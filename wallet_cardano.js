/**
 * Mini-Lace Wallet - Cardano Terminal Wallet
 *
 * How to run:
 *   Node.js >= 18.0.0 required
 *   npm install @lucid-evolution/lucid @meshsdk/core dotenv
 *   Make sure package.json contains: "type": "module"
 *   You must creat a .env arquichive with 2 variables:
 *   MNEMONIC= "Write your 12 or 24 acess words (separated by spaces)"
 *   BLOCKFROST_KEY= "Copy your Blockfrost preview link"
 *   Run: node wallet_cardano.js
 */

import { Lucid, Blockfrost } from "@lucid-evolution/lucid";
import { generateMnemonic } from "@meshsdk/core";
import * as readline from "readline/promises";
import * as dotenv from "dotenv";
dotenv.config();

// ─────────────────────────────────────────────
// Load Blockfrost API key from environment variable
// Never hardcode secrets — use a .env file
// ─────────────────────────────────────────────
const BLOCKFROST_KEY = process.env.BLOCKFROST_KEY;

if (!BLOCKFROST_KEY) {
  console.error("❌ BLOCKFROST_KEY not found. Create a .env file based on .env.example (see SETUP.txt).");
  process.exit(1);
}

// ─────────────────────────────────────────────
// Creates a Lucid instance connected to Blockfrost on the Preview testnet
// ─────────────────────────────────────────────
async function createLucid(mnemonic) {
  const lucid = await Lucid(
    new Blockfrost("https://cardano-preview.blockfrost.io/api/v0", BLOCKFROST_KEY),
    "Preview"
  );
  lucid.selectWallet.fromSeed(mnemonic);
  return lucid;
}

// ─────────────────────────────────────────────
// Generates a new wallet with a random 24-word BIP-39 mnemonic
// and displays the derived address
// ─────────────────────────────────────────────
async function generateNewWallet() {
  // Generate random 24-word mnemonic (256 bits of entropy)
  const words = generateMnemonic(256);

  console.log("\n==================================================");
  console.log("✨ NEW WALLET GENERATED");
  console.log("==================================================");
  console.log("⚠️  WARNING: Store these words in a safe place!");
  console.log("⚠️  Without them, you permanently lose access to this wallet.");
  console.log("--------------------------------------------------");
  console.log("Mnemonic phrase:");
  console.log(words);
  console.log(" ");

  // Derive keys and address from the mnemonic
  const lucid = await createLucid(words);
  const address = await lucid.wallet().address();

  console.log("Wallet address:");
  console.log(address);
  console.log("==================================================\n");

  return { words, lucid, address };
}

// ─────────────────────────────────────────────
// Loads an existing wallet from a mnemonic typed in the terminal
// Validates word count and BIP-39 checksum before connecting
// ─────────────────────────────────────────────
async function loadWallet(mnemonic) {
  const words = mnemonic.trim().split(/\s+/);

  // Validate word count (BIP-39 accepts 12 or 24 words)
  if (words.length !== 12 && words.length !== 24) {
    console.error(`❌ Invalid mnemonic: you entered ${words.length} word(s). Expected 12 or 24.`);
    return null;
  }

  // Validate BIP-39 checksum — catches typos in individual words
  try {
    const { validateMnemonic } = await import("bip39");
    if (!validateMnemonic(mnemonic.trim())) {
      console.error("❌ Invalid checksum: one or more words are incorrect. Please check your mnemonic.");
      return null;
    }
  } catch {
    // If bip39 is not installed, let Lucid handle validation in the next step
  }

  try {
    const lucid = await createLucid(mnemonic.trim());
    const address = await lucid.wallet().address();

    console.log("✅ Wallet connected!");
    console.log("✅ Wallet address:", address);

    return { lucid, address, mnemonic: mnemonic.trim() };
  } catch (error) {
    // Lucid will throw here if the mnemonic is invalid or the connection fails
    console.error("❌ Invalid mnemonic or connection error. Please verify your phrase and Blockfrost key.");
    return null;
  }
}

