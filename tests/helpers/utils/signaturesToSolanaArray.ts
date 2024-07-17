// TODO: PR to @wormhole-foundation/wormhole-query-sdk
// GuardianSetSig expects the guardian index before the signature, the inverse of what the Query Proxy returns.
// https://docs.rs/wormhole-raw-vaas/0.3.0-alpha.1/src/wormhole_raw_vaas/protocol.rs.html#220
// https://github.com/wormhole-foundation/wormhole/blob/31b01629087c610c12fa8e84069786139dc0b6bd/node/cmd/ccq/http.go#L191
export function signaturesToSolanaArray(signatures: string[]) {
  return signatures.map((s) => [
    ...Buffer.from(s.substring(130, 132), "hex"),
    ...Buffer.from(s.substring(0, 130), "hex"),
  ]);
}
