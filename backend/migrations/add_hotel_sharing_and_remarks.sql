-- Migration: Hotel Expenses — Remarks + Shared-With people
-- Run this once against your database after deploying the updated backend.
--
-- What this does — identical shape to add_food_sharing_and_remarks.sql,
-- just for hotel_expenses instead of food_expenses:
--   1. Adds a `remarks` text column to hotel_expenses.
--   2. Creates hotel_expense_sharing, a new child table: for a hotel entry
--      with Sharing > 1, this holds one row per *additional* person beyond
--      the claimant themselves (Sharing=3 -> 2 rows), each either:
--        - an employee (person_type='employee', emp_id set), or
--        - someone external (person_type='other', category + name set).
--      Deleting a hotel_expenses row cascades to delete its sharing rows.
--
-- Safe to run whether or not any of this already exists, and safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_hotel_sharing $$
CREATE PROCEDURE _migrate_hotel_sharing()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='hotel_expenses' AND COLUMN_NAME='remarks') THEN
    ALTER TABLE hotel_expenses ADD COLUMN remarks TEXT AFTER amount;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='hotel_expense_sharing') THEN
    CREATE TABLE hotel_expense_sharing (
      id INT NOT NULL AUTO_INCREMENT,
      hotel_expense_id INT NOT NULL,
      person_type ENUM('employee','other') NOT NULL,
      emp_id INT DEFAULT NULL,
      category ENUM('Client','Vendor','Guest','Other') DEFAULT NULL,
      name VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (id),
      KEY hotel_expense_id (hotel_expense_id),
      KEY emp_id (emp_id),
      CONSTRAINT hotel_expense_sharing_ibfk_1 FOREIGN KEY (hotel_expense_id) REFERENCES hotel_expenses (id) ON DELETE CASCADE,
      CONSTRAINT hotel_expense_sharing_ibfk_2 FOREIGN KEY (emp_id) REFERENCES employees (emp_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;
END $$
DELIMITER ;

CALL _migrate_hotel_sharing();
DROP PROCEDURE _migrate_hotel_sharing;
