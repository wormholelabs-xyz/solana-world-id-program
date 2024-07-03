import {
  appIdActionToExternalNullifierHash,
  hashToField,
} from "../tests/helpers/utils/hashing";
import { getEnv } from "./env";

const { program } = getEnv();
(async () => {
  // This is the default anvil wallet
  const signal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const signalHash = hashToField(signal);
  // This is an example appId and action created via https://developer.worldcoin.org
  const appId = "app_staging_7d23b838b02776cebd87b86ac3248641";
  const action = "testing";
  const externalNullifierHash = appIdActionToExternalNullifierHash(
    appId,
    action
  );
  // This is an example ISuccessResult from IDKitWidget's onSuccess callback
  const result = {
    proof:
      "0x15f5b2def7184b6a31edcee5eadb09333866d351591a6d87c827f7ba53fd64f301c8fbf45fb08e184aeeabcd4aadcaf7080b96a023ecd651c26f984002c004b20d94f647bbbc2a266afcd24471362bd80975927faf52fa01de1eea8cb69251332d3198cfa094e2910a6023761089830d12f77d9c19086db759251004f4c5e6dc17a93aeac55b42ceb0bf52b3f95111d131839a24afad6814f4d7e46d1216cb6d042ab3f47d465062288135c1a91e567d2b767bfc830e7aa657b0ca196aac88670c040fd0278a548c6e6cefd65cf544fba81b55d40bb1ba8e82a32965ac17de690c60700cf5761fa90c11460cb46f41f66376e1b978f173066398d990f8c21fba",
    merkle_root:
      "0x01e8d342ba80dc9bab6939e99a188dc614c0b92b09b9693a4dd9d9677bbd1bf5",
    nullifier_hash:
      "0x2aa975196dc1f4f9f57b8195bea9c61331e0012ec25484ed569782c49145721a",
    verification_level: "orb",
  };
  const rootHash = [...Buffer.from(result.merkle_root.substring(2), "hex")];
  const nullifierHash = [
    ...Buffer.from(result.nullifier_hash.substring(2), "hex"),
  ];
  const proof = [...Buffer.from(result.proof.substring(2), "hex")];
  const tx = await program.methods
    .verifyGroth16Proof(
      rootHash,
      [0],
      signalHash,
      nullifierHash,
      externalNullifierHash,
      proof
    )
    .rpc();
  console.log("Successfully verified:", tx);
})();
