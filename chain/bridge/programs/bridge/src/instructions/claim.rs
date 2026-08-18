use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, TokenCpiExt};

use crate::constants::{CLAIM_SEED, CONFIG_SEED, MINT_AUTHORITY_SEED};
use crate::error::BridgeError;
use crate::events::{WithdrawFilled};
use crate::state::{BridgeConfig, Claim};

// Claim model: the keeper (operator) records a claimable balance on-chain; the USER
// redeems it themselves, minting to their own account and paying their own fee/rent.
// One running-balance Claim PDA per (owner, mint), seeds [b"claim", owner, mint].

// ---- open_claim: operator inits the per-(owner,mint) claim balance -----------
#[derive(Accounts)]
#[instruction(owner: Address, gp: bool)]
pub struct OpenClaim {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = operator)]
    pub config: Account<BridgeConfig>,
    #[account(mut)]
    pub operator: Signer,
    pub mint: Account<Mint>,
    #[account(
        init,
        payer = operator,
        seeds = [CLAIM_SEED, owner.as_ref(), mint.address().as_ref()],
        bump,
    )]
    pub claim: Account<Claim>,
    pub system_program: Program<System>,
}

pub fn open_claim(ctx: &mut Context<OpenClaim>, owner: Address, gp: bool) -> Result<()> {
    let claim = &mut ctx.accounts.claim;
    claim.owner = owner;
    claim.mint = *ctx.accounts.mint.address();
    claim.amount = 0;
    claim.gp = if gp { 1 } else { 0 };
    claim.bump = ctx.bumps.claim;
    Ok(())
}

// ---- credit_claim: operator adds to the user's claimable balance -------------
#[derive(Accounts)]
#[instruction(owner: Address)]
pub struct CreditClaim {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = operator)]
    pub config: Account<BridgeConfig>,
    pub operator: Signer,
    pub mint: Account<Mint>,
    #[account(
        mut,
        seeds = [CLAIM_SEED, owner.as_ref(), mint.address().as_ref()],
        bump = claim.bump,
    )]
    pub claim: Account<Claim>,
}

pub fn credit_claim(ctx: &mut Context<CreditClaim>, _owner: Address, amount: u64) -> Result<()> {
    require!(ctx.accounts.config.paused == 0, BridgeError::Paused);
    require!(amount > 0, BridgeError::ZeroAmount);
    let claim = &mut ctx.accounts.claim;
    claim.amount = claim.amount.checked_add(amount).ok_or(BridgeError::ZeroAmount)?;
    Ok(())
}

// ---- redeem_claim: the USER mints their claimable balance to themselves ------
// Owner-signed; owner is the fee payer and provides (client-created) their own ATA,
// so they pay their own network fee + account rent. Mint authority is the program PDA.
#[event_cpi]
#[derive(Accounts)]
pub struct RedeemClaim {
    pub owner: Signer,
    #[account(mut)]
    pub mint: Account<Mint>,
    /// CHECK: program PDA mint authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount,
    #[account(
        mut,
        seeds = [CLAIM_SEED, owner.address().as_ref(), mint.address().as_ref()],
        bump = claim.bump,
    )]
    pub claim: Account<Claim>,
    #[account(mut)]
    pub recipient_ata: Account<TokenAccount>,
    pub token_program: Program<Token>,
}

pub fn redeem_claim(ctx: &mut Context<RedeemClaim>) -> Result<()> {
    let amount = ctx.accounts.claim.amount;
    require!(amount > 0, BridgeError::NothingToClaim);
    require!(
        anchor_lang::address_eq(ctx.accounts.recipient_ata.owner(), ctx.accounts.owner.address()),
        BridgeError::NotClaimOwner
    );

    let recipient = *ctx.accounts.recipient_ata.owner();
    let mint_addr = *ctx.accounts.mint.address();
    let gp = ctx.accounts.claim.gp != 0;

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

    ctx.accounts.claim.amount = 0;

    emit_cpi!(WithdrawFilled { mint: mint_addr, recipient, amount, gp });
    Ok(())
}
