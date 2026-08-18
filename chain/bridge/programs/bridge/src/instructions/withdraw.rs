use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, TokenCpiExt};

use crate::constants::{CONFIG_SEED, MINT_AUTHORITY_SEED};
use crate::error::BridgeError;
use crate::events::WithdrawFilled;
use crate::state::BridgeConfig;

// ---- withdraw_item: mint item tokens to a user (operator-gated) -------------

#[event_cpi]
#[derive(Accounts)]
pub struct WithdrawItem {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = operator,
    )]
    pub config: Account<BridgeConfig>,
    pub operator: Signer,

    #[account(mut)]
    pub mint: Account<Mint>,

    /// CHECK: program PDA mint authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount,

    #[account(mut)]
    pub recipient_ata: Account<TokenAccount>,

    pub token_program: Program<Token>,
}

pub fn withdraw_item(ctx: &mut Context<WithdrawItem>, amount: u64) -> Result<()> {
    require!(ctx.accounts.config.paused == 0, BridgeError::Paused);
    require!(amount > 0, BridgeError::ZeroAmount);

    let recipient = *ctx.accounts.recipient_ata.owner();
    let mint_addr = *ctx.accounts.mint.address();

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

    emit_cpi!(WithdrawFilled {
        mint: mint_addr,
        recipient,
        amount,
        gp: false,
    });
    Ok(())
}

// ---- withdraw_gp: MINT GP to a user (operator-gated) ------------------------
// GP bridges like items: minted on withdraw (game->chain), burned on deposit.
// The 10B genesis is a separate reserve; the bridge mints/burns around it, so
// on-chain circulating GP = reserve + (withdrawn - deposited).

#[event_cpi]
#[derive(Accounts)]
pub struct WithdrawGp {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = operator,
    )]
    pub config: Account<BridgeConfig>,
    pub operator: Signer,

    #[account(mut)]
    pub mint: Account<Mint>,

    /// CHECK: program PDA mint authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount,

    #[account(mut)]
    pub recipient_ata: Account<TokenAccount>,

    pub token_program: Program<Token>,
}

pub fn withdraw_gp(ctx: &mut Context<WithdrawGp>, amount: u64) -> Result<()> {
    require!(ctx.accounts.config.paused == 0, BridgeError::Paused);
    require!(amount > 0, BridgeError::ZeroAmount);
    require!(
        anchor_lang::address_eq(ctx.accounts.mint.address(), &ctx.accounts.config.gp_mint),
        BridgeError::NotGpMint
    );

    let recipient = *ctx.accounts.recipient_ata.owner();
    let mint_addr = *ctx.accounts.mint.address();

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

    emit_cpi!(WithdrawFilled {
        mint: mint_addr,
        recipient,
        amount,
        gp: true,
    });
    Ok(())
}
