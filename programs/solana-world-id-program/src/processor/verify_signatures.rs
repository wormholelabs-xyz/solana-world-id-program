use crate::{
    error::ExampleQueriesSolanaVerifyError,
    state::{QuerySignatureSet, WormholeGuardianSet},
};
use anchor_lang::{
    prelude::*,
    solana_program::{self, program_memory::sol_memcpy, sysvar},
};
use wormhole_query_sdk::QUERY_MESSAGE_LEN;

/// Offset schema used by the Sig Verify native program.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
struct SigVerifyOffsets {
    /// Offset to \[signature,recovery_id,etherum_address\] of 64 + 1 + 20 bytes.
    signature_offset: u16,
    /// Instruction index to find signature data.
    signature_ix_index: u8,
    /// Offset to \[signature,recovery_id\] of 64 + 1 bytes.
    eth_pubkey_offset: u16,
    // Instruction index to find eth pubkey data.
    eth_pubkey_ix_index: u8,
    // Offset to start of message data.
    message_offset: u16,
    // Size of message data.
    message_size: u16,
    // Index of instruction data to get message data.
    message_ix_index: u8,
}

/// Result of parsing Sig Verify instruction data.
struct SigVerifyParameters {
    eth_pubkeys: Vec<[u8; 20]>,
    message: Vec<u8>,
}

#[derive(Accounts)]
pub struct VerifySignatures<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    /// The wormhole guardian set account.
    guardian_set: Account<'info, WormholeGuardianSet>,

    /// Stores signature validation from Sig Verify native program.
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + QuerySignatureSet::INIT_SPACE
    )]
    signature_set: Account<'info, QuerySignatureSet>,

    /// Instruction sysvar.
    ///
    /// CHECK: This sysvar is used to read Sig Verify native program instruction data, which will
    /// precede this instruction.
    #[account(
        address = sysvar::instructions::id() @ ErrorCode::AccountSysvarMismatch
    )]
    instructions: AccountInfo<'info>,

    system_program: Program<'info, System>,
}

pub fn verify_signatures(ctx: Context<VerifySignatures>, signer_indices: [i8; 19]) -> Result<()> {
    // It would have been nice to be able to perform this check in `access_control`, but there
    // is no data from the instruction sysvar loaded by that point. We have to load it and perform
    // the safety checks in this instruction handler.
    let instructions_sysvar = &ctx.accounts.instructions;

    // We grab the index of the instruction before this instruction, which should be the sig verify
    // program.
    let sig_verify_index = u16::checked_sub(
        sysvar::instructions::load_current_index_checked(instructions_sysvar)?,
        1,
    )
    .ok_or(ExampleQueriesSolanaVerifyError::InstructionAtWrongIndex)?;

    // And here we verify that the previous instruction is actually the Sig Verify native program.
    let SigVerifyParameters {
        eth_pubkeys: signers,
        message,
    } = sysvar::instructions::load_instruction_at_checked(
        usize::from(sig_verify_index),
        instructions_sysvar,
    )
    .map_err(Into::into)
    .and_then(|ix| deserialize_secp256k1_ix(sig_verify_index, &ix))?;

    // Number of specified signers must equal the number of signatures verified in the Sig Verify
    // native program instruction.
    let guardian_indices: Vec<_> = signer_indices
        .iter()
        .enumerate()
        .filter_map(|(i, &value)| if value >= 0 { Some(i) } else { None })
        .collect();
    require_eq!(
        signers.len(),
        guardian_indices.len(),
        ExampleQueriesSolanaVerifyError::SignerIndicesMismatch
    );

    // We use this message hash later on.
    let signature_set = &mut ctx.accounts.signature_set;
    let guardian_set = &ctx.accounts.guardian_set;
    let guardians = &guardian_set.keys;

    // If the signature set account has not been initialized yet, establish the expected account
    // data (guardian set index used, hash and which indices have been verified).
    if signature_set.is_initialized() {
        // Otherwise, verify that the guardian set index is what we expect from
        // the last time we wrote to the signature set account.
        require_eq!(
            guardian_set.index,
            signature_set.guardian_set_index,
            ExampleQueriesSolanaVerifyError::GuardianSetMismatch
        );

        // And verify that the message hash is the same as the one already encoded in the signature
        // set.
        require!(
            message == signature_set.message,
            ExampleQueriesSolanaVerifyError::MessageMismatch
        );
    } else {
        // We are assuming that the signature set has not been "initialized" if there is no
        // indication of verified signatures (via `sig_verify_successes`) written to this account
        // yet. If we reach this condition, we set the message hash and guardian set index because
        // we are assuming that the account is created with this instruction invocation.
        signature_set.set_inner(QuerySignatureSet {
            sig_verify_successes: vec![false; guardians.len()],
            message,
            guardian_set_index: guardian_set.index,
        });
    }

    // Attempt to write `true` to represent verified guardian eth pubkey.
    for (i, &signer_index) in guardian_indices.iter().enumerate() {
        require!(
            signers.get(i) == guardians.get(signer_index),
            ExampleQueriesSolanaVerifyError::InvalidGuardianKeyRecovery
        );

        // Overwritten content should be zeros except double signs by the
        // signer or harmless replays.
        signature_set.sig_verify_successes[signer_index] = true;
    }

    // Done.
    Ok(())
}

