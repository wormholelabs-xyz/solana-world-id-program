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
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { deriveGuardianSetKey } from "./helpers/guardianSet";
import { createVerifyQuerySignaturesInstructions } from "./helpers/verifySignature";
import { deriveRootKey } from "./helpers/root";
import { deriveLatestRootKey } from "./helpers/latestRoot";
import { BN } from "bn.js";

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

  it("Is initialized!", async () => {
    const programData = anchor.web3.PublicKey.findProgramAddressSync(
      [program.programId.toBuffer()],
      new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    )[0];
    await expect(
      program.methods
        .initialize({
          rootExpiry: new BN(24 * 60 * 60), // 24 hours
          allowedUpdateStaleness: new BN(5 * 60), // 5 mins
        })
        .accountsPartial({
          programData,
        })
        .rpc()
    ).to.be.fulfilled;
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
    {
      const response = QueryResponse.from(mockQueryResponse.bytes).responses[0]
        .response as EthCallQueryResponse;
      console.log(
        `Queried World ID root: ${BigInt(response.results[0])} (${
          response.results[0]
        })`
      );
    }

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
    const rootHash = mockQueryResponse.bytes.substring(
      mockQueryResponse.bytes.length - 64
    );
    console.log(`Verifying root: ${BigInt(`0x${rootHash}`)} (0x${rootHash})`);
    const root = deriveRootKey(
      program.programId,
      Buffer.from(rootHash, "hex"),
      0
    );
    const latestRoot = deriveLatestRootKey(program.programId, 0);
    await expect(
      program.methods
        .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: validMockSignatureSet.publicKey,
          root,
          latestRoot,
        })
        .rpc()
    ).to.be.fulfilled;
    const rootAcct = await program.account.root.fetch(root);
    // TODO: verify contents
    console.log(rootAcct);
    const latestRootAcct = await program.account.latestRoot.fetch(latestRoot);
    // TODO: verify contents
    // console.log(latestRootAcct);
  });
});
