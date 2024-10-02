use fuzz_instructions::CleanUpRoot;
use fuzz_instructions::Initialize;
use fuzz_instructions::PostSignatures;
use fuzz_instructions::UpdateRootWithQuery;
use trident_client::fuzzing::*;

mod constants;
use constants::*;
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

        Ok(vec![init_ix, post_signaturs, update_root_with_query])
    }
    fn ixs(_u: &mut arbitrary::Unstructured) -> arbitrary::Result<Vec<FuzzInstruction>> {
        Ok(vec![])
    }
    fn post_ixs(u: &mut arbitrary::Unstructured) -> arbitrary::Result<Vec<FuzzInstruction>> {
        let clean_up_root = FuzzInstruction::CleanUpRoot(CleanUpRoot::arbitrary(u)?);

        Ok(vec![clean_up_root])
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

    let guardian_set_9_mock_nineteen_guardians = FuzzingAccountBase64::new(
        guardian_set_9_mock_nineteen_guardians::GUARDIAN_SET_9_MOCK_NINETEEN_GUARDIANS_ADDRESS,
        1141440,
        MAINNET_CORE_BRIDGE_ID,
        "CQAAABMAAAC++kKdV80Yt/ik2RotqatK8F0PvojX2LMqkQXSKBAOct/+L64HBdMcWAdvVhzGKkcIe1Z8hvmGQm380AC9bpgzSQ+PqHxzOhg80Hamy9KQdLhT/PClx4wbVtFfznoVTm6+nteirzUD29LjdRirBNfOeLYw+YsVt4p4VjLepWCQZIA7HI6ouyx3pgBL0QmigaaYwPW6MfFYWFtB9PM2WeVNMXhEOrdqYOIWkNv7F/f1nwmuPqFkfsJq5JsUBgZgUE9NocIFnhxatoEKw9jhJYvS8ASpTKDNTGj8HAYRgGEOltZFsS9Hrlz0VGsYU4c56Q8u2w2FMOMaIY5yuUgCAqy66wYXjaeIWOXlxHBc3Utmj/475brkhnydXv46Be/GLWDh0Z+utWqAIjzdNHLXkbfTLAWrscwAtjgfoMSSjwxW/BS8ApuICQaQk9cSo/1N+rMZY1l+JGqyn8br7fLTkqUastxcWdCQKgMTKoTf2SCzWj0LpfegY13ymPkDPoX2jWIAAAAA",
    );

    let mut client = ProgramTestClientBlocking::new(
        &[fuzzing_program_solana_world_id_program],
        &[guardian_set_9_mock_nineteen_guardians],
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
