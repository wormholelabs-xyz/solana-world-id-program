use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_world_id_program::state::{LatestRoot, Root};
use trident_client::fuzzing::*;

use solana_world_id_onchain_template::instructions::trident_fuzz_verify_and_execute_snapshot::VerifyAndExecuteAlias;

use crate::constants;
use crate::fuzz_instructions::{FuzzAccounts, VerifyAndExecute};

type VerifyAndExecuteSnapshot<'info> = VerifyAndExecuteAlias<'info>;

impl<'info> IxOps<'info> for VerifyAndExecute {
    type IxData = solana_world_id_onchain_template::instruction::VerifyAndExecute;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = VerifyAndExecuteSnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_onchain_template::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let mut nullifier_hash = constants::quardian_set_5_mock::NULLIFIER_HASH;

        nullifier_hash[constants::quardian_set_5_mock::INDEX] = self.data.args.nullifier_hash[0];

        let data: VerifyAndExecuteCustomArgs = VerifyAndExecuteCustomArgs {
            root_hash: constants::quardian_set_5_mock::ROOT_HASH,
            nullifier_hash: constants::quardian_set_5_mock::NULLIFIER_HASH,
            proof: constants::quardian_set_5_mock::PROOF,
        };

        let data =
            solana_world_id_onchain_template::instruction::VerifyAndExecute { args: data.into() };
        Ok(data)
    }
    fn get_accounts(
        &self,
        client: &mut impl FuzzClient,
        fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<(Vec<Keypair>, Vec<AccountMeta>), FuzzingError> {
        let payer = fuzz_accounts.externalpayer.get_or_create_account(
            self.accounts.payer,
            client,
            58 * LAMPORTS_PER_SOL,
        );

        let root = match fuzz_accounts.root.get(self.accounts.root) {
            Some(r) => r.pubkey(),
            None => Pubkey::default(),
        };

        let latest_root = fuzz_accounts
            .latest_root
            .get_or_create_account(
                self.accounts.latest_root,
                &[LatestRoot::SEED_PREFIX, Root::VERIFICATION_TYPE_QUERY],
                &solana_world_id_program::ID,
            )
            .unwrap();

        let config = match fuzz_accounts.config.get(self.accounts.config) {
            Some(c) => c.pubkey(),
            None => Pubkey::default(),
        };

        let recipient = constants::quardian_set_5_mock::RECIPIENT;

        let nullifier = fuzz_accounts
            .nullifier
            .get_or_create_account(
                self.accounts.nullifier,
                &[
                    b"nullifier",
                    constants::quardian_set_5_mock::NULLIFIER_HASH.as_ref(),
                ],
                &solana_world_id_onchain_template::ID,
            )
            .unwrap();

        let signers = vec![payer.clone()];
        let acc_meta = solana_world_id_onchain_template::accounts::VerifyAndExecute {
            payer: payer.pubkey(),
            root,
            latest_root: latest_root.pubkey(),
            config,
            recipient,
            nullifier: nullifier.pubkey(),
            world_id_program: solana_world_id_program::ID,
            system_program: solana_sdk::system_program::ID,
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
        if ix_data.args.nullifier_hash[constants::quardian_set_5_mock::INDEX]
            != constants::quardian_set_5_mock::REFERENCE
        {
            return Err(FuzzingError::Custom(5));
        }
        Ok(())
    }
}

#[derive(Arbitrary, Debug, Clone, Copy)]
pub struct VerifyAndExecuteCustomArgs {
    pub root_hash: [u8; 32],
    pub nullifier_hash: [u8; 32],
    pub proof: [u8; 256],
}
impl From<VerifyAndExecuteCustomArgs>
    for solana_world_id_onchain_template::instructions::VerifyAndExecuteArgs
{
    fn from(value: VerifyAndExecuteCustomArgs) -> Self {
        solana_world_id_onchain_template::instructions::VerifyAndExecuteArgs {
            root_hash: value.root_hash,
            nullifier_hash: value.nullifier_hash,
            proof: value.proof,
        }
    }
}
