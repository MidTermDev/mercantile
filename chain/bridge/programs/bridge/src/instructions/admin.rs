use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::state::BridgeConfig;

#[derive(Accounts)]
pub struct AdminOnly {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin,
    )]
    pub config: Account<BridgeConfig>,
    pub admin: Signer,
}

pub fn set_operator(ctx: &mut Context<AdminOnly>, new_operator: Address) -> Result<()> {
    ctx.accounts.config.operator = new_operator;
    Ok(())
}

pub fn set_paused(ctx: &mut Context<AdminOnly>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused as u8;
    Ok(())
}

pub fn set_gp_mint(ctx: &mut Context<AdminOnly>, gp_mint: Address) -> Result<()> {
    ctx.accounts.config.gp_mint = gp_mint;
    Ok(())
}
