use crate::{
    error::SolanaWorldIDProgramError,
    state::{Config, Root},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CleanUpRoot<'info> {
    /// This can be any expired root account.
    /// The PDA check is omitted since this code allows cleaning up any root
    /// and the discriminator will still be checked.
    #[account(
        mut,
        has_one = refund_recipient,
        close = refund_recipient
    )]
    root: Account<'info, Root>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    config: Account<'info, Config>,

    /// CHECK: This account is the refund recipient for the above root.
    #[account(address = root.refund_recipient)]
    refund_recipient: AccountInfo<'info>,
}

impl<'info> CleanUpRoot<'info> {
    pub fn constraints(ctx: &Context<Self>) -> Result<()> {
        let root = &ctx.accounts.root;
        let config = &ctx.accounts.config;

        // Check that the root has expired.
        let current_timestamp = Clock::get()?
            .unix_timestamp
            .try_into()
            .expect("timestamp underflow");
        require!(
            !root.is_active(&current_timestamp, &config.root_expiry),
            SolanaWorldIDProgramError::RootUnexpired
        );

        Ok(())
    }
}

#[access_control(CleanUpRoot::constraints(&ctx))]
pub fn clean_up_root(ctx: Context<CleanUpRoot>) -> Result<()> {
    Ok(())
}
