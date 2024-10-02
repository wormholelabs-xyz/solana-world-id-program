use crate::{
    error::SolanaWorldIDProgramError,
    state::{Config, LatestRoot, Root},
};
use anchor_lang::prelude::*;
use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
/// import required for fuzzing
use trident_derive_accounts_snapshots::AccountsSnapshots;
/// -*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
// Generated with https://github.com/Lightprotocol/groth16-solana/tree/5f1a1521bb3032601b235b6df97867801f2dfb0b?tab=readme-ov-file#create-verifyingkey-from-snarkjs-verifyingkeyjson
// Using the values from https://github.com/worldcoin/world-id-state-bridge/blob/29641f734b1ba8ff107c80c6dfd2b903b4eecc1c/src/SemaphoreVerifier.sol#L59-L115
// To make a verifyingKey.json
pub const VERIFYING_KEY: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: 5,

    vk_alpha_g1: [
        45, 77, 154, 167, 227, 2, 217, 223, 65, 116, 157, 85, 7, 148, 157, 5, 219, 234, 51, 251,
        177, 108, 100, 59, 34, 245, 153, 162, 190, 109, 242, 226, 20, 190, 221, 80, 60, 55, 206,
        176, 97, 216, 236, 96, 32, 159, 227, 69, 206, 137, 131, 10, 25, 35, 3, 1, 240, 118, 202,
        255, 0, 77, 25, 38,
    ],

    vk_beta_g2: [
        9, 103, 3, 47, 203, 247, 118, 209, 175, 201, 133, 248, 136, 119, 241, 130, 211, 132, 128,
        166, 83, 242, 222, 202, 169, 121, 76, 188, 59, 243, 6, 12, 14, 24, 120, 71, 173, 76, 121,
        131, 116, 208, 214, 115, 43, 245, 1, 132, 125, 214, 139, 192, 224, 113, 36, 30, 2, 19, 188,
        127, 193, 61, 183, 171, 0, 23, 82, 161, 0, 167, 47, 223, 30, 90, 93, 110, 168, 65, 204, 32,
        236, 131, 139, 204, 252, 247, 189, 85, 158, 121, 241, 201, 199, 89, 182, 160, 25, 42, 140,
        193, 60, 217, 247, 98, 135, 31, 33, 228, 52, 81, 198, 202, 158, 234, 178, 203, 41, 135,
        196, 227, 102, 161, 133, 194, 93, 172, 46, 127,
    ],

    vk_gamme_g2: [
        25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73, 51,
        53, 169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31, 30, 118,
        66, 106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70, 222, 189, 92,
        217, 146, 246, 237, 39, 93, 196, 162, 136, 209, 175, 179, 203, 177, 172, 9, 24, 117, 36,
        199, 219, 54, 57, 93, 247, 190, 59, 153, 230, 115, 177, 58, 7, 90, 101, 236, 29, 155, 239,
        205, 5, 165, 50, 62, 109, 164, 212, 53, 243, 182, 23, 205, 179, 175, 131, 40, 92, 45, 247,
        17, 239, 57, 192, 21, 113, 130, 127, 157,
    ],

    vk_delta_g2: [
        22, 142, 79, 221, 172, 80, 164, 13, 91, 207, 243, 156, 127, 169, 32, 124, 211, 104, 68, 76,
        12, 1, 168, 102, 144, 166, 100, 91, 82, 243, 170, 31, 33, 57, 162, 86, 69, 104, 37, 218,
        166, 35, 149, 124, 79, 46, 161, 160, 210, 111, 19, 87, 105, 228, 80, 117, 145, 66, 167, 21,
        155, 10, 68, 118, 7, 133, 148, 36, 16, 141, 232, 139, 251, 229, 200, 10, 25, 192, 232, 11,
        163, 95, 218, 67, 131, 211, 253, 18, 83, 5, 221, 4, 180, 192, 143, 228, 20, 42, 215, 169,
        60, 160, 197, 84, 169, 240, 48, 48, 89, 229, 162, 78, 133, 64, 0, 4, 167, 48, 89, 139, 212,
        35, 176, 9, 15, 75, 61, 74,
    ],

    vk_ic: &[
        [
            3, 53, 245, 20, 194, 172, 185, 178, 85, 170, 232, 85, 20, 18, 34, 103, 205, 125, 22,
            227, 116, 198, 35, 26, 44, 52, 65, 125, 52, 73, 18, 84, 7, 250, 21, 128, 193, 204, 62,
            212, 246, 214, 96, 198, 246, 15, 134, 175, 237, 216, 161, 47, 185, 11, 46, 142, 212,
            247, 227, 16, 200, 139, 151, 247,
        ],
        [
            32, 183, 129, 221, 13, 179, 183, 152, 10, 75, 56, 20, 18, 140, 134, 229, 151, 225, 68,
            45, 15, 201, 235, 127, 147, 42, 82, 41, 73, 77, 107, 121, 23, 209, 206, 244, 54, 235,
            47, 102, 86, 112, 199, 179, 72, 84, 230, 44, 34, 112, 67, 167, 177, 17, 165, 57, 192,
            41, 85, 24, 187, 171, 60, 169,
        ],
        [
            38, 9, 69, 68, 91, 66, 5, 248, 116, 171, 126, 32, 58, 24, 36, 14, 81, 201, 211, 200,
            150, 234, 48, 13, 64, 19, 43, 28, 47, 80, 41, 154, 17, 8, 122, 139, 118, 176, 249, 87,
            225, 196, 130, 201, 9, 48, 41, 22, 121, 95, 129, 26, 6, 134, 96, 89, 228, 3, 104, 156,
            1, 201, 3, 251,
        ],
        [
            17, 210, 15, 216, 28, 14, 92, 244, 139, 161, 70, 156, 203, 138, 201, 157, 205, 199,
            207, 116, 106, 110, 112, 118, 42, 147, 157, 99, 220, 197, 45, 191, 45, 68, 124, 95, 19,
            78, 255, 82, 125, 123, 202, 172, 232, 139, 56, 66, 196, 43, 128, 13, 141, 192, 73, 224,
            166, 231, 47, 94, 252, 20, 41, 61,
        ],
        [
            16, 124, 213, 74, 22, 6, 166, 168, 115, 190, 212, 193, 183, 106, 244, 137, 117, 230,
            109, 207, 108, 18, 123, 76, 121, 154, 212, 253, 210, 48, 184, 124, 26, 81, 184, 31,
            108, 7, 114, 94, 188, 197, 110, 187, 28, 72, 43, 153, 52, 14, 170, 155, 203, 134, 204,
            9, 174, 214, 245, 138, 40, 229, 48, 182,
        ],
    ],
};

