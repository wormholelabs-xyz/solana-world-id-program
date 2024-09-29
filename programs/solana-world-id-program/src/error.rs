//! Errors that may arise when interacting with the Solana World ID Program.

use anchor_lang::prelude::error_code;

/// * \>= 0x100  -- Root Management.
/// * \>= 0x200  -- Proof Verification.
/// * \>= 0x1000 -- Admin Instructions.
///
/// NOTE: All of these error codes when triggered are offset by `ERROR_CODE_OFFSET` (6000). So for
/// example, `WriteAuthorityMismatch` will return as 6256.
#[error_code]
pub enum SolanaWorldIDProgramError {
    #[msg("WriteAuthorityMismatch")]
    WriteAuthorityMismatch = 0x100,

    #[msg("GuardianSetExpired")]
    GuardianSetExpired = 0x101,

    #[msg("InvalidMessageHash")]
    InvalidMessageHash = 0x102,

    #[msg("NoQuorum")]
    NoQuorum = 0x103,

    #[msg("InvalidGuardianIndexNonIncreasing")]
    InvalidGuardianIndexNonIncreasing = 0x104,

    #[msg("InvalidGuardianIndexOutOfRange")]
    InvalidGuardianIndexOutOfRange = 0x105,

    #[msg("InvalidSignature")]
    InvalidSignature = 0x106,

    #[msg("InvalidGuardianKeyRecovery")]
    InvalidGuardianKeyRecovery = 0x107,

    #[msg("EmptyGuardianSignatures")]
    EmptyGuardianSignatures = 0x108,

    #[msg("FailedToParseResponse")]
    FailedToParseResponse = 0x110,

    #[msg("InvalidNumberOfRequests")]
    InvalidNumberOfRequests = 0x111,

    #[msg("InvalidRequestChainId")]
    InvalidRequestChainId = 0x112,

    #[msg("InvalidRequestType")]
    InvalidRequestType = 0x113,

    #[msg("InvalidRequestCallDataLength")]
    InvalidRequestCallDataLength = 0x114,

    #[msg("InvalidRequestContract")]
    InvalidRequestContract = 0x115,

    #[msg("InvalidRequestSignature")]
    InvalidRequestSignature = 0x116,

    #[msg("InvalidNumberOfResponses")]
    InvalidNumberOfResponses = 0x117,

    #[msg("InvalidResponseChainId")]
    InvalidResponseChainId = 0x118,

    #[msg("StaleBlockNum")]
    StaleBlockNum = 0x119,

    #[msg("StaleBlockTime")]
    StaleBlockTime = 0x120,

    #[msg("InvalidResponseType")]
    InvalidResponseType = 0x121,

    #[msg("InvalidResponseResultsLength")]
    InvalidResponseResultsLength = 0x122,

    #[msg("InvalidResponseResultLength")]
    InvalidResponseResultLength = 0x123,

    #[msg("RootHashMismatch")]
    RootHashMismatch = 0x124,

    #[msg("NoopExpiryUpdate")]
    NoopExpiryUpdate = 0x125,

    #[msg("RootUnexpired")]
    RootUnexpired = 0x126,

    #[msg("RootIsLatest")]
    RootIsLatest = 0x127,

    #[msg("RootExpired")]
    RootExpired = 0x200,

    #[msg("CreateGroth16VerifierFailed")]
    CreateGroth16VerifierFailed = 0x201,

    #[msg("Groth16ProofVerificationFailed")]
    Groth16ProofVerificationFailed = 0x202,

    #[msg("InvalidPendingOwner")]
    InvalidPendingOwner = 0x1000,
}
