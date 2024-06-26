use anchor_lang::prelude::*;

#[account]
#[derive(Debug, InitSpace)]
pub struct Root {
    /// Block number from which the root was read.
    pub read_block_number: u64,
    /// Block hash from which the root was read.
    pub read_block_hash: [u8; 32],
    /// Block time (in microseconds) from which the root was read.
    pub read_block_time: u64,
    /// Time (in seconds) after which this root should be considered expired.
    pub expiry_time: u64,
    /// Payer of this root account, used for reimbursements upon cleanup.
    pub refund_recipient: Pubkey,
}

impl Root {
    pub const SEED_PREFIX: &'static [u8] = b"Root";

    pub fn is_active(&self, timestamp: &u64) -> bool {
        self.expiry_time == 0 || self.expiry_time >= *timestamp
    }
}
