-- CreateTable
CREATE TABLE `account_wallet` (
    `account_id` INTEGER NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `linked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `link_ip` VARCHAR(191) NULL,

    UNIQUE INDEX `account_wallet_address_key`(`address`),
    PRIMARY KEY (`account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bridge_tx` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `direction` VARCHAR(191) NOT NULL,
    `account_id` INTEGER NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `wallet` VARCHAR(191) NOT NULL,
    `obj_debugname` VARCHAR(191) NOT NULL,
    `obj_id` INTEGER NOT NULL,
    `count` INTEGER NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `sig` VARCHAR(191) NULL,
    `last_valid_height` INTEGER NULL,
    `error` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bridge_tx_sig_key`(`sig`),
    INDEX `bridge_tx_state_direction_idx`(`state`, `direction`),
    INDEX `bridge_tx_account_id_state_idx`(`account_id`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
