use anchor_lang::prelude::*;

declare_id!("E8byx9xyWhup2oT2PDR6w2KXHY2Fg2DFNAjj7Svx9spa");

pub mod instructions;
pub(crate) use instructions::*;

#[program]
pub mod solana_world_id_onchain_template {
    use super::*;
    pub fn verify_and_execute(
        ctx: Context<VerifyAndExecute>,
        args: VerifyAndExecuteArgs,
    ) -> Result<()> {
        instructions::verify_and_execute(ctx, args)
    }
}
