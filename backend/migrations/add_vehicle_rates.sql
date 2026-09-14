-- Migration: Own Bike / Own Car per-km travel rates
-- Run this once against your database after deploying the updated backend.
--
-- What this does:
--   1. Creates vehicle_rates — a small, flat (NOT per-designation) rate
--      table: exactly one row each for 'Own Bike' and 'Own Car', each with
--      a single rate_per_km that applies to everyone regardless of role or
--      designation. This is deliberately a different, simpler mechanism
--      than allowance_rates (which is per-designation, used for DA scopes)
--      since these rates were asked to be flat company-wide numbers.
--   2. Adds no_of_km and rate_per_km columns to travel_entries, so a Travel
--      Entry using Own Bike/Own Car can store how the amount was derived
--      (km × rate) — same defensive "add if missing" pattern as every
--      other travel_entries migration.
--
-- Both new vehicle_rates rows start at rate_per_km = 0 — deliberately not
-- pre-filled with a guessed number, so nothing gets reimbursed at a rate
-- nobody actually approved. Set the real rates from the Allowance Rates
-- admin page after running this.
--
-- Safe to run whether or not any of this already exists, and safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_vehicle_rates $$
CREATE PROCEDURE _migrate_vehicle_rates()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicle_rates') THEN
    CREATE TABLE vehicle_rates (
      id INT NOT NULL AUTO_INCREMENT,
      mode ENUM('Own Bike','Own Car') NOT NULL,
      rate_per_km DECIMAL(10,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_mode (mode)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    INSERT INTO vehicle_rates (mode, rate_per_km) VALUES ('Own Bike', 0), ('Own Car', 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_entries' AND COLUMN_NAME='no_of_km') THEN
    ALTER TABLE travel_entries ADD COLUMN no_of_km DECIMAL(10,2) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='travel_entries' AND COLUMN_NAME='rate_per_km') THEN
    ALTER TABLE travel_entries ADD COLUMN rate_per_km DECIMAL(10,2) DEFAULT NULL;
  END IF;
END $$
DELIMITER ;

CALL _migrate_vehicle_rates();
DROP PROCEDURE _migrate_vehicle_rates;
