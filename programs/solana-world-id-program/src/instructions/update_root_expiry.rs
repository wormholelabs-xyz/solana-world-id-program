use crate::{
    error::SolanaWorldIDProgramError,
    state::{Config, Root},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(root_hash: [u8; 32], verification_type: [u8; 1])]
pub struct UpdateRootExpiry<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            Root::SEED_PREFIX,
            &root_hash,
            &verification_type,
        ],
        bump = root.bump
    )]
    root: Account<'info, Root>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    config: Account<'info, Config>,
}

pub fn update_root_expiry(
    ctx: Context<UpdateRootExpiry>,
    _root_hash: [u8; 32],
    _verification_type: [u8; 1],
) -> Result<()> {
    let root = ctx.accounts.root.clone().into_inner();
    let config = ctx.accounts.config.clone().into_inner();
    let read_block_time_in_secs = root.read_block_time / 1_000_000;
    let new_expiry_time = read_block_time_in_secs + config.root_expiry;

    require!(
        new_expiry_time != ctx.accounts.root.expiry_time,
        SolanaWorldIDProgramError::NoopExpiryUpdate
    );

    ctx.accounts.root.expiry_time = new_expiry_time;

    Ok(())
}
