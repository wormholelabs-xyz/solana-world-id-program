# Solana World ID Program

This is an example of using Wormhole Queries to bridge the [World ID](https://worldcoin.org/world-id) state root from Ethereum to Solana.

## Objective

Enable cross-chain World ID verification so that protocols can verify their users’ identities on Solana. This is accomplished in two parts:

1. Read, authenticate, and propagate the World ID state root from Ethereum to Solana.
2. Allow for protocols to authenticate users’ World IDs on-chain on Solana using those roots.

## Background

### World ID

Currently, the World ID state is managed on Ethereum in a privacy-preserving manner via an on-chain representation of the [Semaphore](https://worldcoin.org/blog/worldcoin/intro-zero-knowledge-proofs-semaphore-application-world-id) set.

On Ethereum, on-chain verification of World IDs can be performed by calling `verifyProof` on the [World ID Identity Manager contract](https://docs.worldcoin.org/reference/address-book) ([example](https://github.com/worldcoin/world-id-onchain-template/blob/main/contracts/src/Contract.sol#L51)) with a proof provided by the [Tree Availability Service](https://github.com/worldcoin/world-tree?tab=readme-ov-file#tree-availability-service).

On-chain verification can be made available on other blockchains and is currently available on some Layer 2 EVMs, such as Polygon, Optimism, and Base, via their native bridges, the [World ID State Bridge contracts](https://github.com/worldcoin/world-id-state-bridge/blob/main/README.md), and the [State Bridge Service](https://github.com/worldcoin/world-tree/blob/0fb6223eb29b3ad97a5745b0f9e7a3b32234cd50/README.md#state-bridge-service). Integrators can use the bridged [OpWorldID](https://github.com/worldcoin/world-id-state-bridge/blob/main/src/OpWorldID.sol) and [PolygonWorldID](https://github.com/worldcoin/world-id-state-bridge/blob/main/src/PolygonWorldID.sol) contracts as they would the World ID Identity Manager contract on Ethereum.

### Wormhole Queries

Wormhole Queries is a service that allows applications, developers, and users to access cross-chain data on-demand in an efficient and inexpensive manner. Queries leverages the Wormhole Guardians (some of the largest proof of stake validators in the blockchain ecosystem) to attest to cross-chain reads, enabling sub-second, authenticated cross-chain data retrieval. It currently supports querying, parsing, and verifying on all connected Wormhole EVM networks and Solana. Read more about Queries in [the docs](https://docs.wormhole.com/wormhole/queries/overview).

> 💡 The Queries feature relevant for WorldID is support for requesting a designated `eth_call` from a given contract on Ethereum and the ability to parse and verify the response on Solana.

## Ethereum → Solana Wormhole State Bridge Service

The Ethereum-to-Solana State Bridge Service is responsible for monitoring the World ID contract on Ethereum for state root changes and propagating the root to Solana. It can do this by performing the following steps:

1. Subscribe to `TreeChanged` events or poll for `latestRoot`.
   1. `event TreeChanged(uint256 indexed preRoot, TreeChange indexed kind, uint256 indexed postRoot);`
2. When the root has updated, issue a Wormhole Query request for the `latestRoot` on Ethereum.
3. Submit the Query response to the SolanaWorldID program on Solana.

This is akin to the EVM L2 [State Bridge Service](https://github.com/worldcoin/world-tree/blob/0fb6223eb29b3ad97a5745b0f9e7a3b32234cd50/README.md#state-bridge-service)

### Testing

Change the following line in `solana-world-id-program.ts` from `it` to `it.only`:

```ts
  it(fmtTest("initialize", "Successfully initializes"), async () => {
```

Then run the following to start a local validator:

```bash
anchor test --detach
```

Finally, run

```bash
npm start
```

Running `npm start` subsequent times will update the root again, as necessary.

## SolanaWorldID Program

This program serves two purposes:

1. Parse, verify, and manage the bridged World ID state root.
2. Provide the equivalent functionality of [`verifyProof`](https://github.com/worldcoin/world-id-state-bridge/blob/main/src/abstract/WorldIDBridge.sol#L165) to on-chain integrators.

This is akin to the [World ID State Bridge](https://github.com/worldcoin/world-id-state-bridge/blob/main/README.md) contracts for EVM L2s and should be compatible with existing inclusion proofs served by the [Tree Availability Service](https://github.com/worldcoin/world-tree/blob/0fb6223eb29b3ad97a5745b0f9e7a3b32234cd50/README.md#tree-availability-service).

### Accounts

- [Config](programs/solana-world-id-program/src/state/config.rs) stores the program configuration. There is only one.
- [LatestRoot](programs/solana-world-id-program/src/state/latest_root.rs) stores the most recent verified root metadata and hash. There is one per `Root` verification mechanism (e.g. Query with Guardian signatures).
- [QuerySignatureSet](programs/solana-world-id-program/src/state/query_signature_set.rs) stores the signatures for pending query verification. These are created in service of verifying a root via Queries and closed when that root is verified.
- [Root](programs/solana-world-id-program/src/state/root.rs) stores the metadata and expiry for a verified root. These can be closed after the root is expired.

### Instructions

- [initialize](programs/solana-world-id-program/src/instructions/initialize.rs) sets the initial config and creates the LatestRoot account. It must be signed by the deployer.
- [verify_query_signatures](programs/solana-world-id-program/src/instructions/verify_query_signatures.rs) verifies the preceding secp256k1 instructions successfully verified query signatures for the provided guardian set.
- [update_root_with_query](programs/solana-world-id-program/src/instructions/update_root_with_query.rs) with a Query response and `QuerySignatureSet` with quorum of an active `WormholeGuardianSet`, verifies and updates the `latestRoot` from the World ID Identity Manager contract on Ethereum.
- [clean_up_root](programs/solana-world-id-program/src/instructions/clean_up_root.rs) closes a `Root` account which has expired, reimbursing the rent to the initial payer.
- [update_root_expiry](programs/solana-world-id-program/src/instructions/update_root_expiry.rs) updates a `Root`'s expiry if the `Config`'s `root_expiry` field has changed since it was initially calculated.
- [transfer_ownership](programs/solana-world-id-program/src/instructions/admin.rs) is the first of a two-step ownership transfer process which sets the `pending_owner` and locks the ability to upgrade.
- [claim_ownership](programs/solana-world-id-program/src/instructions/admin.rs) is the second step of the ownership transfer process, signed by either the `pending_owner` (to accept) or the existing `owner` (to cancel).
- [set_root_expiry](programs/solana-world-id-program/src/instructions/admin.rs) sets the `root_expiry` field. The `owner` must sign.
- [set_allowed_update_staleness](programs/solana-world-id-program/src/instructions/admin.rs) sets the `allowed_update_staleness` field. The `owner` must sign.

### Testing

```bash
anchor test
```
