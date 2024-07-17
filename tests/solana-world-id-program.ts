import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  EthCallQueryRequest,
  EthCallQueryResponse,
  EthCallWithFinalityQueryRequest,
  EthCallWithFinalityQueryResponse,
  PerChainQueryRequest,
  QueryProxyMock,
  QueryProxyQueryResponse,
  QueryRequest,
  QueryResponse,
} from "@wormhole-foundation/wormhole-query-sdk";
import axios from "axios";
import { BN } from "bn.js";
import { assert, expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { deriveConfigKey } from "./helpers/config";
import { deriveGuardianSetKey } from "./helpers/guardianSet";
import { deriveLatestRootKey } from "./helpers/latestRoot";
import { deriveRootKey } from "./helpers/root";
import {
  appIdActionToExternalNullifierHash,
  hashToField,
} from "./helpers/utils/hashing";
import { signaturesToSolanaArray } from "./helpers/utils/signaturesToSolanaArray";

use(chaiAsPromised);

const ETH_RPC_URL = "https://ethereum-rpc.publicnode.com";
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

const fmtTest = (instruction: string, name: string) =>
  `${instruction.padEnd(30)} ${name}`;

describe("solana-world-id-program", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SolanaWorldIdProgram as Program<SolanaWorldIdProgram>;

  const programPaidBy = (
    payer: anchor.web3.Keypair
  ): Program<SolanaWorldIdProgram> => {
    const newProvider = new anchor.AnchorProvider(
      anchor.getProvider().connection,
      new anchor.Wallet(payer),
      {}
    );
    return new anchor.Program<SolanaWorldIdProgram>(program.idl, newProvider);
  };

  const devnetCoreBridgeAddress = new anchor.web3.PublicKey(
    "Bridge1p5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o"
  );
  const coreBridgeAddress = new anchor.web3.PublicKey(
    "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
  );
  const mockGuardianSetIndex = 5;
  const expiredMockGuardianSetIndex = 6;
  const noQuorumMockGuardianSetIndex = 7;
  const twoMockGuardianSetIndex = 8;

  // This is an example ISuccessResult from IDKitWidget's onSuccess callback
  const idkitSuccessResult = {
    proof:
      "0x1eef0990c59b6985413ba1589afb6a6b673a4723ea3215923850b89c61aceeee2748da443e3fdf161456b05cb82bc2e6f1ace9e67cdaf76732ff9bf31e6b82b724d7c33a4998f4cd2d1c9f2c90a249910be0aa23b882c9756371769d1af1923d0509d6791ff17c3604425a4a113b5103c014c8f724edc649f1417e56b6cdb4422896c0d5492652ebb1e001016431ae457b58361b5b6cbea25565236362f06fae098cf3493c1c299313672ebd85fde41607261491e3cc57dea51ee7951b47020b21b73fceef2b8fb59c6f5f0302dffa36f9ec01319a257f20052b83f2d7a3232c22f5d0600fb036a5b8d2a3d6d92a3c043b665510d97bf9020510b5f9c692a9a5",
    merkle_root:
      "0x05628ccef5b585f9a5afb764d22835f2c71b10beb4b212e45ec9e4d0354c9764",
    nullifier_hash:
      "0x2aa975196dc1f4f9f57b8195bea9c61331e0012ec25484ed569782c49145721a",
    verification_level: "orb",
  };

  const next_owner = anchor.web3.Keypair.generate();
  const validMockSignatureSet = anchor.web3.Keypair.generate();
  let mockQueryResponse: QueryProxyQueryResponse = null;
  let mockEthCallQueryResponse: EthCallQueryResponse = null;
  let rootHash: string = "";
  let rootKey: anchor.web3.PublicKey = null;

  async function postQuerySigs(
    querySignatures: string[],
    signatureKeypair: anchor.web3.Keypair,
    totalSignatures: number = 0,
    p: Program<SolanaWorldIdProgram> = program
  ) {
    const signatureData = signaturesToSolanaArray(querySignatures);
    await p.methods
      .postSignatures(signatureData, totalSignatures || signatureData.length)
      .accounts({ guardianSignatures: signatureKeypair.publicKey })
      .signers([signatureKeypair])
      .rpc();
  }

  it(fmtTest("initialize", "Rejects deployer account mismatch"), async () => {
    {
      const p = anchor.getProvider();
      const tx = await p.connection.requestAirdrop(
        next_owner.publicKey,
        10000000000
      );
      await p.connection.confirmTransaction({
        ...(await p.connection.getLatestBlockhash()),
        signature: tx,
      });
    }
    const program = programPaidBy(next_owner);
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
    ).to.be.rejectedWith(
      "AnchorError caused by account: deployer. Error Code: ConstraintRaw."
    );
  });

  it(fmtTest("initialize", "Rejects without deployer as signer"), async () => {
    const program = programPaidBy(next_owner);
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
          deployer: anchor.getProvider().publicKey,
        })
        .rpc()
    ).to.be.rejectedWith(
      `Missing signature for public key [\`${anchor
        .getProvider()
        .publicKey.toString()}\`].`
    );
  });

  it(fmtTest("initialize", "Rejects incorrect program_data"), async () => {
    const programData = anchor.web3.PublicKey.findProgramAddressSync(
      [devnetCoreBridgeAddress.toBuffer()],
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
    ).to.be.rejectedWith(
      "AnchorError caused by account: program_data. Error Code: ConstraintSeeds."
    );
  });

  it(fmtTest("initialize", "Successfully initializes"), async () => {
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

  it(fmtTest("initialize", "Rejects duplicate initialization"), async () => {
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
    ).to.be.rejectedWith(
      "Allocate: account Address { address: 5FfhKEsPMY6376WW9dUE1FTyRTttH4annJNJ4NCyF4av, base: None } already in use"
    );
  });

  it(fmtTest("helper", "Mocks query"), async () => {
    const mock = new QueryProxyMock({
      [ETH_CHAIN_ID]: ETH_RPC_URL,
    });
    const blockNumber = (
      await axios.post(ETH_RPC_URL, {
        method: "eth_blockNumber",
        params: [],
        id: 1,
        jsonrpc: "2.0",
      })
    )?.data?.result;
    const query = new QueryRequest(42, [
      new PerChainQueryRequest(
        ETH_CHAIN_ID,
        new EthCallQueryRequest(blockNumber, [
          { to: ETH_WORLD_ID_IDENTITY_MANAGER, data: LATEST_ROOT_SIGNATURE },
        ])
      ),
    ]);
    mockQueryResponse = await mock.mock(query);
    mockEthCallQueryResponse = QueryResponse.from(mockQueryResponse.bytes)
      .responses[0].response as EthCallQueryResponse;
    rootHash = mockEthCallQueryResponse.results[0].substring(2);
    rootKey = deriveRootKey(program.programId, Buffer.from(rootHash, "hex"), 0);
  });

  it(fmtTest("post_signatures", "Successfully posts signatures"), async () => {
    await postQuerySigs(mockQueryResponse.signatures, validMockSignatureSet);
    // this will fail if the account does not exist, match discriminator, and parse
    await expect(
      program.account.guardianSignatures.fetch(validMockSignatureSet.publicKey)
    ).to.be.fulfilled;
  });

  it(
    fmtTest("post_signatures", "Successfully appends signatures"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const expectedSigs1 = signaturesToSolanaArray(
        mockQueryResponse.signatures
      );
      await postQuerySigs(mockQueryResponse.signatures, signatureSet, 2);
      expect(
        (await program.account.guardianSignatures.fetch(signatureSet.publicKey))
          .guardianSignatures
      ).to.deep.equal(expectedSigs1);

      const diffBytes = Buffer.from("00" + mockQueryResponse.bytes, "hex");
      const diffSigs = new QueryProxyMock({}).sign(diffBytes);
      const expectedSigs2 = [
        ...expectedSigs1,
        ...signaturesToSolanaArray(diffSigs),
      ];
      await postQuerySigs(diffSigs, signatureSet, 2);
      expect(
        (await program.account.guardianSignatures.fetch(signatureSet.publicKey))
          .guardianSignatures
      ).to.deep.equal(expectedSigs2);
    }
  );

  it(
    fmtTest("post_signatures", "Rejects append by non-initial payer"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet, 2);
      const nextOwnersProgram = programPaidBy(next_owner);
      await expect(
        postQuerySigs(
          mockQueryResponse.signatures,
          signatureSet,
          2,
          nextOwnersProgram
        )
      ).to.be.rejectedWith("WriteAuthorityMismatch.");
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Rejects guardian set account not owned by the core bridge"
    ),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            0
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(devnetCoreBridgeAddress, 0),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: guardian_set. Error Code: AccountOwnedByWrongProgram."
      );
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects guardian set account mismatch"),
    async () => {
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(coreBridgeAddress, 2),
            guardianSignatures: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: guardian_set. Error Code: ConstraintSeeds."
      );
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Rejects refund recipient account mismatch"
    ),
    async () => {
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: validMockSignatureSet.publicKey,
            refundRecipient: next_owner.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: guardian_signatures. Error Code: ConstraintHasOne."
      );
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Rejects root hash instruction argument mismatch"
    ),
    async () => {
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            new Array(32).fill(0),
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("RootHashMismatch.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid message hash"),
    async () => {
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes + "00", "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidGuardianKeyRecovery.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects un-parse-able response"),
    async () => {
      const badBytes = Buffer.from("00" + mockQueryResponse.bytes, "hex");
      const badBytesSigs = new QueryProxyMock({}).sign(badBytes);
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(badBytesSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            badBytes,
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("FailedToParseResponse.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects expired guardian set"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            expiredMockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              expiredMockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("GuardianSetExpired.");
    }
  );

  it(fmtTest("update_root_with_query", "Rejects no quorum"), async () => {
    const signatureSet = anchor.web3.Keypair.generate();
    await postQuerySigs(mockQueryResponse.signatures, signatureSet);
    await expect(
      program.methods
        .updateRootWithQuery(
          Buffer.from(mockQueryResponse.bytes, "hex"),
          [...Buffer.from(rootHash, "hex")],
          noQuorumMockGuardianSetIndex
        )
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            noQuorumMockGuardianSetIndex
          ),
          guardianSignatures: signatureSet.publicKey,
        })
        .rpc()
    ).to.be.rejectedWith("NoQuorum.");
  });

  it(
    fmtTest(
      "update_root_with_query",
      "Rejects out of order guardian signatures"
    ),
    async () => {
      const validSignatureSet = anchor.web3.Keypair.generate();
      const twoMockGuardianSignatures = new QueryProxyMock({}, [
        // https://github.com/wormhole-foundation/wormhole/blob/main/scripts/devnet-consts.json#L320
        "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0",
        "c3b2e45c422a1602333a64078aeb42637370b0f48fe385f9cfa6ad54a8e0c47e",
      ]).sign(QueryResponse.from(mockQueryResponse.bytes).serialize());
      // first, test that the correct order would have worked
      await postQuerySigs(twoMockGuardianSignatures, validSignatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            twoMockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              twoMockGuardianSetIndex
            ),
            guardianSignatures: validSignatureSet.publicKey,
          })
          .simulate()
      ).to.be.fulfilled;
      // then, test that the incorrect order gets rejected
      const invalidSignatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(
        [twoMockGuardianSignatures[1], twoMockGuardianSignatures[0]],
        invalidSignatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            twoMockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              twoMockGuardianSetIndex
            ),
            guardianSignatures: invalidSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidGuardianIndexNonIncreasing.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects duplicate guardian signatures"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(
        new Array(13).fill(mockQueryResponse.signatures[0]),
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            noQuorumMockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              noQuorumMockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidGuardianIndexNonIncreasing.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects guardian index out of bounds"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(
        [mockQueryResponse.signatures[0].substring(0, 130) + "01"],
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidGuardianIndexOutOfRange.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid signature"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const badRecovery = "02";
      await postQuerySigs(
        [
          `${mockQueryResponse.signatures[0].substring(
            0,
            128
          )}${badRecovery}${mockQueryResponse.signatures[0].substring(130)}`,
        ],
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidSignature.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid number of requests"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      invalidResponse.request.requests.push(
        invalidResponse.request.requests[0]
      );
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidNumberOfRequests.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid request chain id"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      invalidResponse.request.requests[0].chainId = 4;
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestChainId.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid request type"),
    async () => {
      const mock = new QueryProxyMock({
        [ETH_CHAIN_ID]: ETH_RPC_URL,
      });
      const blockNumber = (
        await axios.post(ETH_RPC_URL, {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBlockByNumber",
          params: ["finalized", false],
        })
      )?.data?.result?.number;
      const query = new QueryRequest(42, [
        new PerChainQueryRequest(
          ETH_CHAIN_ID,
          new EthCallWithFinalityQueryRequest(blockNumber, "finalized", [
            { to: ETH_WORLD_ID_IDENTITY_MANAGER, data: LATEST_ROOT_SIGNATURE },
          ])
        ),
      ]);
      const mockQueryResponse = await mock.mock(query);
      const mockEthCallQueryResponse = QueryResponse.from(
        mockQueryResponse.bytes
      ).responses[0].response as EthCallWithFinalityQueryResponse;
      const rootHash = mockEthCallQueryResponse.results[0].substring(2);
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestType.");
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Rejects invalid request call data length"
    ),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      const query = invalidResponse.request.requests[0]
        .query as EthCallQueryRequest;
      query.callData.push(query.callData[0]);
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestCallDataLength.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid request contract"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      const query = invalidResponse.request.requests[0]
        .query as EthCallQueryRequest;
      query.callData[0].to = `0x00${ETH_WORLD_ID_IDENTITY_MANAGER.substring(
        4
      )}`;
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestContract.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid request signature"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      const query = invalidResponse.request.requests[0]
        .query as EthCallQueryRequest;
      query.callData[0].data = `0x00${LATEST_ROOT_SIGNATURE.substring(4)}`;
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestSignature.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid number of responses"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      invalidResponse.responses.push(invalidResponse.responses[0]);
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidNumberOfResponses.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid response chain id"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      invalidResponse.responses[0].chainId = 4;
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseChainId.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid response type"),
    async () => {
      const mock = new QueryProxyMock({
        [ETH_CHAIN_ID]: ETH_RPC_URL,
      });
      const blockNumber = (
        await axios.post(ETH_RPC_URL, {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBlockByNumber",
          params: ["finalized", false],
        })
      )?.data?.result?.number;
      const query = new QueryRequest(42, [
        new PerChainQueryRequest(
          ETH_CHAIN_ID,
          new EthCallWithFinalityQueryRequest(blockNumber, "finalized", [
            { to: ETH_WORLD_ID_IDENTITY_MANAGER, data: LATEST_ROOT_SIGNATURE },
          ])
        ),
      ]);
      const finalityMockQueryResponse = await mock.mock(query);
      const invalidResponse = QueryResponse.from(
        finalityMockQueryResponse.bytes
      );
      invalidResponse.request = QueryResponse.from(
        mockQueryResponse.bytes
      ).request;
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseType.");
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Rejects invalid response results length"
    ),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      const queryResponse = invalidResponse.responses[0]
        .response as EthCallQueryResponse;
      queryResponse.results.push(queryResponse.results[0]);
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseResultsLength.");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid response result length"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      const queryResponse = invalidResponse.responses[0]
        .response as EthCallQueryResponse;
      queryResponse.results[0] += "00";
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseResultLength.");
    }
  );

  it(
    fmtTest(
      "set_allowed_update_staleness",
      "Successfully updates staleness config"
    ),
    async () => {
      const zeroSeconds = new BN(0);
      await expect(program.methods.setAllowedUpdateStaleness(zeroSeconds).rpc())
        .to.be.fulfilled;
      const config = await program.account.config.fetch(
        deriveConfigKey(program.programId)
      );
      assert(
        config.allowedUpdateStaleness.eq(zeroSeconds),
        "config does not match"
      );
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects stale block time"),
    async () => {
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("StaleBlockTime.");
    }
  );

  it(
    fmtTest(
      "set_allowed_update_staleness",
      "Successfully updates staleness config (again)"
    ),
    async () => {
      const fiveMinutes = new BN(5 * 60);
      await expect(program.methods.setAllowedUpdateStaleness(fiveMinutes).rpc())
        .to.be.fulfilled;
      const config = await program.account.config.fetch(
        deriveConfigKey(program.programId)
      );
      assert(
        config.allowedUpdateStaleness.eq(fiveMinutes),
        "config does not match"
      );
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Successfully verifies mock queries and updates root"
    ),
    async () => {
      const latestRootKey = deriveLatestRootKey(program.programId, 0);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.fulfilled;
      const root = await program.account.root.fetch(rootKey);
      assert(
        Buffer.from(root.readBlockHash).toString("hex") ===
          mockEthCallQueryResponse.blockHash.substring(2),
        "readBlockHash does not match"
      );
      assert(
        root.readBlockNumber.eq(
          new BN(mockEthCallQueryResponse.blockNumber.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        root.readBlockTime.eq(
          new BN(mockEthCallQueryResponse.blockTime.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        root.expiryTime.eq(
          new BN(
            (
              mockEthCallQueryResponse.blockTime / BigInt(1_000_000) +
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
          mockEthCallQueryResponse.blockHash.substring(2),
        "readBlockHash does not match"
      );
      assert(
        latestRoot.readBlockNumber.eq(
          new BN(mockEthCallQueryResponse.blockNumber.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        latestRoot.readBlockTime.eq(
          new BN(mockEthCallQueryResponse.blockTime.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        Buffer.from(latestRoot.root).equals(Buffer.from(rootHash, "hex")),
        "root does not match"
      );
    }
  );

  it(
    fmtTest("update_root_with_query", "Successfully closed the signature set"),
    async () => {
      await expect(
        program.account.guardianSignatures.fetch(
          validMockSignatureSet.publicKey
        )
      ).to.be.rejectedWith("Account does not exist or has no data");
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Rejects valid root which already exists"
    ),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes, "hex"),
            [...Buffer.from(rootHash, "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("already in use");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects stale block number"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const invalidResponse = QueryResponse.from(mockQueryResponse.bytes);
      const queryResponse = invalidResponse.responses[0]
        .response as EthCallQueryResponse;
      queryResponse.blockNumber -= BigInt(1);
      // root must also be spoofed to create a different account - the contract does not accept the same root twice
      // in reality, one could have queried a block some time back, prior to the most recent root update
      const rootHash =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      queryResponse.results[0] = rootHash;
      const invalidResponseBytes = invalidResponse.serialize();
      const invalidResponseSigs = new QueryProxyMock({}).sign(
        invalidResponseBytes
      );
      await postQuerySigs(invalidResponseSigs, signatureSet);
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(invalidResponseBytes),
            [...Buffer.from(rootHash.substring(2), "hex")],
            mockGuardianSetIndex
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("StaleBlockNum.");
    }
  );

  it(fmtTest("clean_up_root", "Rejects active root clean up"), async () => {
    await expect(
      program.methods.cleanUpRoot([...Buffer.from(rootHash, "hex")], [0]).rpc()
    ).to.be.rejectedWith("RootUnexpired.");
  });

  it(
    fmtTest("update_root_expiry", "Rejects root expiry update noop"),
    async () => {
      await expect(
        program.methods
          .updateRootExpiry([...Buffer.from(rootHash, "hex")], [0])
          .rpc()
      ).to.be.rejectedWith("NoopExpiryUpdate.");
    }
  );

  it(
    fmtTest("set_root_expiry", "Successfully updates expiry config"),
    async () => {
      const oneSecond = new BN(1);
      await expect(program.methods.setRootExpiry(oneSecond).rpc()).to.be
        .fulfilled;
      const config = await program.account.config.fetch(
        deriveConfigKey(program.programId)
      );
      assert(config.rootExpiry.eq(oneSecond), "config does not match");
    }
  );

  it(
    fmtTest(
      "update_root_expiry",
      "Rejects root hash instruction argument mismatch"
    ),
    async () => {
      await expect(
        program.methods
          .updateRootExpiry(new Array(32).fill(0), [0])
          .accountsPartial({
            root: rootKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: root. Error Code: ConstraintSeeds."
      );
    }
  );

  it(
    fmtTest(
      "update_root_expiry",
      "Rejects verification type instruction argument mismatch"
    ),
    async () => {
      await expect(
        program.methods
          .updateRootExpiry([...Buffer.from(rootHash, "hex")], [1])
          .accountsPartial({
            root: rootKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: root. Error Code: ConstraintSeeds."
      );
    }
  );

  it(
    fmtTest("update_root_expiry", "Successfully updates root expiry"),
    async () => {
      await expect(
        program.methods
          .updateRootExpiry([...Buffer.from(rootHash, "hex")], [0])
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
    }
  );

  it(
    fmtTest("clean_up_root", "Rejects root hash instruction argument mismatch"),
    async () => {
      await expect(
        program.methods
          .cleanUpRoot(new Array(32).fill(0), [0])
          .accountsPartial({
            root: rootKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: root. Error Code: ConstraintSeeds."
      );
    }
  );

  it(
    fmtTest(
      "clean_up_root",
      "Rejects verification type instruction argument mismatch"
    ),
    async () => {
      await expect(
        program.methods
          .cleanUpRoot([...Buffer.from(rootHash, "hex")], [1])
          .accountsPartial({
            root: rootKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: root. Error Code: ConstraintSeeds."
      );
    }
  );

  it(
    fmtTest("clean_up_root", "Rejects refund recipient account mismatch"),
    async () => {
      await expect(
        program.methods
          .cleanUpRoot([...Buffer.from(rootHash, "hex")], [0])
          .accountsPartial({
            refundRecipient: next_owner.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: root. Error Code: ConstraintHasOne."
      );
    }
  );

  it(
    fmtTest("clean_up_root", "Successfully cleans up an expired root"),
    async () => {
      await sleep(1000);
      await expect(
        program.methods
          .cleanUpRoot([...Buffer.from(rootHash, "hex")], [0])
          .rpc()
      ).to.be.fulfilled;
      await expect(program.account.root.fetch(rootKey)).to.be.rejectedWith(
        "Account does not exist or has no data"
      );
    }
  );

  it(
    fmtTest("set_root_expiry", "Successfully updates expiry config (again)"),
    async () => {
      const twentyFourHours = new BN(24 * 60 * 60);
      await expect(program.methods.setRootExpiry(twentyFourHours).rpc()).to.be
        .fulfilled;
      const config = await program.account.config.fetch(
        deriveConfigKey(program.programId)
      );
      assert(config.rootExpiry.eq(twentyFourHours), "config does not match");
    }
  );

  it(fmtTest("set_root_expiry", "Rejects owner account mismatch"), async () => {
    const program = programPaidBy(next_owner);
    await expect(
      program.methods.setRootExpiry(new BN(1)).rpc()
    ).to.be.rejectedWith(
      "AnchorError caused by account: config. Error Code: ConstraintHasOne."
    );
  });

  it(
    fmtTest("set_root_expiry", "Rejects without owner as signer"),
    async () => {
      const program = programPaidBy(next_owner);
      await expect(
        program.methods
          .setRootExpiry(new BN(1))
          .accountsPartial({
            owner: anchor.getProvider().publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        `Missing signature for public key [\`${anchor
          .getProvider()
          .publicKey.toString()}\`].`
      );
    }
  );

  it(
    fmtTest("set_allowed_update_staleness", "Rejects owner account mismatch"),
    async () => {
      const program = programPaidBy(next_owner);
      await expect(
        program.methods.setAllowedUpdateStaleness(new BN(1)).rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: config. Error Code: ConstraintHasOne."
      );
    }
  );

  it(
    fmtTest("set_allowed_update_staleness", "Rejects without owner as signer"),
    async () => {
      const program = programPaidBy(next_owner);
      await expect(
        program.methods
          .setAllowedUpdateStaleness(new BN(1))
          .accountsPartial({
            owner: anchor.getProvider().publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        `Missing signature for public key [\`${anchor
          .getProvider()
          .publicKey.toString()}\`].`
      );
    }
  );

  it(
    fmtTest("transfer_ownership", "Rejects owner account mismatch"),
    async () => {
      const program = programPaidBy(next_owner);
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .transferOwnership()
          .accountsPartial({
            newOwner: next_owner.publicKey,
            programData,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: config. Error Code: ConstraintHasOne."
      );
    }
  );

  it(
    fmtTest("transfer_ownership", "Rejects without owner as signer"),
    async () => {
      const program = programPaidBy(next_owner);
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .transferOwnership()
          .accountsPartial({
            owner: anchor.getProvider().publicKey,
            newOwner: next_owner.publicKey,
            programData,
          })
          .rpc()
      ).to.be.rejectedWith(
        `Missing signature for public key [\`${anchor
          .getProvider()
          .publicKey.toString()}\`].`
      );
    }
  );

  it(
    fmtTest(
      "claim_ownership",
      "Rejects owner or pending owner account mismatch"
    ),
    async () => {
      const program = programPaidBy(next_owner);
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .claimOwnership()
          .accountsPartial({
            newOwner: next_owner.publicKey,
            programData,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: config. Error Code: InvalidPendingOwner."
      );
    }
  );

  it(
    fmtTest(
      "claim_ownership",
      "Rejects without owner or pending owner as signer"
    ),
    async () => {
      const program = programPaidBy(next_owner);
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .claimOwnership()
          .accountsPartial({
            newOwner: anchor.getProvider().publicKey,
            programData,
          })
          .rpc()
      ).to.be.rejectedWith(
        `Missing signature for public key [\`${anchor
          .getProvider()
          .publicKey.toString()}\`].`
      );
    }
  );

  it(
    fmtTest("transfer_ownership", "Rejects incorrect program_data"),
    async () => {
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [devnetCoreBridgeAddress.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .transferOwnership()
          .accountsPartial({
            newOwner: next_owner.publicKey,
            programData,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: program_data. Error Code: ConstraintSeeds."
      );
    }
  );

  it(fmtTest("claim_ownership", "Rejects incorrect program_data"), async () => {
    const programData = anchor.web3.PublicKey.findProgramAddressSync(
      [devnetCoreBridgeAddress.toBuffer()],
      new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    )[0];
    await expect(
      program.methods
        .claimOwnership()
        .accountsPartial({
          newOwner: anchor.getProvider().publicKey,
          programData,
        })
        .rpc()
    ).to.be.rejectedWith(
      "AnchorError caused by account: program_data. Error Code: ConstraintSeeds."
    );
  });

  it(
    fmtTest(
      "claim_ownership",
      "Rejects when upgrade_lock is not upgrade_authority_address"
    ),
    async () => {
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .claimOwnership()
          .accountsPartial({
            newOwner: anchor.getProvider().publicKey,
            programData,
          })
          .rpc()
      ).to.be.rejectedWith(
        "Program BPFLoaderUpgradeab1e11111111111111111111111 failed: Incorrect authority provided"
      );
    }
  );

  // This will fail on a test validator with
  // Program BPFLoaderUpgradeab1e11111111111111111111111 failed: instruction changed executable accounts data
  it.skip(
    fmtTest("transfer_ownership", "Successfully initiates ownership transfer"),
    async () => {
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .transferOwnership()
          .accountsPartial({
            newOwner: next_owner.publicKey,
            programData,
          })
          .rpc()
      ).to.be.fulfilled;
      const config = await program.account.config.fetch(
        deriveConfigKey(program.programId)
      );
      assert(
        config.pendingOwner.equals(next_owner.publicKey),
        "pending owner does not match"
      );
    }
  );

  // This cannot complete because `transfer_ownership` cannot complete
  it.skip(
    fmtTest("claim_ownership", "Successfully cancels ownership transfer"),
    async () => {
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .claimOwnership()
          .accountsPartial({
            newOwner: anchor.getProvider().publicKey,
            programData,
          })
          .rpc()
      ).to.be.fulfilled;
      const config = await program.account.config.fetch(
        deriveConfigKey(program.programId)
      );
      assert(config.pendingOwner === null, "pending owner does not match");
      assert(
        config.owner.equals(anchor.getProvider().publicKey),
        "owner does not match"
      );
    }
  );

  // This cannot complete because `transfer_ownership` cannot complete
  it.skip(
    fmtTest("claim_ownership", "Successfully completes ownership transfer"),
    async () => {
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expect(
        program.methods
          .transferOwnership()
          .accountsPartial({
            newOwner: next_owner.publicKey,
            programData,
          })
          .rpc()
      ).to.be.fulfilled;
      const programNextOwner = programPaidBy(next_owner);
      await expect(
        programNextOwner.methods
          .claimOwnership()
          .accountsPartial({
            newOwner: next_owner.publicKey,
            programData,
          })
          .rpc()
      ).to.be.fulfilled;
      const config = await program.account.config.fetch(
        deriveConfigKey(program.programId)
      );
      assert(config.pendingOwner === null, "pending owner does not match");
      assert(config.owner.equals(next_owner.publicKey), "owner does not match");
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Successfully verifies and updates subsequent root"
    ),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const futureResponse = QueryResponse.from(mockQueryResponse.bytes);
      const mockEthCallQueryResponse = futureResponse.responses[0]
        .response as EthCallQueryResponse;
      mockEthCallQueryResponse.blockNumber += BigInt(1);
      // This is the root from Sepolia at block 6243824 when the following test proof was generated
      // i.e. `05628ccef5b585f9a5afb764d22835f2c71b10beb4b212e45ec9e4d0354c9764` in hex
      const rootHash = BigInt(
        "2435687079378363547963954908279976286426984521078105058052473218447824426852"
      )
        .toString(16)
        .padStart(64, "0");
      mockEthCallQueryResponse.results[0] = `0x${rootHash}`;
      const futureResponseBytes = futureResponse.serialize();
      const futureResponseSigs = new QueryProxyMock({}).sign(
        futureResponseBytes
      );
      await postQuerySigs(futureResponseSigs, signatureSet);
      const rootKey = deriveRootKey(
        program.programId,
        Buffer.from(rootHash, "hex"),
        0
      );
      const latestRootKey = deriveLatestRootKey(program.programId, 0);
      // await expect(
      await program.methods
        .updateRootWithQuery(
          Buffer.from(futureResponseBytes),
          [...Buffer.from(rootHash, "hex")],
          mockGuardianSetIndex
        )
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          guardianSignatures: signatureSet.publicKey,
        })
        .rpc();
      // ).to.be.fulfilled;
      const root = await program.account.root.fetch(rootKey);
      assert(
        Buffer.from(root.readBlockHash).toString("hex") ===
          mockEthCallQueryResponse.blockHash.substring(2),
        "readBlockHash does not match"
      );
      assert(
        root.readBlockNumber.eq(
          new BN(mockEthCallQueryResponse.blockNumber.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        root.readBlockTime.eq(
          new BN(mockEthCallQueryResponse.blockTime.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        root.expiryTime.eq(
          new BN(
            (
              mockEthCallQueryResponse.blockTime / BigInt(1_000_000) +
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
          mockEthCallQueryResponse.blockHash.substring(2),
        "readBlockHash does not match"
      );
      assert(
        latestRoot.readBlockNumber.eq(
          new BN(mockEthCallQueryResponse.blockNumber.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        latestRoot.readBlockTime.eq(
          new BN(mockEthCallQueryResponse.blockTime.toString())
        ),
        "readBlockNumber does not match"
      );
      assert(
        Buffer.from(latestRoot.root).equals(Buffer.from(rootHash, "hex")),
        "root does not match"
      );
    }
  );

  it(
    fmtTest(
      "verify_groth16_proof",
      "Successfully verifies a valid groth16 proof"
    ),
    async () => {
      // This is the default anvil wallet
      const signal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const signalHash = hashToField(signal);
      // This is an example appId and action created via https://developer.worldcoin.org
      const appId = "app_staging_7d23b838b02776cebd87b86ac3248641";
      const action = "testing";
      const externalNullifierHash = appIdActionToExternalNullifierHash(
        appId,
        action
      );
      const rootHash = [
        ...Buffer.from(idkitSuccessResult.merkle_root.substring(2), "hex"),
      ];
      const nullifierHash = [
        ...Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
      ];
      const proof = [
        ...Buffer.from(idkitSuccessResult.proof.substring(2), "hex"),
      ];
      await expect(
        program.methods
          .verifyGroth16Proof(
            rootHash,
            [0],
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
          )
          .rpc()
      ).to.be.fulfilled;
    }
  );

  it(
    fmtTest(
      "verify_groth16_proof",
      "Rejects root hash without a corresponding PDA"
    ),
    async () => {
      // This is the default anvil wallet
      const signal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const signalHash = hashToField(signal);
      // This is an example appId and action created via https://developer.worldcoin.org
      const appId = "app_staging_7d23b838b02776cebd87b86ac3248641";
      const action = "testing";
      const externalNullifierHash = appIdActionToExternalNullifierHash(
        appId,
        action
      );
      const rootHash = [
        ...Buffer.from(
          "00" + idkitSuccessResult.merkle_root.substring(4),
          "hex"
        ),
      ];
      const nullifierHash = [
        ...Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
      ];
      const proof = [
        ...Buffer.from(idkitSuccessResult.proof.substring(2), "hex"),
      ];
      await expect(
        program.methods
          .verifyGroth16Proof(
            rootHash,
            [0],
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
          )
          .rpc()
      ).to.be.rejectedWith("AccountNotInitialized.");
    }
  );

  it(
    fmtTest(
      "verify_groth16_proof",
      "Rejects root hash instruction argument mismatch"
    ),
    async () => {
      // This is the default anvil wallet
      const signal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const signalHash = hashToField(signal);
      // This is an example appId and action created via https://developer.worldcoin.org
      const appId = "app_staging_7d23b838b02776cebd87b86ac3248641";
      const action = "testing";
      const externalNullifierHash = appIdActionToExternalNullifierHash(
        appId,
        action
      );
      const badRootHash = [
        ...Buffer.from(
          "00" + idkitSuccessResult.merkle_root.substring(4),
          "hex"
        ),
      ];
      const nullifierHash = [
        ...Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
      ];
      const proof = [
        ...Buffer.from(idkitSuccessResult.proof.substring(2), "hex"),
      ];
      await expect(
        program.methods
          .verifyGroth16Proof(
            badRootHash,
            [0],
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
          )
          .accountsPartial({
            root: deriveRootKey(
              program.programId,
              Buffer.from(idkitSuccessResult.merkle_root.substring(2), "hex"),
              0
            ),
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: root. Error Code: ConstraintSeeds."
      );
    }
  );

  it(
    fmtTest(
      "verify_groth16_proof",
      "Rejects verification type instruction argument mismatch"
    ),
    async () => {
      // This is the default anvil wallet
      const signal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
      const signalHash = hashToField(signal);
      // This is an example appId and action created via https://developer.worldcoin.org
      const appId = "app_staging_7d23b838b02776cebd87b86ac3248641";
      const action = "testing";
      const externalNullifierHash = appIdActionToExternalNullifierHash(
        appId,
        action
      );
      const rootHash = [
        ...Buffer.from(idkitSuccessResult.merkle_root.substring(2), "hex"),
      ];
      const nullifierHash = [
        ...Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
      ];
      const proof = [
        ...Buffer.from(idkitSuccessResult.proof.substring(2), "hex"),
      ];
      await expect(
        program.methods
          .verifyGroth16Proof(
            rootHash,
            [1],
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
          )
          .accountsPartial({
            root: deriveRootKey(program.programId, Buffer.from(rootHash), 0),
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: root. Error Code: ConstraintSeeds."
      );
    }
  );

  it(fmtTest("verify_groth16_proof", "Rejects an expired root"), async () => {
    // This is the default anvil wallet
    const signal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const signalHash = hashToField(signal);
    // This is an example appId and action created via https://developer.worldcoin.org
    const appId = "app_staging_7d23b838b02776cebd87b86ac3248641";
    const action = "testing";
    const externalNullifierHash = appIdActionToExternalNullifierHash(
      appId,
      action
    );
    const rootHash = [
      ...Buffer.from(idkitSuccessResult.merkle_root.substring(2), "hex"),
    ];
    const nullifierHash = [
      ...Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
    ];
    const proof = [
      ...Buffer.from(idkitSuccessResult.proof.substring(2), "hex"),
    ];
    // update the expiry config
    const oneSecond = new BN(1);
    await expect(program.methods.setRootExpiry(oneSecond).rpc()).to.be
      .fulfilled;
    // expire the root
    await expect(program.methods.updateRootExpiry(rootHash, [0]).rpc()).to.be
      .fulfilled;
    await sleep(1000);
    await expect(
      program.methods
        .verifyGroth16Proof(
          rootHash,
          [0],
          signalHash,
          nullifierHash,
          externalNullifierHash,
          proof
        )
        .rpc()
    ).to.be.rejectedWith("RootExpired.");
    // put things back the way they were
    const twentyFourHours = new BN(24 * 60 * 60);
    await expect(program.methods.setRootExpiry(twentyFourHours).rpc()).to.be
      .fulfilled;
    await expect(program.methods.updateRootExpiry(rootHash, [0]).rpc()).to.be
      .fulfilled;
  });

  it(fmtTest("verify_groth16_proof", "Rejects an invalid proof"), async () => {
    // This is the default anvil wallet
    const signal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const signalHash = hashToField(signal);
    const badSignal = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92260";
    const badSignalHash = hashToField(badSignal);
    // This is an example appId and action created via https://developer.worldcoin.org
    const appId = "app_staging_7d23b838b02776cebd87b86ac3248641";
    const action = "testing";
    const externalNullifierHash = appIdActionToExternalNullifierHash(
      appId,
      action
    );
    const badExternalNullifierHash = appIdActionToExternalNullifierHash(
      appId,
      "garbage"
    );
    const rootHash = [
      ...Buffer.from(idkitSuccessResult.merkle_root.substring(2), "hex"),
    ];
    const nullifierHash = [
      ...Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
    ];
    const badNullifierHash = [
      ...Buffer.from(
        "00" + idkitSuccessResult.nullifier_hash.substring(4),
        "hex"
      ),
    ];
    const proof = [
      ...Buffer.from(idkitSuccessResult.proof.substring(2), "hex"),
    ];
    const badProof = [
      ...Buffer.from("00" + idkitSuccessResult.proof.substring(4), "hex"),
    ];
    await expect(
      program.methods
        .verifyGroth16Proof(
          rootHash,
          [0],
          badSignalHash,
          nullifierHash,
          externalNullifierHash,
          proof
        )
        .rpc()
    ).to.be.rejectedWith("Groth16ProofVerificationFailed.");
    await expect(
      program.methods
        .verifyGroth16Proof(
          rootHash,
          [0],
          signalHash,
          badNullifierHash,
          externalNullifierHash,
          proof
        )
        .rpc()
    ).to.be.rejectedWith("Groth16ProofVerificationFailed.");
    await expect(
      program.methods
        .verifyGroth16Proof(
          rootHash,
          [0],
          signalHash,
          nullifierHash,
          badExternalNullifierHash,
          proof
        )
        .rpc()
    ).to.be.rejectedWith("Groth16ProofVerificationFailed.");
    await expect(
      program.methods
        .verifyGroth16Proof(
          rootHash,
          [0],
          signalHash,
          nullifierHash,
          externalNullifierHash,
          badProof
        )
        .rpc()
    ).to.be.rejectedWith("Groth16ProofVerificationFailed.");
  });

  it(
    fmtTest("close_signatures", "Successfully closes signature accounts"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet);
      await expect(
        program.account.guardianSignatures.fetch(signatureSet.publicKey)
      ).to.be.fulfilled;
      await expect(
        program.methods
          .closeSignatures()
          .accounts({
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.fulfilled;
      await expect(
        program.account.guardianSignatures.fetch(signatureSet.publicKey)
      ).to.be.rejectedWith("Account does not exist or has no data");
    }
  );

  it(
    fmtTest("close_signatures", "Rejects refund recipient account mismatch"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet);
      const nextOwnersProgram = programPaidBy(next_owner);
      await expect(
        nextOwnersProgram.methods
          .closeSignatures()
          .accounts({
            guardianSignatures: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: guardian_signatures. Error Code: ConstraintHasOne."
      );
    }
  );

  it(
    fmtTest("close_signatures", "Rejects without refund recipient as signer"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await postQuerySigs(mockQueryResponse.signatures, signatureSet);
      const nextOwnersProgram = programPaidBy(next_owner);
      await expect(
        nextOwnersProgram.methods
          .closeSignatures()
          .accountsPartial({
            guardianSignatures: signatureSet.publicKey,
            refundRecipient: anchor.getProvider().publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        `Missing signature for public key [\`${anchor
          .getProvider()
          .publicKey.toString()}\`].`
      );
    }
  );
});
