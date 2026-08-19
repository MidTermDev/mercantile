-- rs-sdk: bot-license activation flag (paid on the website by burning GP)
ALTER TABLE "account" ADD COLUMN "bot_license_until" DATETIME;
