use trident_client::fuzzing::*;

#[derive(Arbitrary, DisplayIx, FuzzTestExecutor)]
pub enum FuzzInstruction {
    ClaimOwnership(ClaimOwnership),
    Initialize(Initialize),
    SetAllowedUpdateStaleness(SetAllowedUpdateStaleness),
    SetRootExpiry(SetRootExpiry),
    TransferOwnership(TransferOwnership),
}
#[derive(Arbitrary, Debug)]
pub struct ClaimOwnership {
    pub accounts: ClaimOwnershipAccounts,
    pub data: ClaimOwnershipData,
}
#[derive(Arbitrary, Debug)]
pub struct ClaimOwnershipAccounts {
    pub config: AccountId,
    pub upgrade_lock: AccountId,
    pub new_owner: AccountId,
    pub program_data: AccountId,
    pub bpf_loader_upgradeable_program: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct ClaimOwnershipData {}
#[derive(Arbitrary, Debug)]
pub struct Initialize {
    pub accounts: InitializeAccounts,
    pub data: InitializeData,
}
#[derive(Arbitrary, Debug)]
pub struct InitializeAccounts {
    pub payer: AccountId,
    pub deployer: AccountId,
    pub program_data: AccountId,
    pub config: AccountId,
    pub latest_root: AccountId,
    pub system_program: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct InitializeData {
    pub args: InitializeArgs,
}

#[derive(Arbitrary, Debug)]
pub struct SetAllowedUpdateStaleness {
    pub accounts: SetAllowedUpdateStalenessAccounts,
    pub data: SetAllowedUpdateStalenessData,
}
#[derive(Arbitrary, Debug)]
pub struct SetAllowedUpdateStalenessAccounts {
    pub deployer: AccountId,
    pub config: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct SetAllowedUpdateStalenessData {
    pub allowed_update_staleness: u64,
}
#[derive(Arbitrary, Debug)]
pub struct SetRootExpiry {
    pub accounts: SetRootExpiryAccounts,
    pub data: SetRootExpiryData,
}
#[derive(Arbitrary, Debug)]
pub struct SetRootExpiryAccounts {
    pub deployer: AccountId,
    pub config: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct SetRootExpiryData {
    pub root_expiry: u64,
}
#[derive(Arbitrary, Debug)]
pub struct TransferOwnership {
    pub accounts: TransferOwnershipAccounts,
    pub data: TransferOwnershipData,
}
#[derive(Arbitrary, Debug)]
pub struct TransferOwnershipAccounts {
    pub config: AccountId,
    pub deployer: AccountId,
    pub new_owner: AccountId,
    pub upgrade_lock: AccountId,
    pub program_data: AccountId,
    pub bpf_loader_upgradeable_program: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct TransferOwnershipData {}
#[doc = r" Use AccountsStorage<T> where T can be one of:"]
#[doc = r" Keypair, PdaStore, TokenStore, MintStore, ProgramStore"]
#[derive(Default)]
pub struct FuzzAccounts {
    pub config: AccountsStorage<PdaStore>,
    pub deployer: AccountsStorage<Keypair>,
    pub latest_root: AccountsStorage<PdaStore>,
    pub payer: AccountsStorage<Keypair>,
    pub upgrade_lock: AccountsStorage<PdaStore>,
    pub new_owner: AccountsStorage<Keypair>,
}
// ARBITRARY
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
//-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*

#[derive(Arbitrary, Debug, Clone, Copy)]
pub struct InitializeArgs {
    pub root_expiry: u64,
    pub allowed_update_staleness: u64,
}

impl From<InitializeArgs> for solana_world_id_program::instructions::InitializeArgs {
    fn from(value: InitializeArgs) -> Self {
        solana_world_id_program::instructions::InitializeArgs {
            root_expiry: value.root_expiry,
            allowed_update_staleness: value.allowed_update_staleness,
        }
    }
}
