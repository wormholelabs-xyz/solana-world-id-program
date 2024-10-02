use crate::{
    error::SolanaWorldIDProgramError,
    state::{Config, GuardianSignatures, LatestRoot, Root, WormholeGuardianSet},
};
use anchor_lang::{
    prelude::*,
    solana_program::{
        self, keccak, program_memory::sol_memcpy, secp256k1_recover::secp256k1_recover,
    },
};
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// import required for fuzzing
use trident_derive_accounts_snapshots::AccountsSnapshots;
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
use wormhole_query_sdk::{
    structs::{ChainSpecificQuery, ChainSpecificResponse, QueryResponse},
    MESSAGE_PREFIX, QUERY_MESSAGE_LEN,
};
use wormhole_raw_vaas::{utils::quorum, GuardianSetSig};
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
        // https://sepolia.etherscan.io/address/0xb2ead588f14e69266d1b87936b75325181377076
        pub const ETH_WORLD_ID_IDENTITY_MANAGER: [u8; 20] = [
            0xb2, 0xea, 0xd5, 0x88, 0xf1, 0x4e, 0x69, 0x26, 0x6d, 0x1b, 0x87, 0x93, 0x6b, 0x75, 0x32, 0x51,
            0x81, 0x37, 0x70, 0x76,
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

#[derive(Accounts, AccountsSnapshots)]
#[instruction(bytes: Vec<u8>, root_hash: [u8; 32], guardian_set_index: u32)]
pub struct UpdateRootWithQuery<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    /// Guardian set used for signature verification.
    #[account(
        seeds = [
            WormholeGuardianSet::SEED_PREFIX,
            guardian_set_index.to_be_bytes().as_ref()
        ],
        bump,
        seeds::program = CORE_BRIDGE_PROGRAM_ID
    )]
    guardian_set: Account<'info, WormholeGuardianSet>,

    /// Stores unverified guardian signatures as they are too large to fit in the instruction data.
    #[account(mut, has_one = refund_recipient, close = refund_recipient)]
    guardian_signatures: Account<'info, GuardianSignatures>,

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
    #[account(mut, address = guardian_signatures.refund_recipient)]
    refund_recipient: AccountInfo<'info>,

    system_program: Program<'info, System>,
}

impl<'info> UpdateRootWithQuery<'info> {
    pub fn constraints(ctx: &Context<Self>, bytes: &Vec<u8>) -> Result<()> {
        let guardian_set = &ctx.accounts.guardian_set;

        // Check that the guardian set is still active.
        let timestamp = Clock::get()?
            .unix_timestamp
            .try_into()
            .expect("timestamp overflow");
        require!(
            guardian_set.is_active(&timestamp),
            SolanaWorldIDProgramError::GuardianSetExpired
        );

        // Compute the message hash.
        let message_hash = [
            MESSAGE_PREFIX,
            &solana_program::keccak::hashv(&[&bytes]).to_bytes(),
        ]
        .concat();

        // SECURITY: defense-in-depth, check again that these are the expected length
        require_eq!(
            message_hash.len(),
            QUERY_MESSAGE_LEN,
            SolanaWorldIDProgramError::InvalidMessageHash
        );

        let guardian_signatures = &ctx.accounts.guardian_signatures.guardian_signatures;

        // This section is borrowed from https://github.com/wormhole-foundation/wormhole/blob/wen/solana-rewrite/solana/programs/core-bridge/src/processor/parse_and_verify_vaa/verify_encoded_vaa_v1.rs#L72-L103
        // Also similarly used here https://github.com/pyth-network/pyth-crosschain/blob/6771c2c6998f53effee9247347cb0ac71612b3dc/target_chains/solana/programs/pyth-solana-receiver/src/lib.rs#L121-L159
        // Do we have enough signatures for quorum?
        let guardian_keys = &guardian_set.keys;
        let quorum = quorum(guardian_keys.len());
        require!(
            guardian_signatures.len() >= quorum,
            SolanaWorldIDProgramError::NoQuorum
        );

        let digest = keccak::hash(message_hash.as_slice());

        // Verify signatures
        let mut last_guardian_index = None;
        for sig_bytes in guardian_signatures {
            let sig = GuardianSetSig::try_from(sig_bytes.as_slice())
                .map_err(|_| SolanaWorldIDProgramError::InvalidSignature)?;
            // We do not allow for non-increasing guardian signature indices.
            let index = usize::from(sig.guardian_index());
            if let Some(last_index) = last_guardian_index {
                require!(
                    index > last_index,
                    SolanaWorldIDProgramError::InvalidGuardianIndexNonIncreasing
                );
            }

            // Does this guardian index exist in this guardian set?
            let guardian_pubkey = guardian_keys
                .get(index)
                .ok_or_else(|| error!(SolanaWorldIDProgramError::InvalidGuardianIndexOutOfRange))?;

            // Now verify that the signature agrees with the expected Guardian's pubkey.
            verify_guardian_signature(&sig, guardian_pubkey, digest.as_ref())?;

            last_guardian_index = Some(index);
        }
        // End borrowed section

        // Done.
        Ok(())
    }
}

