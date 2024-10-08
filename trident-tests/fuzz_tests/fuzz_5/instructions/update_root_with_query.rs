use trident_client::fuzzing::*;

use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_world_id_program::state::{Config, LatestRoot, Root};

use crate::fuzz_instructions::{FuzzAccounts, UpdateRootWithQuery};

use solana_world_id_program::instructions::trident_fuzz_update_root_with_query_snapshot::UpdateRootWithQueryAlias;

type UpdateRootWithQuerySnapshot<'info> = UpdateRootWithQueryAlias<'info>;

impl<'info> IxOps<'info> for UpdateRootWithQuery {
    type IxData = solana_world_id_program::instruction::UpdateRootWithQuery;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = UpdateRootWithQuerySnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_program::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let data = solana_world_id_program::instruction::UpdateRootWithQuery {
            bytes: crate::constants::quardian_set_5_mock::BYTES.to_vec(),
            root_hash: crate::constants::quardian_set_5_mock::ROOT_HASH,
            guardian_set_index: crate::constants::quardian_set_5_mock::MOCK_GUARDIAN_SET_INDEX,
        };
        Ok(data)
    }
    fn get_accounts(
        &self,
        client: &mut impl FuzzClient,
        fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<(Vec<Keypair>, Vec<AccountMeta>), FuzzingError> {
        let payer = fuzz_accounts.payer.get_or_create_account(
            self.accounts.payer,
            client,
            10 * LAMPORTS_PER_SOL,
        );

        let guardian_signatures = fuzz_accounts.guardian_signatures.get_or_create_account(
            self.accounts.guardian_signatures,
            client,
            10 * LAMPORTS_PER_SOL,
        );

        let root_hash = crate::constants::quardian_set_5_mock::ROOT_HASH;

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

        let refund_recipient = fuzz_accounts.payer.get_or_create_account(
            self.accounts.refund_recipient,
            client,
            50 * LAMPORTS_PER_SOL,
        );

        let guardian_set = fuzz_accounts
            .guardian_set
            .get_or_create_account(
                self.accounts.guardian_set,
                &[
                    b"GuardianSet",
                    crate::constants::quardian_set_5_mock::MOCK_GUARDIAN_SET_INDEX
                        .to_be_bytes()
                        .as_ref(),
                ],
                &crate::constants::MAINNET_CORE_BRIDGE_ID,
            )
            .unwrap();

        let signers = vec![payer.clone()];
        let acc_meta = solana_world_id_program::accounts::UpdateRootWithQuery {
            payer: payer.pubkey(),
            guardian_set: guardian_set.pubkey(),
            guardian_signatures: guardian_signatures.pubkey(),
            root: root.pubkey(),
            latest_root: latest_root.pubkey(),
            config: config.pubkey(),
            refund_recipient: refund_recipient.pubkey(),
            system_program: solana_sdk::system_program::ID,
        }
        .to_account_metas(None);
        Ok((signers, acc_meta))
    }
}
