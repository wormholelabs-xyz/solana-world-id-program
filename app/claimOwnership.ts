// NETWORK=testnet WALLET=~/.config/solana/your-key.json npx tsx app/claimOwnership.ts

import { web3 } from "@coral-xyz/anchor";
import { getEnv } from "./env";

const { program } = getEnv();

const programData = web3.PublicKey.findProgramAddressSync(
  [program.programId.toBuffer()],
  new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
)[0];
(async () => {
  const tx = await program.methods
    .claimOwnership()
    .accountsPartial({
      programData,
    })
    .rpc();
  console.log(`Successfully claimed ownership: ${tx}`);
})();
