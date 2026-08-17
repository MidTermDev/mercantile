use anchor_lang::prelude::*;

#[event]
pub struct MintCreated {
    pub mint: Address,
    pub decimals: u8,
}

#[event]
pub struct WithdrawFilled {
    pub mint: Address,
    pub recipient: Address,
    pub amount: u64,
    pub gp: bool,
}

/// Emitted when a GP withdrawal minted past the vault balance — the on-chain
/// signal that the in-game economy is inflating.
#[event]
pub struct Inflation {
    pub amount: u64,
}

#[event]
pub struct DepositReceived {
    pub mint: Address,
    pub owner: Address,
    pub amount: u64,
    pub gp: bool,
}
