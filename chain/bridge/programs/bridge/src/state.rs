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
