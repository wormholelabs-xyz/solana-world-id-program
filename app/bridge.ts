import { web3 } from "@coral-xyz/anchor";
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
import { deriveGuardianSetKey } from "../tests/helpers/guardianSet";
import { deriveLatestRootKey } from "../tests/helpers/latestRoot";
import { createVerifyQuerySignaturesInstructions } from "../tests/helpers/verifySignature";
import { getEnv } from "./env";

const {
  MOCK,
  QUERY_URL,
  QUERY_API_KEY,
  SLEEP,
  ETH_RPC_URL,
  ETH_CHAIN_ID,
  ETH_WORLD_ID_IDENTITY_MANAGER,
  LATEST_ROOT_SIGNATURE,
  coreBridgeAddress,
  mockGuardianSetIndex,
  provider,
  program,
} = getEnv();

async function sleep(timeout: number) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

type RootHashAndBlockNumber = {
  hash: string;
  blockNumber: bigint;
};

async function getLatestEthereumRoot(): Promise<RootHashAndBlockNumber> {
  const response = await axios.post(ETH_RPC_URL, [
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
  if (MOCK) {
    const mock = new QueryProxyMock({
      [ETH_CHAIN_ID]: ETH_RPC_URL,
    });
    return await mock.mock(query);
  }
  const serialized = Buffer.from(query.serialize()).toString("hex");
  return (
    await axios.post<QueryProxyQueryResponse>(
      QUERY_URL,
      { bytes: serialized },
      { headers: { "X-API-Key": QUERY_API_KEY } }
    )
  ).data;
}

async function verifyQuerySigs(
  queryBytes: string,
  querySignatures: string[],
  signatureSet: web3.Keypair,
  wormholeProgramId: web3.PublicKey = coreBridgeAddress,
  guardianSetIndex: number | undefined = mockGuardianSetIndex
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

async function runSyncRoot(timeout: number) {
  let retry = 0;
  while (true) {
    try {
      await syncRoot();
      retry = 0;
      await sleep(timeout);
    } catch (e) {
      retry++;
      console.error(e);
      const expoBacko = timeout * 2 ** retry;
      console.warn(`backing off for ${expoBacko}ms`);
      await sleep(expoBacko);
    }
  }
}

if (typeof require !== "undefined" && require.main === module) {
  if (SLEEP) {
    console.log("Sleep is set. Running as a service.");
    runSyncRoot(SLEEP);
  } else {
    syncRoot();
  }
}
