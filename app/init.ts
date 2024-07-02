// NETWORK=testnet WALLET=~/.config/solana/your-key.json npx tsx app/init.ts

import { web3 } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { getEnv } from "./env";

const { program } = getEnv();

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
