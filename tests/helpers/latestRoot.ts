// modified from https://github.com/wormhole-foundation/wormhole/blob/main/sdk/js/src/solana/wormhole/accounts/guardianSet.ts
import * as anchor from "@coral-xyz/anchor";

export function deriveLatestRootKey(
  worldIdProgramId: anchor.web3.PublicKey,
  type: number
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("LatestRoot"), Buffer.from([type])],
    worldIdProgramId
  )[0];
}
