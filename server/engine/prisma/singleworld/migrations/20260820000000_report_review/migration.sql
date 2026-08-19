-- rs-sdk: report review pipeline — track which abuse reports have been actioned
ALTER TABLE "report" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "report" ADD COLUMN "reviewed_at" DATETIME;
