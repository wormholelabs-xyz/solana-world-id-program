import * as anchor from "@coral-xyz/anchor";
import { createVerifyQuerySignaturesInstructions } from "./verifySignature";
import { SolanaWorldIdProgram } from "../../target/types/solana_world_id_program";

const coreBridgeAddress = new anchor.web3.PublicKey(
  "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth"
);
const mockGuardianSetIndex = 5;

async function verifyQuerySigs(
  program: anchor.Program<SolanaWorldIdProgram>,
  queryBytes: string,
  querySignatures: string[],
  signatureSet: anchor.web3.Keypair,
  wormholeProgramId: anchor.web3.PublicKey = coreBridgeAddress,
  guardianSetIndex: number = mockGuardianSetIndex
) {
  const p = anchor.getProvider();
  const instructions = await createVerifyQuerySignaturesInstructions(
    p.connection,
    program,
    wormholeProgramId,
    p.publicKey,
    queryBytes,
    querySignatures,
    signatureSet.publicKey,
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
    await p.sendAndConfirm(tx, [signatureSet]);
  }
}

export default verifyQuerySigs;
