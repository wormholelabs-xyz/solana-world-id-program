use crate::{
    error::SolanaWorldIDProgramError,
    state::{Config, Root},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateRootExpiry<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    #[account(mut)]
    root: Account<'info, Root>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump
    )]
    config: Account<'info, Config>,
}

pub fn update_root_expiry(ctx: Context<UpdateRootExpiry>) -> Result<()> {
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
