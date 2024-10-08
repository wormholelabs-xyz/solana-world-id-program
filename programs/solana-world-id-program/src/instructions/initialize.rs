use anchor_lang::{prelude::*, solana_program::bpf_loader_upgradeable};

use crate::state::{Config, LatestRoot, Root};
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// import required for fuzzing
use trident_derive_accounts_snapshots::AccountsSnapshots;
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
#[derive(Accounts, AccountsSnapshots)]
#[instruction(args: InitializeArgs)]
pub struct Initialize<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    #[account(constraint = deployer.key() == program_data.upgrade_authority_address.unwrap_or_default())]
    deployer: Signer<'info>,

    #[account(
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    program_data: Account<'info, ProgramData>,

    #[account(
        init,
        space = 8 + Config::INIT_SPACE,
        payer = payer,
        seeds = [Config::SEED_PREFIX],
        bump
    )]
    config: Account<'info, Config>,

    #[account(
        init,
        payer = payer,
        space = 8 + LatestRoot::INIT_SPACE,
        seeds = [
            LatestRoot::SEED_PREFIX,
            Root::VERIFICATION_TYPE_QUERY,
        ],
        bump
    )]
    latest_root: Account<'info, LatestRoot>,

    system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeArgs {
    pub root_expiry: u64,
    pub allowed_update_staleness: u64,
}

pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    ctx.accounts.config.set_inner(Config {
        bump: ctx.bumps.config,
        owner: ctx.accounts.deployer.key(),
        pending_owner: None,
        root_expiry: args.root_expiry,
        allowed_update_staleness: args.allowed_update_staleness,
    });

    ctx.accounts.latest_root.bump = ctx.bumps.latest_root;
    ctx.accounts.latest_root.verification_type = *Root::VERIFICATION_TYPE_QUERY;

    Ok(())
}
