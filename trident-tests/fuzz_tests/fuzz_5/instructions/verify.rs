use solana_world_id_program::state::{Config, LatestRoot, Root};
use trident_client::fuzzing::*;

use solana_world_id_program::instructions::trident_fuzz_verify_groth_16_proof_snapshot::VerifyGroth16ProofAlias;

use crate::fuzz_instructions::{FuzzAccounts, VerifyGroth16Proof};

type VerifyGroth16ProofSnapshot<'info> = VerifyGroth16ProofAlias<'info>;

use crate::constants::*;

impl<'info> IxOps<'info> for VerifyGroth16Proof {
    type IxData = solana_world_id_program::instruction::VerifyGroth16Proof;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = VerifyGroth16ProofSnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_program::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let mut proof = quardian_set_5_mock::PROOF;
        proof[quardian_set_5_mock::RANDOM_INDEXA] = self.data.proof[0];
        proof[quardian_set_5_mock::RANDOM_INDEXB] = self.data.proof[1];
        proof[quardian_set_5_mock::RANDOM_INDEXC] = self.data.proof[2];

        let data = solana_world_id_program::instruction::VerifyGroth16Proof {
            root_hash: quardian_set_5_mock::ROOT_HASH,
            verification_type: [0],
            signal_hash: quardian_set_5_mock::SIGNAL_HASH,
            nullifier_hash: quardian_set_5_mock::NULLIFIER_HASH,
            external_nullifier_hash: quardian_set_5_mock::EXTERNAL_NULLIFIER,
            proof,
        };
        Ok(data)
    }
    fn get_accounts(
        &self,
        _client: &mut impl FuzzClient,
        fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<(Vec<Keypair>, Vec<AccountMeta>), FuzzingError> {
        let root_hash = quardian_set_5_mock::ROOT_HASH;

        let root = fuzz_accounts
            .root
            .get_or_create_account(
                self.accounts.root,
                &[Root::SEED_PREFIX, &root_hash, Root::VERIFICATION_TYPE_QUERY],
                &solana_world_id_program::ID,
            )
            .unwrap();
        let latest_root = fuzz_accounts
            .latest_root
            .get_or_create_account(
                self.accounts.latest_root,
                &[LatestRoot::SEED_PREFIX, Root::VERIFICATION_TYPE_QUERY],
                &solana_world_id_program::ID,
            )
            .unwrap();

        let config = fuzz_accounts
            .config
            .get_or_create_account(
                self.accounts.config,
                &[Config::SEED_PREFIX],
                &solana_world_id_program::ID,
            )
            .unwrap();

        let signers = vec![];
        let acc_meta = solana_world_id_program::accounts::VerifyGroth16Proof {
            root: root.pubkey(),
            latest_root: latest_root.pubkey(),
            config: config.pubkey(),
        }
        .to_account_metas(None);
        Ok((signers, acc_meta))
    }
    fn check(
        &self,
        _pre_ix: Self::IxSnapshot,
        _post_ix: Self::IxSnapshot,
        ix_data: Self::IxData,
    ) -> Result<(), FuzzingError> {
        // invariant check is called only if instruction passed , so that the proof was verified
        // thus we can check for proof values

        if ix_data.proof[0] != quardian_set_5_mock::REFERENCE_SIG_VALUEA
            || ix_data.proof[1] != quardian_set_5_mock::REFERENCE_SIG_VALUEB
            || ix_data.proof[2] != quardian_set_5_mock::REFERENCE_SIG_VALUEC
        {
            return Err(FuzzingError::Custom(5));
        }
        Ok(())
    }
}
