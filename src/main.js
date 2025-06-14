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

// Change 1: Import UMI and related libraries
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import {
  createMetadataAccountV3,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";

// Constants
const programId = new PublicKey("7S8e5bweirM9Dq7ebtTb3FQg3QWGb9L1nhF43Fc2zySZ");
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

// We no longer need METADATA_PROGRAM_ID directly as UMI handles it
// const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

let provider, program, umi; // Add umi instance

// --- Connect Wallet button ---
const connectButton = document.getElementById("connect-button");
const walletDisplay = document.getElementById("wallet-address");
const tokenForm = document.getElementById("token-form");

connectButton.addEventListener("click", async () => {
  if (window.solana && window.solana.isPhantom) {
    try {
      const res = await window.solana.connect();

      connectButton.style.display = "none";
      walletDisplay.innerText = `Wallet: ${res.publicKey.toBase58()}`;
      tokenForm.style.display = "block";

      // Set up Anchor provider for our custom program
      provider = new anchor.AnchorProvider(connection, window.solana, {
        commitment: "confirmed",
      });
      anchor.setProvider(provider);
      program = new anchor.Program(idl, programId, provider);

      // Change 2: Set up UMI instance for Metaplex interactions
      umi = createUmi(clusterApiUrl("devnet"))
        .use(walletAdapterIdentity(window.solana))
        .use(mplTokenMetadata());
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
        description: "Minted with Solana Token Factory",
        image: "", // You can add an image URL here if you have one
      },
      name
    );

    console.log(`Metadata uploaded to Pinata. URI: ${metadataUri}`);
    document.getElementById("status").innerText = "Creating token on-chain...";

    // Step 2: Create the token using the Anchor program
    const mint = Keypair.generate();
    console.log(`New Mint Keypair Generated: ${mint.publicKey.toBase58()}`);

    const [factoryStatePda, factoryBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("factory_state")],
        program.programId
      );

    const [tokenMetadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_metadata"), mint.publicKey.toBuffer()],
      program.programId
    );

    const ata = getAssociatedTokenAddressSync(mint.publicKey, payer);

    const factoryOwner = new PublicKey(
      "D7TWwK544nwb3FtsgavPsq666cEcnKwn9HiXLuVPGkiP"
    );

    const programSignature = await program.methods
      .createToken(name, symbol, supply, decimals, factoryBump)
      .accounts({
        payer: payer,
        factoryState: factoryStatePda,
        mint: mint.publicKey,
        tokenMetadata: tokenMetadataPda,
        payerTokenAccount: ata,
        owner: factoryOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc({ commitment: "confirmed" });

    console.log(`Token created successfully! Signature: ${programSignature}`);

    // Change 3: Replace the old Metaplex transaction with a UMI call
    document.getElementById("status").innerText =
      "Token created. Now creating on-chain metadata with UMI...";

    const createMetadataResult = await createMetadataAccountV3(umi, {
      mint: publicKey(mint.publicKey),
      mintAuthority: umi.identity,
      payer: umi.identity,
      updateAuthority: umi.identity,
      data: {
        name: name,
        symbol: symbol,
        uri: metadataUri,
        sellerFeeBasisPoints: 0,
        creators: [
          { address: umi.identity.publicKey, verified: true, share: 100 },
        ],
        collection: null,
        uses: null,
      },
      isMutable: true,
      collectionDetails: null,
    }).sendAndConfirm(umi, { commitment: "confirmed" });

    // UMI returns a signature as a Uint8Array. We can log it directly or convert for display.
    console.log(
      "Metaplex Metadata created. Signature:",
      createMetadataResult.signature
    );

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
