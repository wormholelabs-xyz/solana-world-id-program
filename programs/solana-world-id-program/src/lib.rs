use anchor_lang::prelude::*;

declare_id!("9QwAWx3TKg4CaTjHNhBefQeNSzEKDe2JDxL46F76tVDv");

pub mod error;

/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// Required change to pub, in order to import derived Snapshots
/// in the Fuzz Tests
pub mod instructions;
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
pub(crate) use instructions::*;

pub mod state;

#[program]
pub mod solana_world_id_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::initialize(ctx, args)
    }

    pub fn post_signatures(
        ctx: Context<PostSignatures>,
        guardian_signatures: Vec<[u8; 66]>,
        total_signatures: u8,
    ) -> Result<()> {
        instructions::post_signatures(ctx, guardian_signatures, total_signatures)
    }

    pub fn update_root_with_query(
        ctx: Context<UpdateRootWithQuery>,
        bytes: Vec<u8>,
        root_hash: [u8; 32],
        guardian_set_index: u32,
    ) -> Result<()> {
        instructions::update_root_with_query(ctx, bytes, root_hash, guardian_set_index)
    }

    pub fn clean_up_root(ctx: Context<CleanUpRoot>) -> Result<()> {
        instructions::clean_up_root(ctx)
    }

    pub fn close_signatures(ctx: Context<CloseSignatures>) -> Result<()> {
        instructions::close_signatures(ctx)
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
