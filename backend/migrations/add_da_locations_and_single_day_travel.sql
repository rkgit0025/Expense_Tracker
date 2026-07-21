-- Migration: Add From/To Location to DA claim tables + Single-Day Travel flag
-- Run this once against your database before deploying the updated backend.
--
-- What this does:
--   1. Adds from_location / to_location to journey_allowance, return_allowance,
--      and stay_allowance so employees can record where the DA was claimed for
--      (both "DA for Travel Days" and "DA for Stay Days").
--   2. Adds is_single_day_travel to expense_form to support the "Single-Day
--      Travel" radio option in Section 2 (Daily Allowance).
--
-- NOTE: an earlier version of this file used "ADD COLUMN IF NOT EXISTS",
-- which MySQL does NOT actually support (confirmed by testing directly
-- against a real MySQL 8.0.46 server — it's a hard syntax error, not a
-- graceful no-op). That meant this migration could have failed to apply
-- at all when you first tried to run it. This version uses a small
-- procedure that checks INFORMATION_SCHEMA instead, which works on any
-- MySQL 5.7+/8.0+ server and is genuinely safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_da_locations_single_day $$
CREATE PROCEDURE _migrate_da_locations_single_day()
BEGIN
  -- journey_allowance
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='journey_allowance' AND COLUMN_NAME='from_location') THEN
    ALTER TABLE journey_allowance ADD COLUMN from_location VARCHAR(255) DEFAULT NULL AFTER to_date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='journey_allowance' AND COLUMN_NAME='to_location') THEN
    ALTER TABLE journey_allowance ADD COLUMN to_location VARCHAR(255) DEFAULT NULL AFTER from_location;
  END IF;

  -- return_allowance
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='return_allowance' AND COLUMN_NAME='from_location') THEN
    ALTER TABLE return_allowance ADD COLUMN from_location VARCHAR(255) DEFAULT NULL AFTER to_date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='return_allowance' AND COLUMN_NAME='to_location') THEN
    ALTER TABLE return_allowance ADD COLUMN to_location VARCHAR(255) DEFAULT NULL AFTER from_location;
  END IF;

  -- stay_allowance
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stay_allowance' AND COLUMN_NAME='from_location') THEN
    ALTER TABLE stay_allowance ADD COLUMN from_location VARCHAR(255) DEFAULT NULL AFTER to_date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stay_allowance' AND COLUMN_NAME='to_location') THEN
    ALTER TABLE stay_allowance ADD COLUMN to_location VARCHAR(255) DEFAULT NULL AFTER from_location;
  END IF;

  -- expense_form
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_form' AND COLUMN_NAME='is_single_day_travel') THEN
    ALTER TABLE expense_form ADD COLUMN is_single_day_travel TINYINT(1) NOT NULL DEFAULT 0 AFTER project_coordinator_hod_override;
  END IF;
END $$
DELIMITER ;

CALL _migrate_da_locations_single_day();
DROP PROCEDURE _migrate_da_locations_single_day;
