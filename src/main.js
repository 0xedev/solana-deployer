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
  createInitializeMintInstruction,
  MINT_SIZE,
} from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import idl from "./idl.json" assert { type: "json" };
import BN from "bn.js";

// Constants
const programId = new PublicKey("7S8e5bweirM9Dq7ebtTb3FQg3QWGb9L1nhF43Fc2zySZ");
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

    const lamports = await connection.getMinimumBalanceForRentExemption(
      MINT_SIZE
    );

    const [factoryState, factoryBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("factory_state")],
        program.programId
      );

    const [metadata] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_metadata"), mint.publicKey.toBuffer()],
      program.programId
    );

    const accountInfo = await connection.getAccountInfo(metadata);
    if (accountInfo) {
      throw new Error("Metadata PDA already exists. Use a new mint or clean up devnet.");
    }

    // Use the correct Token-2022 program ID for devnet
    const TOKEN_PROGRAM_ID = new PublicKey(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );

    const ata = getAssociatedTokenAddressSync(
      mint.publicKey,
      payer,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const createMintIx = anchor.web3.SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    });

    const initMintIx = createInitializeMintInstruction(
      mint.publicKey,
      decimals.toNumber(),
      payer,
      null,
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(createMintIx, initMintIx);

    await provider.sendAndConfirm(tx, [mint]);

    await program.methods
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
      .signers([mint])
      .rpc();

    document.getElementById("status").innerText = "Token created successfully!";
  } catch (err) {
    console.error(err);
    if (err.getLogs) {
      console.error("Transaction logs:", await err.getLogs());
    }
    document.getElementById("status").innerText = "Token creation failed.";
  }
});

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
