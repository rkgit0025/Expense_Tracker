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

    await db.query(
      `INSERT INTO audit_logs
         (actor_emp_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, description, ip_address, action_time)
       VALUES (?,?,?,?,?,?,?,?,?, CONVERT_TZ(NOW(),'+00:00','+05:30'))`,
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
