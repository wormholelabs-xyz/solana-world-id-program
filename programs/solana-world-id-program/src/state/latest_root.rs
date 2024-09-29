use anchor_lang::prelude::*;

#[account]
#[derive(Debug, InitSpace)]
pub struct LatestRoot {
    pub bump: u8,
    /// Block number from which the root was read.
    pub read_block_number: u64,
    /// Block hash from which the root was read.
    pub read_block_hash: [u8; 32],
    /// Block time (in microseconds) from which the root was read.
    pub read_block_time: u64,
    /// Root hash of the last posted root account.
    pub root: [u8; 32],
    /// SEED: Verification type.
    pub verification_type: [u8; 1],
}

impl LatestRoot {
    pub const SEED_PREFIX: &'static [u8] = b"LatestRoot";
}
