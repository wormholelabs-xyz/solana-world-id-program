use anchor_lang::prelude::*;

use crate::{error::SolanaWorldIDProgramError, state::GuardianSignatures};

#[derive(Accounts)]
#[instruction(_guardian_signatures: Vec<[u8; 66]>, total_signatures: u8)]
pub struct PostSignatures<'info> {
    #[account(mut)]
    payer: Signer<'info>,

    /// Stores signatures for later use by verify_query
    #[account(
        init_if_needed,
        payer = payer,
        space = GuardianSignatures::compute_size(usize::from(total_signatures))
    )]
    guardian_signatures: Account<'info, GuardianSignatures>,

    system_program: Program<'info, System>,
}

pub fn post_signatures(
    ctx: Context<PostSignatures>,
    mut guardian_signatures: Vec<[u8; 66]>,
    _total_signatures: u8,
) -> Result<()> {
    if ctx.accounts.guardian_signatures.is_initialized() {
        require_eq!(
            ctx.accounts.guardian_signatures.refund_recipient,
            ctx.accounts.payer.key(),
            SolanaWorldIDProgramError::WriteAuthorityMismatch
        );
        ctx.accounts
            .guardian_signatures
            .guardian_signatures
            .append(&mut guardian_signatures);
    } else {
        ctx.accounts
            .guardian_signatures
            .set_inner(GuardianSignatures {
                refund_recipient: ctx.accounts.payer.key(),
                guardian_signatures,
            });
    }
    // Done.
    Ok(())
}
