// NETWORK=testnet WALLET=~/.config/solana/your-key.json npx tsx app/setRootExpiry.ts

import { BN } from "bn.js";
import { getEnv } from "./env";

const { program } = getEnv();

(async () => {
  const expiryInSecs = new BN(60 * 60 * 24 * 7);
  const tx = await program.methods.setRootExpiry(expiryInSecs).rpc();
  console.log(
    `Successfully set root expiry (${expiryInSecs.toString()}s): ${tx}`
  );
})();
