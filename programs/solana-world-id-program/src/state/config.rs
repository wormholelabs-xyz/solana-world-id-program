use anchor_lang::prelude::*;

#[account]
#[derive(Debug, InitSpace)]
pub struct Config {
    // TODO: store bump
    /// Owner of the program.
    pub owner: Pubkey,
    /// Pending next owner (before claiming ownership).
    pub pending_owner: Option<Pubkey>,
    /// Time (in seconds) after which a root should be considered expired.
    pub root_expiry: u64,
    /// Time (in seconds) after which an attempted update should be rejected.
    pub allowed_update_staleness: u64,
}

impl Config {
    pub const SEED_PREFIX: &'static [u8] = b"Config";
}
