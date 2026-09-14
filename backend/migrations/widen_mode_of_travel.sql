-- Migration: widen travel_entries.mode_of_travel from ENUM to VARCHAR
-- Needed because the Mode of Travel field is now a multi-select checkbox
-- list on the frontend (e.g. "Cab + Train"), plus new options Metro and Cab.
-- Run this once against your database before deploying the updated backend.
-- Safe to re-run: checks the column type before altering.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_widen_mode_of_travel $$
CREATE PROCEDURE _migrate_widen_mode_of_travel()
BEGIN
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'travel_entries'
      AND COLUMN_NAME = 'mode_of_travel'
      AND DATA_TYPE = 'enum'
  ) THEN
    ALTER TABLE travel_entries
      MODIFY COLUMN mode_of_travel VARCHAR(255) NOT NULL;
  END IF;
END $$
DELIMITER ;

CALL _migrate_widen_mode_of_travel();
DROP PROCEDURE _migrate_widen_mode_of_travel;
