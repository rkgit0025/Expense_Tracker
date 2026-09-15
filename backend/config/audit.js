/**
 * audit.js — centralised audit logging helper
 *
 * Usage:
 *   const { logAudit } = require('../config/audit');
 *   await logAudit(db, req, 'employee_deleted', 'employee', emp_id, 'John Doe', 'Deleted employee John Doe (EMP-001)');
 */

async function logAudit(db, req, action, entityType, entityId, entityLabel, description) {
  try {
    const actor      = req?.user;
    const ip         = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
                    || req?.socket?.remoteAddress
                    || null;

    // Fetch actor name — req.user has emp_id but not full_name
    let actorName = null;
    if (actor?.emp_id) {
      try {
        const [[emp]] = await db.query('SELECT full_name FROM employees WHERE emp_id=?', [actor.emp_id]);
        actorName = emp?.full_name || null;
      } catch { /* silent */ }
    }

    // UTC_TIMESTAMP() (not NOW()) — NOW() reflects whatever timezone the
    // MySQL server itself is configured with, which varies by host; the
    // rest of the app (mysql2's `timezone: 'Z'` driver option, and the
    // frontend's UTC→IST display conversion) assumes every stored
    // timestamp is genuine UTC. Mixing NOW() in here previously caused
    // login times to display several hours off — see backend/config/db.js
    // for the matching session-level fix.
    await db.query(
      `INSERT INTO audit_logs
         (actor_emp_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, description, ip_address, action_time)
       VALUES (?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP())`,
      [
        actor?.emp_id  || null,
        actorName,
        actor?.role    || null,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        entityLabel    || null,
        description    || null,
        ip,
      ]
    );
  } catch (err) {
    // Audit logging must NEVER break the main request
    console.warn('[audit] Log failed (non-fatal):', err.message);
  }
}

module.exports = { logAudit };
