use anchor_lang::prelude::*;
use anchor_spl::token::{set_authority, Mint, SetAuthority, Token};
use anchor_spl::token::spl_token::instruction::AuthorityType;

use crate::constants::{CONFIG_SEED, MINT_AUTHORITY_SEED};
use crate::state::BridgeConfig;

// revoke_freeze: permanently drop the mint's freeze authority (set to None). We never
// freeze holders' accounts; removing the authority makes that impossible. Admin-gated;
// the mint_authority PDA (which currently holds freeze authority) signs via seeds.
// Mint authority is intentionally left intact — the bridge needs it to mint withdrawals.
#[derive(Accounts)]
pub struct RevokeFreeze {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<BridgeConfig>,
    pub admin: Signer,
    #[account(mut)]
    pub mint: Account<Mint>,
    /// CHECK: program PDA that currently holds the freeze authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount,
    pub token_program: Program<Token>,
}

pub fn revoke_freeze(ctx: &mut Context<RevokeFreeze>) -> Result<()> {
    let bump = [ctx.bumps.mint_authority];
    let seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &bump];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let accs = SetAuthority {
        account_or_mint: ctx.accounts.mint.cpi_handle_mut(),
        current_authority: ctx.accounts.mint_authority.cpi_handle(),
    };
    let cpi = CpiContext::new_with_signer(ctx.accounts.token_program.address(), accs, signer_seeds);
    set_authority(cpi, AuthorityType::FreezeAccount, None)
}
