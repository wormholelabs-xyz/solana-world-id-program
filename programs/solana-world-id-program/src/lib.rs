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

    pub fn verify_query_signatures(
        ctx: Context<VerifyQuerySignatures>,
        signer_indices: [i8; 19],
    ) -> Result<()> {
        instructions::verify_query_signatures(ctx, signer_indices)
    }

    pub fn update_root_with_query(
        ctx: Context<UpdateRootWithQuery>,
        bytes: Vec<u8>,
        root_hash: [u8; 32],
    ) -> Result<()> {
        instructions::update_root_with_query(ctx, bytes, root_hash)
    }

    pub fn clean_up_root(
        ctx: Context<CleanUpRoot>,
        root_hash: [u8; 32],
        verification_type: [u8; 1],
    ) -> Result<()> {
        instructions::clean_up_root(ctx, root_hash, verification_type)
    }

    pub fn update_root_expiry(
        ctx: Context<UpdateRootExpiry>,
        root_hash: [u8; 32],
        verification_type: [u8; 1],
    ) -> Result<()> {
        instructions::update_root_expiry(ctx, root_hash, verification_type)
    }

    pub fn transfer_ownership(ctx: Context<TransferOwnership>) -> Result<()> {
        instructions::transfer_ownership(ctx)
    }

    pub fn claim_ownership(ctx: Context<ClaimOwnership>) -> Result<()> {
        instructions::claim_ownership(ctx)
    }

    pub fn set_root_expiry(ctx: Context<SetRootExpiry>, root_expiry: u64) -> Result<()> {
        instructions::set_root_expiry(ctx, root_expiry)
    }

    pub fn set_allowed_update_staleness(
        ctx: Context<SetAllowedUpdateStaleness>,
        allowed_update_staleness: u64,
    ) -> Result<()> {
        instructions::set_allowed_update_staleness(ctx, allowed_update_staleness)
    }

    pub fn verify_groth16_proof(
        ctx: Context<VerifyGroth16Proof>,
        root_hash: [u8; 32],
        verification_type: [u8; 1],
        signal_hash: [u8; 32],
        nullifier_hash: [u8; 32],
        external_nullifier_hash: [u8; 32],
        proof: [u8; 256],
    ) -> Result<()> {
        instructions::verify_groth16_proof(
            ctx,
            root_hash,
            verification_type,
            signal_hash,
            nullifier_hash,
            external_nullifier_hash,
            proof,
        )
    }
}
