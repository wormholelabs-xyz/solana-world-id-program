use anchor_lang::prelude::*;

declare_id!("9QwAWx3TKg4CaTjHNhBefQeNSzEKDe2JDxL46F76tVDv");

pub mod error;

mod instructions;
pub(crate) use instructions::*;

pub mod state;

#[program]
pub mod solana_world_id_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize(ctx, args)
    }

    pub fn verify_signatures(
        ctx: Context<VerifySignatures>,
        signer_indices: [i8; 19],
    ) -> Result<()> {
        instructions::verify_signatures(ctx, signer_indices)
    }

    pub fn verify_query(ctx: Context<VerifyQuery>, bytes: Vec<u8>) -> Result<()> {
        instructions::verify_query(ctx, bytes)
    }
}

#[macro_use]
extern crate cfg_if;
