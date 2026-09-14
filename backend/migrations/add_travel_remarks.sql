-- Migration: Travel Entries — Remarks
-- Run this once against your database after deploying the updated backend.
--
-- Adds a `remarks` text column to travel_entries — a general notes box per
-- travel entry (e.g. "Cab from airport, traffic diversion"), same pattern
-- as the remarks column already added to food_expenses.
--
-- Positions the new column after total_amount if that column exists (i.e.
-- the add_travel_total_amount migration has already been run), otherwise
-- after amount, so this works regardless of which migrations have run so far.
--
-- Safe to run whether or not the column already exists, and safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_travel_remarks $$
CREATE PROCEDURE _migrate_travel_remarks()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_entries' AND COLUMN_NAME='remarks') THEN
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_entries' AND COLUMN_NAME='total_amount') THEN
      ALTER TABLE travel_entries ADD COLUMN remarks TEXT AFTER total_amount;
    ELSE
      ALTER TABLE travel_entries ADD COLUMN remarks TEXT AFTER amount;
    END IF;
  END IF;
END $$
DELIMITER ;

CALL _migrate_travel_remarks();
DROP PROCEDURE _migrate_travel_remarks;
