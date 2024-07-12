use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

mod instructions;
pub(crate) use instructions::*;

#[program]
pub mod solana_world_id_example_program {
    use super::*;
    pub fn verify_and_execute(
        ctx: Context<VerifyAndExecute>,
        args: VerifyAndExecuteArgs,
    ) -> Result<()> {
        instructions::verify_and_execute(ctx, args)
    }
}
