-- Migration: Admin-rejected status + Spl-Approval scope
-- Run this once against your database after deploying the updated backend.
--
-- What this does:
--   1. Adds 'admin_rejected' to expense_form.status, distinct from
--      coordinator_rejected / hr_rejected / accounts_rejected, so a
--      rejection made by an admin (at ANY stage, including an already
--      fully accounts_approved expense) shows clearly as "Admin Rejected"
--      rather than being attributed to whichever stage it happened to be
--      sitting at.
--   2. Adds admin_comment / admin_reviewed_by / admin_reviewed_at to
--      expense_form, mirroring the existing coordinator_/hr_/accounts_
--      columns, so the admin's rejection reason has its own home instead
--      of overwriting one of the other three.
--   3. Adds 'Spl-Approval' to the scope enum on journey_allowance,
--      return_allowance, stay_allowance, and allowance_rates — a new DA
--      scope alongside DA-Metro / DA-Non-Metro / Site-Allowance.
--
-- Safe to run whether or not any of this already exists, and safe to re-run.

DELIMITER $$
DROP PROCEDURE IF EXISTS _migrate_admin_reject_spl_approval $$
CREATE PROCEDURE _migrate_admin_reject_spl_approval()
BEGIN
  -- expense_form.status: MODIFY to the full enum including admin_rejected.
  -- Re-running this with the same final list is a harmless no-op, so no
  -- existence check is needed here (unlike ADD COLUMN below).
  ALTER TABLE expense_form
    MODIFY COLUMN status ENUM('draft','pending','coordinator_approved','coordinator_rejected',
                               'hr_approved','hr_rejected','accounts_approved','accounts_rejected',
                               'admin_rejected') DEFAULT 'draft';

  -- expense_form: admin review columns
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_form' AND COLUMN_NAME='admin_comment') THEN
    ALTER TABLE expense_form ADD COLUMN admin_comment TEXT AFTER accounts_comment;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_form' AND COLUMN_NAME='admin_reviewed_by') THEN
    ALTER TABLE expense_form ADD COLUMN admin_reviewed_by INT DEFAULT NULL AFTER accounts_reviewed_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expense_form' AND COLUMN_NAME='admin_reviewed_at') THEN
    ALTER TABLE expense_form ADD COLUMN admin_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER accounts_reviewed_at;
  END IF;

  -- scope enum: add 'Spl-Approval' everywhere DA-Metro/DA-Non-Metro/Site-Allowance
  -- currently live. Same "MODIFY is a harmless no-op on re-run" reasoning as above.
  ALTER TABLE journey_allowance MODIFY COLUMN scope ENUM('DA-Metro','DA-Non-Metro','Site-Allowance','Spl-Approval') NOT NULL;
  ALTER TABLE return_allowance  MODIFY COLUMN scope ENUM('DA-Metro','DA-Non-Metro','Site-Allowance','Spl-Approval') NOT NULL;
  ALTER TABLE stay_allowance    MODIFY COLUMN scope ENUM('DA-Metro','DA-Non-Metro','Site-Allowance','Spl-Approval') NOT NULL;
  ALTER TABLE allowance_rates   MODIFY COLUMN scope ENUM('DA-Metro','DA-Non-Metro','Site-Allowance','Spl-Approval') NOT NULL;
END $$
DELIMITER ;

CALL _migrate_admin_reject_spl_approval();
DROP PROCEDURE _migrate_admin_reject_spl_approval;
