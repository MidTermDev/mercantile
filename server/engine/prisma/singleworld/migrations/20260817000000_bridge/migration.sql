-- CreateTable
CREATE TABLE "account_wallet" (
    "account_id" INTEGER NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "linked_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "link_ip" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "account_wallet_address_key" ON "account_wallet"("address");

-- CreateTable
CREATE TABLE "bridge_tx" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "direction" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "obj_debugname" TEXT NOT NULL,
    "obj_id" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "sig" TEXT,
    "last_valid_height" INTEGER,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "bridge_tx_sig_key" ON "bridge_tx"("sig");

-- CreateIndex
CREATE INDEX "bridge_tx_state_direction_idx" ON "bridge_tx"("state", "direction");

-- CreateIndex
CREATE INDEX "bridge_tx_account_id_state_idx" ON "bridge_tx"("account_id", "state");
