use anchor_lang::prelude::*;

#[account]
#[derive(Debug, InitSpace)]
pub struct LatestRoot {
    /// Block number from which the root was read.
    pub read_block_number: u64,
    /// Block hash from which the root was read.
    pub read_block_hash: [u8; 32],
    /// Block time (in microseconds) from which the root was read.
    pub read_block_time: u64,
    /// Root hash of the last posted root account.
    #[max_len(32)]
    pub root: Vec<u8>,
}

impl LatestRoot {
    pub const SEED_PREFIX: &'static [u8] = b"LatestRoot";
}
