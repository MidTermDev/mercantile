use anchor_lang::prelude::*;
use anchor_spl::metadata::{
    create_metadata_accounts_v3, mpl_token_metadata, CreateMetadataAccountsV3,
};
use anchor_spl::mint::{self, Mint};
use anchor_spl::token::Token;

use crate::constants::{CONFIG_SEED, MINT_AUTHORITY_SEED};
use crate::events::MintCreated;
use crate::state::BridgeConfig;

#[event_cpi]
#[derive(Accounts)]
#[instruction(decimals: u8, name: String, symbol: String, uri: String)]
pub struct CreateMint {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin,
    )]
    pub config: Account<BridgeConfig>,
    #[account(mut)]
    pub admin: Signer,

    /// The new mint — created at the client-supplied (vanity) keypair's address.
    #[account(
        init,
        payer = admin,
        mint::decimals = decimals,
        mint::authority = mint_authority,
        mint::freeze_authority = mint_authority,
    )]
    pub mint: Account<Mint>,

    /// CHECK: program PDA that owns mint/freeze/metadata authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount,

    /// CHECK: Metaplex metadata PDA for `mint`; validated by the Metaplex CPI.
    #[account(mut)]
    pub metadata: UncheckedAccount,

    /// CHECK: the Metaplex Token Metadata program.
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount,

    pub token_program: Program<Token>,
    pub system_program: Program<System>,
}

pub fn handler(
    ctx: &mut Context<CreateMint>,
    decimals: u8,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let bump = [ctx.bumps.mint_authority];
    let seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &bump];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let data = mpl_token_metadata::types::DataV2 {
        name: name.clone(),
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };

    let accs = CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.cpi_handle_mut(),
        mint: ctx.accounts.mint.cpi_handle(),
        mint_authority: ctx.accounts.mint_authority.cpi_handle(),
        payer: ctx.accounts.admin.cpi_handle_mut(),
        update_authority: ctx.accounts.mint_authority.cpi_handle(),
        system_program: ctx.accounts.system_program.cpi_handle(),
        update_authority_is_signer: true,
    };
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_metadata_program.address(),
        accs,
        signer_seeds,
    );
    create_metadata_accounts_v3(cpi, data, true, None)?;

    emit_cpi!(MintCreated {
        mint: *ctx.accounts.mint.address(),
        decimals,
    });
    Ok(())
}
