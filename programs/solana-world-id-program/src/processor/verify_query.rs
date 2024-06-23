use crate::{
    error::SolanaWorldIDProgramError,
    state::{wormhole, QuerySignatureSet, WormholeGuardianSet},
};
use anchor_lang::{
    prelude::*,
    solana_program::{self},
};
use wormhole_query_sdk::{
    structs::{ChainSpecificQuery, ChainSpecificResponse, QueryResponse},
    MESSAGE_PREFIX, QUERY_MESSAGE_LEN,
};

// TODO: move to config acct so these are more easily visible to the public
// Or consider a view method
// https://www.anchor-lang.com/docs/cross-program-invocations#reading-return-data-in-the-clients
// e.g.
// https://github.com/wormhole-foundation/example-native-token-transfers/blob/c0b0e69c03b3f83ce5a0f8d676d6a82a82443c1a/solana/programs/example-native-token-transfers/src/lib.rs#L80C12-L80C19
// https://github.com/wormhole-foundation/example-native-token-transfers/blob/c0b0e69c03b3f83ce5a0f8d676d6a82a82443c1a/solana/ts/lib/ntt.ts#L156

// https://docs.wormhole.com/wormhole/reference/constants
pub const ETH_CHAIN_ID: u16 = 2;
// https://etherscan.io/address/0xf7134CE138832c1456F2a91D64621eE90c2bddEa
pub const ETH_WORLD_ID_IDENTITY_MANAGER: [u8; 20] = [
    0xf7, 0x13, 0x4C, 0xE1, 0x38, 0x83, 0x2c, 0x14, 0x56, 0xF2, 0xa9, 0x1D, 0x64, 0x62, 0x1e, 0xE9,
    0x0c, 0x2b, 0xdd, 0xEa,
];
// web3.eth.abi.encodeFunctionSignature("latestRoot()");
pub const LATEST_ROOT_SIGNATURE: [u8; 4] = [0xd7, 0xb0, 0xfe, 0xf1];

/// Compute quorum based on the number of guardians in a guardian set.
#[inline]
pub fn quorum(num_guardians: usize) -> usize {
    (2 * num_guardians) / 3 + 1
}

#[derive(Accounts)]
pub struct VerifyQuery<'info> {
    /// Guardian set used for signature verification (whose index should agree with the signature
    /// set account's guardian set index).
    #[account(
        seeds = [
            WormholeGuardianSet::SEED_PREFIX,
            signature_set.guardian_set_index.to_be_bytes().as_ref()
        ],
        bump,
        seeds::program = wormhole::program::Wormhole::id()
    )]
    guardian_set: Account<'info, WormholeGuardianSet>,

    /// Stores signature validation from Sig Verify native program.
    signature_set: Account<'info, QuerySignatureSet>,
}

impl<'info> VerifyQuery<'info> {
    pub fn constraints(ctx: &Context<Self>, bytes: &Vec<u8>) -> Result<()> {
        let guardian_set = ctx.accounts.guardian_set.clone().into_inner();

        // Check that the guardian set is still active.
        let timestamp = Clock::get()?
            .unix_timestamp
            .try_into()
            .expect("timestamp overflow");
        require!(
            guardian_set.is_active(&timestamp),
            SolanaWorldIDProgramError::GuardianSetExpired
        );

        let signature_set = &ctx.accounts.signature_set;

        // Number of verified signatures in the signature set account must be at least quorum with
        // the guardian set.
        require!(
            signature_set.num_verified() >= quorum(guardian_set.keys.len()),
            SolanaWorldIDProgramError::NoQuorum
        );

        // Recompute the message hash and compare it to the one in the signature set account.
        let recomputed = [
            MESSAGE_PREFIX,
            &solana_program::keccak::hashv(&[&bytes]).to_bytes(),
        ]
        .concat();

        // And verify that the message hash is the same as the one already encoded in the signature
        // set.
        require!(
            recomputed == signature_set.message,
            SolanaWorldIDProgramError::InvalidMessageHash
        );

        // SECURITY: defense-in-depth, check again that these are the expected length
        require_eq!(
            recomputed.len(),
            QUERY_MESSAGE_LEN,
            SolanaWorldIDProgramError::InvalidSigVerifyInstruction
        );

        // Done.
        Ok(())
    }
}

#[access_control(VerifyQuery::constraints(&ctx, &bytes))]
pub fn verify_query(ctx: Context<VerifyQuery>, bytes: Vec<u8>) -> Result<()> {
    let response = QueryResponse::deserialize(&bytes)
        .map_err(|_| SolanaWorldIDProgramError::FailedToParseResponse)?;
    require!(
        response.request.requests.len() == 1,
        SolanaWorldIDProgramError::InvalidNumberOfRequests
    );
    let request = &response.request.requests[0];
    require!(
        request.chain_id == ETH_CHAIN_ID,
        SolanaWorldIDProgramError::InvalidRequestChainId
    );
    let query = match &request.query {
        ChainSpecificQuery::EthCallQueryRequest(q) => Some(q),
        _ => None,
    }
    .ok_or(SolanaWorldIDProgramError::InvalidRequestType)?;
    require!(
        query.call_data.len() == 1,
        SolanaWorldIDProgramError::InvalidRequestCallDataLength
    );
    require!(
        query.call_data[0].to == ETH_WORLD_ID_IDENTITY_MANAGER,
        SolanaWorldIDProgramError::InvalidRequestContract
    );
    require!(
        query.call_data[0].data == LATEST_ROOT_SIGNATURE,
        SolanaWorldIDProgramError::InvalidRequestSignature
    );

    require!(
        response.responses.len() == 1,
        SolanaWorldIDProgramError::InvalidNumberOfResponses
    );
    let response = &response.responses[0];
    require!(
        response.chain_id == ETH_CHAIN_ID,
        SolanaWorldIDProgramError::InvalidResponseChainId
    );
    let chain_response = match &response.response {
        ChainSpecificResponse::EthCallQueryResponse(q) => Some(q),
        _ => None,
    }
    .ok_or(SolanaWorldIDProgramError::InvalidResponseType)?;

    // TODO: validate block number
    // TODO: validate block time

    require!(
        chain_response.results.len() == 1,
        SolanaWorldIDProgramError::InvalidResponseResultsLength
    );
    let result = &chain_response.results[0];
    require!(
        result.len() == 32,
        SolanaWorldIDProgramError::InvalidResponseResultLength
    );

    msg!("result: {:?}", result);

    Ok(())
}
