-- rs-sdk: allow MANY accounts to link the same wallet. Drop the UNIQUE(address)
-- constraint (one wallet per account is still enforced by account_id PK) and replace
-- it with a plain lookup index. Deposits/licensing choose the target account explicitly.
DROP INDEX "account_wallet_address_key";
CREATE INDEX "account_wallet_address_idx" ON "account_wallet"("address");
