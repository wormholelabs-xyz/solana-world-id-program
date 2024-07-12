use anchor_lang::prelude::*;
use wormhole_query_sdk::QUERY_MESSAGE_LEN;

#[account]
#[derive(Debug, InitSpace)]
pub struct QuerySignatureSet {
    /// Verification success per guardian.
    #[max_len(19)]
    pub sig_verify_successes: Vec<bool>,

    /// 35 prefix + 32 keccak(message).
    #[max_len(QUERY_MESSAGE_LEN)]
    pub message: Vec<u8>,

    /// Index of the guardian set.
    pub guardian_set_index: u32,

    /// Payer of this signature set account, used for reimbursements upon cleanup.
    pub refund_recipient: Pubkey,
}

impl QuerySignatureSet {
    pub fn is_initialized(&self) -> bool {
        !self.sig_verify_successes.is_empty()
    }

    pub fn num_verified(&self) -> usize {
        self.sig_verify_successes
            .iter()
            .filter(|&&signed| signed)
            .count()
    }
}
