const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const multer  = require('multer');
const xlsx    = require('xlsx');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const { logAudit }  = require('../config/audit');
const { computeClaimTotal } = require('../config/claimCalc');

const adminOnly = authorize('admin');
const adminOrHR = authorize('admin', 'hr');

// multer: in-memory for bulk upload
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════

// ── GET /admin/employees/list  — lightweight employee list for dropdowns (all authenticated roles) ──
router.get('/employees/list', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.emp_id, e.emp_code, e.full_name, d.designation_name
       FROM employees e
       LEFT JOIN designations d ON e.designation_id = d.designation_id
       ORDER BY e.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /admin/employees — full employee list (admin/HR only) ────────────────
router.get('/employees', auth, adminOrHR, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*,
              d.designation_name, dep.department_name, l.location_name,
              u.user_id, u.role AS user_role, u.status AS user_status,
              u.must_change_password,
              CONCAT(rm1.first_name,' ',COALESCE(rm1.last_name,'')) AS first_manager_name,
              CONCAT(rm2.first_name,' ',COALESCE(rm2.last_name,'')) AS second_manager_name
       FROM employees e
       LEFT JOIN designations d    ON e.designation_id  = d.designation_id
       LEFT JOIN departments  dep  ON e.department_id   = dep.department_id
       LEFT JOIN locations    l    ON e.location_id     = l.location_id
       LEFT JOIN users        u    ON e.emp_id          = u.emp_id
       LEFT JOIN employees    rm1  ON e.first_reporting_manager_emp_code  = rm1.emp_code
       LEFT JOIN employees    rm2  ON e.second_reporting_manager_emp_code = rm2.emp_code
       ORDER BY e.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST — create single employee
router.post('/employees', auth, adminOrHR, async (req, res) => {
  try {
    const {
      emp_code, first_name, middle_name, last_name, email,
      mobile_number, gender, category, birth_of_date, date_of_joining,
      designation_id, department_id, location_id,
      first_reporting_manager_emp_code, second_reporting_manager_emp_code
    } = req.body;

    if (!emp_code || !first_name || !email)
      return res.status(400).json({ message: 'Employee code, first name and email are required.' });

    const full_name = [first_name, middle_name, last_name].filter(Boolean).join(' ');
    const username  = email.toLowerCase().trim(); // username always matches email

    const [result] = await db.query(
      `INSERT INTO employees
         (emp_code, username, first_name, middle_name, last_name, full_name,
          email, mobile_number, gender, category, birth_of_date, date_of_joining,
          designation_id, department_id, location_id,
          first_reporting_manager_emp_code, second_reporting_manager_emp_code)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [emp_code, username, first_name, middle_name || null, last_name, full_name,
       email.trim(), mobile_number || null, gender || null, category || 'Staff',
       birth_of_date || null, date_of_joining || null,
       designation_id || null, department_id || null, location_id || null,
       first_reporting_manager_emp_code || null, second_reporting_manager_emp_code || null]
    );

    await logAudit(db, req, 'employee_created', 'employee', result.insertId,
      full_name, `Created employee ${full_name} (${emp_code})`);

    res.status(201).json({ message: 'Employee created successfully.', emp_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Employee code or email already exists.' });
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT — update employee
// ── GET bulk upload template (MUST be before /:id route) ────────────────────
router.get('/employees/bulk-template', auth, adminOrHR, (req, res) => {
  const headers = [
    'emp_code','first_name','middle_name','last_name','email','mobile_number',
    'gender','category','birth_of_date','date_of_joining',
    'designation_name','department_name','location_name',
    'first_reporting_manager_emp_code','second_reporting_manager_emp_code'
  ];
  const sample = [
    'EMP-001','John','Kumar','Doe','john.doe@company.com','9876543210',
    'Male','Staff','1990-01-15','2022-06-01',
    'Senior Engineer','Engineering','Mumbai','EMP-000',''
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(() => ({ wch: 24 }));
  xlsx.utils.book_append_sheet(wb, ws, 'Employees');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="employee_bulk_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── Helper: extract an emp_code from a cell that may be a plain code
//    ("EMP-001") or a "Full Name (EMP-001)" style value (as shown in
//    dropdowns elsewhere in the app). Falls back to the trimmed raw value. ──
function extractEmpCode(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const match = str.match(/\(([^)]+)\)\s*$/); // grabs the code inside trailing parentheses
  return (match ? match[1] : str).trim() || null;
}

// ── POST bulk upload (MUST be before /:id route) ─────────────────────────────
router.post('/employees/bulk-upload', auth, adminOrHR, uploadMem.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
    const wb   = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.status(400).json({ message: 'File is empty.' });

    const [desigs] = await db.query('SELECT designation_id, designation_name FROM designations');
    const [depts]  = await db.query('SELECT department_id, department_name FROM departments');
    const [locs]   = await db.query('SELECT location_id, location_name FROM locations');
    const desigMap = Object.fromEntries(desigs.map(d => [d.designation_name.toLowerCase().trim(), d.designation_id]));
    const deptMap  = Object.fromEntries(depts.map(d  => [d.department_name.toLowerCase().trim(),  d.department_id]));
    const locMap   = Object.fromEntries(locs.map(l   => [l.location_name.toLowerCase().trim(),    l.location_id]));

    // Existing employees (for validating/resolving reporting-manager emp_codes,
    // including managers being uploaded earlier in this very same file).
    const [existingEmps] = await db.query('SELECT emp_code FROM employees');
    const knownEmpCodes  = new Set(existingEmps.map(e => String(e.emp_code).toLowerCase().trim()));
    rows.forEach(r => { if (r.emp_code) knownEmpCodes.add(String(r.emp_code).toLowerCase().trim()); });

    let created = 0, updated = 0, skipped = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const rowNum = i + 2;
      if (!r.emp_code || !r.first_name || !r.email) {
        errors.push(`Row ${rowNum}: emp_code, first_name, email required.`); skipped++; continue;
      }
      const full_name      = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ');
      const username        = String(r.email).toLowerCase().trim();
      const designation_id = desigMap[String(r.designation_name||'').toLowerCase().trim()] || null;
      const department_id  = deptMap[String(r.department_name||'').toLowerCase().trim()]   || null;
      const location_id    = locMap[String(r.location_name||'').toLowerCase().trim()]      || null;

      // Reporting managers: accept plain emp_code OR "Full Name (EMP_CODE)"
      // and detect/map the manager by their emp_code. If a code is supplied
      // but doesn't match any known employee, flag it instead of silently
      // saving a dangling reference.
      let first_reporting_manager_emp_code  = extractEmpCode(r.first_reporting_manager_emp_code);
      let second_reporting_manager_emp_code = extractEmpCode(r.second_reporting_manager_emp_code);
      if (first_reporting_manager_emp_code && !knownEmpCodes.has(first_reporting_manager_emp_code.toLowerCase())) {
        errors.push(`Row ${rowNum} (${r.emp_code}): first reporting manager code "${first_reporting_manager_emp_code}" not found — left unset.`);
        first_reporting_manager_emp_code = null;
      }
      if (second_reporting_manager_emp_code && !knownEmpCodes.has(second_reporting_manager_emp_code.toLowerCase())) {
        errors.push(`Row ${rowNum} (${r.emp_code}): second reporting manager code "${second_reporting_manager_emp_code}" not found — left unset.`);
        second_reporting_manager_emp_code = null;
      }

      try {
        // ON DUPLICATE KEY UPDATE now refreshes every column, so re-uploading
        // the same emp_code with edited fields (designation, manager, etc.)
        // actually updates the existing employee instead of being a no-op.
        const [result] = await db.query(
          `INSERT INTO employees (emp_code,username,first_name,middle_name,last_name,full_name,email,mobile_number,gender,category,birth_of_date,date_of_joining,designation_id,department_id,location_id,first_reporting_manager_emp_code,second_reporting_manager_emp_code)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             username=VALUES(username), first_name=VALUES(first_name), middle_name=VALUES(middle_name),
             last_name=VALUES(last_name), full_name=VALUES(full_name), email=VALUES(email),
             mobile_number=VALUES(mobile_number), gender=VALUES(gender), category=VALUES(category),
             birth_of_date=VALUES(birth_of_date), date_of_joining=VALUES(date_of_joining),
             designation_id=VALUES(designation_id), department_id=VALUES(department_id), location_id=VALUES(location_id),
             first_reporting_manager_emp_code=VALUES(first_reporting_manager_emp_code),
             second_reporting_manager_emp_code=VALUES(second_reporting_manager_emp_code)`,
          [String(r.emp_code),username,r.first_name,r.middle_name||null,r.last_name,full_name,username,r.mobile_number||null,r.gender||null,r.category||'Staff',r.birth_of_date||null,r.date_of_joining||null,designation_id,department_id,location_id,first_reporting_manager_emp_code,second_reporting_manager_emp_code]
        );
        // MySQL affectedRows semantics for INSERT ... ON DUPLICATE KEY UPDATE:
        // 1 = new row inserted, 2 = existing row updated, 0 = existing row unchanged.
        if (result.affectedRows === 2) updated++;
        else if (result.affectedRows === 1) created++;
        else updated++; // row matched but values identical — still counts as processed/up to date
      } catch (e) { errors.push(`Row ${rowNum} (${r.emp_code}): ${e.message}`); skipped++; }
    }
    res.json({
      message: `Bulk upload complete. ${created} created, ${updated} updated, ${skipped} skipped.`,
      created, updated, skipped, errors
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Bulk upload failed: ' + err.message });
  }
});

// NOTE: bulk-template and bulk-upload must appear BEFORE /:id routes (Express param matching)
router.put('/employees/:id', auth, adminOrHR, async (req, res) => {
  try {
    const {
      emp_code, first_name, middle_name, last_name, email,
      mobile_number, gender, category, birth_of_date, date_of_joining,
      designation_id, department_id, location_id,
      first_reporting_manager_emp_code, second_reporting_manager_emp_code
    } = req.body;

    if (!emp_code || !first_name || !email)
      return res.status(400).json({ message: 'Employee code, first name and email are required.' });

    const full_name = [first_name, middle_name, last_name].filter(Boolean).join(' ');
    const username  = email.toLowerCase().trim(); // username always matches email

    await db.query(
      `UPDATE employees SET
         emp_code=?, username=?, first_name=?, middle_name=?, last_name=?, full_name=?,
         email=?, mobile_number=?, gender=?, category=?, birth_of_date=?, date_of_joining=?,
         designation_id=?, department_id=?, location_id=?,
         first_reporting_manager_emp_code=?, second_reporting_manager_emp_code=?
       WHERE emp_id=?`,
      [emp_code, username, first_name, middle_name || null, last_name, full_name,
       email.trim(), mobile_number || null, gender || null, category || 'Staff',
       birth_of_date || null, date_of_joining || null,
       designation_id || null, department_id || null, location_id || null,
       first_reporting_manager_emp_code || null, second_reporting_manager_emp_code || null,
       req.params.id]
    );
    await logAudit(db, req, 'employee_updated', 'employee', req.params.id,
      full_name, `Updated employee ${full_name} (${emp_code})`);
    res.json({ message: 'Employee updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/employees/:id', auth, adminOrHR, async (req, res) => {
  try {
    const targetEmpId = parseInt(req.params.id);

    // ── Self-delete protection ─────────────────────────────────────────────
    // req.user.emp_id is the logged-in user's employee ID
    if (targetEmpId === req.user.emp_id) {
      return res.status(403).json({
        message: 'You cannot delete your own employee record. Ask another administrator to do this.'
      });
    }

    // Fetch the employee for audit log before deleting
    const [[emp]] = await db.query('SELECT emp_code, full_name FROM employees WHERE emp_id=?', [targetEmpId]);
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    await db.query('DELETE FROM employees WHERE emp_id=?', [targetEmpId]);

    await logAudit(db, req, 'employee_deleted', 'employee', targetEmpId,
      emp.full_name, `Deleted employee ${emp.full_name} (${emp.emp_code})`);

    res.json({ message: 'Employee deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════

router.get('/users', auth, adminOrHR, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.user_id, u.emp_id, u.username, u.email, u.role, u.status, u.created_at,
              u.must_change_password,
              e.emp_code, e.full_name,
              d.designation_name, dep.department_name
       FROM users u
       JOIN employees   e   ON u.emp_id = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       ORDER BY e.full_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

router.get('/users/unlinked', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.emp_id, e.emp_code, e.full_name, e.email, e.username,
              e.department_id, e.designation_id,
              d.designation_name, dep.department_name
       FROM employees e
       LEFT JOIN users u ON e.emp_id = u.emp_id
       LEFT JOIN designations d ON e.designation_id = d.designation_id
       LEFT JOIN departments dep ON e.department_id = dep.department_id
       WHERE u.emp_id IS NULL ORDER BY e.full_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { emp_id, role, send_email } = req.body;
    if (!emp_id || !role)
      return res.status(400).json({ message: 'Employee and role are required.' });

    const [[emp]] = await db.query('SELECT * FROM employees WHERE emp_id=?', [emp_id]);
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    const [[existing]] = await db.query('SELECT user_id FROM users WHERE emp_id=?', [emp_id]);
    if (existing) return res.status(409).json({ message: 'This employee already has a user account.' });

    // Generate a secure temporary password
    const tempPassword = 'Temp@' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const hash         = await bcrypt.hash(tempPassword, 10);
    const username     = emp.email.toLowerCase().trim();

    await db.query(
      `INSERT INTO users (emp_id, username, email, password, role, must_change_password) VALUES (?,?,?,?,?,1)`,
      [emp_id, username, emp.email, hash, role]
    );

    // Optionally send invite email
    let emailSent  = false;
    let emailError = null;
    if (send_email) {
      try {
        const { sendInviteEmail } = require('../config/mailer');
        const loginUrl = `${process.env.CLIENT_URL}/login`;
        await sendInviteEmail({
          to:           emp.email,
          fullName:     emp.full_name || `${emp.first_name} ${emp.last_name}`,
          username,
          tempPassword,
          loginUrl,
        });
        emailSent = true;
      } catch (e) {
        emailError = e.message;
        console.warn('Invite email failed (non-fatal):', e.message);
      }
    }

    await logAudit(db, req, 'user_created', 'user', null, emp.full_name,
      `Created login account for ${emp.full_name} (${emp.emp_code}) with role: ${role}`);

    res.status(201).json({
      message:      `User account created for ${emp.full_name}.`,
      tempPassword,
      email_sent:   emailSent,
      email_error:  emailError,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Username or email already in use.' });
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /users/bulk-create — create accounts for many employees at once ─────
// Accepts a list of emp_ids (selected individually, or gathered client-side
// by filtering the unlinked-employees list by department/designation) and
// creates a login account for each, reusing the same logic as the single
// "Create Login Access" flow above.
router.post('/users/bulk-create', auth, adminOnly, async (req, res) => {
  try {
    const { emp_ids, role, send_email } = req.body;
    if (!Array.isArray(emp_ids) || emp_ids.length === 0)
      return res.status(400).json({ message: 'Select at least one employee.' });
    if (!role)
      return res.status(400).json({ message: 'Role is required.' });

    const { sendInviteEmail } = require('../config/mailer');
    const loginUrl = `${process.env.CLIENT_URL}/login`;

    let created = 0, skipped = 0;
    const results = [];
    const errors  = [];

    for (const emp_id of emp_ids) {
      try {
        const [[emp]] = await db.query('SELECT * FROM employees WHERE emp_id=?', [emp_id]);
        if (!emp) { errors.push(`Employee #${emp_id}: not found.`); skipped++; continue; }

        const [[existing]] = await db.query('SELECT user_id FROM users WHERE emp_id=?', [emp_id]);
        if (existing) { errors.push(`${emp.full_name} (${emp.emp_code}): already has a login account — skipped.`); skipped++; continue; }

        const tempPassword = 'Temp@' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const hash         = await bcrypt.hash(tempPassword, 10);
        const username      = emp.email.toLowerCase().trim();

        await db.query(
          `INSERT INTO users (emp_id, username, email, password, role, must_change_password) VALUES (?,?,?,?,?,1)`,
          [emp_id, username, emp.email, hash, role]
        );

        let emailSent = false, emailError = null;
        if (send_email) {
          try {
            await sendInviteEmail({
              to: emp.email,
              fullName: emp.full_name || `${emp.first_name} ${emp.last_name}`,
              username, tempPassword, loginUrl,
            });
            emailSent = true;
          } catch (e) { emailError = e.message; console.warn('Bulk invite email failed (non-fatal):', e.message); }
        }

        await logAudit(db, req, 'user_created', 'user', null, emp.full_name,
          `Created login account for ${emp.full_name} (${emp.emp_code}) with role: ${role} (bulk creation)`);

        results.push({
          emp_id, full_name: emp.full_name, emp_code: emp.emp_code,
          username, tempPassword, email_sent: emailSent, email_error: emailError,
        });
        created++;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') { errors.push(`Employee #${emp_id}: username/email already in use — skipped.`); skipped++; }
        else { errors.push(`Employee #${emp_id}: ${e.message}`); skipped++; }
      }
    }

    res.json({
      message: `Bulk account creation complete. ${created} created, ${skipped} skipped.`,
      created, skipped, results, errors,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Bulk account creation failed: ' + err.message });
  }
});

router.put('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { role, status } = req.body;
    await db.query('UPDATE users SET role=?, status=? WHERE user_id=?', [role, status || 'active', req.params.id]);
    res.json({ message: 'User updated.' });
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

router.post('/users/:id/reset-password', auth, adminOnly, async (req, res) => {
  try {
    // Get user + employee info for email
    const [[userRow]] = await db.query(
      `SELECT u.user_id, u.email, u.username, e.full_name
       FROM users u JOIN employees e ON u.emp_id = e.emp_id
       WHERE u.user_id = ?`,
      [req.params.id]
    );
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    // Auto-generate a secure temp password
    const tempPassword = 'Temp@' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const hash         = await bcrypt.hash(tempPassword, 10);

    await db.query('UPDATE users SET password=?, must_change_password=1 WHERE user_id=?',
      [hash, req.params.id]);

    // Send email with temp password (non-fatal)
    let emailSent  = false;
    let emailError = null;
    try {
      const { sendPasswordResetEmail } = require('../config/mailer');
      const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/login`;
      await sendPasswordResetEmail({
        to:           userRow.email,
        fullName:     userRow.full_name,
        username:     userRow.username,
        tempPassword,
        loginUrl,
      });
      emailSent = true;
    } catch (mailErr) {
      emailError = mailErr.message;
      console.warn('Password reset email failed (non-fatal):', mailErr.message);
    }

    await logAudit(db, req, 'password_reset', 'user', req.params.id, userRow.full_name,
      `Password reset for ${userRow.full_name} (${userRow.username}) — email ${emailSent ? 'sent to ' + userRow.email : 'failed: ' + emailError}`);

    res.json({
      message:     `Password reset for ${userRow.full_name}.`,
      tempPassword,
      email_sent:  emailSent,
      email_error: emailError,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.patch('/users/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { status, inactive_reason } = req.body;
    await db.query('UPDATE users SET status=?, inactive_reason=? WHERE user_id=?',
      [status, inactive_reason || null, req.params.id]);
    res.json({ message: 'Status updated.' });
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE user_id=?', [req.params.id]);
    res.json({ message: 'User account removed.' });
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

// ═══════════════════════════════════════════════════════════════
// COORDINATOR ↔ DEPARTMENT
// ═══════════════════════════════════════════════════════════════

// Self-scoped: which departments *I* (the logged-in coordinator) cover.
// Any authenticated user can call this — it only ever returns their own
// assignments (empty for non-coordinators) — used by the frontend to decide
// whether to show department-scoped abilities like adding project codes.
router.get('/my-coordinator-departments', auth, async (req, res) => {
  try {
    if (req.user.role !== 'coordinator') return res.json([]);
    const [rows] = await db.query(
      `SELECT d.department_id, d.department_name
       FROM coordinator_departments cd
       JOIN departments d ON d.department_id = cd.department_id
       WHERE cd.coordinator_emp_id = ?`,
      [req.user.emp_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

router.get('/coordinator-departments', auth, adminOrHR, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT cd.id, cd.coordinator_emp_id, cd.department_id,
              e.full_name AS coordinator_name, e.emp_code,
              dep.department_name
       FROM coordinator_departments cd
       JOIN employees   e   ON cd.coordinator_emp_id = e.emp_id
       JOIN departments dep ON cd.department_id      = dep.department_id
       ORDER BY dep.department_name, e.full_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

router.post('/coordinator-departments', auth, adminOrHR, async (req, res) => {
  try {
    const { coordinator_emp_id, department_id } = req.body;
    if (!coordinator_emp_id || !department_id)
      return res.status(400).json({ message: 'Coordinator and department are required.' });
    const [[u]] = await db.query("SELECT role FROM users WHERE emp_id=?", [coordinator_emp_id]);
    if (!u || u.role !== 'coordinator')
      return res.status(400).json({ message: 'Selected employee must have the coordinator role.' });
    await db.query(`INSERT INTO coordinator_departments (coordinator_emp_id, department_id) VALUES (?,?)`,
      [coordinator_emp_id, department_id]);
    await logAudit(db, req, 'coordinator_assigned', 'coordinator', null, null,
      `Coordinator (emp_id:${coordinator_emp_id}) assigned to department_id:${department_id}`);
    res.status(201).json({ message: 'Coordinator assigned.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Already assigned.' });
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/coordinator-departments/:id', auth, adminOrHR, async (req, res) => {
  try {
    await db.query('DELETE FROM coordinator_departments WHERE id=?', [req.params.id]);
    await logAudit(db, req, 'coordinator_removed', 'coordinator', req.params.id, null,
      `Coordinator-department assignment #${req.params.id} removed`);
    res.json({ message: 'Removed.' });
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

// ═══════════════════════════════════════════════════════════════
// REFERENCE DATA
// ═══════════════════════════════════════════════════════════════

router.get('/departments', auth, async (req, res) => {
  try { const [r] = await db.query('SELECT * FROM departments ORDER BY department_name'); res.json(r); }
  catch (err) { res.status(500).json({ message: 'Server error.' }); }
});
router.post('/departments', auth, adminOrHR, async (req, res) => {
  try {
    const [r] = await db.query('INSERT INTO departments (department_name) VALUES (?)', [req.body.department_name]);
    res.status(201).json({ message: 'Created.', department_id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Already exists.' });
    res.status(500).json({ message: 'Server error.' });
  }
});
router.delete('/departments/:id', auth, adminOrHR, async (req, res) => {
  try {
    // Check if any employees use this department
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) as cnt FROM employees WHERE department_id=?', [req.params.id]
    );
    if (cnt > 0)
      return res.status(409).json({
        message: `Cannot delete: ${cnt} employee${cnt>1?'s are':' is'} assigned to this department. Reassign them first.`
      });
    await db.query('DELETE FROM departments WHERE department_id=?', [req.params.id]);
    await logAudit(db, req, 'department_deleted', 'department', req.params.id, null,
      `Department #${req.params.id} deleted`);
    res.json({ message: 'Department deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ message: 'Cannot delete: this department is in use.' });
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/designations', auth, async (req, res) => {
  try { const [r] = await db.query('SELECT * FROM designations ORDER BY designation_name'); res.json(r); }
  catch (err) { res.status(500).json({ message: 'Server error.' }); }
});
router.post('/designations', auth, adminOrHR, async (req, res) => {
  try {
    const [r] = await db.query('INSERT INTO designations (designation_name) VALUES (?)', [req.body.designation_name]);
    res.status(201).json({ message: 'Created.', designation_id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Already exists.' });
    res.status(500).json({ message: 'Server error.' });
  }
});
router.delete('/designations/:id', auth, adminOrHR, async (req, res) => {
  try {
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) as cnt FROM employees WHERE designation_id=?', [req.params.id]
    );
    if (cnt > 0)
      return res.status(409).json({
        message: `Cannot delete: ${cnt} employee${cnt>1?'s are':' is'} assigned to this designation.`
      });
    await db.query('DELETE FROM designations WHERE designation_id=?', [req.params.id]);
    await logAudit(db, req, 'designation_deleted', 'designation', req.params.id, null,
      `Designation #${req.params.id} deleted`);
    res.json({ message: 'Designation deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ message: 'Cannot delete: this designation is in use.' });
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/locations', auth, async (req, res) => {
  try { const [r] = await db.query('SELECT * FROM locations ORDER BY location_name'); res.json(r); }
  catch (err) { res.status(500).json({ message: 'Server error.' }); }
});
router.post('/locations', auth, adminOrHR, async (req, res) => {
  try {
    const [r] = await db.query('INSERT INTO locations (location_name) VALUES (?)', [req.body.location_name]);
    res.status(201).json({ message: 'Created.', location_id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Already exists.' });
    res.status(500).json({ message: 'Server error.' });
  }
});
router.delete('/locations/:id', auth, adminOrHR, async (req, res) => {
  try {
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) as cnt FROM employees WHERE location_id=?', [req.params.id]
    );
    if (cnt > 0)
      return res.status(409).json({
        message: `Cannot delete: ${cnt} employee${cnt>1?'s are':' is'} assigned to this location.`
      });
    await db.query('DELETE FROM locations WHERE location_id=?', [req.params.id]);
    await logAudit(db, req, 'location_deleted', 'location', req.params.id, null,
      `Location #${req.params.id} deleted`);
    res.json({ message: 'Location deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ message: 'Cannot delete: this location is in use.' });
    res.status(500).json({ message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════

router.get('/stats', auth, adminOrHR, async (req, res) => {
  try {
    const [[{ total_expenses }]] = await db.query('SELECT COUNT(*) as total_expenses FROM expense_form');
    const [[{ pending }]]        = await db.query("SELECT COUNT(*) as pending FROM expense_form WHERE status='pending'");
    const [[{ approved }]]       = await db.query("SELECT COUNT(*) as approved FROM expense_form WHERE status='accounts_approved'");
    const [[{ total_claim }]]    = await db.query("SELECT COALESCE(SUM(claim_amount),0) as total_claim FROM expense_form WHERE status='accounts_approved'");
    const [[{ total_employees }]]= await db.query('SELECT COUNT(*) as total_employees FROM employees');
    const [[{ total_users }]]    = await db.query("SELECT COUNT(*) as total_users FROM users WHERE status='active'");

    // Analytics for admin dashboard
    const [byStatus]      = await db.query(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(claim_amount),0) as total
      FROM expense_form GROUP BY status ORDER BY count DESC`);

    const [byDepartment]  = await db.query(`
      SELECT dep.department_name, COUNT(ef.expense_id) as count,
             COALESCE(SUM(ef.claim_amount),0) as total
      FROM expense_form ef
      JOIN employees e   ON ef.emp_id        = e.emp_id
      JOIN departments dep ON e.department_id  = dep.department_id
      GROUP BY dep.department_id, dep.department_name
      ORDER BY total DESC LIMIT 10`);

    const [monthlyTrend]  = await db.query(`
      SELECT DATE_FORMAT(submitted_at,'%Y-%m') as month,
             COUNT(*) as count,
             COALESCE(SUM(claim_amount),0) as total
      FROM expense_form
      WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND submitted_at IS NOT NULL
      GROUP BY month ORDER BY month ASC`);

    const [topClaimants]  = await db.query(`
      SELECT e.full_name, e.emp_code, dep.department_name,
             COUNT(ef.expense_id) as submissions,
             COALESCE(SUM(ef.claim_amount),0) as total_claimed
      FROM expense_form ef
      JOIN employees   e   ON ef.emp_id       = e.emp_id
      LEFT JOIN departments dep ON e.department_id = dep.department_id
      GROUP BY e.emp_id, e.full_name, e.emp_code, dep.department_name
      ORDER BY total_claimed DESC LIMIT 5`);

    const [recentActivity]= await db.query(`
      SELECT al.action_time, al.actor_name, al.actor_role, al.action,
             al.entity_type, al.entity_label, al.description
      FROM audit_logs al
      ORDER BY al.action_time DESC LIMIT 20`);

    res.json({
      total_expenses, pending, approved, total_claim, total_employees, total_users,
      byStatus, byDepartment, monthlyTrend, topClaimants, recentActivity,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUDIT LOGS — admin read only
// NOTE: /audit-logs/export must come BEFORE /audit-logs to avoid param conflict
router.get('/audit-logs/export', auth, adminOnly, async (req, res) => {
  try {
    const { action, entity_type, search } = req.query;
    let where  = 'WHERE 1=1';
    const params = [];
    if (action)       { where += ' AND action = ?';       params.push(action); }
    if (entity_type)  { where += ' AND entity_type = ?';  params.push(entity_type); }
    if (search) {
      where += ' AND (actor_name LIKE ? OR entity_label LIKE ? OR description LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    const [rows] = await db.query(
      `SELECT * FROM audit_logs ${where} ORDER BY action_time DESC LIMIT 10000`, params
    );
    const esc     = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN') : '';
    const headers = ['ID','Date & Time','Actor Name','Actor Role','Action','Entity Type','Entity ID','Entity Label','Description','IP Address'];
    const csv = [
      headers.map(esc).join(','),
      ...rows.map(r => [
        r.id, fmtDate(r.action_time), r.actor_name, r.actor_role,
        r.action, r.entity_type, r.entity_id, r.entity_label, r.description, r.ip_address,
      ].map(esc).join(','))
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_log_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Export failed.' });
  }
});

router.get('/audit-logs', auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50, action, entity_type, actor_emp_id, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where  = 'WHERE 1=1';
    const params = [];

    if (action)       { where += ' AND al.action = ?';           params.push(action); }
    if (entity_type)  { where += ' AND al.entity_type = ?';      params.push(entity_type); }
    if (actor_emp_id) { where += ' AND al.actor_emp_id = ?';     params.push(actor_emp_id); }
    if (search) {
      where += ' AND (al.actor_name LIKE ? OR al.entity_label LIKE ? OR al.description LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const [rows] = await db.query(
      `SELECT al.* FROM audit_logs al ${where}
       ORDER BY al.action_time DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM audit_logs al ${where}`, params
    );

    res.json({ logs: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DATABASE BACKUP — admin only
// ═══════════════════════════════════════════════════════════════
router.get('/backup-database', auth, adminOnly, async (req, res) => {
  try {
    const [tables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`
    );
    if (!tables.length) return res.status(500).json({ message: 'No tables found to back up.' });

    const stamp    = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const filename = `expense_tracker_backup_${stamp}.sql`;

    // Log before streaming so the action is recorded even if the download
    // is interrupted partway through.
    await logAudit(db, req, 'database_backup', 'database', null,
      process.env.DB_NAME || 'expense_tracker',
      `Full database backup (${tables.length} tables) downloaded by ${req.user.role} (emp_id ${req.user.emp_id})`);

    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.write(`-- ExpenseTrack full database backup\n`);
    res.write(`-- Database: ${process.env.DB_NAME || ''}\n`);
    res.write(`-- Generated: ${new Date().toISOString()}\n`);
    res.write(`-- Generated by: emp_id ${req.user.emp_id} (${req.user.role})\n\n`);
    res.write(`SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n`);

    const BATCH = 200; // rows per INSERT statement — keeps statements a sane size
    for (const { TABLE_NAME: table } of tables) {
      const [[createRow]] = await db.query(`SHOW CREATE TABLE \`${table}\``);
      const createStmt = createRow['Create Table'];

      res.write(`--\n-- Table structure for \`${table}\`\n--\nDROP TABLE IF EXISTS \`${table}\`;\n${createStmt};\n\n`);

      const [rows] = await db.query(`SELECT * FROM \`${table}\``);
      if (rows.length) {
        res.write(`--\n-- Data for \`${table}\` (${rows.length} rows)\n--\n`);
        const cols    = Object.keys(rows[0]);
        const colList = cols.map(c => `\`${c}\``).join(',');
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch  = rows.slice(i, i + BATCH);
          const values = batch.map(r => `(${cols.map(c => db.escape(r[c])).join(',')})`).join(',\n');
          res.write(`INSERT INTO \`${table}\` (${colList}) VALUES\n${values};\n`);
        }
      }
      res.write('\n');
    }

    res.write('SET FOREIGN_KEY_CHECKS=1;\n');
    res.end();
  } catch (err) {
    console.error('Database backup failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Backup failed: ' + err.message });
    } else {
      // Headers already sent — can't change status now, just note the error
      // in the file and close the stream so the download isn't silently truncated.
      res.write(`\n-- ERROR: backup interrupted: ${err.message}\n`);
      res.end();
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// CLAIM TOTAL RECALCULATION — admin only
// Finds (and optionally fixes) expenses whose stored claim_amount doesn't
// match what their actual line items add up to today. A now-fixed bug in
// that calculation could leave older records with an under-counted
// claim_amount that never self-corrects — this tool finds and repairs them.
// Read-only check first, explicit list of IDs required to actually write,
// so nothing gets changed without a human reviewing it first.
// ═══════════════════════════════════════════════════════════════
async function fetchExpenseLineItems(expenseId) {
  const [[journey], [returns], [stay], [travel], [food], [hotel], [misc]] = await Promise.all([
    db.query('SELECT * FROM journey_allowance WHERE expense_id=?', [expenseId]),
    db.query('SELECT * FROM return_allowance  WHERE expense_id=?', [expenseId]),
    db.query('SELECT * FROM stay_allowance    WHERE expense_id=?', [expenseId]),
    db.query('SELECT * FROM travel_entries    WHERE expense_id=?', [expenseId]),
    db.query('SELECT * FROM food_expenses     WHERE expense_id=?', [expenseId]),
    db.query('SELECT * FROM hotel_expenses    WHERE expense_id=?', [expenseId]),
    db.query('SELECT * FROM misc_expenses     WHERE expense_id=?', [expenseId]),
  ]);
  return { journey, returns, stay, travel, food, hotel, misc };
}

router.get('/claim-amount-check', auth, adminOnly, async (req, res) => {
  try {
    const [expenses] = await db.query(
      `SELECT ef.expense_id, ef.claim_amount, ef.status, ef.is_single_day_travel,
              e.full_name AS employee_name, e.emp_code
       FROM expense_form ef
       JOIN employees e ON ef.emp_id = e.emp_id
       ORDER BY ef.expense_id`
    );

    const mismatches = [];
    for (const exp of expenses) {
      const { journey, returns, stay, travel, food, hotel, misc } = await fetchExpenseLineItems(exp.expense_id);
      const returnsToUse = exp.is_single_day_travel ? [] : returns;
      const correctTotal = computeClaimTotal(journey, returnsToUse, stay, travel, food, hotel, misc);
      const stored = parseFloat(exp.claim_amount) || 0;
      // Guard against floating point noise (e.g. 1909.999999999998 vs 1910)
      if (Math.abs(correctTotal - stored) > 0.01) {
        mismatches.push({
          expense_id:     exp.expense_id,
          employee_name:  exp.employee_name,
          emp_code:       exp.emp_code,
          status:         exp.status,
          stored_amount:  stored,
          correct_amount: Math.round(correctTotal * 100) / 100,
          difference:     Math.round((correctTotal - stored) * 100) / 100,
        });
      }
    }

    res.json({ total_checked: expenses.length, mismatches_found: mismatches.length, mismatches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

router.post('/claim-amount-check/fix', auth, adminOnly, async (req, res) => {
  try {
    const { expense_ids } = req.body;
    if (!Array.isArray(expense_ids) || expense_ids.length === 0) {
      return res.status(400).json({ message: 'expense_ids array is required — run the check first and pass back the IDs to fix.' });
    }

    const fixed = [];
    for (const expenseId of expense_ids) {
      const [[exp]] = await db.query(
        'SELECT claim_amount, is_single_day_travel FROM expense_form WHERE expense_id=?', [expenseId]
      );
      if (!exp) continue;

      const { journey, returns, stay, travel, food, hotel, misc } = await fetchExpenseLineItems(expenseId);
      const returnsToUse = exp.is_single_day_travel ? [] : returns;
      const correctTotal = Math.round(computeClaimTotal(journey, returnsToUse, stay, travel, food, hotel, misc) * 100) / 100;
      const oldAmount = parseFloat(exp.claim_amount) || 0;

      if (Math.abs(correctTotal - oldAmount) > 0.01) {
        await db.query('UPDATE expense_form SET claim_amount=? WHERE expense_id=?', [correctTotal, expenseId]);
        fixed.push({ expense_id: expenseId, old_amount: oldAmount, new_amount: correctTotal });
      }
    }

    if (fixed.length > 0) {
      await logAudit(db, req, 'claim_amount_corrected', 'expense', null,
        `${fixed.length} expense(s)`,
        `Recalculated claim_amount for ${fixed.length} expense(s): ` +
        fixed.map(f => `#${f.expense_id} (${f.old_amount} \u2192 ${f.new_amount})`).join(', '));
    }

    res.json({ fixed_count: fixed.length, fixed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

module.exports = router;
