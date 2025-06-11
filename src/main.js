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
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
// import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "./idl.json" assert { type: "json" };
import BN from "bn.js";

// Constants
const programId = new PublicKey("3dDGCv5yHufek6xPgKRvKUZWHk5Hn6DXnx5WkJFG8X3U");
const connection = new Connection(clusterApiUrl("devnet"));

let provider, program;

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

        provider = new anchor.AnchorProvider(connection, window.solana, {});
        anchor.setProvider(provider);
        program = new anchor.Program(idl, programId, provider);
      } catch (err) {
        console.error("Wallet connection error", err);
      }
    } else {
      alert("Please install Phantom Wallet");
    }
  });

document.getElementById("token-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;
  const symbol = document.getElementById("symbol").value;
  const supply = new BN(document.getElementById("supply").value);
  const decimals = new BN(document.getElementById("decimals").value);
  const payer = provider.wallet.publicKey;

  document.getElementById("status").innerText = "Creating token...";

  try {
    const mint = Keypair.generate();

    const [factoryState, factoryBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("factory_state")],
        program.programId
      );

    const [metadata] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_metadata"), mint.publicKey.toBuffer()],
      program.programId
    );

    // Use the correct Token-2022 program ID for devnet
    const TOKEN_2022_PROGRAM_ID_DEVNET = new PublicKey(
      "9amFQ13YKsi8iG9omphCiXLnB1mUwFyLT4wSDMYnWFye"
    );

    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      payer,
      false,
      TOKEN_2022_PROGRAM_ID_DEVNET,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    await program.methods
      .createToken(name, symbol, supply, decimals, factoryBump)
      .accounts({
        payer,
        mint: mint.publicKey,
        factoryState,
        tokenMetadata: metadata,
        payerTokenAccount: ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID_DEVNET,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        owner: payer,
      })
      .signers([mint])
      .rpc();

    document.getElementById("status").innerText = "Token created successfully!";
  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = "Token creation failed.";
  }
});
