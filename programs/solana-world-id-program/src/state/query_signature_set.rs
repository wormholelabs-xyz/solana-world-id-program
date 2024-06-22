use anchor_lang::prelude::*;
use wormhole_query_sdk::QUERY_MESSAGE_LEN;

#[account]
#[derive(Debug, InitSpace)]
pub struct QuerySignatureSet {
    // TODO: should this enforce a max length?
    #[max_len(19)]
    pub sig_verify_successes: Vec<bool>,

    /// 35 prefix + 32 keccak(message)
    #[max_len(QUERY_MESSAGE_LEN)]
    pub message: Vec<u8>,

    /// Index of the guardian set
    pub guardian_set_index: u32,
}

impl QuerySignatureSet {
    pub fn is_initialized(&self) -> bool {
        self.sig_verify_successes.iter().any(|&value| value)
    }

    pub fn num_verified(&self) -> usize {
        self.sig_verify_successes
            .iter()
            .filter(|&&signed| signed)
            .count()
    }
}
