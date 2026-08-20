-- rs-sdk: allow MANY accounts to link the same wallet. Drop UNIQUE(address); one wallet
-- per account is still enforced by the account_id PK. Replace with a plain lookup index.
DROP INDEX `account_wallet_address_key` ON `account_wallet`;
CREATE INDEX `account_wallet_address_idx` ON `account_wallet`(`address`);
