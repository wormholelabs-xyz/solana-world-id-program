use solana_sdk::bpf_loader_upgradeable;

use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_world_id_program::state::Config;
use trident_client::fuzzing::*;

use solana_world_id_program::instructions::trident_fuzz_transfer_ownership_snapshot::TransferOwnershipAlias;

use crate::fuzz_instructions::{FuzzAccounts, TransferOwnership};

type TransferOwnershipSnapshot<'info> = TransferOwnershipAlias<'info>;

impl<'info> IxOps<'info> for TransferOwnership {
    type IxData = solana_world_id_program::instruction::TransferOwnership;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = TransferOwnershipSnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_program::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let data = solana_world_id_program::instruction::TransferOwnership {};
        Ok(data)
    }
    fn get_accounts(
        &self,
        client: &mut impl FuzzClient,
        fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<(Vec<Keypair>, Vec<AccountMeta>), FuzzingError> {
        let config = fuzz_accounts
            .config
            .get_or_create_account(
                self.accounts.config,
                &[Config::SEED_PREFIX],
                &solana_world_id_program::ID,
            )
            .unwrap();

        let deployer = fuzz_accounts.deployer.get_or_create_account(
            self.accounts.deployer,
            client,
            5 * LAMPORTS_PER_SOL,
        );

        let new_owner = fuzz_accounts.new_owner.get_or_create_account(
            self.accounts.new_owner,
            client,
            15 * LAMPORTS_PER_SOL,
        );

        let upgrade_lock = fuzz_accounts
            .upgrade_lock
            .get_or_create_account(
                self.accounts.upgrade_lock,
                &[b"upgrade_lock"],
                &solana_world_id_program::ID,
            )
            .unwrap();

        let (program_data_address, _program_data_address_bump) = Pubkey::try_find_program_address(
            &[solana_world_id_program::ID.as_ref()],
            &bpf_loader_upgradeable::id(),
        )
        .unwrap();

        let signers = vec![deployer.clone()];
        let acc_meta = solana_world_id_program::accounts::TransferOwnership {
            config: config.pubkey(),
            owner: deployer.pubkey(),
            new_owner: new_owner.pubkey(),
            upgrade_lock: upgrade_lock.pubkey(),
            program_data: program_data_address,
            bpf_loader_upgradeable_program: solana_sdk::bpf_loader_upgradeable::ID,
        }
        .to_account_metas(None);
        Ok((signers, acc_meta))
    }
    fn check(
        &self,
        pre_ix: Self::IxSnapshot,
        post_ix: Self::IxSnapshot,
        _ix_data: Self::IxData,
    ) -> Result<(), FuzzingError> {
        let config_pre = pre_ix.config;
        let config_post = post_ix.config;

        let deployer = pre_ix.owner.key;
        let deployer_reference = config_pre.owner;

        if config_pre.pending_owner.is_none()
            && config_post.pending_owner.is_some()
            && *deployer != deployer_reference
        {
            return Err(FuzzingError::Custom(3));
        }

        Ok(())
    }
}
