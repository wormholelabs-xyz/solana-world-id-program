import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaWorldIdExampleProgram } from "../target/types/solana_world_id_example_program";
import { SolanaWorldIdProgram } from "../target/types/solana_world_id_program";
import { assert, expect } from "chai";
import { deriveRootKey } from "./helpers/root";
import fmtTest from "./helpers/fmtTest";
import { PublicKey } from "@solana/web3.js";
import { sign } from "@wormhole-foundation/wormhole-query-sdk";
import { hashToField } from "./helpers/utils/hashing";

describe("solana-world-id-example-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .SolanaWorldIdExampleProgram as Program<SolanaWorldIdExampleProgram>;
  const worldIdProgram = anchor.workspace
    .SolanaWorldIdProgram as Program<SolanaWorldIdProgram>;

  // Generated with WorldCoin ID Example template using Solana pubkey as a signal
  const idkitSuccessResult = {
    proof:
      "0x177606b1626d9de53cca760de8907c122dcd7a0a8e36d6714785643b11604a61290b36c88275913ac7a0493e43362eff9e75cfc407e8fb3baab5b70323f29dbe0aa915653679af4671b1abbe0d79d2f08ee30696b336b81321f6d21ef0817c641177998bcd88a114cec8fe64783ba28f3fb1cc7b82e6438a414596ec1d2a606010a45353ded3a594f599b6d4abbde58d6f64e2a1d705cdaa6850400eb58312392d56bba2718764fc9062b92159314937a9683f491e0e77253cd3a1000ce601632383b56798f90d32756497d00aab3ed4520ab743e1718fcd0707435e1cf24bfd23eb1717e04b27c3b9c98d098ab8f876f5a6fa72d2dccc6850f7c98d80d7549a",
    merkle_root:
      "0x29e7081a4cb49cd0119c81d766d9ca41cbdfaf3ce21c8ae0963b8d1b15db4d9a",
    nullifier_hash:
      "0x2aa975196dc1f4f9f57b8195bea9c61331e0012ec25484ed569782c49145721a",
    verification_level: "orb",
  };

  const rootHash = [
    ...Buffer.from(idkitSuccessResult.merkle_root.substring(2), "hex"),
  ];
  // Random Solana pubkey generated for testing
  const recipient = "5yNbCZcCHeAxdmMJXcpFgmurEnygaVbCRwZNMMWETdeZ";

  const nullifierHash = [
    ...Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
  ];
  const proof = [...Buffer.from(idkitSuccessResult.proof.substring(2), "hex")];

  async function verifyAndExecute(
    rootHash: number[],
    nullifierHash: number[],
    proof: number[],
    recipientPublicKey: string
  ) {
    return program.methods
      .verifyAndExecute({
        rootHash: rootHash,
        nullifierHash: nullifierHash,
        proof: proof,
      })
      .accounts({
        payer: provider.wallet.publicKey,
        root: deriveRootKey(worldIdProgram.programId, Buffer.from(rootHash), 0),
        recipient: new PublicKey(recipientPublicKey),
      })
      .accountsPartial({
        nullifier: anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("nullifier"),
            Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
          ],
          program.programId
        )[0],
        worldIdProgram: worldIdProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  it(
    fmtTest("verify_and_execute", "Rejects mismatched root hash"),
    async () => {
      const invalidRootHash = new Array(32).fill(0); // Create an array of 32 zeros
      await expect(
        verifyAndExecute(invalidRootHash, nullifierHash, proof, recipient)
      ).to.be.rejected;
    }
  );

  it(
    fmtTest("verify_and_execute", "Rejects invalid nullifier hash"),
    async () => {
      const invalidNullifierHash = new Array(32).fill(0); // Create an array of 32 zeros
      await expect(
        verifyAndExecute(rootHash, invalidNullifierHash, proof, recipient)
      ).to.be.rejected;
    }
  );

  it(fmtTest("verify_and_execute", "Rejects different recipient"), async () => {
    const differentRecipient = "5yNbCZcCHeAxdmMJXcpFgmurEnygaVbCRwZNMMWETdeA";
    await expect(
      verifyAndExecute(rootHash, nullifierHash, proof, differentRecipient)
    ).to.be.rejected;
  });

  it(
    fmtTest(
      "verify_and_execute",
      "Successfully verifies and adds nullifier PDA"
    ),
    async () => {
      await expect(verifyAndExecute(rootHash, nullifierHash, proof, recipient))
        .to.be.fulfilled;

      // Add assertions here to check if the verification was successful
      const [nullifierPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("nullifier"),
          Buffer.from(idkitSuccessResult.nullifier_hash.substring(2), "hex"),
        ],
        program.programId
      );

      const connection = program.provider.connection;
      const nullifierAccountInfo = await connection.getAccountInfo(
        nullifierPda
      );

      assert(nullifierAccountInfo !== null, "Nullifier PDA should exist");
      assert(
        nullifierAccountInfo!.owner.equals(program.programId),
        "Nullifier PDA should be owned by the program"
      );
      assert(
        nullifierAccountInfo!.data.length === 0,
        "Nullifier PDA should have no data"
      );
    }
  );

  it(
    fmtTest("verify_and_execute", "Rejects nullifier already used"),
    async () => {
      await expect(
        verifyAndExecute(rootHash, nullifierHash, proof, recipient)
      ).to.be.rejectedWith(
        "Allocate: account Address { address: 9H5hoPdn4mSStDV4y2Pbc3oqkdUoRrqvdPzAP5bZC6hm, base: None } already in use"
      );
    }
  );
});
