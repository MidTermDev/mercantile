-- rs-sdk: report review pipeline — track which abuse reports have been actioned
ALTER TABLE `report` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'pending';
ALTER TABLE `report` ADD COLUMN `reviewed_at` DATETIME NULL;
