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
  EthCallWithFinalityQueryRequest,
  EthCallWithFinalityQueryResponse,
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
import { createVerifyQuerySignaturesInstructions } from "./helpers/verifySignature";
import { SystemProgram } from "@solana/web3.js";
import fmtTest from "./helpers/fmtTest";
import verifyQuerySigs from "./helpers/verifyQuerySigs";
import { PublicKey } from "@solana/web3.js";
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

  // This is an example ISuccessResult from IDKitWidget's onSuccess callback
  const idkitSuccessResult = {
    proof:
      "0x177606b1626d9de53cca760de8907c122dcd7a0a8e36d6714785643b11604a61290b36c88275913ac7a0493e43362eff9e75cfc407e8fb3baab5b70323f29dbe0aa915653679af4671b1abbe0d79d2f08ee30696b336b81321f6d21ef0817c641177998bcd88a114cec8fe64783ba28f3fb1cc7b82e6438a414596ec1d2a606010a45353ded3a594f599b6d4abbde58d6f64e2a1d705cdaa6850400eb58312392d56bba2718764fc9062b92159314937a9683f491e0e77253cd3a1000ce601632383b56798f90d32756497d00aab3ed4520ab743e1718fcd0707435e1cf24bfd23eb1717e04b27c3b9c98d098ab8f876f5a6fa72d2dccc6850f7c98d80d7549a",
    merkle_root:
      "0x29e7081a4cb49cd0119c81d766d9ca41cbdfaf3ce21c8ae0963b8d1b15db4d9a",
    nullifier_hash:
      "0x2aa975196dc1f4f9f57b8195bea9c61331e0012ec25484ed569782c49145721a",
    verification_level: "orb",
  };

  const signal = `0x${new PublicKey(
    "5yNbCZcCHeAxdmMJXcpFgmurEnygaVbCRwZNMMWETdeZ"
  )
    .toBuffer()
    .toString("hex")}`;

  const signalHash = hashToField(signal);

  const next_owner = anchor.web3.Keypair.generate();
  const validMockSignatureSet = anchor.web3.Keypair.generate();
  let mockQueryResponse: QueryProxyQueryResponse = null;
  let mockEthCallQueryResponse: EthCallQueryResponse = null;
  let rootHash: string = "";
  let rootKey: anchor.web3.PublicKey = null;

  async function getCurrentBlockNumber(program: Program<SolanaWorldIdProgram>) {
    const latestRootKey = deriveLatestRootKey(program.programId, 0);
    const currentLatestRoot = await program.account.latestRoot.fetch(
      latestRootKey
    );
    return currentLatestRoot.readBlockNumber;
  }

  function createMockResponse(
    mockQueryResponse: QueryProxyQueryResponse,
    blockNumber: anchor.BN,
    blockTime: bigint,
    rootHash: string
  ) {
    const response = QueryResponse.from(mockQueryResponse.bytes);
    const ethCallQueryResponse = response.responses[0]
      .response as EthCallQueryResponse;
    ethCallQueryResponse.blockNumber = BigInt(blockNumber.toString());
    ethCallQueryResponse.blockTime = blockTime;
    ethCallQueryResponse.results[0] = `0x${rootHash}`;
    return response;
  }

  async function signAndVerifyResponse(response: QueryResponse) {
    const responseBytes = response.serialize();
    const responseSigs = new QueryProxyMock({}).sign(responseBytes);
    const signatureSet = anchor.web3.Keypair.generate();
    await verifyQuerySigs(
      program,
      Buffer.from(responseBytes).toString("hex"),
      responseSigs,
      signatureSet,
      coreBridgeAddress,
      mockGuardianSetIndex
    );
    return { responseBytes, signatureSet };
  }

  async function updateRootWithQuery(
    program: Program<SolanaWorldIdProgram>,
    responseBytes: Buffer,
    rootHash: string,
    signatureSet: anchor.web3.Keypair
  ) {
    await program.methods
      .updateRootWithQuery(responseBytes, [...Buffer.from(rootHash, "hex")])
      .accountsPartial({
        guardianSet: deriveGuardianSetKey(
          coreBridgeAddress,
          mockGuardianSetIndex
        ),
        signatureSet: signatureSet.publicKey,
      })
      .rpc();
  }

  async function verifyRootUpdate(
    program: Program<SolanaWorldIdProgram>,
    rootHash: string,
    queryResponse: EthCallQueryResponse
  ) {
    const rootKey = deriveRootKey(
      program.programId,
      Buffer.from(rootHash, "hex"),
      0
    );
    const root = await program.account.root.fetch(rootKey);
    const config = await program.account.config.fetch(
      deriveConfigKey(program.programId)
    );
    assertRootMatches(
      root,
      queryResponse,
      config,
      anchor.getProvider().publicKey
    );

    const latestRootKey = deriveLatestRootKey(program.programId, 0);
    const updatedLatestRoot = await program.account.latestRoot.fetch(
      latestRootKey
    );
    assertLatestRootMatches(updatedLatestRoot, queryResponse, rootHash);
  }

  function assertRootMatches(
    root: {
      bump: number;
      readBlockNumber: anchor.BN;
      readBlockHash: number[];
      readBlockTime: anchor.BN;
      expiryTime: anchor.BN;
      refundRecipient: anchor.web3.PublicKey;
    },
    queryResponse: EthCallQueryResponse,
    config: {
      bump?: number;
      owner?: anchor.web3.PublicKey;
      pendingOwner?: anchor.web3.PublicKey;
      rootExpiry: anchor.BN;
      allowedUpdateStaleness?: anchor.BN;
    },
    refundRecipient: anchor.web3.PublicKey
  ) {
    assert(
      Buffer.from(root.readBlockHash).toString("hex") ===
        queryResponse.blockHash.substring(2),
      "readBlockHash does not match"
    );
    assert(
      root.readBlockNumber.eq(new BN(queryResponse.blockNumber.toString())),
      "readBlockNumber does not match"
    );
    assert(
      root.readBlockTime.eq(new BN(queryResponse.blockTime.toString())),
      "readBlockTime does not match"
    );
    assert(
      root.expiryTime.eq(
        new BN(queryResponse.blockTime.toString())
          .div(new BN(1_000_000))
          .add(config.rootExpiry)
      ),
      "expiryTime is incorrect"
    );
    assert(
      root.refundRecipient.equals(refundRecipient),
      "refundRecipient does not match"
    );
  }

  function assertLatestRootMatches(
    latestRoot: {
      bump: number;
      readBlockNumber: anchor.BN;
      readBlockHash: number[];
      readBlockTime: anchor.BN;
      root: number[];
    },
    queryResponse: EthCallQueryResponse,
    rootHash: string
  ) {
    assert(
      Buffer.from(latestRoot.readBlockHash).toString("hex") ===
        queryResponse.blockHash.substring(2),
      "latest root readBlockHash does not match"
    );
    assert(
      latestRoot.readBlockNumber.eq(
        new BN(queryResponse.blockNumber.toString())
      ),
      "latest root readBlockNumber does not match"
    );
    assert(
      latestRoot.readBlockTime.eq(new BN(queryResponse.blockTime.toString())),
      "latest root readBlockTime does not match"
    );
    assert(
      Buffer.from(latestRoot.root).equals(Buffer.from(rootHash, "hex")),
      "latest root does not match"
    );
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
      "AnchorError caused by account: deployer. Error Code: ConstraintRaw"
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
      "AnchorError caused by account: program_data. Error Code: ConstraintSeeds"
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

  it(
    fmtTest(
      "verify_query_signatures",
      "Rejects guardian set account not owned by the core bridge"
    ),
    async () => {
      await expect(
        verifyQuerySigs(
          program,
          mockQueryResponse.bytes,
          mockQueryResponse.signatures,
          validMockSignatureSet,
          devnetCoreBridgeAddress,
          0
        )
      ).to.be.rejectedWith(
        "Program log: AnchorError caused by account: guardian_set. Error Code: AccountOwnedByWrongProgram."
      );
    }
  );

  it(
    fmtTest("verify_query_signatures", "Rejects sysvar account mismatch"),
    async () => {
      const p = anchor.getProvider();
      const signatureSet = anchor.web3.Keypair.generate();

      const instructions = await createVerifyQuerySignaturesInstructions(
        p.connection,
        program,
        coreBridgeAddress,
        p.publicKey,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet.publicKey,
        undefined,
        mockGuardianSetIndex
      );
      const signatureStatus = new Array(19).fill(-1);
      signatureStatus[0] = 0;
      instructions[instructions.length - 1] = await program.methods
        .verifyQuerySignatures(signatureStatus)
        .accountsPartial({
          payer: p.publicKey,
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: signatureSet.publicKey,
          instructions: p.publicKey,
        })
        .instruction();
      const unsignedTransactions: anchor.web3.Transaction[] = [];
      for (let i = 0; i < instructions.length; i += 2) {
        unsignedTransactions.push(
          new anchor.web3.Transaction().add(...instructions.slice(i, i + 2))
        );
      }
      for (const tx of unsignedTransactions) {
        await expect(p.sendAndConfirm(tx, [signatureSet])).to.be.rejectedWith(
          "AccountSysvarMismatch"
        );
      }
    }
  );

  it(
    fmtTest(
      "verify_query_signatures",
      "Rejects signer indices instruction argument mismatch"
    ),
    async () => {
      const p = anchor.getProvider();
      const signatureSet = anchor.web3.Keypair.generate();

      const instructions = await createVerifyQuerySignaturesInstructions(
        p.connection,
        program,
        coreBridgeAddress,
        p.publicKey,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet.publicKey,
        undefined,
        mockGuardianSetIndex
      );
      const signatureStatus = new Array(19).fill(-1);
      instructions[instructions.length - 1] = await program.methods
        .verifyQuerySignatures(signatureStatus)
        .accountsPartial({
          payer: p.publicKey,
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: signatureSet.publicKey,
        })
        .instruction();
      const unsignedTransactions: anchor.web3.Transaction[] = [];
      for (let i = 0; i < instructions.length; i += 2) {
        unsignedTransactions.push(
          new anchor.web3.Transaction().add(...instructions.slice(i, i + 2))
        );
      }
      for (const tx of unsignedTransactions) {
        await expect(p.sendAndConfirm(tx, [signatureSet])).to.be.rejectedWith(
          "SignerIndicesMismatch"
        );
      }
    }
  );

  it(
    fmtTest("verify_query_signatures", "Rejects guardian set mismatch"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      // start the verification with one guardian set
      await verifyQuerySigs(
        program,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet
      );
      // then try to resume it with another
      await expect(
        verifyQuerySigs(
          program,
          mockQueryResponse.bytes,
          mockQueryResponse.signatures,
          signatureSet,
          undefined,
          expiredMockGuardianSetIndex
        )
      ).to.be.rejectedWith("GuardianSetMismatch");
    }
  );

  it(
    fmtTest("verify_query_signatures", "Rejects message mismatch"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      // start the verification with one message
      await verifyQuerySigs(
        program,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet
      );
      // then try to resume it with another
      const badBytes = Buffer.from("00" + mockQueryResponse.bytes, "hex");
      const badBytesSigs = new QueryProxyMock({}).sign(badBytes);
      await expect(
        verifyQuerySigs(
          program,
          badBytes.toString("hex"),
          badBytesSigs,
          signatureSet
        )
      ).to.be.rejectedWith("MessageMismatch");
    }
  );

  it(
    fmtTest("verify_query_signatures", "Rejects invalid guardian key recovery"),
    async () => {
      const p = anchor.getProvider();
      const signatureSet = anchor.web3.Keypair.generate();

      const instructions = await createVerifyQuerySignaturesInstructions(
        p.connection,
        program,
        coreBridgeAddress,
        p.publicKey,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet.publicKey,
        undefined,
        mockGuardianSetIndex
      );
      const signatureStatus = new Array(19).fill(-1);
      signatureStatus[1] = 0;
      instructions[instructions.length - 1] = await program.methods
        .verifyQuerySignatures(signatureStatus)
        .accountsPartial({
          payer: p.publicKey,
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: signatureSet.publicKey,
        })
        .instruction();
      const unsignedTransactions: anchor.web3.Transaction[] = [];
      for (let i = 0; i < instructions.length; i += 2) {
        unsignedTransactions.push(
          new anchor.web3.Transaction().add(...instructions.slice(i, i + 2))
        );
      }
      for (const tx of unsignedTransactions) {
        await expect(p.sendAndConfirm(tx, [signatureSet])).to.be.rejectedWith(
          "InvalidGuardianKeyRecovery"
        );
      }
    }
  );

  // This test is to ensure that we reject when grabbing the instruction before the `verify_query_signature` throws an error.
  it(
    fmtTest(
      "verify_query_signatures",
      "Rejects when there's no preceding Secp256k1 instruction"
    ),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const provider = anchor.getProvider();

      const instructions = await createVerifyQuerySignaturesInstructions(
        provider.connection,
        program,
        coreBridgeAddress,
        provider.publicKey,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet.publicKey,
        undefined,
        mockGuardianSetIndex
      );

      // Only keep the last instruction (verify_query_signatures)
      const verifyInstruction = instructions[instructions.length - 1];

      const tx = new anchor.web3.Transaction().add(verifyInstruction);
      await expect(
        provider.sendAndConfirm(tx, [signatureSet])
      ).to.be.rejectedWith("InstructionAtWrongIndex");
    }
  );

  // This test is to ensure that we reject when the preceding instruction is not a Secp256k1 instruction.
  it(
    fmtTest(
      "verify_query_signatures",
      "Rejects when preceding instruction is not Secp256k1"
    ),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      const provider = anchor.getProvider();

      const instructions = await createVerifyQuerySignaturesInstructions(
        provider.connection,
        program,
        coreBridgeAddress,
        provider.publicKey,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet.publicKey,
        undefined,
        mockGuardianSetIndex
      );

      // Insert a dummy instruction between Secp256k1 and verify_query_signatures
      const dummyInstruction = SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: provider.publicKey,
        lamports: 100,
      });

      instructions.splice(instructions.length - 1, 0, dummyInstruction);

      const tx = new anchor.web3.Transaction().add(...instructions);
      await expect(
        provider.sendAndConfirm(tx, [signatureSet])
      ).to.be.rejectedWith("InvalidSigVerifyInstruction");
    }
  );

  it(
    fmtTest("verify_query_signatures", "Rejects message with incorrect size"),
    async () => {
      const p = anchor.getProvider();
      const signatureSet = anchor.web3.Keypair.generate();

      // Create an incorrect message by adding an extra byte
      const incorrectBytes = Buffer.concat([
        Buffer.from(mockQueryResponse.bytes, "hex"),
        Buffer.alloc(1),
      ]);

      const instructions = await createVerifyQuerySignaturesInstructions(
        p.connection,
        program,
        coreBridgeAddress,
        p.publicKey,
        incorrectBytes.toString("hex"),
        mockQueryResponse.signatures,
        signatureSet.publicKey,
        undefined
      );

      // Now try to update the root with the incorrect bytes
      const tx = new anchor.web3.Transaction().add(...instructions);

      expect(p.sendAndConfirm(tx, [signatureSet])).to.be.rejectedWith(
        "InvalidSigVerifyInstruction"
      );
    }
  );

  it(
    fmtTest("verify_query_signatures", "Rejects empty sig verify instruction"),
    async () => {
      const p = anchor.getProvider();
      const signatureSet = anchor.web3.Keypair.generate();

      // Create an incorrect message by adding an extra byte
      const incorrectBytes = Buffer.concat([
        Buffer.from(mockQueryResponse.bytes, "hex"),
        Buffer.alloc(1),
      ]);

      const instructions = await createVerifyQuerySignaturesInstructions(
        p.connection,
        program,
        coreBridgeAddress,
        p.publicKey,
        incorrectBytes.toString("hex"),
        mockQueryResponse.signatures,
        signatureSet.publicKey,
        undefined,
        0,
        true
      );

      const tx = new anchor.web3.Transaction().add(...instructions);
      await expect(p.sendAndConfirm(tx, [signatureSet])).to.be.rejectedWith(
        "EmptySigVerifyInstruction"
      );
    }
  );

  it(
    fmtTest("verify_query_signatures", "Successfully verifies mock signatures"),
    async () => {
      await verifyQuerySigs(
        program,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        validMockSignatureSet
      );
      // this will fail if the account does not exist, match discriminator, and parse
      await expect(
        program.account.querySignatureSet.fetch(validMockSignatureSet.publicKey)
      ).to.be.fulfilled;
    }
  );

  // A repeat of the above test, but this time the signature set account is already initialized
  // in above test.
  it(
    fmtTest(
      "verify_query_signatures",
      "Successfully verifies mock signatures after initialization"
    ),
    async () => {
      await verifyQuerySigs(
        program,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        validMockSignatureSet
      );
      // this will fail if the account does not exist, match discriminator, and parse
      await expect(
        program.account.querySignatureSet.fetch(validMockSignatureSet.publicKey)
      ).to.be.fulfilled;
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects guardian set account mismatch"),
    async () => {
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(coreBridgeAddress, 2),
            signatureSet: validMockSignatureSet.publicKey,
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
          .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: validMockSignatureSet.publicKey,
            refundRecipient: next_owner.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: signature_set. Error Code: ConstraintHasOne."
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
            new Array(32).fill(0)
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("RootHashMismatch");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects invalid message hash"),
    async () => {
      await expect(
        program.methods
          .updateRootWithQuery(
            Buffer.from(mockQueryResponse.bytes + "00", "hex"),
            [...Buffer.from(rootHash, "hex")]
          )
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidMessageHash");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects un-parse-able response"),
    async () => {
      const badBytes = Buffer.from("00" + mockQueryResponse.bytes, "hex");
      const badBytesSigs = new QueryProxyMock({}).sign(badBytes);
      const signatureSet = anchor.web3.Keypair.generate();
      await verifyQuerySigs(
        program,
        badBytes.toString("hex"),
        badBytesSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(badBytes, [...Buffer.from(rootHash, "hex")])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("FailedToParseResponse");
    }
  );

  it(
    fmtTest("update_root_with_query", "Rejects expired guardian set"),
    async () => {
      const signatureSet = anchor.web3.Keypair.generate();
      await verifyQuerySigs(
        program,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet,
        undefined,
        expiredMockGuardianSetIndex
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              expiredMockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("GuardianSetExpired");
    }
  );

  it(fmtTest("update_root_with_query", "Rejects no quorum"), async () => {
    const signatureSet = anchor.web3.Keypair.generate();
    await verifyQuerySigs(
      program,
      mockQueryResponse.bytes,
      mockQueryResponse.signatures,
      signatureSet,
      undefined,
      noQuorumMockGuardianSetIndex
    );
    await expect(
      program.methods
        .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
          ...Buffer.from(rootHash, "hex"),
        ])
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            noQuorumMockGuardianSetIndex
          ),
          signatureSet: signatureSet.publicKey,
        })
        .rpc()
    ).to.be.rejectedWith("NoQuorum");
  });

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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidNumberOfRequests");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestChainId");
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
      await verifyQuerySigs(
        program,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestType");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestCallDataLength");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestContract");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidRequestSignature");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidNumberOfResponses");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseChainId");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseType");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseResultsLength");
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("InvalidResponseResultLength");
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
          .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: validMockSignatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("StaleBlockTime");
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
          .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: validMockSignatureSet.publicKey,
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
        program.account.querySignatureSet.fetch(validMockSignatureSet.publicKey)
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
      await verifyQuerySigs(
        program,
        mockQueryResponse.bytes,
        mockQueryResponse.signatures,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(mockQueryResponse.bytes, "hex"), [
            ...Buffer.from(rootHash, "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
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
      await verifyQuerySigs(
        program,
        Buffer.from(invalidResponseBytes).toString("hex"),
        invalidResponseSigs,
        signatureSet
      );
      await expect(
        program.methods
          .updateRootWithQuery(Buffer.from(invalidResponseBytes), [
            ...Buffer.from(rootHash.substring(2), "hex"),
          ])
          .accountsPartial({
            guardianSet: deriveGuardianSetKey(
              coreBridgeAddress,
              mockGuardianSetIndex
            ),
            signatureSet: signatureSet.publicKey,
          })
          .rpc()
      ).to.be.rejectedWith("StaleBlockNum");
    }
  );

  it(fmtTest("clean_up_root", "Rejects active root clean up"), async () => {
    await expect(
      program.methods.cleanUpRoot([...Buffer.from(rootHash, "hex")], [0]).rpc()
    ).to.be.rejectedWith("RootUnexpired");
  });

  it(
    fmtTest("update_root_expiry", "Rejects root expiry update noop"),
    async () => {
      await expect(
        program.methods
          .updateRootExpiry([...Buffer.from(rootHash, "hex")], [0])
          .rpc()
      ).to.be.rejectedWith("NoopExpiryUpdate");
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
      "AnchorError caused by account: config. Error Code: ConstraintHasOne"
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
        "AnchorError caused by account: config. Error Code: ConstraintHasOne"
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
        "AnchorError caused by account: config. Error Code: ConstraintHasOne"
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
        "AnchorError caused by account: config. Error Code: InvalidPendingOwner"
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
        "AnchorError caused by account: program_data. Error Code: ConstraintSeeds"
      );
    }
  );

  it(
    fmtTest(
      "transfer_ownership",
      "Rejects when upgrade_lock account is incorrect"
    ),
    async () => {
      const incorrectUpgradeLock = anchor.web3.Keypair.generate().publicKey;
      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];

      await expect(
        program.methods
          .transferOwnership()
          .accountsPartial({
            newOwner: next_owner.publicKey,
            upgradeLock: incorrectUpgradeLock,
            programData,
          })
          .rpc()
      ).to.be.rejectedWith(
        "AnchorError caused by account: upgrade_lock. Error Code: ConstraintSeeds"
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
      "AnchorError caused by account: program_data. Error Code: ConstraintSeeds"
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
      const rootHash = idkitSuccessResult.merkle_root.substring(2);
      mockEthCallQueryResponse.results[0] = idkitSuccessResult.merkle_root;
      const futureResponseBytes = futureResponse.serialize();
      const futureResponseSigs = new QueryProxyMock({}).sign(
        futureResponseBytes
      );
      await verifyQuerySigs(
        program,
        Buffer.from(futureResponseBytes).toString("hex"),
        futureResponseSigs,
        signatureSet
      );
      const rootKey = deriveRootKey(
        program.programId,
        Buffer.from(rootHash, "hex"),
        0
      );
      const latestRootKey = deriveLatestRootKey(program.programId, 0);
      // await expect(
      await program.methods
        .updateRootWithQuery(Buffer.from(futureResponseBytes), [
          ...Buffer.from(rootHash, "hex"),
        ])
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: signatureSet.publicKey,
        })
        .rpc();
      // ).to.be.fulfilled;
      const root = await program.account.root.fetch(rootKey);
      assertRootMatches(
        root,
        mockEthCallQueryResponse,
        { rootExpiry: new BN(24 * 60 * 60) }, // Assuming 24 hours expiry
        anchor.getProvider().publicKey
      );
      const latestRoot = await program.account.latestRoot.fetch(latestRootKey);
      assertLatestRootMatches(latestRoot, mockEthCallQueryResponse, rootHash);
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Successfully updates root with maximum allowed staleness"
    ),
    async () => {
      const maxStaleness = new BN("18446744073709551615"); // u64::MAX
      await program.methods.setAllowedUpdateStaleness(maxStaleness).rpc();

      const currentBlockNumber = await getCurrentBlockNumber(program);
      const oldRootHash =
        "0000000000000000000000000000000000000000000000000000000000000001";
      const oldResponse = createMockResponse(
        mockQueryResponse,
        currentBlockNumber.add(new BN(1)),
        BigInt(1000000), // Set to a very old time (1 second after epoch)
        oldRootHash
      );

      const { responseBytes, signatureSet } = await signAndVerifyResponse(
        oldResponse
      );

      await expect(
        updateRootWithQuery(
          program,
          Buffer.from(responseBytes),
          oldRootHash,
          signatureSet
        )
      ).to.be.fulfilled;

      await verifyRootUpdate(
        program,
        oldRootHash,
        EthCallQueryResponse.from(oldResponse.responses[0].response.serialize())
      );
    }
  );

  it(
    fmtTest(
      "update_root_with_query",
      "Successfully handles allowed update staleness underflow gracefully"
    ),
    async () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const slightlyMoreThanCurrentTime = new BN(currentTimestamp + 10);
      await program.methods
        .setAllowedUpdateStaleness(slightlyMoreThanCurrentTime)
        .rpc();

      const currentBlockNumber = await getCurrentBlockNumber(program);
      const newRootHash =
        "0000000000000000000000000000000000000000000000000000000000000002";
      const newResponse = createMockResponse(
        mockQueryResponse,
        currentBlockNumber.add(new BN(1)),
        BigInt(currentTimestamp * 1_000_000), // Convert to microseconds
        newRootHash
      );

      const { responseBytes, signatureSet } = await signAndVerifyResponse(
        newResponse
      );

      await expect(
        updateRootWithQuery(
          program,
          Buffer.from(responseBytes),
          newRootHash,
          signatureSet
        )
      ).to.be.fulfilled;

      await verifyRootUpdate(
        program,
        newRootHash,
        EthCallQueryResponse.from(newResponse.responses[0].response.serialize())
      );
    }
  );

  it(
    fmtTest(
      "verify_groth16_proof",
      "Successfully verifies a valid groth16 proof"
    ),
    async () => {
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
      ).to.be.rejectedWith("AccountNotInitialized");
    }
  );

  it(
    fmtTest(
      "verify_groth16_proof",
      "Rejects root hash instruction argument mismatch"
    ),
    async () => {
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
    ).to.be.rejectedWith("RootExpired");
    // put things back the way they were
    const twentyFourHours = new BN(24 * 60 * 60);
    await expect(program.methods.setRootExpiry(twentyFourHours).rpc()).to.be
      .fulfilled;
    await expect(program.methods.updateRootExpiry(rootHash, [0]).rpc()).to.be
      .fulfilled;
  });

  it(fmtTest("verify_groth16_proof", "Rejects an invalid proof"), async () => {
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
    ).to.be.rejectedWith("Groth16ProofVerificationFailed");
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
    ).to.be.rejectedWith("Groth16ProofVerificationFailed");
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
    ).to.be.rejectedWith("Groth16ProofVerificationFailed");
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
    ).to.be.rejectedWith("Groth16ProofVerificationFailed");
  });
});
