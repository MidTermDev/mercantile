pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;

declare_id!("H5C6RKWQzUdfS8tVzZb3uVcRw3EHCzghv7kWdMBTD2bS");

#[program]
pub mod bridge {
    use super::*;

    /// Create the config PDA. Signer becomes admin; operator is the hot key.
    #[discrim = 0]
    pub fn initialize(ctx: &mut Context<Initialize>, operator: Address) -> Result<()> {
        instructions::initialize::handler(ctx, operator)
    }

    #[discrim = 1]
    pub fn set_operator(ctx: &mut Context<AdminOnly>, new_operator: Address) -> Result<()> {
        instructions::admin::set_operator(ctx, new_operator)
    }

    #[discrim = 2]
    pub fn set_paused(ctx: &mut Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    #[discrim = 3]
    pub fn set_gp_mint(ctx: &mut Context<AdminOnly>, gp_mint: Address) -> Result<()> {
        instructions::admin::set_gp_mint(ctx, gp_mint)
    }

    /// Create a bridge mint (at a client-supplied vanity keypair) with the
    /// program PDA as mint/freeze authority, plus Metaplex metadata.
    #[discrim = 4]
    pub fn create_mint(
        ctx: &mut Context<CreateMint>,
        decimals: u8,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        instructions::create_mint::handler(ctx, decimals, name, symbol, uri)
    }

    /// Admin genesis minting (item pool seeds, GP 10B split).
    #[discrim = 5]
    pub fn mint_initial(ctx: &mut Context<MintInitial>, amount: u64) -> Result<()> {
        instructions::mint_initial::handler(ctx, amount)
    }

    /// Operator: fulfil an item withdrawal by minting to the user.
    #[discrim = 6]
    pub fn withdraw_item(ctx: &mut Context<WithdrawItem>, amount: u64) -> Result<()> {
        instructions::withdraw::withdraw_item(ctx, amount)
    }

    /// Operator: fulfil a GP withdrawal from the vault, minting any shortfall.
    #[discrim = 7]
    pub fn withdraw_gp(ctx: &mut Context<WithdrawGp>, amount: u64) -> Result<()> {
        instructions::withdraw::withdraw_gp(ctx, amount)
    }

    /// User: burn item tokens to deposit them back into the game.
    #[discrim = 8]
    pub fn deposit_item(ctx: &mut Context<DepositItem>, amount: u64) -> Result<()> {
        instructions::deposit::deposit_item(ctx, amount)
    }

    /// User: return GP to the vault to deposit it back into the game.
    #[discrim = 9]
    pub fn deposit_gp(ctx: &mut Context<DepositGp>, amount: u64) -> Result<()> {
        instructions::deposit::deposit_gp(ctx, amount)
    }

    /// Keeper: open a user's per-(owner,mint) claimable balance PDA.
    #[discrim = 10]
    pub fn open_claim(ctx: &mut Context<OpenClaim>, owner: Address, gp: bool) -> Result<()> {
        instructions::claim::open_claim(ctx, owner, gp)
    }

    /// Keeper: add to a user's claimable balance (game-side already debited).
    #[discrim = 11]
    pub fn credit_claim(ctx: &mut Context<CreditClaim>, owner: Address, amount: u64) -> Result<()> {
        instructions::claim::credit_claim(ctx, owner, amount)
    }

    /// User: mint your claimable balance to your own account (you pay fee + rent).
    #[discrim = 12]
    pub fn redeem_claim(ctx: &mut Context<RedeemClaim>) -> Result<()> {
        instructions::claim::redeem_claim(ctx)
    }

    /// Admin: permanently drop a mint's freeze authority (we never freeze holders).
    #[discrim = 13]
    pub fn revoke_freeze(ctx: &mut Context<RevokeFreeze>) -> Result<()> {
        instructions::revoke::revoke_freeze(ctx)
    }
}
