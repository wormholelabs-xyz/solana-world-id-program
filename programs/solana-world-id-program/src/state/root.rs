use anchor_lang::prelude::*;

#[account]
#[derive(Debug, InitSpace)]
pub struct Root {
    /// the block number from which the root was read
    pub read_block_number: u64,
    /// the block hash from which the root was read
    pub read_block_hash: [u8; 32],
    /// the block time (in microseconds) from which the root was read
    pub read_block_time: u64,

    /// the time after which this root should be considered expired
    pub expiry_time: u64,

    /// the payer of this root account, used for reimbursements upon cleanup
    pub payer: Pubkey,
}

impl Root {
    pub const SEED_PREFIX: &'static [u8] = b"Root";
}
