use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_world_id_program::state::Config;
use trident_client::fuzzing::*;

use solana_world_id_program::instructions::trident_fuzz_set_root_expiry_snapshot::SetRootExpiryAlias;

use crate::fuzz_instructions::{FuzzAccounts, SetRootExpiry};

type SetRootExpirySnapshot<'info> = SetRootExpiryAlias<'info>;

impl<'info> IxOps<'info> for SetRootExpiry {
    type IxData = solana_world_id_program::instruction::SetRootExpiry;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = SetRootExpirySnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_program::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let data = solana_world_id_program::instruction::SetRootExpiry {
            root_expiry: self.data.root_expiry,
        };
        Ok(data)
    }
    fn get_accounts(
        &self,
        client: &mut impl FuzzClient,
        fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<(Vec<Keypair>, Vec<AccountMeta>), FuzzingError> {
        let deployer = fuzz_accounts.deployer.get_or_create_account(
            self.accounts.deployer,
            client,
            10 * LAMPORTS_PER_SOL,
        );
        let config = fuzz_accounts
            .config
            .get_or_create_account(
                self.accounts.config,
                &[Config::SEED_PREFIX],
                &solana_world_id_program::ID,
            )
            .unwrap();

        let signers = vec![deployer.clone()];
        let acc_meta = solana_world_id_program::accounts::SetRootExpiry {
            owner: deployer.pubkey(),
            config: config.pubkey(),
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

        // The field was updated however the authority does not match
        if config_pre.root_expiry != config_post.root_expiry && *deployer != deployer_reference {
            return Err(FuzzingError::Custom(2));
        }

        Ok(())
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
