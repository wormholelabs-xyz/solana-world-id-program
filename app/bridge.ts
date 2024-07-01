import {
  AnchorProvider,
  Program,
  Wallet,
  setProvider,
  web3,
} from "@coral-xyz/anchor";
import idl from "../target/idl/solana_world_id_program.json";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { deriveLatestRootKey } from "../tests/helpers/latestRoot";
import axios from "axios";
import {
  EthCallQueryRequest,
  EthCallQueryResponse,
  PerChainQueryRequest,
  QueryProxyMock,
  QueryProxyQueryResponse,
  QueryRequest,
  QueryResponse,
} from "@wormhole-foundation/wormhole-query-sdk";
import { createVerifyQuerySignaturesInstructions } from "../tests/helpers/verifySignature";
import { deriveGuardianSetKey } from "../tests/helpers/guardianSet";

const ETH_NODE_URL = "https://ethereum-rpc.publicnode.com";
// https://docs.wormhole.com/wormhole/reference/constants
const ETH_CHAIN_ID = 2;
// https://etherscan.io/address/0xf7134CE138832c1456F2a91D64621eE90c2bddEa
const ETH_WORLD_ID_IDENTITY_MANAGER =
  "0xf7134CE138832c1456F2a91D64621eE90c2bddEa";
// web3.eth.abi.encodeFunctionSignature("latestRoot()");
const LATEST_ROOT_SIGNATURE = "0xd7b0fef1";

const connection = new web3.Connection("http://127.0.0.1:8899", "confirmed");
const TEST_PAYER_PRIVATE_KEY = Buffer.from(
  require("../tests/keys/pFCBP4bhqdSsrWUVTgqhPsLrfEdChBK17vgFM7TxjxQ.json")
);
const wallet = new Wallet(web3.Keypair.fromSecretKey(TEST_PAYER_PRIVATE_KEY));

const provider = new AnchorProvider(connection, wallet);
setProvider(provider);

const program = new Program<SolanaWorldIdProgram>(idl as SolanaWorldIdProgram);

type RootHashAndBlockNumber = {
  hash: string;
  blockNumber: bigint;
};

async function getLatestEthereumRoot(): Promise<RootHashAndBlockNumber> {
  const response = await axios.post(ETH_NODE_URL, [
    {
      jsonrpc: "2.0",
      id: 0,
      method: "eth_call",
      params: [
        { to: ETH_WORLD_ID_IDENTITY_MANAGER, data: LATEST_ROOT_SIGNATURE },
        "latest",
      ],
    },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    },
  ]);
  if (!response?.data?.[0]?.result || !response?.data?.[1]?.result) {
    throw new Error(
      `Failed to read root from Ethereum: ${
        response?.data?.[0]?.error?.message ||
        response?.data?.[1]?.error?.message ||
        "unknown error"
      }`
    );
  }
  const hash = response.data[0].result.substring(2);
  const blockNumber = BigInt(response.data[1].result.number);
  return { hash, blockNumber };
}

async function getLatestSolanaRoot(): Promise<RootHashAndBlockNumber> {
  const latestRoot = await program.account.latestRoot.fetch(
    deriveLatestRootKey(program.programId, 0)
  );
  const hash = Buffer.from(latestRoot.root).toString("hex");
  const blockNumber = BigInt(latestRoot.readBlockNumber.toString());
  return { hash, blockNumber };
}

async function queryEthLatestRoot(
  blockNumber: bigint
): Promise<QueryProxyQueryResponse> {
  const query = new QueryRequest(42, [
    new PerChainQueryRequest(
      ETH_CHAIN_ID,
      new EthCallQueryRequest(`0x${blockNumber.toString(16)}`, [
        { to: ETH_WORLD_ID_IDENTITY_MANAGER, data: LATEST_ROOT_SIGNATURE },
      ])
    ),
  ]);
  const mock = new QueryProxyMock({
    [ETH_CHAIN_ID]: ETH_NODE_URL,
  });
  return await mock.mock(query);
}

const coreBridgeAddress = new web3.PublicKey(
  "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
);
const mockGuardianSetIndex = 5;

async function verifyQuerySigs(
  queryBytes: string,
  querySignatures: string[],
  signatureSet: web3.Keypair,
  wormholeProgramId: web3.PublicKey = coreBridgeAddress,
  guardianSetIndex: number = mockGuardianSetIndex
) {
  const instructions = await createVerifyQuerySignaturesInstructions(
    provider.connection,
    program,
    wormholeProgramId,
    provider.wallet.publicKey,
    queryBytes,
    querySignatures,
    signatureSet.publicKey,
    undefined,
    guardianSetIndex
  );
  const unsignedTransactions: web3.Transaction[] = [];
  for (let i = 0; i < instructions.length; i += 2) {
    unsignedTransactions.push(
      new web3.Transaction().add(...instructions.slice(i, i + 2))
    );
  }
  for (const tx of unsignedTransactions) {
    await provider.sendAndConfirm(tx, [signatureSet]);
  }
}

async function syncRoot() {
  const ethRoot = await getLatestEthereumRoot();
  const solRoot = await getLatestSolanaRoot();
  console.log("Eth root:", ethRoot);
  console.log("Sol root:", solRoot);
  if (
    ethRoot.hash !== solRoot.hash &&
    ethRoot.blockNumber > solRoot.blockNumber
  ) {
    console.log("Eth root is newer, querying...");
    const queryResponse = await queryEthLatestRoot(ethRoot.blockNumber);
    const mockEthCallQueryResponse = QueryResponse.from(queryResponse.bytes)
      .responses[0].response as EthCallQueryResponse;
    const newRootHash = mockEthCallQueryResponse.results[0].substring(2);
    if (newRootHash === ethRoot.hash) {
      console.log("Query successful! Updating...");
      const signatureSet = web3.Keypair.generate();
      await verifyQuerySigs(
        queryResponse.bytes,
        queryResponse.signatures,
        signatureSet
      );
      const tx = await program.methods
        .updateRootWithQuery(Buffer.from(queryResponse.bytes, "hex"), [
          ...Buffer.from(newRootHash, "hex"),
        ])
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: signatureSet.publicKey,
        })
        .rpc();
      console.log(`Successfully updated root on Solana: ${tx}`);
    } else {
      console.log(
        `Queried root mismatch! Ours: ${ethRoot.hash}, Theirs: ${newRootHash}`
      );
    }
  } else {
    console.log("Roots match, nothing to update.");
  }
}

if (typeof require !== "undefined" && require.main === module) {
  syncRoot();
}
