use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_world_id_program::state::{Config, LatestRoot, Root};
use trident_client::fuzzing::*;

use solana_world_id_program::instructions::trident_fuzz_clean_up_root_snapshot::CleanUpRootAlias;

use crate::fuzz_instructions::{CleanUpRoot, FuzzAccounts};

type CleanUpRootSnapshot<'info> = CleanUpRootAlias<'info>;

impl<'info> IxOps<'info> for CleanUpRoot {
    type IxData = solana_world_id_program::instruction::CleanUpRoot;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = CleanUpRootSnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_program::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let data = solana_world_id_program::instruction::CleanUpRoot {};
        Ok(data)
    }
    fn get_accounts(
        &self,
        client: &mut impl FuzzClient,
        fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<(Vec<Keypair>, Vec<AccountMeta>), FuzzingError> {
        let root_hash = crate::guardian_set_9_mock_nineteen_guardians::ROOT_HASH;

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

        let signers = vec![];
        let acc_meta = solana_world_id_program::accounts::CleanUpRoot {
            root: root.pubkey(),
            latest_root: latest_root.pubkey(),
            config: config.pubkey(),
            refund_recipient: refund_recipient.pubkey(),
        }
        .to_account_metas(None);
        Ok((signers, acc_meta))
    }
    fn tx_error_handler(
        &self,
        _e: FuzzClientErrorWithOrigin,
        _ix_data: Self::IxData,
        _pre_ix_acc_infos: &mut &'info [Option<AccountInfo<'info>>],
    ) -> Result<(), FuzzClientErrorWithOrigin> {
        Ok(())
    }
}
