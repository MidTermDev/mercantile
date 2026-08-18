use anchor_lang::prelude::*;

#[account]
pub struct BridgeConfig {
    /// Cold key: creates mints, sets config, upgrade authority.
    pub admin: Address,
    /// Hot key held by the bridge daemon: the ONLY key that can trigger withdrawals.
    pub operator: Address,
    /// The GP mint (recorded once created); zero until set.
    pub gp_mint: Address,
    /// Non-zero blocks withdrawals (bool isn't Pod in v2's zero-copy accounts).
    pub paused: u8,
    pub bump: u8,
}

/// A user's claimable balance for one mint (running total). The keeper credits it;
/// the owner redeems it themselves (mint to their own account, paying their own fee).
#[account]
pub struct Claim {
    pub amount: u64,          // align 8 → keep first
    pub owner: Address,
    pub mint: Address,
    pub gp: u8,
    pub bump: u8,
    pub _reserved: [u8; 6],   // pad to 80 (multiple of 8) — no implicit padding
}
