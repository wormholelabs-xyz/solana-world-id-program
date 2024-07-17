use anchor_lang::prelude::*;

#[account]
#[derive(Debug, InitSpace)]
pub struct Root {
    pub bump: u8,
    /// Block number from which the root was read.
    pub read_block_number: u64,
    /// Block hash from which the root was read.
    pub read_block_hash: [u8; 32],
    /// Block time (in microseconds) from which the root was read.
    pub read_block_time: u64,
    /// Payer of this root account, used for reimbursements upon cleanup.
    pub refund_recipient: Pubkey,
    /// SEED: Root hash. Stored for off-chain convenience.
    pub root: [u8; 32],
    /// SEED: Verification type. Stored for off-chain convenience.
    pub verification_type: [u8; 1],
}

impl Root {
    pub const SEED_PREFIX: &'static [u8] = b"Root";
    pub const VERIFICATION_TYPE_QUERY: &'static [u8; 1] = &[0x00];

    pub fn is_active(&self, timestamp: &u64, config_root_expiry: &u64) -> bool {
        let read_block_time_in_secs = self.read_block_time / 1_000_000;
        let expiry_time = read_block_time_in_secs + config_root_expiry;
        expiry_time == 0 || expiry_time >= *timestamp
    }
}
