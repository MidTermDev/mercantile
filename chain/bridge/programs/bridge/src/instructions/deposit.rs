use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, TokenCpiExt};

use crate::error::BridgeError;
use crate::events::DepositReceived;

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

// ---- deposit_gp: transfer GP into the vault (owner-signed) ------------------

#[event_cpi]
#[derive(Accounts)]
pub struct DepositGp {
    #[account(mut)]
    pub owner_ata: Account<TokenAccount>,
    #[account(mut)]
    pub vault: Account<TokenAccount>,
    pub owner: Signer,
    pub token_program: Program<Token>,
}

pub fn deposit_gp(ctx: &mut Context<DepositGp>, amount: u64) -> Result<()> {
    require!(amount > 0, BridgeError::ZeroAmount);
    let mint_addr = *ctx.accounts.vault.mint();
    let owner = *ctx.accounts.owner.address();

    ctx.accounts.token_program.transfer(
        &mut ctx.accounts.owner_ata,
        &mut ctx.accounts.vault,
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
