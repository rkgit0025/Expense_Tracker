-- Run this migration to add audit logging to your existing database
-- ALTER TABLE to add audit_logs if it doesn't exist

CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  action_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_emp_id  INT          NULL,           -- who did it (NULL = system)
  actor_name    VARCHAR(120) NULL,           -- cached name at time of action
  actor_role    VARCHAR(30)  NULL,
  action        VARCHAR(60)  NOT NULL,       -- 'employee_created', 'expense_approved', etc.
  entity_type   VARCHAR(40)  NOT NULL,       -- 'employee', 'expense', 'user', 'project', etc.
  entity_id     VARCHAR(30)  NULL,           -- the record ID affected
  entity_label  VARCHAR(200) NULL,           -- human-readable e.g. employee name, expense #
  description   TEXT         NULL,           -- full context
  ip_address    VARCHAR(45)  NULL,
  INDEX idx_action_time  (action_time),
  INDEX idx_actor        (actor_emp_id),
  INDEX idx_action       (action),
  INDEX idx_entity_type  (entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
