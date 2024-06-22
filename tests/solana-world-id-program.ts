import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  QueryProxyMock,
  QueryResponse,
} from "@wormhole-foundation/wormhole-query-sdk";
import { assert, expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { getWormholeBridgeData } from "./helpers/config";
import { deriveGuardianSetKey } from "./helpers/guardianSet";
import { createVerifySignaturesInstructions } from "./helpers/verifySignature";

use(chaiAsPromised);

// borrowed from https://github.com/wormhole-foundation/wormhole-circle-integration/blob/solana/integration/solana/ts/tests/helpers/consts.ts
export const PAYER_PRIVATE_KEY = Buffer.from(
  "7037e963e55b4455cf3f0a2e670031fa16bd1ea79d921a94af9bd46856b6b9c00c1a5886fe1093df9fc438c296f9f7275b7718b6bc0e156d8d336c58f083996d",
  "hex"
);

describe("solana-world-id-program", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SolanaWorldIdProgram as Program<SolanaWorldIdProgram>;

  const coreBridgeAddress = new anchor.web3.PublicKey(
    "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
  );

  const mockGuardianSetIndex = 5;

  it("Core exists!", async () => {
    const p = anchor.getProvider();
    {
      // devnet
      const coreBridge = await p.connection.getAccountInfo(
        new anchor.web3.PublicKey("Bridge1p5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o")
      );
      assert(coreBridge !== null, "devnet core bridge program does not exist");
      const bridgeConfig = await p.connection.getAccountInfo(
        new anchor.web3.PublicKey(
          "FKoMTctsC7vJbEqyRiiPskPnuQx2tX1kurmvWByq5uZP"
        )
      );
      assert(
        bridgeConfig !== null,
        "devnet bridge config account does not exist"
      );
      const guardianSet = await p.connection.getAccountInfo(
        new anchor.web3.PublicKey(
          "6MxkvoEwgB9EqQRLNhvYaPGhfcLtBtpBqdQugr3AZUgD"
        )
      );
      assert(
        guardianSet !== null,
        "devnet guardian set account does not exist"
      );
    }
    {
      // testnet
      const coreBridge = await p.connection.getAccountInfo(
        new anchor.web3.PublicKey(
          "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5"
        )
      );
      assert(coreBridge !== null, "testnet core bridge program does not exist");
      const bridgeConfig = await p.connection.getAccountInfo(
        new anchor.web3.PublicKey(
          "6bi4JGDoRwUs9TYBuvoA7dUVyikTJDrJsJU1ew6KVLiu"
        )
      );
      assert(
        bridgeConfig !== null,
        "testnet bridge config account does not exist"
      );
      const guardianSet = await p.connection.getAccountInfo(
        new anchor.web3.PublicKey("dxZtypiKT5D9LYzdPxjvSZER9MgYfeRVU5qpMTMTRs4")
      );
      assert(
        guardianSet !== null,
        "testnet guardian set account does not exist"
      );
    }
    {
      // mainnet
      const coreBridge = await p.connection.getAccountInfo(coreBridgeAddress);
      assert(coreBridge !== null, "mainnet core bridge program does not exist");
      const bridgeConfig = await p.connection.getAccountInfo(
        new anchor.web3.PublicKey(
          "2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn"
        )
      );
      assert(
        bridgeConfig !== null,
        "mainnet bridge config account does not exist"
      );
      const info = await getWormholeBridgeData(p.connection, coreBridgeAddress);
      const currentGuardianSetIndex = info.guardianSetIndex;
      assert(
        mockGuardianSetIndex === currentGuardianSetIndex + 1,
        "mockGuardianSetIndex is not set to following index"
      );
      for (
        let guardianSetIndex = 0;
        guardianSetIndex <= mockGuardianSetIndex;
        guardianSetIndex++
      ) {
        const gsAddr = deriveGuardianSetKey(
          coreBridgeAddress,
          guardianSetIndex
        );
        const guardianSet = await p.connection.getAccountInfo(
          new anchor.web3.PublicKey(gsAddr)
        );
        assert(
          guardianSet !== null,
          `mainnet guardian set ${guardianSetIndex} account (${gsAddr}) does not exist`
        );
      }
    }
  });

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });

  const validSignatureSet = anchor.web3.Keypair.generate();
  const validMockSignatureSet = anchor.web3.Keypair.generate();
  const expiredSignatureSet = anchor.web3.Keypair.generate();
  const wethNameResponse = {
    bytes:
      "01000051ced87ef0a0bb371964f793bb665a01435d57c9dc79b9fb6f31323f99f557ee0fa583718753cb3b35fe7c2e9bab2afde3f8cfdbeee0432804cb3c9146027a9401000000370100000001010002010000002a0000000930783132346330643601c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000406fdde030100020100000095000000000124c0d60f319af73bad19735c2f795e3bf22c0cb3d6be77b5fbd3bc1cf197efdbfb506c000610e4cf31cfc001000000600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000d5772617070656420457468657200000000000000000000000000000000000000",
    signatures: [
      "f122af3db0ae62af57bc16f0b3e79c86cbfc860a5994ca65928c06a739a2f4ca0496c7c1de38350e7b7cdc573fa0b7af981f3ac3d60298d67c76ca99d3bcf1040002",
      "7b9af5d9a3438b5d44e04b7ae8c64894b8ea6a94701bf048bd106a3c79a6d2896843dae20b8db3fea62520565ddaf95a24d77783dfd990f7dc60a1a5c39d16840103",
      "1a86399f16aee73e4aac7d9b06359805a818dd753cd3be77d7934a086f32b6d15d9166fa2d30af365c92bd6a8500c94a377d30a4b64741326f220ea920f4ecc20104",
      "d4e9a063e8c015bf33081f2e37b3379870d5de6798d40694a69e92dcf66264540c84b26737617b93742b74d55068295c68ab7630efa8dc4f6d40b9c30ff17fb40006",
      "998f80bd8c4f30ad30850782e9aaa24212470e233d48a126f3b174e241d8668872d0c37d306aecd15a6e740306bb625e31692ab1c58e89fe6030fa00b1e34c4d0107",
      "59a772f2626f7376ff8a5279cea20290b625febd9b0dc8c312fcf59a3427445b4a97acbfe9394eacd709a6c49763bcb9d6bf7464f32020338a0f2edc824864f00109",
      "4160ea981f0c5c1e9677aea518e5e999216dc6320b92037aea92266975468e9b2be7e73594f8e5b58290f57d7d0875654da779f38e1b167d06f71fead234d4a3010a",
      "634f00406ff3d8ef65c5cb12bdb7cccdbc8da65025775e3a1f230ec167033de719dcdddb103c98be132478d559c4d8ee0b73f74bd89b06d525d4f6f09e8048c6000c",
      "e7580e30907d0077951b62febd93daf3e9ae1887fe7b23c7a06354bb9aefb73c5613cbffb64e9887de71a90ab534533613f4b728a902a0be908e33b2bc070909010d",
      "23fe620935057eab2e45cfeea8965985c0f3c96122ed1d12df3f39d1484eaeb940ad4dc225825fb68231384a094d420930f5060061b6dec71df4f1c752184a4a010e",
      "ed986adf2099a6dc08bed9b6260d72bccf3e2226d774464b4761e7f885ff765d0d5291f1429b14862a52b6991a95fa6b842b66c2c3459970db2f314a1acd27710110",
      "51b5c3b2f16104357ebce559f145ec0f6c1fcbec205dfcaefc1f131191e17fca0eb4eb76b6ff6550d1091644e00314ecd8aa94701e2ef8f00e5b62482710ef3c0011",
      "a3d0cba06bf40ed5a3cc858dde5d3ab5ad016b242c273532c5b1419efe5863ae35d315a7087d6f0592c4dc3a7fccb4b6f1893af558a282728f5d9f468921ffd70012",
    ],
  };
  const opWethNameResponse = {
    bytes:
      "0100007a2b6cae754910b87973fbbf95ca48fbe1ea6607d2584b572f986503f9addf2215980aad2a4d9ebdfed57db5de897dea818a9e0137f4e11f1d438e73ddfa391f00000000370100000001010018010000002a000000093078366562333233310142000000000000000000000000000000000000060000000406fdde0301001801000000950000000006eb3231661db141ca39006df985fd515418cbded0c7ad7dab56e2af72b51b0252f5b075000611313a277cc001000000600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000d5772617070656420457468657200000000000000000000000000000000000000",
    signatures: [
      "0a5f56a53a50ee07b472ef73202e9bbdcdbc6fb9386085c591633c9c81c487170640cc69cd57a61460dffd0d5028ed3476347a9055e1fbf6cb59d4bbfb6b14730002",
      "9bffca93bf2a7c8c112923e191f59e99c1000c046f79a8262d96ea01e3537c571faf53191f4a0e5576bf346e1848c5726303c4e534bb1bd742dc26549f6b3efa0003",
      "79c40aacb09fd65e7f05cda1cd8ca7169b62fb5f404ebb514b9aa51d5bf9046b2f0db8d0d1cd59f1494d051c4f3103022956c75b033ebc7e4d5c2734757e27f60004",
      "b3a3f332aaa4a578cc5ab509babe5cbf26d12b0176ff47f5ab13d6cb1c453955424a19018289bc24c6d5a1022ed5d1b264fffa2961aef74159b93f98c3305a230106",
      "aca16262e927ff72cf935c4111e275b5238db014b1678669becf051ee1d35b9c1acec381c867f9b0ba8ca9761afb9e8c44139c573304ea991557e02cf81da5120009",
      "a0c117b0be864cafd3dcb8e83708bcba8a82ea899a0999d535171f6c88cf834463916d0506cc8c48552f58e4b68fd7cced8ef60ec946a288a40e2c0115e8c1e2000a",
      "0d3340ecfdf7fbf28f3ce92337c583fe297c58fe5a48a050e31cb64c56f56943053514485a4f9d701987da018d37c5639d989a52d6f1fa452c8e7f35e114d1e8000b",
      "3fd2d86f9754778be744f7df13f5a8e56f7b3bca070b708b276f522eb2e306df4f9647adf138d6aaefa8acaee39ca4fa464722fd2537733c8863d2f2f8116438010c",
      "d20c0e74360f4e9445eb67f45a4e64f4171c7e0de3618e9f5cc7389d2a25d6d139eca1f2ef074fc4b09670e4620ed476364efc1f2aaf3cf6196b579ea8d3ab5b000d",
      "75697accdb3dc8e3d505306d3d7f30a2bef5663765f4c403338aab6945c03d0756ed9f1bf08b4f9447deac32d766f3606ff2e80feb95c48cfe4b709d37862e63000e",
      "4a19c439bf005b128f45599dee8fa504193c9ef152ba091b096f9c304fa25de6689770f9886efd70d7a5e8c96a1bb3f22a515f5e58b8d3619d4f49e54413656c0110",
      "4019143736df572f4800ae3d36ff98d38907d389f19c38b43291bf1f962f3b0a1174ec04d6ede9a46eb373c904367ef86838bbf76ddd94184b70d96ada1727220011",
      "e6ed9decc58904b00a4a5cd4ac943787aefde76e7709ee4be8e3ce0aa65da58624af30fa6a692ca0f3c170a7161ac30fbb76f65038e7f91ee25dde143478b7b60012",
    ],
  };

  it("Verifies mainnet signatures!", async () => {
    const p = anchor.getProvider();
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);

    const instructions = await createVerifySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      wethNameResponse.bytes,
      wethNameResponse.signatures,
      validSignatureSet.publicKey
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
          validSignatureSet,
        ])
      ).to.be.fulfilled;
    }
    // this will fail if the account does not exist, match discriminator, and parse
    await expect(
      program.account.querySignatureSet.fetch(validSignatureSet.publicKey)
    ).to.be.fulfilled;
  });
  it("Verifies mainnet queries!", async () => {
    const p = anchor.getProvider();
    const info = await getWormholeBridgeData(p.connection, coreBridgeAddress);
    const guardianSetIndex = info.guardianSetIndex;
    await expect(
      program.methods
        .verifyQuery(Buffer.from(wethNameResponse.bytes, "hex"))
        // TODO: should `accounts` be able to derive guardianSet?
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            guardianSetIndex
          ),
          signatureSet: validSignatureSet.publicKey,
        })
        .rpc()
    ).to.be.fulfilled;
  });
  it("Verifies mock signatures!", async () => {
    const p = anchor.getProvider();
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
    const mock = new QueryProxyMock({});
    const mockSignatures = mock.sign(
      Buffer.from(wethNameResponse.bytes, "hex")
    );

    const instructions = await createVerifySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      wethNameResponse.bytes,
      mockSignatures,
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
    await expect(
      program.methods
        .verifyQuery(Buffer.from(wethNameResponse.bytes, "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            mockGuardianSetIndex
          ),
          signatureSet: validMockSignatureSet.publicKey,
        })
        .rpc()
    ).to.be.fulfilled;
  });
  it("Parses queries!", async () => {
    const p = anchor.getProvider();
    const info = await getWormholeBridgeData(p.connection, coreBridgeAddress);
    const guardianSetIndex = info.guardianSetIndex;
    console.log(QueryResponse.from(wethNameResponse.bytes).request.requests[0]);
    console.log(QueryResponse.from(wethNameResponse.bytes).responses[0]);
    const tx = await program.methods
      .verifyQuery(Buffer.from(wethNameResponse.bytes, "hex"))
      .accountsPartial({
        guardianSet: deriveGuardianSetKey(coreBridgeAddress, guardianSetIndex),
        signatureSet: validSignatureSet.publicKey,
      })
      .rpc();
    let transaction: null | anchor.web3.VersionedTransactionResponse = null;
    while (transaction == null) {
      transaction = await p.connection.getTransaction(tx, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    }
    console.log(transaction);
  });
  it("Rejects an expired guardian set!", async () => {
    // notably, `opWethNameResponse` does not have guardian index 7 - xLabs, which is not in guardian set 2

    const p = anchor.getProvider();
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
    const guardianSetIndex = 2; // this one is expired

    const instructions = await createVerifySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      opWethNameResponse.bytes,
      opWethNameResponse.signatures,
      expiredSignatureSet.publicKey,
      undefined,
      guardianSetIndex
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
          expiredSignatureSet,
        ])
      ).to.be.fulfilled;
    }

    await expect(
      program.methods
        .verifyQuery(Buffer.from(wethNameResponse.bytes, "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            guardianSetIndex
          ),
          signatureSet: expiredSignatureSet.publicKey,
        })
        .rpc()
    ).to.be.rejectedWith(
      "Error Code: GuardianSetExpired. Error Number: 7798. Error Message: GuardianSetExpired."
    );
  });
  it("Rejects an invalid guardian set!", async () => {
    const p = anchor.getProvider();
    await expect(
      program.methods
        .verifyQuery(Buffer.from(wethNameResponse.bytes, "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(coreBridgeAddress, 2),
          signatureSet: validSignatureSet.publicKey,
        })
        .rpc()
    ).to.be.rejectedWith(
      "AnchorError caused by account: guardian_set. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated."
    );
  });
  it("Rejects an invalid signature set!", async () => {
    const p = anchor.getProvider();
    const info = await getWormholeBridgeData(p.connection, coreBridgeAddress);
    const guardianSetIndex = info.guardianSetIndex;
    await expect(
      program.methods
        .verifyQuery(Buffer.from(wethNameResponse.bytes, "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            guardianSetIndex
          ),
          signatureSet: expiredSignatureSet.publicKey,
        })
        .rpc()
    ).to.be.rejectedWith(
      "AnchorError caused by account: guardian_set. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated."
    );
  });
  it("Rejects an invalid query hash!", async () => {
    const p = anchor.getProvider();
    const info = await getWormholeBridgeData(p.connection, coreBridgeAddress);
    const guardianSetIndex = info.guardianSetIndex;
    await expect(
      program.methods
        .verifyQuery(Buffer.from(wethNameResponse.bytes + "00", "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            guardianSetIndex
          ),
          signatureSet: validSignatureSet.publicKey,
        })
        .rpc()
    ).to.be.rejectedWith(
      "Error Code: InvalidMessageHash. Error Number: 6514. Error Message: InvalidMessageHash."
    );
  });
  it("Rejects a no quorum signature set!", async () => {
    const p = anchor.getProvider();
    const noQuorumSignatureSet = anchor.web3.Keypair.generate();
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
    const instructions = await createVerifySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      wethNameResponse.bytes,
      wethNameResponse.signatures.slice(1),
      noQuorumSignatureSet.publicKey
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
          noQuorumSignatureSet,
        ])
      ).to.be.fulfilled;
    }
    // this will fail if the account does not exist, match discriminator, and parse
    await expect(
      program.account.querySignatureSet.fetch(noQuorumSignatureSet.publicKey)
    ).to.be.fulfilled;
    const info = await getWormholeBridgeData(p.connection, coreBridgeAddress);
    const guardianSetIndex = info.guardianSetIndex;
    await expect(
      program.methods
        .verifyQuery(Buffer.from(wethNameResponse.bytes + "00", "hex"))
        .accountsPartial({
          guardianSet: deriveGuardianSetKey(
            coreBridgeAddress,
            guardianSetIndex
          ),
          signatureSet: noQuorumSignatureSet.publicKey,
        })
        .rpc()
    ).to.be.rejectedWith(
      "Error Code: NoQuorum. Error Number: 6515. Error Message: NoQuorum."
    );
  });
  it("Rejects a valid signature on the wrong guardian index!", async () => {
    const p = anchor.getProvider();
    const badSignatureSet = anchor.web3.Keypair.generate();
    const badSignatures = [...wethNameResponse.signatures];
    badSignatures[0] =
      "f122af3db0ae62af57bc16f0b3e79c86cbfc860a5994ca65928c06a739a2f4ca0496c7c1de38350e7b7cdc573fa0b7af981f3ac3d60298d67c76ca99d3bcf1040001";
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
    const instructions = await createVerifySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      wethNameResponse.bytes,
      badSignatures,
      badSignatureSet.publicKey
    );
    const unsignedTransactions: anchor.web3.Transaction[] = [];
    for (let i = 0; i < instructions.length; i += 2) {
      unsignedTransactions.push(
        new anchor.web3.Transaction().add(...instructions.slice(i, i + 2))
      );
    }
    const tx = unsignedTransactions[0];
    await expect(
      anchor.web3.sendAndConfirmTransaction(p.connection, tx, [
        payer,
        badSignatureSet,
      ])
    ).to.be.rejectedWith(
      "Transaction precompile verification failure InvalidAccountIndex"
    );
  });
  it("Rejects an invalid signature!", async () => {
    const p = anchor.getProvider();
    const badSignatureSet = anchor.web3.Keypair.generate();
    const badSignatures = [...wethNameResponse.signatures];
    badSignatures[0] =
      "f122af3db0ae62af57bc16f0b3e79c86cbfc860a5994ca65928c06a739a2f4ca0496c7c1de38350e7b7cdc573fa0b7af981f3ac3d60298d67c76ca99d3bcf1040102";
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
    const instructions = await createVerifySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      wethNameResponse.bytes,
      badSignatures,
      badSignatureSet.publicKey
    );
    const unsignedTransactions: anchor.web3.Transaction[] = [];
    for (let i = 0; i < instructions.length; i += 2) {
      unsignedTransactions.push(
        new anchor.web3.Transaction().add(...instructions.slice(i, i + 2))
      );
    }
    const tx = unsignedTransactions[0];
    await expect(
      anchor.web3.sendAndConfirmTransaction(p.connection, tx, [
        payer,
        badSignatureSet,
      ])
    ).to.be.rejectedWith(
      "Transaction precompile verification failure InvalidAccountIndex"
    );
  });
  it("Rejects a valid signature for the wrong message!", async () => {
    const p = anchor.getProvider();
    const badSignatureSet = anchor.web3.Keypair.generate();
    const payer = anchor.web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);
    const instructions = await createVerifySignaturesInstructions(
      p.connection,
      program,
      coreBridgeAddress,
      payer.publicKey,
      wethNameResponse.bytes,
      opWethNameResponse.signatures,
      badSignatureSet.publicKey
    );
    const unsignedTransactions: anchor.web3.Transaction[] = [];
    for (let i = 0; i < instructions.length; i += 2) {
      unsignedTransactions.push(
        new anchor.web3.Transaction().add(...instructions.slice(i, i + 2))
      );
    }
    const tx = unsignedTransactions[0];
    await expect(
      anchor.web3.sendAndConfirmTransaction(p.connection, tx, [
        payer,
        badSignatureSet,
      ])
    ).to.be.rejectedWith(
      "Transaction precompile verification failure InvalidAccountIndex"
    );
  });
});
