import { Buffer } from "buffer";
import process from "process";
import { uploadMetadataToPinata } from "./pinataStorage.js";
window.Buffer = Buffer;
window.process = process;

import {
  Connection,
  PublicKey,
  clusterApiUrl,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import idl from "./idl.json" assert { type: "json" };
import BN from "bn.js";
import * as Metaplex from "@metaplex-foundation/mpl-token-metadata";

// Constants
const programId = new PublicKey("7S8e5bweirM9Dq7ebtTb3FQg3QWGb9L1nhF43Fc2zySZ");
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

let provider, program;

// --- Connect Wallet buton ---
const connectButton = document.getElementById("connect-button");
const walletDisplay = document.getElementById("wallet-address");
const tokenForm = document.getElementById("token-form");

connectButton.addEventListener("click", async () => {
  if (window.solana && window.solana.isPhantom) {
    try {
      const res = await window.solana.connect();

      // Hide connect button
      connectButton.style.display = "none";

      // Show wallet address and token form
      walletDisplay.innerText = `Wallet: ${res.publicKey.toBase58()}`;
      tokenForm.style.display = "block";

      // Set up Anchor provider and program
      provider = new anchor.AnchorProvider(connection, window.solana, {
        commitment: "confirmed",
      });
      anchor.setProvider(provider);
      program = new anchor.Program(idl, programId, provider);
    } catch (err) {
      console.error("Wallet connection error", err);
      alert("Failed to connect to Phantom Wallet.");
    }
  } else {
    alert("Please install Phantom Wallet to use this app.");
  }
});

// --- Form Submission to Create Token ---
document.getElementById("token-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const symbol = document.getElementById("symbol").value;
  const decimals = parseInt(document.getElementById("decimals").value);
  const rawSupply = document.getElementById("supply").value;

  if (!name || !symbol || isNaN(decimals) || !rawSupply) {
    document.getElementById("status").innerText =
      "Please fill out all fields correctly.";
    return;
  }

  const supply = new BN(rawSupply).mul(new BN(10).pow(new BN(decimals)));
  const payer = provider.wallet.publicKey;

  document.getElementById("status").innerText = "Uploading metadata to IPFS...";

  try {
    // Step 1: Upload metadata to get the URI
    const metadataUri = await uploadMetadataToPinata(
      {
        name: name,
        symbol: symbol,
        description: "Minted with Token Factory",
        image: "",
      },
      name
    );

    console.log(`Metadata uploaded to Pinata. URI: ${metadataUri}`);
    document.getElementById("status").innerText = "Creating token on-chain...";

    // Step 2: Determine the factory owner and create the token
    const mint = Keypair.generate();
    console.log(`New Mint Keypair Generated: ${mint.publicKey.toBase58()}`);

    const [factoryStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("factory_state")],
      program.programId
    );

    const [tokenMetadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_metadata"), mint.publicKey.toBuffer()],
      program.programId
    );

    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      payer,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const factoryOwner = new PublicKey(
      "D7TWwK544nwb3FtsgavPsq666cEcnKwn9HiXLuVPGkiP"
    );

    const [_, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("factory_state")],
      program.programId
    );
    const factoryBump = bump;

    // ✅ CORRECTED ACCOUNT ORDER
    const programSignature = await program.methods
      .createToken(name, symbol, supply, decimals, factoryBump)
      .accounts({
        payer: payer,
        factoryState: factoryStatePda,
        mint: mint.publicKey,
        tokenMetadata: tokenMetadataPda,
        payerTokenAccount: ata,
        // System accounts are typically grouped together.
        // The 'owner' account was likely added after these in the struct.
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        owner: factoryOwner, // Moved to the end
      })
      .signers([mint])
      .rpc({ commitment: "confirmed" });

    console.log(`Token created successfully! Signature: ${programSignature}`);
    document.getElementById("status").innerText =
      "Token created. Now updating metadata...";

    // Step 3: Update the metadata account with the URI (Metaplex metadata)
    const metadataData = {
      name: name,
      symbol: symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    };

    const [metaplexMetadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    const updateMetadataTx = new Transaction().add(
      Metaplex.createUpdateMetadataAccountV2Instruction(
        {
          metadata: metaplexMetadataPda,
          updateAuthority: payer,
        },
        {
          updateMetadataAccountArgsV2: {
            data: metadataData,
            updateAuthority: payer,
            primarySaleHappened: true,
            isMutable: true,
          },
        }
      )
    );

    const updateMetadataSignature = await provider.sendAndConfirm(
      updateMetadataTx
    );
    console.log("Metadata updated:", updateMetadataSignature);

    // Final Success Message
    const successMessage = `Token and metadata created! Mint Address: ${mint.publicKey.toBase58()}`;
    const explorerLink = `https://explorer.solana.com/address/${mint.publicKey.toBase58()}?cluster=devnet`;
    const statusElement = document.getElementById("status");
    statusElement.innerHTML = `${successMessage} <a href="${explorerLink}" target="_blank" rel="noopener noreferrer">(View on Explorer)</a>`;
  } catch (err) {
    console.error("Error creating token:", err);
    if (err.logs) {
      console.error("Transaction logs:", err.logs);
    }
    const errorDetails = err.message || JSON.stringify(err);
    document.getElementById(
      "status"
    ).innerText = `Token creation failed. Check the console for details. Error: ${errorDetails}`;
  }
});
