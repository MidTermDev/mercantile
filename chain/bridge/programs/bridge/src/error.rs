use anchor_lang::prelude::*;

#[error_code]
pub enum BridgeError {
    #[msg("The bridge is paused")]
    Paused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Mint does not match the configured GP mint")]
    NotGpMint,
}
