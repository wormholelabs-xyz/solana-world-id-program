export interface GuardianSignature {
  index: number;
  signature: Buffer;
}

export const responseSignaturesToGuardianSignature = (
  signatures: string[]
): GuardianSignature[] =>
  signatures.map((s) => {
    const b = Buffer.from(s, "hex");
    return {
      index: b[b.length - 1],
      signature: b.subarray(0, b.length - 1),
    };
  });