// ─────────────────────────────────────────────
// Fetches and displays UTxOs for the active wallet address
// Shows individual UTxOs and the total balance in Lovelace and ADA
// ─────────────────────────────────────────────
async function getUTxOs(lucid, address) {
  try {
    const utxos = await lucid.utxosAt(address);

    if (utxos.length === 0) {
      console.log("No UTxOs found for this address.");
      return;
    }

    console.log(`\nFound ${utxos.length} UTxO(s):`);
    utxos.forEach((utxo, index) => {
      console.log(`✅ --- UTxO #${index + 1} ---`);
      console.log(`TxHash: ${utxo.txHash}`);
      console.log(`Output Index: ${utxo.outputIndex}`);
      console.log(`Assets:`, utxo.assets);
      // The 'assets' field contains Lovelace and any other native tokens
    });

    // Sum all Lovelace values using BigInt to avoid floating-point precision loss
    const totalLovelace = utxos.reduce((acc, utxo) => acc + utxo.assets.lovelace, 0n);

    // Convert to ADA (1 ADA = 1,000,000 Lovelace)
    const totalAda = Number(totalLovelace) / 1_000_000;

    console.log("--------------------------------------------------");
    console.log(`Balance in Lovelace : ${totalLovelace.toLocaleString("pt-BR")} lovelace`);
    console.log(`Total balance       : ${totalAda.toLocaleString("pt-BR", { minimumFractionDigits: 6 })} ADA`);

  } catch (error) {
    console.error("Error fetching UTxOs:", error);
  }
}

// ─────────────────────────────────────────────
// Builds, previews, and sends a transaction
// Shows the fee before asking for confirmation
// Signs locally — the mnemonic never leaves the program
// Amounts displayed and accepted in ADA
// ─────────────────────────────────────────────
async function sendTransaction(lucid, recipient, lovelace, rl) {
  // Validate recipient — Preview testnet addresses start with addr_test
  if (!recipient || !recipient.startsWith("addr_test")) {
    console.error("❌ Invalid recipient address. Use an addr_test... address from the Preview network.");
    return;
  }

  try {
    // Build the transaction without signing to calculate the real fee
    const tx = await lucid
      .newTx()
      .pay.ToAddress(recipient, { lovelace: BigInt(lovelace) })
      .complete();

    // Extract the exact fee from the built transaction body
    // Falls back to a safe 0.17 ADA estimate if reading the fee fails
    let feeLovelace;
    try {
      const txBody = tx.toTransaction().body();
      feeLovelace = BigInt(txBody.fee().toString());
    } catch {
      feeLovelace = 170_000n;
      console.warn("⚠️  Could not read the exact fee; using 0.17 ADA as estimate.");
    }

    const feeAda   = (Number(feeLovelace) / 1_000_000).toFixed(6);
    const valueAda = (Number(lovelace)    / 1_000_000).toFixed(6);
    const totalAda = ((Number(lovelace) + Number(feeLovelace)) / 1_000_000).toFixed(6);

    // Show transaction summary before asking for confirmation
    console.log("\n--------------------------------------------------");
    console.log(`💸 Amount to send : ${valueAda} ADA`);
    console.log(`💸 Fee            : ${feeAda} ADA`);
    console.log(`💸 Total debited  : ${totalAda} ADA`);
    console.log(`📬 Recipient      : ${recipient}`);
    console.log("--------------------------------------------------");

    const confirm = await rl.question("\nConfirm transaction? (y/n): ");
    if (confirm.trim().toLowerCase() !== "y") {
      console.log("❌ Transaction cancelled.");
      return;
    }

    // Sign locally with the wallet loaded in memory and submit to the network
    const signedTx = await tx.sign.withWallet().complete();
    const txHash   = await signedTx.submit();

    console.log("✅ Transaction submitted!", txHash);
    console.log(`🔗 Explorer: https://preview.cardanoscan.io/transaction/${txHash}`);

    return txHash;

  } catch (err) {
    // Friendly message for insufficient balance errors
    const msg = err.message?.toLowerCase() ?? "";
    if (msg.includes("balance") || msg.includes("utxo") || msg.includes("insufficient")) {
      console.error("❌ Insufficient balance to cover the transaction amount + fee.");
    } else {
      console.error("❌ Error sending transaction:", err.message);
    }
  }
}

