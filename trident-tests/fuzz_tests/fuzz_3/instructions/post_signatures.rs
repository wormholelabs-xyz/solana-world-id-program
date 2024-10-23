use solana_sdk::native_token::LAMPORTS_PER_SOL;
use trident_client::fuzzing::*;

use crate::fuzz_instructions::{FuzzAccounts, PostSignatures};
use solana_world_id_program::instructions::trident_fuzz_post_signatures_snapshot::PostSignaturesAlias;

type PostSignaturesSnapshot<'info> = PostSignaturesAlias<'info>;

impl<'info> IxOps<'info> for PostSignatures {
    type IxData = solana_world_id_program::instruction::PostSignatures;
    type IxAccounts = FuzzAccounts;
    type IxSnapshot = PostSignaturesSnapshot<'info>;
    fn get_program_id(&self) -> solana_sdk::pubkey::Pubkey {
        solana_world_id_program::ID
    }
    fn get_data(
        &self,
        _client: &mut impl FuzzClient,
        _fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<Self::IxData, FuzzingError> {
        let signatures_len = crate::guardian_set_9_mock_nineteen_guardians::SIGNATURES.len() as u8;

        let data = solana_world_id_program::instruction::PostSignatures {
            guardian_signatures: crate::guardian_set_9_mock_nineteen_guardians::SIGNATURES.to_vec(),
            total_signatures: signatures_len,
        };
        Ok(data)
    }
    fn get_accounts(
        &self,
        client: &mut impl FuzzClient,
        fuzz_accounts: &mut FuzzAccounts,
    ) -> Result<(Vec<Keypair>, Vec<AccountMeta>), FuzzingError> {
        let refund_recipient = fuzz_accounts.payer.get_or_create_account(
            self.accounts.refund_recipient,
            client,
            10 * LAMPORTS_PER_SOL,
        );

        let guardian_signatures = fuzz_accounts.guardian_signatures.get_or_create_account(
            self.accounts.guardian_signatures,
            client,
            0,
        );

        let signers = vec![refund_recipient.clone(), guardian_signatures.clone()];
        let acc_meta = solana_world_id_program::accounts::PostSignatures {
            payer: refund_recipient.pubkey(),
            guardian_signatures: guardian_signatures.pubkey(),
            system_program: solana_sdk::system_program::ID,
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
        let pre_ix_signatures = match pre_ix.guardian_signatures {
            Some(gs) => gs.guardian_signatures.len(),
            None => return Ok(()),
        };
        let post_ix_signatures = match post_ix.guardian_signatures {
            Some(gs) => gs.guardian_signatures.len(),
            None => return Ok(()),
        };

        if pre_ix_signatures < post_ix_signatures {
            return Err(FuzzingError::Custom(5));
        }

        Ok(())
    }
}