#[derive(Accounts, AccountsSnapshots)]
#[instruction(root_hash: [u8; 32], verification_type: [u8; 1], signal_hash: [u8; 32], nullifier_hash: [u8; 32], external_nullifier_hash: [u8; 32], proof: [u8; 256])]
pub struct VerifyGroth16Proof<'info> {
    #[account(
        seeds = [
            Root::SEED_PREFIX,
            &root_hash,
            &verification_type,
        ],
        bump = root.bump
    )]
    root: Account<'info, Root>,

    #[account(
        seeds = [
            LatestRoot::SEED_PREFIX,
            &verification_type,
        ],
        bump = latest_root.bump
    )]
    latest_root: Account<'info, LatestRoot>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump = config.bump
    )]
    config: Account<'info, Config>,
}

impl<'info> VerifyGroth16Proof<'info> {
    pub fn constraints(
        ctx: &Context<Self>,
        root_hash: [u8; 32],
        _verification_type: [u8; 1],
        signal_hash: [u8; 32],
        nullifier_hash: [u8; 32],
        external_nullifier_hash: [u8; 32],
        proof: [u8; 256],
    ) -> Result<()> {
        let root = &ctx.accounts.root;
        let latest_root = &ctx.accounts.latest_root;
        let config = &ctx.accounts.config;

        // The latest root is always valid
        if root_hash != latest_root.root {
            // Check that the root not has expired.
            let current_timestamp = Clock::get()?
                .unix_timestamp
                .try_into()
                .expect("timestamp underflow");
            require!(
                root.is_active(&current_timestamp, &config.root_expiry),
                SolanaWorldIDProgramError::RootExpired
            );
        }

        let proof_a = proof[0..64].try_into().unwrap();
        let proof_b = proof[64..192].try_into().unwrap();
        let proof_c = proof[192..256].try_into().unwrap();

        let public_inputs = [
            root_hash,
            nullifier_hash,
            signal_hash,
            external_nullifier_hash,
        ];

        let mut verifier =
            Groth16Verifier::new(&proof_a, &proof_b, &proof_c, &public_inputs, &VERIFYING_KEY)
                .map_err(|_| SolanaWorldIDProgramError::CreateGroth16VerifierFailed)?;
        verifier
            .verify()
            .map_err(|_| SolanaWorldIDProgramError::Groth16ProofVerificationFailed)?;

        Ok(())
    }
}

#[access_control(VerifyGroth16Proof::constraints(&ctx, root_hash,
    verification_type,
    signal_hash,
    nullifier_hash,
    external_nullifier_hash,
    proof))]
pub fn verify_groth16_proof(
    ctx: Context<VerifyGroth16Proof>,
    root_hash: [u8; 32],
    verification_type: [u8; 1],
    signal_hash: [u8; 32],
    nullifier_hash: [u8; 32],
    external_nullifier_hash: [u8; 32],
    proof: [u8; 256],
) -> Result<()> {
    Ok(())
}
