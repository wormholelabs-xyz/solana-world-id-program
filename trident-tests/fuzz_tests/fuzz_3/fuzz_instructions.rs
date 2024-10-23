use trident_client::fuzzing::*;

#[derive(Arbitrary, DisplayIx, FuzzTestExecutor)]
pub enum FuzzInstruction {
    CleanUpRoot(CleanUpRoot),
    Initialize(Initialize),
    PostSignatures(PostSignatures),
    UpdateRootWithQuery(UpdateRootWithQuery),
}
#[derive(Arbitrary, Debug)]
pub struct CleanUpRoot {
    pub accounts: CleanUpRootAccounts,
    pub data: CleanUpRootData,
}
#[derive(Arbitrary, Debug)]
pub struct CleanUpRootAccounts {
    pub root: AccountId,
    pub latest_root: AccountId,
    pub config: AccountId,
    pub refund_recipient: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct CleanUpRootData {}
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
pub struct PostSignatures {
    pub accounts: PostSignaturesAccounts,
    pub data: PostSignaturesData,
}
#[derive(Arbitrary, Debug)]
pub struct PostSignaturesAccounts {
    pub refund_recipient: AccountId,
    pub guardian_signatures: AccountId,
    pub system_program: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct PostSignaturesData {
    pub guardian_signatures: Vec<[u8; 66usize]>,
    pub total_signatures: u8,
}
#[derive(Arbitrary, Debug)]
pub struct UpdateRootWithQuery {
    pub accounts: UpdateRootWithQueryAccounts,
    pub data: UpdateRootWithQueryData,
}
#[derive(Arbitrary, Debug)]
pub struct UpdateRootWithQueryAccounts {
    pub payer: AccountId,
    pub guardian_set: AccountId,
    pub guardian_signatures: AccountId,
    pub root: AccountId,
    pub latest_root: AccountId,
    pub config: AccountId,
    pub refund_recipient: AccountId,
    pub system_program: AccountId,
}
#[derive(Arbitrary, Debug)]
pub struct UpdateRootWithQueryData {
    pub bytes: Vec<u8>,
    pub root_hash: [u8; 32usize],
    pub guardian_set_index: u32,
}
#[doc = r" Use AccountsStorage<T> where T can be one of:"]
#[doc = r" Keypair, PdaStore, TokenStore, MintStore, ProgramStore"]
#[derive(Default)]
pub struct FuzzAccounts {
    pub config: AccountsStorage<PdaStore>,
    pub deployer: AccountsStorage<Keypair>,
    pub guardian_set: AccountsStorage<PdaStore>,
    pub guardian_signatures: AccountsStorage<Keypair>,
    pub latest_root: AccountsStorage<PdaStore>,
    pub payer: AccountsStorage<Keypair>,
    pub root: AccountsStorage<PdaStore>,
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
