-- Migration: Travel Entries — Per-Day Amount Toggle
-- Run this once against your database after deploying the updated backend.
--
-- Adds an `is_per_day` flag to travel_entries. The Travel Entries form now
-- has a checkbox next to the Amount field: checked (default, matches all
-- existing behaviour) means the amount entered is a per-day rate and gets
-- multiplied by the number of days; unchecked means the amount entered is
-- already the flat/total amount for that entry and is used as-is.
--
-- This column is optional — the app works fine without it too (the
-- computed total is always stored in amount/total_amount regardless), but
-- having it means the checkbox correctly reflects its saved state when you
-- reopen a submitted entry to edit it, instead of resetting to checked.
--
-- Safe to run whether or not the column already exists, and safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_travel_is_per_day $$
CREATE PROCEDURE _migrate_travel_is_per_day()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_entries' AND COLUMN_NAME='is_per_day') THEN
    ALTER TABLE travel_entries ADD COLUMN is_per_day TINYINT(1) NOT NULL DEFAULT 1;
  END IF;
END $$
DELIMITER ;

CALL _migrate_travel_is_per_day();
DROP PROCEDURE _migrate_travel_is_per_day;
