-- Migration: Add no_of_days and total_amount columns to travel_entries
-- Run this once against your database before deploying the updated backend.

ALTER TABLE travel_entries
  ADD COLUMN IF NOT EXISTS no_of_days   INT            NOT NULL DEFAULT 0  AFTER amount,
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0  AFTER no_of_days;

-- Backfill existing rows: total_amount = amount (single-day entries before this fix)
UPDATE travel_entries
SET total_amount = amount,
    no_of_days   = 0
WHERE total_amount = 0;
