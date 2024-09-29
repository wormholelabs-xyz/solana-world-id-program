// NETWORK=testnet WALLET=~/.config/solana/your-key.json npx tsx app/cleanup.ts

import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { Logger } from "winston";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { deriveConfigKey } from "../tests/helpers/config";
import { deriveLatestRootKey } from "../tests/helpers/latestRoot";

export async function cleanUpRoots(
  program: Program<SolanaWorldIdProgram>,
  logger: Logger
) {
  logger.info(`Cleaning up roots...`);
  const config = await program.account.config.fetch(
    deriveConfigKey(program.programId)
  );
  const latestRoot = deriveLatestRootKey(program.programId, 0);
  const slot = await program.provider.connection.getSlot();
  const blockTime = new BN(
    await program.provider.connection.getBlockTime(slot)
  );
  const roots = await program.account.root.all();
  logger.debug(`Found ${roots.length} root(s)`);
  for (const root of roots) {
    // programs/solana-world-id-program/src/state/root.rs
    const readTimeInSeconds = root.account.readBlockTime.div(new BN(1_000_000));
    const expiry = readTimeInSeconds.add(config.rootExpiry);
    const isActive = expiry.gte(blockTime);
    const rootHex = Buffer.from(root.account.root).toString("hex");
    if (isActive) {
      logger.debug(
        `Skipping active root ${rootHex} account ${root.publicKey.toString()}, expires in ${expiry.sub(
          blockTime
        )}s`
      );
    } else {
      try {
        const tx = await program.methods
          .cleanUpRoot()
          .accounts({ root: root.publicKey, latestRoot: latestRoot })
          .rpc();
        logger.info(
          `Cleaned up root ${rootHex} account ${root.publicKey.toString()} in tx ${tx}`
        );
      } catch (e) {
        logger.error(
          `Error cleaning up root account ${root.publicKey.toString()}: ${
            e.message
          }`
        );
      }
    }
  }
  logger.info(`Done.`);
}

if (typeof require !== "undefined" && require.main === module) {
  const { getEnv } = require("./env");
  const { program, logger } = getEnv();
  cleanUpRoots(program, logger);
}