#[access_control(UpdateRootWithQuery::constraints(&ctx, &bytes))]
pub fn update_root_with_query(
    ctx: Context<UpdateRootWithQuery>,
    bytes: Vec<u8>,
    root_hash: [u8; 32],
    _guardian_set_index: u32,
) -> Result<()> {
    // Parse the Wormhole QueryResponse.
    let response = QueryResponse::deserialize(&bytes)
        .map_err(|_| SolanaWorldIDProgramError::FailedToParseResponse)?;
    // Requests can be batched, expect only one request to Ethereum.
    require!(
        response.request.requests.len() == 1,
        SolanaWorldIDProgramError::InvalidNumberOfRequests
    );
    let request = &response.request.requests[0];
    require!(
        request.chain_id == ETH_CHAIN_ID,
        SolanaWorldIDProgramError::InvalidRequestChainId
    );
    // Ensure this was an EthCall. https://docs.wormhole.com/wormhole/queries/overview#eth_call
    let query = match &request.query {
        ChainSpecificQuery::EthCallQueryRequest(q) => Some(q),
        _ => None,
    }
    .ok_or(SolanaWorldIDProgramError::InvalidRequestType)?;
    // Ensure there was one call of `latestRoot()` to the World ID Identity Manager contract.
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
    // Sanity checks: expect one EthCall response from Ethereum.
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
    // Only accept roots from newer blocks.
    let latest_root = &ctx.accounts.latest_root;
    require!(
        chain_response.block_number > latest_root.read_block_number,
        SolanaWorldIDProgramError::StaleBlockNum
    );
    // Only accept blocks within the allowed update staleness.
    // This, along with the above check, ensures that Queries cannot be stored for an extended period of time without being submitted.
    let current_timestamp = Clock::get()?
        .unix_timestamp
        .try_into()
        .expect("timestamp underflow");
    let config = &ctx.accounts.config;
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
    // Ensure one result matching the root hash used to derive the root account.
    require!(
        chain_response.results.len() == 1,
        SolanaWorldIDProgramError::InvalidResponseResultsLength
    );
    let result = &chain_response.results[0];
    require!(
        result.len() == 32, // A keccak hash is 32 bytes.
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
        refund_recipient: ctx.accounts.payer.key(),
        root: root_hash,
        verification_type: *Root::VERIFICATION_TYPE_QUERY,
    });

    ctx.accounts.latest_root.read_block_number = chain_response.block_number;
    ctx.accounts.latest_root.read_block_hash = chain_response.block_hash;
    ctx.accounts.latest_root.read_block_time = chain_response.block_time;
    ctx.accounts.latest_root.root = root_hash;

    Ok(())
}

/**
 * Borrowed from https://github.com/wormhole-foundation/wormhole/blob/wen/solana-rewrite/solana/programs/core-bridge/src/processor/parse_and_verify_vaa/verify_encoded_vaa_v1.rs#L121
 * Also used here https://github.com/pyth-network/pyth-crosschain/blob/6771c2c6998f53effee9247347cb0ac71612b3dc/target_chains/solana/programs/pyth-solana-receiver/src/lib.rs#L432
 */
fn verify_guardian_signature(
    sig: &GuardianSetSig,
    guardian_pubkey: &[u8; 20],
    digest: &[u8],
) -> Result<()> {
    // Recover using `solana_program::secp256k1_recover`. Public key recovery costs 25k compute
    // units. And hashing this public key to recover the Ethereum public key costs about 13k.
    let recovered = {
        // Recover EC public key (64 bytes).
        let pubkey = secp256k1_recover(digest, sig.recovery_id(), &sig.rs())
            .map_err(|_| SolanaWorldIDProgramError::InvalidSignature)?;

        // The Ethereum public key is the last 20 bytes of keccak hashed public key above.
        let hashed = keccak::hash(&pubkey.to_bytes());

        let mut eth_pubkey = [0; 20];
        sol_memcpy(&mut eth_pubkey, &hashed.0[12..], 20);

        eth_pubkey
    };

    // The recovered public key should agree with the Guardian's public key at this index.
    require!(
        recovered == *guardian_pubkey,
        SolanaWorldIDProgramError::InvalidGuardianKeyRecovery
    );

    // Done.
    Ok(())
}
