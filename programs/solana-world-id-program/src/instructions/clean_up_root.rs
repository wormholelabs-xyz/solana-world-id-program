use crate::{error::SolanaWorldIDProgramError, state::Root};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(root_hash: [u8; 32], verification_type: [u8; 1])]
pub struct CleanUpRoot<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Root::SEED_PREFIX,
            &root_hash,
            &verification_type,
        ],
        bump = root.bump,
        has_one = refund_recipient,
        close = refund_recipient
    )]
    root: Account<'info, Root>,

    /// CHECK: This account is the refund recipient for the above root
    #[account(address = root.refund_recipient)]
    refund_recipient: AccountInfo<'info>,
}

impl<'info> CleanUpRoot<'info> {
    pub fn constraints(ctx: &Context<Self>) -> Result<()> {
        let root = ctx.accounts.root.clone().into_inner();

        // Check that the root has expired.
        let current_timestamp = Clock::get()?
            .unix_timestamp
            .try_into()
            .expect("timestamp underflow");
        require!(
            !root.is_active(&current_timestamp),
            SolanaWorldIDProgramError::RootUnexpired
        );

        Ok(())
    }
}

#[access_control(CleanUpRoot::constraints(&ctx))]
pub fn clean_up_root(
    ctx: Context<CleanUpRoot>,
    _root_hash: [u8; 32],
    _verification_type: [u8; 1],
) -> Result<()> {
    Ok(())
}
