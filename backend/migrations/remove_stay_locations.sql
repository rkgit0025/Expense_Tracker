-- Migration: Remove From/To Location from stay_allowance
-- Run this once against your database after deploying the updated backend.
--
-- What this does:
--   Drops from_location / to_location from stay_allowance. Those columns
--   were added by add_da_locations_and_single_day_travel.sql, but "DA for
--   Stay Days / Site Allowance" represents staying in one place for a date
--   range, not a journey between two locations — unlike "DA for Travel
--   Days" and "Return Journey" (journey_allowance / return_allowance),
--   which keep these columns and are NOT touched by this migration.
--
-- Safe to run whether or not the columns exist (checks INFORMATION_SCHEMA
-- first, same approach as the migration that added them), and safe to
-- re-run.
--
-- NOTE: existing stay_allowance rows that already had a location filled in
-- will lose that value once its column is dropped — it was already hidden
-- from every part of the app (form, view page, PDF) before this migration
-- runs, so nothing currently displays it; this just removes the now-unused
-- storage for it too.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_drop_stay_locations $$
CREATE PROCEDURE _migrate_drop_stay_locations()
BEGIN
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stay_allowance' AND COLUMN_NAME='from_location') THEN
    ALTER TABLE stay_allowance DROP COLUMN from_location;
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stay_allowance' AND COLUMN_NAME='to_location') THEN
    ALTER TABLE stay_allowance DROP COLUMN to_location;
  END IF;
END $$
DELIMITER ;

CALL _migrate_drop_stay_locations();
DROP PROCEDURE _migrate_drop_stay_locations;
