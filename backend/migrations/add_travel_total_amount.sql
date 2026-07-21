-- Migration: Add no_of_days and total_amount columns to travel_entries
-- Run this once against your database before deploying the updated backend.
--
-- NOTE: this file previously used "ADD COLUMN IF NOT EXISTS", which MySQL
-- does NOT actually support — confirmed by testing directly against a real
-- MySQL 8.0.46 server, it's a hard syntax error, not a graceful no-op. That
-- meant this migration could have failed to apply entirely. Rewritten to use
-- an INFORMATION_SCHEMA check instead, which works on any MySQL 5.7+/8.0+
-- server and is genuinely safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_travel_total_amount $$
CREATE PROCEDURE _migrate_travel_total_amount()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_entries' AND COLUMN_NAME='no_of_days') THEN
    ALTER TABLE travel_entries ADD COLUMN no_of_days INT NOT NULL DEFAULT 0 AFTER amount;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_entries' AND COLUMN_NAME='total_amount') THEN
    ALTER TABLE travel_entries ADD COLUMN total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER no_of_days;
  END IF;
END $$
DELIMITER ;

CALL _migrate_travel_total_amount();
DROP PROCEDURE _migrate_travel_total_amount;

-- Backfill existing rows: total_amount = amount (single-day entries before this fix)
UPDATE travel_entries
SET total_amount = amount,
    no_of_days   = 0
WHERE total_amount = 0;
