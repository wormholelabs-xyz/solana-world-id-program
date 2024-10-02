use fuzz_instructions::ClaimOwnership;
use fuzz_instructions::Initialize;
use fuzz_instructions::SetAllowedUpdateStaleness;
use fuzz_instructions::SetRootExpiry;
use fuzz_instructions::TransferOwnership;
use trident_client::fuzzing::*;

mod fuzz_instructions;
mod instructions;

use solana_world_id_program::entry as entry_solana_world_id_program;
use solana_world_id_program::ID as PROGRAM_ID_SOLANA_WORLD_ID_PROGRAM;

const PROGRAM_NAME_SOLANA_WORLD_ID_PROGRAM: &str = "solana_world_id_program";

use fuzz_instructions::FuzzInstruction as fuzz_instruction_solana_world_id_program;

pub type FuzzInstruction = fuzz_instruction_solana_world_id_program;

struct MyFuzzData;

impl FuzzDataBuilder<FuzzInstruction> for MyFuzzData {
    fn pre_ixs(u: &mut arbitrary::Unstructured) -> arbitrary::Result<Vec<FuzzInstruction>> {
        let init_ix = FuzzInstruction::Initialize(Initialize::arbitrary(u)?);
        let set_staleness_ix =
            FuzzInstruction::SetAllowedUpdateStaleness(SetAllowedUpdateStaleness::arbitrary(u)?);

        let set_root_expiry_ix = FuzzInstruction::SetRootExpiry(SetRootExpiry::arbitrary(u)?);

        let transfer_ownership_ix =
            FuzzInstruction::TransferOwnership(TransferOwnership::arbitrary(u)?);

        let claim_ownership_ix = FuzzInstruction::ClaimOwnership(ClaimOwnership::arbitrary(u)?);

        Ok(vec![
            init_ix,
            set_staleness_ix,
            set_root_expiry_ix,
            transfer_ownership_ix,
            claim_ownership_ix,
        ])
    }
    fn ixs(_u: &mut arbitrary::Unstructured) -> arbitrary::Result<Vec<FuzzInstruction>> {
        Ok(vec![])
    }
    fn post_ixs(_u: &mut arbitrary::Unstructured) -> arbitrary::Result<Vec<FuzzInstruction>> {
        Ok(vec![])
    }
}

fn fuzz_iteration<T: FuzzTestExecutor<U> + std::fmt::Display, U>(
    fuzz_data: FuzzData<T, U>,
    config: &Config,
) {
    let fuzzing_program_solana_world_id_program = FuzzingProgram::new(
        PROGRAM_NAME_SOLANA_WORLD_ID_PROGRAM,
        &PROGRAM_ID_SOLANA_WORLD_ID_PROGRAM,
        processor!(convert_entry!(entry_solana_world_id_program)),
    );

    let mut client =
        ProgramTestClientBlocking::new(&[fuzzing_program_solana_world_id_program], &[]).unwrap();

    let _ = fuzz_data.run_with_runtime(&mut client, config);
}

fn main() {
    let config = Config::new();

    loop {
        fuzz_trident ! (fuzz_ix : FuzzInstruction , | fuzz_data : MyFuzzData | { fuzz_iteration (fuzz_data,&config) ; });
    }
}
