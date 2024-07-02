// NETWORK=testnet WALLET=~/.config/solana/your-key.json npx tsx app/init.ts

import {
  AnchorProvider,
  Program,
  Wallet,
  setProvider,
  web3,
} from "@coral-xyz/anchor";
import { BN } from "bn.js";
import "dotenv/config";
import idl from "../target/idl/solana_world_id_program.json";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";

const NETWORK =
  process.env.NETWORK === "localnet"
    ? "localnet"
    : process.env.NETWORK === "testnet"
    ? "testnet"
    : "mainnet";
console.log("Network:         ", NETWORK);

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (NETWORK === "localnet"
    ? "http://127.0.0.1:8899"
    : NETWORK === "testnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com");

const connection = new web3.Connection(SOLANA_RPC_URL, "confirmed");
if (NETWORK !== "localnet" && !process.env.WALLET) {
  throw new Error("WALLET is required when NETWORK !== 'localnet'");
}
const TEST_PAYER_PRIVATE_KEY = Buffer.from(
  require(process.env.WALLET ||
    "../tests/keys/pFCBP4bhqdSsrWUVTgqhPsLrfEdChBK17vgFM7TxjxQ.json")
);
const wallet = new Wallet(web3.Keypair.fromSecretKey(TEST_PAYER_PRIVATE_KEY));
console.log("Wallet:          ", wallet.publicKey.toString());

const provider = new AnchorProvider(connection, wallet);
setProvider(provider);

const program = new Program<SolanaWorldIdProgram>(idl as SolanaWorldIdProgram);

const programData = web3.PublicKey.findProgramAddressSync(
  [program.programId.toBuffer()],
  new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
)[0];
const twentyFourHours = new BN(24 * 60 * 60);
const fiveMinutes = new BN(5 * 60);
(async () => {
  const tx = await program.methods
    .initialize({
      rootExpiry: twentyFourHours,
      allowedUpdateStaleness: fiveMinutes,
    })
    .accountsPartial({
      programData,
    })
    .rpc();
  console.log("Successfully initialized:", tx);
})();