// ─────────────────────────────────────────────
// Clears the active session from memory
// Mnemonic and keys are volatile — nothing is written to disk
// ─────────────────────────────────────────────
function logout(session) {
  session.mnemonic = null;
  session.address  = null;
  session.lucid    = null;
  console.log("\n🚪 Logged out. Mnemonic cleared from memory.");
}

// ─────────────────────────────────────────────
// MAIN MENU LOOP
// ─────────────────────────────────────────────
async function main() {
  // Check if a default mnemonic was provided via .env for quick login
  const envMnemonic = process.env.DEFAULT_MNEMONIC?.trim();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let session = { lucid: null, address: null, mnemonic: null, balanceChecked: false };
  const history = []; // Transaction history for the current session

  console.log("\n==================================================");
  console.log("💎 Mini-Lace Wallet — Cardano Preview Testnet");
  console.log("==================================================");

  // Auto-login if DEFAULT_MNEMONIC is set in .env
  if (envMnemonic) {
    console.log("\n🔑 DEFAULT_MNEMONIC detected — attempting auto-login...");
    const result = await loadWallet(envMnemonic);
    if (result) {
      session.lucid    = result.lucid;
      session.address  = result.address;
      session.mnemonic = result.mnemonic;
    }
  }

  let running = true;

  while (running) {
    console.log("\n--- MENU ---");
    if (!session.lucid) {
      console.log("1. Load existing wallet (enter mnemonic)");
      console.log("2. Generate new wallet");
    } else {
      console.log(session.balanceChecked ? "3. Refresh balance" : "3. Check balance");
      console.log("4. Send transaction");
      console.log("5. View session history");
      console.log("6. Logout");
    }

    const option = await rl.question("\nChoose an option: ");

    if (option === "1" && !session.lucid) {
      // Prompt user to type their mnemonic phrase
      const mnemonic = await rl.question("Enter your 12 or 24 words (space-separated): ");
      const result   = await loadWallet(mnemonic);
      if (result) {
        session.lucid    = result.lucid;
        session.address  = result.address;
        session.mnemonic = result.mnemonic;
      }

    } else if (option === "2" && !session.lucid) {
      // Generate a new wallet and activate it immediately
      const result     = await generateNewWallet();
      session.lucid    = result.lucid;
      session.address  = result.address;
      session.mnemonic = result.words;
      console.log("✅ New wallet active! Save the words above to use this wallet again.");

    } else if (option === "3" && session.lucid) {
      // Fetch and display UTxOs and balance
      await getUTxOs(session.lucid, session.address);
      session.balanceChecked = true;

    } else if (option === "4" && session.lucid) {
      // Collect recipient and amount, convert ADA to Lovelace
      const recipient = await rl.question("Recipient address (addr_test...): ");
      const adaStr    = await rl.question("Amount in ADA (e.g. 2): ");

      // Convert ADA to Lovelace — 1 ADA = 1,000,000 Lovelace
      const lovelace = Math.round(parseFloat(adaStr) * 1_000_000).toString();

      const txHash = await sendTransaction(session.lucid, recipient.trim(), lovelace, rl);

      // Add to session history only if the transaction was submitted successfully
      if (txHash) {
        history.push({
          txHash,
          recipient: recipient.trim(),
          ada:  parseFloat(adaStr).toFixed(6),
          time: new Date().toLocaleTimeString("pt-BR"),
        });
      }

    } else if (option === "5" && session.lucid) {
      // Display all transactions sent during this session
      if (history.length === 0) {
        console.log("\nNo transactions sent in this session.");
      } else {
        console.log("\n--- SESSION HISTORY ---");
        history.forEach((tx, i) => {
          console.log(`#${i + 1} | ${tx.time} | ${tx.ada} ADA → ${tx.recipient}`);
          console.log(`     Hash: https://preview.cardanoscan.io/transaction/${tx.txHash}`);
        });
      }

    } else if (option === "6" && session.lucid) {
      // Logout and exit the loop
      logout(session);
      running = false;

    } else {
      console.log("⚠️  Invalid option.");
    }
  }

  rl.close();
  console.log("\nGoodbye! 👋");
}

main();