/// This method performs the Sig Verify native program instruction deserialization and validates
/// this data.
fn deserialize_secp256k1_ix(
    sig_verify_index: u16,
    ix: &solana_program::instruction::Instruction,
) -> Result<SigVerifyParameters> {
    // Check that the program invoked is the secp256k1 program.
    require_keys_eq!(
        ix.program_id,
        solana_program::secp256k1_program::id(),
        ExampleQueriesSolanaVerifyError::InvalidSigVerifyInstruction
    );

    let ix_data = &ix.data;

    // The first byte encodes the number of signatures.
    let num_signatures: usize = ix_data[0].into();

    let mut eth_pubkeys = Vec::with_capacity(num_signatures);

    // For each offset encoded, grab each SigVerify parameter (signature, eth pubkey, message).
    let mut expected_message_offset = None;
    for i in 0..num_signatures {
        let offsets_idx = 1 + i * SigVerifyOffsets::INIT_SPACE;
        let offsets = SigVerifyOffsets::deserialize(
            &mut &ix_data[offsets_idx..(offsets_idx + SigVerifyOffsets::INIT_SPACE)],
        )?;
        let SigVerifyOffsets {
            signature_offset: _,
            signature_ix_index,
            eth_pubkey_offset,
            eth_pubkey_ix_index,
            message_offset,
            message_size,
            message_ix_index,
        } = offsets;
        // Because guardians sign the hash of the query response prefix + query response hash, this verified message must be
        // 67 bytes.
        require_eq!(
            usize::from(message_size),
            QUERY_MESSAGE_LEN,
            ExampleQueriesSolanaVerifyError::InvalidSigVerifyInstruction
        );

        // The instruction index must be the same for signature, eth pubkey and message.
        require_eq!(
            u16::from(signature_ix_index),
            sig_verify_index,
            ExampleQueriesSolanaVerifyError::InvalidSigVerifyInstruction
        );
        require_eq!(
            u16::from(eth_pubkey_ix_index),
            sig_verify_index,
            ExampleQueriesSolanaVerifyError::InvalidSigVerifyInstruction
        );
        require_eq!(
            u16::from(message_ix_index),
            sig_verify_index,
            ExampleQueriesSolanaVerifyError::InvalidSigVerifyInstruction
        );

        let eth_pubkey_offset = usize::from(eth_pubkey_offset);
        let mut eth_pubkey = [0; 20];
        sol_memcpy(&mut eth_pubkey, &ix_data[eth_pubkey_offset..], 20);

        // The message offset should be the same for each sig verify offsets since each signature is
        // for the same message.
        let message_offset = usize::from(message_offset);
        if let Some(expected_message_offset) = expected_message_offset {
            require_eq!(
                message_offset,
                expected_message_offset,
                ExampleQueriesSolanaVerifyError::InvalidSigVerifyInstruction
            );
        }

        eth_pubkeys.push(eth_pubkey);
        expected_message_offset = Some(message_offset);
    }

    if let Some(message_offset) = expected_message_offset {
        let mut message = vec![0u8; QUERY_MESSAGE_LEN];
        sol_memcpy(&mut message, &ix_data[message_offset..], QUERY_MESSAGE_LEN);

        Ok(SigVerifyParameters {
            eth_pubkeys,
            message,
        })
    } else {
        Err(ExampleQueriesSolanaVerifyError::EmptySigVerifyInstruction.into())
    }
}
