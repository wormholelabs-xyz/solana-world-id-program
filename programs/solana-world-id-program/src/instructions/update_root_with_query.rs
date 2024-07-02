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

cfg_if::cfg_if! {
    if #[cfg(feature = "mainnet")] {
        // https://docs.wormhole.com/wormhole/reference/constants
        pub const ETH_CHAIN_ID: u16 = 2;
        // https://docs.worldcoin.org/reference/address-book
        // https://etherscan.io/address/0xf7134CE138832c1456F2a91D64621eE90c2bddEa
        pub const ETH_WORLD_ID_IDENTITY_MANAGER: [u8; 20] = [
            0xf7, 0x13, 0x4c, 0xe1, 0x38, 0x83, 0x2c, 0x14, 0x56, 0xf2, 0xa9, 0x1d, 0x64, 0x62, 0x1e, 0xe9,
            0x0c, 0x2b, 0xdd, 0xea,
        ];
    } else if #[cfg(feature = "testnet")] {
        // https://docs.wormhole.com/wormhole/reference/constants
        pub const ETH_CHAIN_ID: u16 = 10002;
        // https://docs.worldcoin.org/reference/address-book
        // https://sepolia.etherscan.io/address/0x928a514350A403e2f5e3288C102f6B1CCABeb37C
        pub const ETH_WORLD_ID_IDENTITY_MANAGER: [u8; 20] = [
            0x92, 0x8a, 0x51, 0x43, 0x50, 0xa4, 0x03, 0xe2, 0xf5, 0xe3, 0x28, 0x8c, 0x10, 0x2f, 0x6b, 0x1c, 0xca, 0xbe, 0xb3, 0x7c
        ];
    }
}
// web3.eth.abi.encodeFunctionSignature("latestRoot()");
pub const LATEST_ROOT_SIGNATURE: [u8; 4] = [0xd7, 0xb0, 0xfe, 0xf1];

#[test]
fn test_latest_root_signature() {
    let hash = solana_program::keccak::hashv(&[b"latestRoot()"]).to_bytes();
    assert_eq!(LATEST_ROOT_SIGNATURE, hash[0..4]);
}

/// Compute quorum based on the number of guardians in a guardian set.
#[inline]
pub fn quorum(num_guardians: usize) -> usize {
    (2 * num_guardians) / 3 + 1
}

#[derive(Accounts)]
#[instruction(bytes: Vec<u8>, root_hash: [u8; 32])]
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
    #[account(mut, has_one = refund_recipient, close = refund_recipient)]
    signature_set: Account<'info, QuerySignatureSet>,

    #[account(
        init,
        payer = payer,
        space = 8 + Root::INIT_SPACE,
        seeds = [
            Root::SEED_PREFIX,
            &root_hash,
            Root::VERIFICATION_TYPE_QUERY,
        ],
        bump
    )]
    root: Account<'info, Root>,

    #[account(
        mut,
        seeds = [
            LatestRoot::SEED_PREFIX,
            Root::VERIFICATION_TYPE_QUERY,
        ],
        bump = latest_root.bump
    )]
    latest_root: Account<'info, LatestRoot>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    config: Account<'info, Config>,

    /// CHECK: This account is the refund recipient for the above signature_set
    #[account(address = signature_set.refund_recipient)]
    refund_recipient: AccountInfo<'info>,

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
pub fn update_root_with_query(
    ctx: Context<UpdateRootWithQuery>,
    bytes: Vec<u8>,
    root_hash: [u8; 32],
) -> Result<()> {
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
    let current_timestamp = Clock::get()?
        .unix_timestamp
        .try_into()
        .expect("timestamp underflow");
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
    require!(
        result.as_slice() == root_hash,
        SolanaWorldIDProgramError::RootHashMismatch
    );

    ctx.accounts.root.set_inner(Root {
        bump: ctx.bumps.root,
        read_block_number: chain_response.block_number,
        read_block_hash: chain_response.block_hash,
        read_block_time: chain_response.block_time,
        expiry_time: read_block_time_in_secs + config.root_expiry,
        refund_recipient: ctx.accounts.payer.key(),
    });

    ctx.accounts.latest_root.read_block_number = chain_response.block_number;
    ctx.accounts.latest_root.read_block_hash = chain_response.block_hash;
    ctx.accounts.latest_root.read_block_time = chain_response.block_time;
    ctx.accounts.latest_root.root = root_hash;

    Ok(())
}
