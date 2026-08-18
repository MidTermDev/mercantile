use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, TokenCpiExt};

use crate::constants::CONFIG_SEED;
use crate::error::BridgeError;
use crate::events::DepositReceived;
use crate::state::BridgeConfig;

// ---- deposit_item: burn the caller's tokens (owner-signed) ------------------

#[event_cpi]
#[derive(Accounts)]
pub struct DepositItem {
    #[account(mut)]
    pub mint: Account<Mint>,
    #[account(mut)]
    pub owner_ata: Account<TokenAccount>,
    pub owner: Signer,
    pub token_program: Program<Token>,
}

pub fn deposit_item(ctx: &mut Context<DepositItem>, amount: u64) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);
    let mint_addr = *ctx.accounts.mint.address();
    let owner = *ctx.accounts.owner.address();

    ctx.accounts.token_program.burn(
        &mut ctx.accounts.owner_ata,
        &mut ctx.accounts.mint,
        &ctx.accounts.owner,
        &[],
        amount,
    )?;

    emit_cpi!(DepositReceived {
        mint: mint_addr,
        owner,
        amount,
        gp: false,
    });
    Ok(())
}

// ---- deposit_gp: BURN the caller's GP (owner-signed) ------------------------
// GP bridges like items: burned on deposit (chain->game). Gated to the GP mint
// via config so the gp:true flag is honest.

#[event_cpi]
#[derive(Accounts)]
pub struct DepositGp {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<BridgeConfig>,
    #[account(mut)]
    pub mint: Account<Mint>,
    #[account(mut)]
    pub owner_ata: Account<TokenAccount>,
    pub owner: Signer,
    pub token_program: Program<Token>,
}

pub fn deposit_gp(ctx: &mut Context<DepositGp>, amount: u64) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);
    require!(
        anchor_lang::address_eq(ctx.accounts.mint.address(), &ctx.accounts.config.gp_mint),
        BridgeError::NotGpMint
    );
    let mint_addr = *ctx.accounts.mint.address();
    let owner = *ctx.accounts.owner.address();

    ctx.accounts.token_program.burn(
        &mut ctx.accounts.owner_ata,
        &mut ctx.accounts.mint,
        &ctx.accounts.owner,
        &[],
        amount,
    )?;

    emit_cpi!(DepositReceived {
        mint: mint_addr,
        owner,
        amount,
        gp: true,
    });
    Ok(())
}
