// modified from https://github.com/wormhole-foundation/wormhole/blob/main/sdk/js/src/solana/utils/secp256k1.ts
import * as anchor from "@coral-xyz/anchor";

export const SIGNATURE_LENGTH = 65;
export const ETHEREUM_KEY_LENGTH = 20;

/**
 * Create {@link TransactionInstruction} for {@link Secp256k1Program}.
 *
 * @param {Buffer[]} signatures - 65-byte signatures (64 bytes + 1 byte recovery id)
 * @param {Buffer[]} keys - 20-byte ethereum public keys
 * @param {Buffer} message - 67-byte hash, but can be different length for testing error cases
 * @returns Solana instruction for Secp256k1 program
 */
export function createSecp256k1Instruction(
  signatures: Buffer[],
  keys: Buffer[],
  message: Buffer
): anchor.web3.TransactionInstruction {
  return {
    keys: [],
    programId: anchor.web3.Secp256k1Program.programId,
    data: Secp256k1SignatureOffsets.serialize(signatures, keys, message),
  };
}

/**
 * Secp256k1SignatureOffsets serializer
 *
 * See {@link https://docs.solana.com/developing/runtime-facilities/programs#secp256k1-program} for more info.
 */
export class Secp256k1SignatureOffsets {
  // https://docs.solana.com/developing/runtime-facilities/programs#secp256k1-program
  //
  // struct Secp256k1SignatureOffsets {
  //     secp_signature_key_offset: u16,        // offset to [signature,recovery_id,etherum_address] of 64+1+20 bytes
  //     secp_signature_instruction_index: u8,  // instruction index to find data
  //     secp_pubkey_offset: u16,               // offset to [signature,recovery_id] of 64+1 bytes
  //     secp_signature_instruction_index: u8,  // instruction index to find data
  //     secp_message_data_offset: u16,         // offset to start of message data
  //     secp_message_data_size: u16,           // size of message data
  //     secp_message_instruction_index: u8,    // index of instruction data to get message data
  // }
  //
  // Pseudo code of the operation:
  //
  // process_instruction() {
  //     for i in 0..count {
  //         // i'th index values referenced:
  //         instructions = &transaction.message().instructions
  //         signature = instructions[secp_signature_instruction_index].data[secp_signature_offset..secp_signature_offset + 64]
  //         recovery_id = instructions[secp_signature_instruction_index].data[secp_signature_offset + 64]
  //         ref_eth_pubkey = instructions[secp_pubkey_instruction_index].data[secp_pubkey_offset..secp_pubkey_offset + 32]
  //         message_hash = keccak256(instructions[secp_message_instruction_index].data[secp_message_data_offset..secp_message_data_offset + secp_message_data_size])
  //         pubkey = ecrecover(signature, recovery_id, message_hash)
  //         eth_pubkey = keccak256(pubkey[1..])[12..]
  //         if eth_pubkey != ref_eth_pubkey {
  //             return Error
  //         }
  //     }
  //     return Success
  //   }

  /**
   * Serialize multiple signatures, ethereum public keys and message as Secp256k1 instruction data.
   *
   * @param {Buffer[]} signatures - 65-byte signatures (64 + 1 recovery id)
   * @param {Buffer[]} keys - ethereum public keys
   * @param {Buffer} message - 67-byte hash, but can be different length for testing error cases
   * @see [InvalidVerifySigIx](https://github.com/wormholelabs-xyz/solana-world-id-program/blob/bing/verify_query_signature_test/programs/solana-world-id-program/src/instructions/verify_query_signatures.rs#L194)
   * @returns serialized Secp256k1 instruction data
   */
  static serialize(signatures: Buffer[], keys: Buffer[], message: Buffer) {
    // instead of throwing an error, we want to return a an empty sig verify offset data
    // to test for `EmptySigVerifyInstruction` error
    if (signatures.length == 0) {
      const serialized = Buffer.alloc(1);
      serialized.writeUInt8(0, 0); // Write 0 as the number of signatures
      return serialized;
    }

    if (signatures.length != keys.length) {
      throw Error("signatures.length != keys.length");
    }

    // Removed this check because we want to be able to use this with any message length
    // To accommodate for `Rejects when message size doesn't match QUERY_MESSAGE_LEN`
    // if (message.length != 67) {
    //   throw Error("message.length != 67");
    // }

    const numSignatures = signatures.length;
    const offsetSpan = 11;
    const dataLoc = 1 + numSignatures * offsetSpan;

    const dataLen = SIGNATURE_LENGTH + ETHEREUM_KEY_LENGTH; // 65 signature size + 20 eth pubkey size
    const messageDataOffset = dataLoc + numSignatures * dataLen;
    const messageDataSize = 67;
    const serialized = Buffer.alloc(messageDataOffset + messageDataSize);

    serialized.writeUInt8(numSignatures, 0);
    serialized.write(message.toString("hex"), messageDataOffset, "hex");

    for (let i = 0; i < numSignatures; ++i) {
      const signature = signatures.at(i);
      if (signature?.length != SIGNATURE_LENGTH) {
        throw Error(`signatures[${i}].length != 65`);
      }

      const key = keys.at(i);
      if (key?.length != ETHEREUM_KEY_LENGTH) {
        throw Error(`keys[${i}].length != 20`);
      }

      const signatureOffset = dataLoc + dataLen * i;
      const ethAddressOffset = signatureOffset + 65;

      serialized.writeUInt16LE(signatureOffset, 1 + i * offsetSpan);
      serialized.writeUInt8(0, 3 + i * offsetSpan);
      serialized.writeUInt16LE(ethAddressOffset, 4 + i * offsetSpan);
      serialized.writeUInt8(0, 6 + i * offsetSpan);
      serialized.writeUInt16LE(messageDataOffset, 7 + i * offsetSpan);
      serialized.writeUInt16LE(messageDataSize, 9 + i * offsetSpan);
      serialized.writeUInt8(0, 11 + i * offsetSpan);

      serialized.write(signature.toString("hex"), signatureOffset, "hex");
      serialized.write(key.toString("hex"), ethAddressOffset, "hex");
    }

    return serialized;
  }
}
