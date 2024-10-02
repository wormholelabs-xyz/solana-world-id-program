use anchor_lang::prelude::*;
use wormhole_solana_utils::cpi::bpf_loader_upgradeable::{self, BpfLoaderUpgradeable};

use crate::{error::SolanaWorldIDProgramError, state::Config};

/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// REQUIRED IMPORT
use trident_derive_accounts_snapshots::AccountsSnapshots;
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*

// * Transfer ownership
// Adapted from https://github.com/wormhole-foundation/example-native-token-transfers/blob/7a5b86ff8c0c36f9b609175d67e5f3651a62d740/solana/programs/example-native-token-transfers/src/instructions/admin.rs

/// Transferring the ownership is a 2-step process. The first step is to set the
/// new owner, and the second step is for the new owner to claim the ownership.
/// This is to prevent a situation where the ownership is transferred to an
/// address that is not able to claim the ownership (by mistake).
///
/// The transfer can be cancelled by the existing owner invoking the [`claim_ownership`]
/// instruction.
#[derive(Accounts, AccountsSnapshots)]
pub struct TransferOwnership<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    pub owner: Signer<'info>,

    /// CHECK: This account will be the signer in the [claim_ownership] instruction.
    new_owner: AccountInfo<'info>,

    /// CHECK: PDA signer owned by this program
    #[account(
        seeds = [b"upgrade_lock"],
        bump,
    )]
    upgrade_lock: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    program_data: Account<'info, ProgramData>,

    bpf_loader_upgradeable_program: Program<'info, BpfLoaderUpgradeable>,
}

pub fn transfer_ownership(ctx: Context<TransferOwnership>) -> Result<()> {
    ctx.accounts.config.pending_owner = Some(ctx.accounts.new_owner.key());

    bpf_loader_upgradeable::set_upgrade_authority_checked(
        CpiContext::new_with_signer(
            ctx.accounts
                .bpf_loader_upgradeable_program
                .to_account_info(),
            bpf_loader_upgradeable::SetUpgradeAuthorityChecked {
                program_data: ctx.accounts.program_data.to_account_info(),
                current_authority: ctx.accounts.owner.to_account_info(),
                new_authority: ctx.accounts.upgrade_lock.to_account_info(),
            },
            &[&[b"upgrade_lock", &[ctx.bumps.upgrade_lock]]],
        ),
        &crate::ID,
    )
}

// * Claim ownership

#[derive(Accounts, AccountsSnapshots)]
pub struct ClaimOwnership<'info> {
    #[account(
        mut,
        constraint = (
            config.pending_owner == Some(new_owner.key())
            || config.owner == new_owner.key()
        ) @ SolanaWorldIDProgramError::InvalidPendingOwner,
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: PDA signer owned by this program
    #[account(
        seeds = [b"upgrade_lock"],
        bump,
    )]
    upgrade_lock: AccountInfo<'info>,

    pub new_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    program_data: Account<'info, ProgramData>,

    bpf_loader_upgradeable_program: Program<'info, BpfLoaderUpgradeable>,
}

pub fn claim_ownership(ctx: Context<ClaimOwnership>) -> Result<()> {
    ctx.accounts.config.pending_owner = None;
    ctx.accounts.config.owner = ctx.accounts.new_owner.key();

    bpf_loader_upgradeable::set_upgrade_authority_checked(
        CpiContext::new_with_signer(
            ctx.accounts
                .bpf_loader_upgradeable_program
                .to_account_info(),
            bpf_loader_upgradeable::SetUpgradeAuthorityChecked {
                program_data: ctx.accounts.program_data.to_account_info(),
                current_authority: ctx.accounts.upgrade_lock.to_account_info(),
                new_authority: ctx.accounts.new_owner.to_account_info(),
            },
            &[&[b"upgrade_lock", &[ctx.bumps.upgrade_lock]]],
        ),
        &crate::ID,
    )
}

// * Set Root Expiry
#[derive(Accounts, AccountsSnapshots)]
pub struct SetRootExpiry<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
}

pub fn set_root_expiry(ctx: Context<SetRootExpiry>, root_expiry: u64) -> Result<()> {
    ctx.accounts.config.root_expiry = root_expiry;
    Ok(())
}

// * Set Allowed Update Staleness
#[derive(Accounts, AccountsSnapshots)]
pub struct SetAllowedUpdateStaleness<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
}

pub fn set_allowed_update_staleness(
    ctx: Context<SetAllowedUpdateStaleness>,
    allowed_update_staleness: u64,
) -> Result<()> {
    ctx.accounts.config.allowed_update_staleness = allowed_update_staleness;
    Ok(())
}
