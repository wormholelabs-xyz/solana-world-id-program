use crate::{
    error::SolanaWorldIDProgramError,
    state::{Config, LatestRoot, Root},
};
use anchor_lang::prelude::*;
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// REQUIRED IMPORT
use trident_derive_accounts_snapshots::AccountsSnapshots;
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
#[derive(Accounts, AccountsSnapshots)]
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

    /// Latest root of the matching verification type
    #[account(
        seeds = [
            LatestRoot::SEED_PREFIX,
            &root.verification_type,
        ],
        bump = latest_root.bump
    )]
    latest_root: Account<'info, LatestRoot>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    config: Account<'info, Config>,

    /// CHECK: This account is the refund recipient for the above root.
    #[account(mut, address = root.refund_recipient)]
    refund_recipient: AccountInfo<'info>,
}

impl<'info> CleanUpRoot<'info> {
    pub fn constraints(ctx: &Context<Self>) -> Result<()> {
        let root = &ctx.accounts.root;
        let latest_root = &ctx.accounts.latest_root;
        let config = &ctx.accounts.config;

        // The latest root cannot be cleaned up, as it is always considered valid
        require!(
            root.root != latest_root.root,
            SolanaWorldIDProgramError::RootIsLatest
        );

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
