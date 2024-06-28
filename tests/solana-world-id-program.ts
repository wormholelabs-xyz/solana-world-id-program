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
  require("./keys/pFCBP4bhqdSsrWUVTgqhPsLrfEdChBK17vgFM7TxjxQ.json")
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

  const next_owner = anchor.web3.Keypair.generate();
  const validMockSignatureSet = anchor.web3.Keypair.generate();
  let mockQueryResponse: QueryProxyQueryResponse = null;
  let mockEthCallQueryResponse: EthCallQueryResponse = null;
  let rootHash: string = "";
  let rootKey: anchor.web3.PublicKey = null;

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
    mockEthCallQueryResponse = QueryResponse.from(mockQueryResponse.bytes)
      .responses[0].response as EthCallQueryResponse;
    rootHash = mockEthCallQueryResponse.results[0].substring(2);
    rootKey = deriveRootKey(program.programId, Buffer.from(rootHash, "hex"), 0);
  });

  it(
    fmtTest("verify_query_signatures", "Successfully verifies mock signatures"),
    async () => {
      const p = anchor.getProvider();
      const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
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
});
