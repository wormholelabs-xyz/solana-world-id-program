// modified from https://github.com/wormhole-foundation/wormhole/blob/main/sdk/js/src/solana/wormhole/accounts/guardianSet.ts
import * as anchor from "@coral-xyz/anchor";
import { getAccountData } from "./utils/account";

export const ETHEREUM_KEY_LENGTH = 20;

export function deriveGuardianSetKey(
  wormholeProgramId: anchor.web3.PublicKey,
  index: number
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("GuardianSet"),
      (() => {
        const buf = Buffer.alloc(4);
        buf.writeUInt32BE(index);
        return buf;
      })(),
    ],
    wormholeProgramId
  )[0];
}

export async function getGuardianSet(
  connection: anchor.web3.Connection,
  wormholeProgramId: anchor.web3.PublicKey,
  index: number,
  commitment?: anchor.web3.Commitment
): Promise<GuardianSetData> {
  return connection
    .getAccountInfo(deriveGuardianSetKey(wormholeProgramId, index), commitment)
    .then((info) => GuardianSetData.deserialize(getAccountData(info)));
}

export class GuardianSetData {
  index: number;
  keys: Buffer[];
  creationTime: number;
  expirationTime: number;

  constructor(
    index: number,
    keys: Buffer[],
    creationTime: number,
    expirationTime: number
  ) {
    this.index = index;
    this.keys = keys;
    this.creationTime = creationTime;
    this.expirationTime = expirationTime;
  }

  static deserialize(data: Buffer): GuardianSetData {
    const index = data.readUInt32LE(0);
    const keysLen = data.readUInt32LE(4);
    const keysEnd = 8 + keysLen * ETHEREUM_KEY_LENGTH;
    const creationTime = data.readUInt32LE(keysEnd);
    const expirationTime = data.readUInt32LE(4 + keysEnd);

    const keys = [];
    for (let i = 0; i < keysLen; ++i) {
      const start = 8 + i * ETHEREUM_KEY_LENGTH;
      keys.push(data.subarray(start, start + ETHEREUM_KEY_LENGTH));
    }
    return new GuardianSetData(index, keys, creationTime, expirationTime);
  }
}
