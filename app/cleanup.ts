// NETWORK=testnet WALLET=~/.config/solana/your-key.json npx tsx app/cleanup.ts

import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { deriveConfigKey } from "../tests/helpers/config";

export async function cleanUpRoots(program: Program<SolanaWorldIdProgram>) {
  console.log(`Cleaning up roots...`);
  const config = await program.account.config.fetch(
    deriveConfigKey(program.programId)
  );
  const slot = await program.provider.connection.getSlot();
  const blockTime = new BN(
    await program.provider.connection.getBlockTime(slot)
  );
  const roots = await program.account.root.all();
  console.log(`Found ${roots.length} root(s)`);
  for (const root of roots) {
    // programs/solana-world-id-program/src/state/root.rs
    const readTimeInSeconds = root.account.readBlockTime.div(new BN(1_000_000));
    const expiry = readTimeInSeconds.add(config.rootExpiry);
    const isActive = expiry.gte(blockTime);
    if (isActive) {
      console.log(
        `Skipping active root account ${root.publicKey.toString()}, expires in ${expiry.sub(
          blockTime
        )}s`
      );
    } else {
      try {
        const tx = await program.methods
          .cleanUpRoot()
          .accounts({ root: root.publicKey })
          .rpc();
        console.log(
          `Cleaned up root account ${root.publicKey.toString()} in tx ${tx}`
        );
      } catch (e) {
        console.error(
          `Error cleaning up root account ${root.publicKey.toString()}: ${
            e.message
          }`
        );
      }
    }
  }
}

if (typeof require !== "undefined" && require.main === module) {
  const { getEnv } = require("./env");
  const { program } = getEnv();
  cleanUpRoots(program);
}
