import { web3 } from "@coral-xyz/anchor";
import {
  EthCallQueryRequest,
  EthCallQueryResponse,
  PerChainQueryRequest,
  QueryProxyMock,
  QueryProxyQueryResponse,
  QueryRequest,
  QueryResponse,
  signaturesToSolanaArray,
} from "@wormhole-foundation/wormhole-query-sdk";
import axios from "axios";
import { Logger } from "winston";
import { getWormholeBridgeData } from "../tests/helpers/config";
import { deriveGuardianSetKey } from "../tests/helpers/guardianSet";
import { deriveLatestRootKey } from "../tests/helpers/latestRoot";
import { cleanUpRoots } from "./cleanup";
import { getEnv } from "./env";

const {
  NETWORK,
  MOCK,
  QUERY_URL,
  QUERY_API_KEY,
  SLEEP,
  CLEANUP,
  ETH_RPC_URL,
  ETH_CHAIN_ID,
  ETH_WORLD_ID_IDENTITY_MANAGER,
  LATEST_ROOT_SIGNATURE,
  coreBridgeAddress,
  mockGuardianSetIndex,
  provider,
  program,
  logger,
} = getEnv(true);

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

async function getGuardianSetIndex(): Promise<number> {
  if (mockGuardianSetIndex !== undefined) {
    return mockGuardianSetIndex;
  }
  const info = await getWormholeBridgeData(
    provider.connection,
    coreBridgeAddress
  );
  return info.guardianSetIndex;
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

async function syncRoot(logger: Logger) {
  const ethRoot = await getLatestEthereumRoot();
  const solRoot = await getLatestSolanaRoot();
  logger.info(`Eth root: ${ethRoot.blockNumber.toString()} ${ethRoot.hash}`);
  logger.info(`Sol root: ${solRoot.blockNumber.toString()} ${solRoot.hash}`);
  if (
    ethRoot.hash !== solRoot.hash &&
    ethRoot.blockNumber > solRoot.blockNumber
  ) {
    logger.debug("Eth root is newer, querying...");
    const queryResponse = await queryEthLatestRoot(ethRoot.blockNumber);
    const mockEthCallQueryResponse = QueryResponse.from(queryResponse.bytes)
      .responses[0].response as EthCallQueryResponse;
    const newRootHash = mockEthCallQueryResponse.results[0].substring(2);
    if (newRootHash === ethRoot.hash) {
      logger.debug("Query successful! Updating...");
      const guardianSetIndex = await getGuardianSetIndex();
      const signatureSet = web3.Keypair.generate();
      const signatureData = signaturesToSolanaArray(queryResponse.signatures);
      await program.methods
        .postSignatures(signatureData, signatureData.length)
        .accounts({ guardianSignatures: signatureSet.publicKey })
        .signers([signatureSet])
        .rpc();
      const tx = await program.methods
        .updateRootWithQuery(
          Buffer.from(queryResponse.bytes, "hex"),
          [...Buffer.from(newRootHash, "hex")],
          guardianSetIndex
        )
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            guardianSetIndex
          ),
          guardianSignatures: signatureSet.publicKey,
        })
        .preInstructions(
          NETWORK === "mainnet"
            ? [
                anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
                  units: 420_000,
                }),
              ]
            : []
        )
        .rpc();
      logger.info(`Successfully updated root on Solana: ${tx}`);
    } else {
      logger.warn(
        `Queried root mismatch! Ours: ${ethRoot.hash}, Theirs: ${newRootHash}`
      );
    }
  } else {
    logger.debug("Roots match, nothing to update.");
  }
}

async function runWithRetry(
  fn: (logger: Logger) => Promise<void>,
  timeout: number,
  logger: Logger
) {
  let retry = 0;
  while (true) {
    try {
      await fn(logger);
      retry = 0;
      await sleep(timeout);
    } catch (e) {
      retry++;
      logger.error(e);
      const expoBacko = timeout * 2 ** retry;
      logger.warn(`backing off for ${expoBacko}ms`);
      await sleep(expoBacko);
    }
  }
}

if (typeof require !== "undefined" && require.main === module) {
  if (SLEEP) {
    logger.info("Sleep is set. Running as a service.");
    runWithRetry(syncRoot, SLEEP, logger.child({ source: "sync" }));
    if (CLEANUP) {
      logger.info("Cleanup is set. Running intermittent cleanup.");
      runWithRetry(
        async (logger: Logger) => {
          await cleanUpRoots(program, logger);
        },
        CLEANUP,
        logger.child({ source: "cleanup" })
      );
    }
  } else {
    syncRoot(logger);
  }
}
