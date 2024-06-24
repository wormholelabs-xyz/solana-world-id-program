// modified from https://github.com/wormhole-foundation/wormhole/blob/main/sdk/js/src/solana/wormhole/accounts/guardianSet.ts
import * as anchor from "@coral-xyz/anchor";

export function deriveRootKey(
  worldIdProgramId: anchor.web3.PublicKey,
  root: Buffer,
  type: number
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("Root"), root, Buffer.from([type])],
    worldIdProgramId
  )[0];
}
