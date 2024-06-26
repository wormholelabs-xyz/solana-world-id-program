import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  EthCallQueryRequest,
  EthCallQueryResponse,
  PerChainQueryRequest,
  QueryProxyMock,
  QueryProxyQueryResponse,
  QueryRequest,
  QueryResponse,
} from "@wormhole-foundation/wormhole-query-sdk";
import axios from "axios";
import { assert, expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { deriveGuardianSetKey } from "./helpers/guardianSet";
import { createVerifyQuerySignaturesInstructions } from "./helpers/verifySignature";
import { deriveRootKey } from "./helpers/root";
import { deriveLatestRootKey } from "./helpers/latestRoot";
import { BN } from "bn.js";
import { deriveConfigKey } from "./helpers/config";

use(chaiAsPromised);

// borrowed from https://github.com/wormhole-foundation/wormhole-circle-integration/blob/solana/integration/solana/ts/tests/helpers/consts.ts
const PAYER_PRIVATE_KEY = Buffer.from(
  "7037e963e55b4455cf3f0a2e670031fa16bd1ea79d921a94af9bd46856b6b9c00c1a5886fe1093df9fc438c296f9f7275b7718b6bc0e156d8d336c58f083996d",
  "hex"
);

const ETH_NODE_URL = "https://ethereum-rpc.publicnode.com";
// https://docs.wormhole.com/wormhole/reference/constants
const ETH_CHAIN_ID = 2;
// https://etherscan.io/address/0xf7134CE138832c1456F2a91D64621eE90c2bddEa
const ETH_WORLD_ID_IDENTITY_MANAGER =
  "0xf7134CE138832c1456F2a91D64621eE90c2bddEa";
// web3.eth.abi.encodeFunctionSignature("latestRoot()");
const LATEST_ROOT_SIGNATURE = "0xd7b0fef1";

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

describe("solana-world-id-program", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SolanaWorldIdProgram as Program<SolanaWorldIdProgram>;

  const coreBridgeAddress = new anchor.web3.PublicKey(
    "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
  );

  const mockGuardianSetIndex = 5;

  const validMockSignatureSet = anchor.web3.Keypair.generate();
  let mockQueryResponse: QueryProxyQueryResponse = null;
  let rootKey: anchor.web3.PublicKey = null;

  it("Is initialized!", async () => {
    const programData = anchor.web3.PublicKey.findProgramAddressSync(
      [program.programId.toBuffer()],
      new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    )[0];
    const twentyFourHours = new BN(24 * 60 * 60);
    const fiveMinutes = new BN(5 * 60);
    await expect(
      program.methods
        .initialize({
          rootExpiry: twentyFourHours,
          allowedUpdateStaleness: fiveMinutes,
        })
        .accountsPartial({
          programData,
        })
        .rpc()
    ).to.be.fulfilled;
    const config = await program.account.config.fetch(
      deriveConfigKey(program.programId)
    );
    assert(
      config.allowedUpdateStaleness.eq(fiveMinutes),
      "allowed update staleness does not match"
    );
    assert(
      config.owner.equals(anchor.getProvider().publicKey),
      "owner does not match"
    );
    assert(config.pendingOwner === null, "pending owner is set");
    assert(config.rootExpiry.eq(twentyFourHours), "root expiry does not match");
  });

  it("Verifies mock signatures!", async () => {
    const p = anchor.getProvider();
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
    const mock = new QueryProxyMock({
      [ETH_CHAIN_ID]: ETH_NODE_URL,
    });
    const blockNumber = (
      await axios.post(ETH_NODE_URL, {
        method: "eth_blockNumber",
        params: [],
        id: 1,
        jsonrpc: "2.0",
      })
    ).data?.result;
    const query = new QueryRequest(42, [
      new PerChainQueryRequest(
        ETH_CHAIN_ID,
        new EthCallQueryRequest(blockNumber, [
          { to: ETH_WORLD_ID_IDENTITY_MANAGER, data: LATEST_ROOT_SIGNATURE },
        ])
      ),
    ]);
    mockQueryResponse = await mock.mock(query);
    const instructions = await createVerifyQuerySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      mockQueryResponse.bytes,
      mockQueryResponse.signatures,
      validMockSignatureSet.publicKey,
      undefined,
      mockGuardianSetIndex
    );
    const unsignedTransactions: anchor.web3.Transaction[] = [];
    for (let i = 0; i < instructions.length; i += 2) {
      unsignedTransactions.push(
        new anchor.web3.Transaction().add(...instructions.slice(i, i + 2))
      );
    }
    for (const tx of unsignedTransactions) {
      await expect(
        anchor.web3.sendAndConfirmTransaction(p.connection, tx, [
          payer,
          validMockSignatureSet,
        ])
      ).to.be.fulfilled;
    }
    // this will fail if the account does not exist, match discriminator, and parse
    await expect(
      program.account.querySignatureSet.fetch(validMockSignatureSet.publicKey)
    ).to.be.fulfilled;
  });

  it("Verifies mock queries!", async () => {
    const response = QueryResponse.from(mockQueryResponse.bytes).responses[0]
      .response as EthCallQueryResponse;
    const rootHash = response.results[0].substring(2);
    rootKey = deriveRootKey(program.programId, Buffer.from(rootHash, "hex"), 0);
    const latestRootKey = deriveLatestRootKey(program.programId, 0);
    await expect(
      program.methods
        .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: validMockSignatureSet.publicKey,
          root: rootKey,
          latestRoot: latestRootKey,
        })
        .rpc()
    ).to.be.fulfilled;

    const root = await program.account.root.fetch(rootKey);
    assert(
      Buffer.from(root.readBlockHash).toString("hex") ===
        response.blockHash.substring(2),
      "readBlockHash does not match"
    );
    assert(
      root.readBlockNumber.eq(new BN(response.blockNumber.toString())),
      "readBlockNumber does not match"
    );
    assert(
      root.readBlockTime.eq(new BN(response.blockTime.toString())),
      "readBlockNumber does not match"
    );
    assert(
      root.expiryTime.eq(
        new BN(
          (
            response.blockTime / BigInt(1_000_000) +
            BigInt(24 * 60 * 60)
          ).toString()
        )
      ),
      "expiryTime is incorrect"
    );
    assert(
      root.refundRecipient.equals(anchor.getProvider().publicKey),
      "refundRecipient does not match"
    );
    const latestRoot = await program.account.latestRoot.fetch(latestRootKey);
    assert(
      Buffer.from(latestRoot.readBlockHash).toString("hex") ===
        response.blockHash.substring(2),
      "readBlockHash does not match"
    );
    assert(
      latestRoot.readBlockNumber.eq(new BN(response.blockNumber.toString())),
      "readBlockNumber does not match"
    );
    assert(
      latestRoot.readBlockTime.eq(new BN(response.blockTime.toString())),
      "readBlockNumber does not match"
    );
    assert(
      latestRoot.root.equals(Buffer.from(rootHash, "hex")),
      "root does not match"
    );
  });

  it("Closed the signature set!", async () => {
    await expect(
      program.account.querySignatureSet.fetch(validMockSignatureSet.publicKey)
    ).to.be.rejectedWith("Account does not exist or has no data");
  });

  it("Rejects active root clean up!", async () => {
    await expect(
      program.methods
        .cleanUpRoot()
        .accounts({
          root: rootKey,
        })
        .rpc()
    ).to.be.rejectedWith("RootUnexpired");
  });

  it("Rejects root expiry update noop!", async () => {
    await expect(
      program.methods
        .updateRootExpiry()
        .accounts({
          root: rootKey,
        })
        .rpc()
    ).to.be.rejectedWith("NoopExpiryUpdate");
  });

  it("Updates expiry config!", async () => {
    const oneSecond = new BN(1);
    await expect(
      program.methods
        .setRootExpiry(oneSecond)
        .accounts({ config: deriveConfigKey(program.programId) })
        .rpc()
    ).to.be.fulfilled;
    const config = await program.account.config.fetch(
      deriveConfigKey(program.programId)
    );
    assert(config.rootExpiry.eq(oneSecond), "config does not match");
  });

  it("Updates root expiry!", async () => {
    await expect(
      program.methods
        .updateRootExpiry()
        .accounts({
          root: rootKey,
        })
        .rpc()
    ).to.be.fulfilled;
    const root = await program.account.root.fetch(rootKey);
    assert(
      root.readBlockTime
        .div(new BN(1_000_000))
        .add(new BN(1))
        .eq(root.expiryTime),
      "root not updated correctly"
    );
  });

  it("Cleans up expired roots!", async () => {
    await sleep(1000);
    const p = anchor.getProvider();
    console.log(await p.connection.getBalance(p.publicKey));
    await expect(
      program.methods
        .cleanUpRoot()
        .accounts({
          root: rootKey,
        })
        .rpc()
    ).to.be.fulfilled;
    await expect(program.account.root.fetch(rootKey)).to.be.rejectedWith(
      "Account does not exist or has no data"
    );
    console.log(await p.connection.getBalance(p.publicKey));
  });
});
