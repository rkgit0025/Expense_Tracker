-- Migration: Food Expenses — Remarks + Shared-With people
-- Run this once against your database after deploying the updated backend.
--
-- What this does:
--   1. Adds a `remarks` text column to food_expenses — a general notes box
--      per food entry, independent of who it was shared with.
--   2. Creates food_expense_sharing, a new child table: for a food entry
--      with Sharing > 1, this holds one row per *additional* person beyond
--      the claimant themselves (Sharing=3 → 2 rows). Each row is either:
--        - an employee (person_type='employee', emp_id set), or
--        - someone external (person_type='other', category + name set —
--          e.g. category='Client', name='Bindal Sugar').
--      Deleting a food_expenses row cascades to delete its sharing rows.
--
-- Safe to run whether or not any of this already exists, and safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_food_sharing $$
CREATE PROCEDURE _migrate_food_sharing()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='food_expenses' AND COLUMN_NAME='remarks') THEN
    ALTER TABLE food_expenses ADD COLUMN remarks TEXT AFTER amount;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='food_expense_sharing') THEN
    CREATE TABLE food_expense_sharing (
      id INT NOT NULL AUTO_INCREMENT,
      food_expense_id INT NOT NULL,
      person_type ENUM('employee','other') NOT NULL,
      emp_id INT DEFAULT NULL,
      category ENUM('Client','Vendor','Guest','Other') DEFAULT NULL,
      name VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (id),
      KEY food_expense_id (food_expense_id),
      KEY emp_id (emp_id),
      CONSTRAINT food_expense_sharing_ibfk_1 FOREIGN KEY (food_expense_id) REFERENCES food_expenses (id) ON DELETE CASCADE,
      CONSTRAINT food_expense_sharing_ibfk_2 FOREIGN KEY (emp_id) REFERENCES employees (emp_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;
END $$
DELIMITER ;

CALL _migrate_food_sharing();
DROP PROCEDURE _migrate_food_sharing;
