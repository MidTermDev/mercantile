use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::state::BridgeConfig;

#[derive(Accounts)]
pub struct Initialize {
    #[account(mut)]
    pub admin: Signer,
    #[account(
        init,
        payer = admin,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<BridgeConfig>,
    pub system_program: Program<System>,
}

pub fn handler(ctx: &mut Context<Initialize>, operator: Address) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = *ctx.accounts.admin.address();
    config.operator = operator;
    config.gp_mint = Address::default();
    config.paused = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}
