use fuzz_instructions::Initialize;
use fuzz_instructions::PostSignatures;
use fuzz_instructions::UpdateRootWithQuery;
use fuzz_instructions::VerifyGroth16Proof;
use trident_client::fuzzing::*;

mod constants;
mod instructions;

mod fuzz_instructions;
use fuzz_instructions::FuzzInstruction;

use solana_world_id_program::entry as entry_solana_world_id_program;
use solana_world_id_program::ID as PROGRAM_ID_SOLANA_WORLD_ID_PROGRAM;

const PROGRAM_NAME_SOLANA_WORLD_ID_PROGRAM: &str = "solana_world_id_program";

struct MyFuzzData;

impl FuzzDataBuilder<FuzzInstruction> for MyFuzzData {
    fn pre_ixs(u: &mut arbitrary::Unstructured) -> arbitrary::Result<Vec<FuzzInstruction>> {
        let init_ix = FuzzInstruction::Initialize(Initialize::arbitrary(u)?);

        let post_signaturs = FuzzInstruction::PostSignatures(PostSignatures::arbitrary(u)?);

        let update_root_with_query =
            FuzzInstruction::UpdateRootWithQuery(UpdateRootWithQuery::arbitrary(u)?);

        let verify = FuzzInstruction::VerifyGroth16Proof(VerifyGroth16Proof::arbitrary(u)?);

        Ok(vec![
            init_ix,
            post_signaturs,
            update_root_with_query,
            verify,
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

    let guardian_set_5_mock = FuzzingAccountBase64::new(
        crate::constants::quardian_set_5_mock::GUARDIAN_SET_5_MOCK,
        1141440,
        crate::constants::MAINNET_CORE_BRIDGE_ID,
        "BQAAAAEAAAC++kKdV80Yt/ik2RotqatK8F0PvoX2jWIAAAAA",
    );

    let mut client = ProgramTestClientBlocking::new(
        &[fuzzing_program_solana_world_id_program],
        &[guardian_set_5_mock],
    )
    .unwrap();

    let _ = fuzz_data.run_with_runtime(&mut client, config);
}

fn main() {
    let config = Config::new();

    loop {
        fuzz_trident ! (fuzz_ix : FuzzInstruction , | fuzz_data : MyFuzzData | { fuzz_iteration (fuzz_data,&config) ; });
    }
}
