use borsh::{BorshDeserialize, BorshSerialize};
use solana_sdk::account::{AccountSharedData, WritableAccount};
use solana_sdk::bpf_loader_upgradeable;

use solana_sdk::native_token::LAMPORTS_PER_SOL;
use solana_world_id_program::state::{Config, LatestRoot, Root};
use trident_client::fuzzing::*;

use crate::fuzz_instructions::{FuzzAccounts, Initialize, InitializeArgs};
use solana_world_id_program::instructions::trident_fuzz_initialize_snapshot::InitializeAlias;

type InitializeSnapshot<'info> = InitializeAlias<'info>;

impl<'info> IxOps<'info> for Initialize {
    type IxData = solana_world_id_program::instruction::Initialize;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = InitializeSnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_program::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let data = InitializeArgs {
            root_expiry: 0,
            allowed_update_staleness: self.data.args.allowed_update_staleness,
        };

        let data = solana_world_id_program::instruction::Initialize { args: data.into() };
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
            100 * LAMPORTS_PER_SOL,
        );

        let payer = fuzz_accounts.payer.get_or_create_account(
            self.accounts.payer,
            client,
            100 * LAMPORTS_PER_SOL,
        );

        let (program_data_address, _program_data_address_bump) = Pubkey::try_find_program_address(
            &[solana_world_id_program::ID.as_ref()],
            &bpf_loader_upgradeable::id(),
        )
        .unwrap();

        let program_data = setup_program_data(deployer.pubkey());

        client.set_account_custom(
            &program_data_address,
            &AccountSharedData::create(
                100 * LAMPORTS_PER_SOL,
                program_data,
                bpf_loader_upgradeable::ID,
                true,
                5,
            ),
        );

        let config = fuzz_accounts
            .config
            .get_or_create_account(
                self.accounts.config,
                &[Config::SEED_PREFIX],
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

        let signers = vec![payer.clone(), deployer.clone()];
        let acc_meta = solana_world_id_program::accounts::Initialize {
            payer: payer.pubkey(),
            deployer: deployer.pubkey(),
            program_data: program_data_address,
            config: config.pubkey(),
            latest_root: latest_root.pubkey(),
            system_program: solana_sdk::system_program::ID,
        }
        .to_account_metas(None);
        Ok((signers, acc_meta))
    }
}

// CUSTOM PROGRAM DATA
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
#[derive(Clone, BorshDeserialize, BorshSerialize)]
pub struct ProgramData {
    pub slot: u64,
    pub upgrade_authority_address: Option<Pubkey>,
}
fn setup_program_data(deployer: Pubkey) -> Vec<u8> {
    let program_data = ProgramData {
        slot: 4,
        upgrade_authority_address: Some(deployer),
    };

    let mut data: Vec<u8> = vec![0u8; 45];
    let mut program_data_serialized: Vec<u8> = vec![];

    program_data
        .serialize(&mut program_data_serialized)
        .unwrap();

    data[0] = 3;
    data[4..4 + program_data_serialized.len()].copy_from_slice(&program_data_serialized);
    data
}
