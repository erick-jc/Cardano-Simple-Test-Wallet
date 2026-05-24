# Cardano-Simple-Test-Wallet
This is a Cardano Test Wallet, created using the testnet to simulate transations with the cryptocoin: ADA. This code run in a Linux terminal (You can use a Virtual Machine). This code's focus is only on the most important functions: Log in, Create a wallet, Send and Recive ADAs, Session History and Log off.

Installation Guide
==========Node.js==================

Go to https://nodejs.org
Download the LTS version
Run the installer (keep all default options)
Verify in terminal:

   node -v
   npm -v
Both should print a version number.

===========Blockfrost API Key=============

Go to https://blockfrost.io and create a free account
Click "New Project"
Set the network to Preview
Copy the API key — it starts with preview...


=================dotenv=======================
Loads your .env file into the program so secrets stay out of the code.
bashnpm install dotenv

bip39
Validates the checksum of your mnemonic phrase — catches typos before connecting.
The wallet works without it, but validation becomes less strict.
bashnpm install bip39

================All at once================
bashnpm install @lucid-evolution/lucid @meshsdk/core dotenv bip39
