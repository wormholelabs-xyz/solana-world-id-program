// declare_program!(solana_world_id_program);

use anchor_lang::{
    prelude::*,
    solana_program::{self},
};
use ethnum::U256;
use solana_program::keccak::hash;
use solana_world_id_program::cpi::accounts::VerifyGroth16Proof;
use solana_world_id_program::program::SolanaWorldIdProgram;

use trident_derive_accounts_snapshots::AccountsSnapshots;

// Hardcoded examples
pub const APP_ID: &str = "app_staging_7d23b838b02776cebd87b86ac3248641";
pub const ACTION: &str = "testing";
pub const VERIFICATION_TYPE: [u8; 1] = [0u8]; // For query-based verification

#[derive(Accounts, AccountsSnapshots)]
#[instruction(args: VerifyAndExecuteArgs)]
pub struct VerifyAndExecute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: account is passed to `verify_groth16_proof` which checks the PDA.
    pub root: AccountInfo<'info>,

    pub latest_root: AccountInfo<'info>,

    /// CHECK: account is passed to `verify_groth16_proof` which checks the PDA.
    pub config: AccountInfo<'info>,

    /// CHECK: This account is the recipient and must exist, but can be any type of account.
    /// In practice, this might be a wallet address or a SPL associated token account.
    pub recipient: UncheckedAccount<'info>,

    /// CHECK: This account is used as a PDA to ensure uniqueness and is not read or written to.
    #[account(
        init,
        payer = payer,
        space = 0,
        seeds = [b"nullifier", args.nullifier_hash.as_ref()],
        bump,
    )]
    pub nullifier: AccountInfo<'info>,

    pub world_id_program: Program<'info, SolanaWorldIdProgram>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct VerifyAndExecuteArgs {
    pub root_hash: [u8; 32],
    pub nullifier_hash: [u8; 32],
    pub proof: [u8; 256],
}

fn hash_to_field(input: &[u8]) -> [u8; 32] {
    let hash_result = hash(input).to_bytes();
    let big_int: U256 = U256::from_be_bytes(hash_result);
    let shifted: U256 = big_int >> 8;
    shifted.to_be_bytes()
}

fn app_id_action_to_external_nullifier_hash(app_id: &str, action: &str) -> [u8; 32] {
    let app_hash = hash_to_field(app_id.as_bytes());
    let mut combined = app_hash.to_vec();
    combined.extend_from_slice(action.as_bytes());
    hash_to_field(&combined)
}

/// Parameters for the `verify_and_execute` function:
///
/// - `ctx`: The context containing all the accounts required for the instruction.
/// - `args`: The arguments for the `verify_and_execute` instruction, which include:
///   - `root_hash`: A 32-byte array representing the root hash of the Merkle tree.
///   - `nullifier_hash`: A 32-byte array representing the hash of the nullifier to ensure uniqueness.
///   - `proof`: A 256-byte array containing the Groth16 proof for verification.
///
/// The function performs the following steps:
/// 1. Calculates the `external_nullifier_hash` using the `APP_ID` and `ACTION`.
/// 2. Converts the recipient's public key to a hex string and hashes it to get the `signal_hash`.
///    Note: The proof is generated using the recipient's public key converted to bytes and then to a hex string.
///    This is equivalent to `publicKey.toBuffer().toString('hex')` in JavaScript/TypeScript.
/// 3. Makes a CPI call to the `verify_groth16_proof` function in the `solana_world_id_program` to verify the proof.
///
/// Important: When generating the proof off-chain, ensure that the signal (recipient's public key)
/// is processed in the same way: convert the public key to bytes, then to a hex string. This ensures
/// that the on-chain verification matches the off-chain proof generation.
///
/// Example:
/// In JavaScript/TypeScript, the signal would be generated like this:
/// ```javascript
/// const signal = `0x${new PublicKey('5yNbCZcCHeAxdmMJXcpFgmurEnygaVbCRwZNMMWETdeZ')
///   .toBuffer()
///   .toString('hex')}`;
/// ```
/// This produces a hex string that matches what the on-chain program uses for verification.
pub fn verify_and_execute(
    ctx: Context<VerifyAndExecute>,
    args: VerifyAndExecuteArgs,
) -> Result<()> {
    // Calculate external_nullifier_hash
    let external_nullifier_hash: [u8; 32] =
        app_id_action_to_external_nullifier_hash(APP_ID, ACTION);

    // Calculate the signal hash by converting the recipient key to hex and hashing it
    let signal_bytes = ctx.accounts.recipient.key().to_bytes();
    let signal_hash = hash_to_field(&signal_bytes);

    // CPI call to verify_groth16_proof
    solana_world_id_program::cpi::verify_groth16_proof(
        CpiContext::new(
            ctx.accounts.world_id_program.to_account_info(),
            VerifyGroth16Proof {
                root: ctx.accounts.root.to_account_info(),
                latest_root: ctx.accounts.latest_root.to_account_info(),
                config: ctx.accounts.config.to_account_info(),
            },
        ),
        args.root_hash,
        VERIFICATION_TYPE,
        signal_hash,
        args.nullifier_hash,
        external_nullifier_hash,
        args.proof,
    )?;

    Ok(())
}
