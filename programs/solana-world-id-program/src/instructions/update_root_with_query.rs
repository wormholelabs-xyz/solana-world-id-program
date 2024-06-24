use crate::{
    error::SolanaWorldIDProgramError,
    state::{Config, LatestRoot, QuerySignatureSet, Root, WormholeGuardianSet},
};
use anchor_lang::{
    prelude::*,
    solana_program::{self},
};
use wormhole_query_sdk::{
    structs::{ChainSpecificQuery, ChainSpecificResponse, QueryResponse},
    MESSAGE_PREFIX, QUERY_MESSAGE_LEN,
};
use wormhole_solana_consts::CORE_BRIDGE_PROGRAM_ID;

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
    0xf7, 0x13, 0x4c, 0xe1, 0x38, 0x83, 0x2c, 0x14, 0x56, 0xf2, 0xa9, 0x1d, 0x64, 0x62, 0x1e, 0xe9,
    0x0c, 0x2b, 0xdd, 0xea,
];
// web3.eth.abi.encodeFunctionSignature("latestRoot()");
pub const LATEST_ROOT_SIGNATURE: [u8; 4] = [0xd7, 0xb0, 0xfe, 0xf1];

/// Compute quorum based on the number of guardians in a guardian set.
#[inline]
pub fn quorum(num_guardians: usize) -> usize {
    (2 * num_guardians) / 3 + 1
}

#[derive(Accounts)]
#[instruction(bytes: Vec<u8>)]
pub struct UpdateRootWithQuery<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    /// Guardian set used for signature verification (whose index should agree with the signature
    /// set account's guardian set index).
    #[account(
        seeds = [
            WormholeGuardianSet::SEED_PREFIX,
            signature_set.guardian_set_index.to_be_bytes().as_ref()
        ],
        bump,
        seeds::program = CORE_BRIDGE_PROGRAM_ID
    )]
    guardian_set: Account<'info, WormholeGuardianSet>,

    /// Stores signature validation from Sig Verify native program.
    /// TODO: does this need to have an owner defined? maybe yes after moving to a separate crate
    signature_set: Account<'info, QuerySignatureSet>,

    #[account(
        init,
        payer = payer,
        space = 8 + Root::INIT_SPACE,
        seeds = [
            Root::SEED_PREFIX,
            // TODO: what are better ways to do this? maybe instruction input?
            &bytes.as_slice()[bytes.len()-32..],
            &[0x00], //TODO: replace with enum
        ],
        bump
    )]
    root: Account<'info, Root>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + LatestRoot::INIT_SPACE,
        seeds = [
            LatestRoot::SEED_PREFIX,
            &[0x00], //TODO: replace with enum
        ],
        bump
    )]
    latest_root: Account<'info, LatestRoot>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump
    )]
    config: Account<'info, Config>,

    system_program: Program<'info, System>,
}

impl<'info> UpdateRootWithQuery<'info> {
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

#[access_control(UpdateRootWithQuery::constraints(&ctx, &bytes))]
pub fn update_root_with_query(ctx: Context<UpdateRootWithQuery>, bytes: Vec<u8>) -> Result<()> {
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

    let latest_root = ctx.accounts.latest_root.clone().into_inner();
    require!(
        chain_response.block_number > latest_root.read_block_number,
        SolanaWorldIDProgramError::StaleBlockNum
    );
    let current_timestamp = u64::try_from(Clock::get()?.unix_timestamp)?;
    let config = ctx.accounts.config.clone().into_inner();
    let min_block_time = if config.allowed_update_staleness >= current_timestamp {
        0
    } else {
        current_timestamp - config.allowed_update_staleness
    };
    let read_block_time_in_secs = chain_response.block_time / 1_000_000;
    require!(
        read_block_time_in_secs >= min_block_time,
        SolanaWorldIDProgramError::StaleBlockTime
    );

    require!(
        chain_response.results.len() == 1,
        SolanaWorldIDProgramError::InvalidResponseResultsLength
    );
    let result = &chain_response.results[0];
    require!(
        result.len() == 32,
        SolanaWorldIDProgramError::InvalidResponseResultLength
    );

    ctx.accounts.root.set_inner(Root {
        read_block_number: chain_response.block_number,
        read_block_hash: chain_response.block_hash,
        read_block_time: chain_response.block_time,
        expiry_time: read_block_time_in_secs + config.root_expiry,
        payer: ctx.accounts.payer.key(),
    });

    ctx.accounts.latest_root.set_inner(LatestRoot {
        read_block_number: chain_response.block_number,
        read_block_hash: chain_response.block_hash,
        read_block_time: chain_response.block_time,
        root: result.to_vec(),
    });

    Ok(())
}
