const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const xlsx    = require('xlsx');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { authorize } = require('../middleware/auth');

const adminOnly = authorize('admin');
const adminOrHR = authorize('admin', 'hr');

// multer: in-memory for bulk upload
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════

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

    if (!emp_code || !first_name || !last_name || !email)
      return res.status(400).json({ message: 'Employee code, first name, last name and email are required.' });

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

    let created = 0, skipped = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const rowNum = i + 2;
      if (!r.emp_code || !r.first_name || !r.last_name || !r.email) {
        errors.push(`Row ${rowNum}: emp_code, first_name, last_name, email required.`); skipped++; continue;
      }
      const full_name      = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ');
      const username       = String(r.email).toLowerCase().trim();
      const designation_id = desigMap[String(r.designation_name||'').toLowerCase().trim()] || null;
      const department_id  = deptMap[String(r.department_name||'').toLowerCase().trim()]   || null;
      const location_id    = locMap[String(r.location_name||'').toLowerCase().trim()]      || null;
      try {
        await db.query(
          `INSERT INTO employees (emp_code,username,first_name,middle_name,last_name,full_name,email,mobile_number,gender,category,birth_of_date,date_of_joining,designation_id,department_id,location_id,first_reporting_manager_emp_code,second_reporting_manager_emp_code)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE emp_code=emp_code`,
          [String(r.emp_code),username,r.first_name,r.middle_name||null,r.last_name,full_name,username,r.mobile_number||null,r.gender||null,r.category||'Staff',r.birth_of_date||null,r.date_of_joining||null,designation_id,department_id,location_id,r.first_reporting_manager_emp_code||null,r.second_reporting_manager_emp_code||null]
        );
        created++;
      } catch (e) { errors.push(`Row ${rowNum} (${r.emp_code}): ${e.message}`); skipped++; }
    }
    res.json({ message: `Bulk upload complete. ${created} created, ${skipped} skipped.`, created, skipped, errors });
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

    if (!emp_code || !first_name || !last_name || !email)
      return res.status(400).json({ message: 'Employee code, first name, last name and email are required.' });

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
    res.json({ message: 'Employee updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/employees/:id', auth, adminOrHR, async (req, res) => {
  try {
    await db.query('DELETE FROM employees WHERE emp_id=?', [req.params.id]);
    res.json({ message: 'Employee deleted.' });
  } catch (err) {
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
    const crypto = require('crypto');
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

    res.status(201).json({
      message:      `User account created for ${emp.full_name}.`,
      tempPassword,            // Always return in response so admin can share manually
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
    const crypto      = require('crypto');
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

    res.json({
      message:     `Password reset for ${userRow.full_name}.`,
      tempPassword, // show in UI so admin can share manually if email fails
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
    res.json({ total_expenses, pending, approved, total_claim, total_employees, total_users });
  } catch (err) { res.status(500).json({ message: 'Server error.' }); }
});

module.exports = router;
