use anchor_lang::prelude::*;

declare_id!("9QwAWx3TKg4CaTjHNhBefQeNSzEKDe2JDxL46F76tVDv");

pub mod error;

mod processor;
pub(crate) use processor::*;

pub mod state;

#[program]
pub mod solana_world_id_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }

    pub fn verify_signatures(
        ctx: Context<VerifySignatures>,
        signer_indices: [i8; 19],
    ) -> Result<()> {
        processor::verify_signatures(ctx, signer_indices)
    }

    pub fn verify_query(ctx: Context<VerifyQuery>, bytes: Vec<u8>) -> Result<()> {
        processor::verify_query(ctx, bytes)
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[macro_use]
extern crate cfg_if;
