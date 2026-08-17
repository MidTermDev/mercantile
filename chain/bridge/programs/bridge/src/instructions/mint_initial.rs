use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, TokenCpiExt};

use crate::constants::{CONFIG_SEED, MINT_AUTHORITY_SEED};
use crate::error::BridgeError;
use crate::state::BridgeConfig;

/// Admin-gated genesis minting: item pool seeds (100 to a treasury ATA) and the
/// 10B GP split (vault + treasury). Distinct from operator withdrawals.
#[derive(Accounts)]
pub struct MintInitial {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin,
    )]
    pub config: Account<BridgeConfig>,
    pub admin: Signer,

    #[account(mut)]
    pub mint: Account<Mint>,

    /// CHECK: program PDA mint authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount,

    #[account(mut)]
    pub recipient_ata: Account<TokenAccount>,

    pub token_program: Program<Token>,
}

pub fn handler(ctx: &mut Context<MintInitial>, amount: u64) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);
    let bump = [ctx.bumps.mint_authority];
    let seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &bump];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    ctx.accounts.token_program.mint_to(
        &mut ctx.accounts.mint,
        &mut ctx.accounts.recipient_ata,
        &ctx.accounts.mint_authority,
        signer_seeds,
        amount,
    )?;
    Ok(())
}
