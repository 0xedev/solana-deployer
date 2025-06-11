import { Buffer } from "buffer";
import process from "process";

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

// Constants
const programId = new PublicKey("7S8e5bweirM9Dq7ebtTb3FQg3QWGb9L1nhF43Fc2zySZ");
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

let provider, program;

// --- Connect Wallet buton ---
document
  .getElementById("connect-button")
  .addEventListener("click", async () => {
    if (window.solana && window.solana.isPhantom) {
      try {
        const res = await window.solana.connect();
        document.getElementById(
          "wallet-address"
        ).innerText = `Wallet: ${res.publicKey}`;
        document.getElementById("token-form").style.display = "block";

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
  const supply = new BN(document.getElementById("supply").value);
  const decimals = new BN(document.getElementById("decimals").value);
  const payer = provider.wallet.publicKey;

  if (!name || !symbol || supply.isZero() || !decimals) {
    document.getElementById("status").innerText = "Please fill out all fields.";
    return;
  }

  document.getElementById("status").innerText =
    "Creating token, please wait...";

  try {
    // Generate a new keypair for the mint account.
    // The program will create this account, but we need the address and signer.
    const mint = Keypair.generate();
    console.log(`New Mint Keypair Generated: ${mint.publicKey.toBase58()}`);

    // Get PDA for factory state
    const [factoryState, factoryBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("factory_state")],
        program.programId
      );

    // Get PDA for the token metadata
    const [metadata] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_metadata"), mint.publicKey.toBuffer()],
      program.programId
    );

    // Get the associated token account for the payer
    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      payer,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Call the program's `createToken` instruction
    console.log("Calling the on-chain program to create the token...");
    const programSignature = await program.methods
      .createToken(name, symbol, supply, decimals, factoryBump)
      .accounts({
        payer,
        mint: mint.publicKey,
        factoryState,
        tokenMetadata: metadata,
        payerTokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        owner: payer,
      })
      // The `mint` keypair must sign to authorize the creation of the account
      .signers([mint])
      .rpc({ commitment: "confirmed" });

    console.log(`Token created successfully! Signature: ${programSignature}`);
    const successMessage = `Token created! Mint Address: ${mint.publicKey.toBase58()}`;
    document.getElementById("status").innerText = successMessage;

    // Optional: Add a link to the Solana Explorer
    const explorerLink = `https://explorer.solana.com/address/${mint.publicKey.toBase58()}?cluster=devnet`;
    const statusElement = document.getElementById("status");
    statusElement.innerHTML = `${successMessage} <a href="${explorerLink}" target="_blank" rel="noopener noreferrer">(View on Explorer)</a>`;
  } catch (err) {
    console.error("Error creating token:", err);
    if (err.logs) {
      console.error("Transaction logs:", err.logs);
    }
    document.getElementById("status").innerText =
      "Token creation failed. Check the console for details.";
  }
});
