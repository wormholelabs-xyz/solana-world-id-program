// NEW_OWNER=<new_owner_address> NETWORK=testnet WALLET=~/.config/solana/your-key.json npx tsx app/transferOwnership.ts

import { web3 } from "@coral-xyz/anchor";
import { getEnv } from "./env";

if (!process.env.NEW_OWNER) {
  throw new Error("NEW_OWNER is required!");
}

const { program } = getEnv();

const programData = web3.PublicKey.findProgramAddressSync(
  [program.programId.toBuffer()],
  new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
)[0];
(async () => {
  const newOwner = new web3.PublicKey(process.env.NEW_OWNER);
  const tx = await program.methods
    .transferOwnership()
    .accountsPartial({
      newOwner,
      programData,
    })
    .rpc();
  console.log(
    `Successfully initiated ownership transfer to ${newOwner.toString()}: ${tx}`
  );
})();
