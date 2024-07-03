import { keccak256 } from "@ethersproject/keccak256";

// Similar to https://github.com/worldcoin/idkit-js/blob/4f3139cbb1273aa3e944517ce7ed05ff5fb56d6e/packages/core/src/lib/hashing.ts
// But without so many dependencies
export function hashToField(input: Uint8Array | string) {
  const bytes =
    typeof input === "string" && !input.startsWith("0x")
      ? Buffer.from(input)
      : input;
  const hash = BigInt(keccak256(bytes)) >> BigInt(8);
  return [...Buffer.from(hash.toString(16).padStart(64, "0"), "hex")];
}

// Similar to https://github.com/worldcoin/world-id-onchain-template/blob/126ade79acb63f13e2d8d16e6db983c4ad1f41fe/contracts/src/Contract.sol#L38
// But in TypeScript
export function appIdActionToExternalNullifierHash(
  appId: string,
  action: string
) {
  const appHash = hashToField(appId);
  return hashToField(new Uint8Array([...appHash, ...Buffer.from(action)]));
}
