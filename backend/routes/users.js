const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const db       = require('../config/db');
const auth     = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const { sendInviteEmail, sendPasswordResetEmail } = require('../config/mailer');

const adminOnly = authorize('admin');
const adminOrHR = authorize('admin', 'hr');

// ── GET /api/users  (list all users with employee info) ──────────────────────
router.get('/', auth, adminOrHR, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.user_id, u.emp_id, u.username, u.email, u.role, u.status,
              u.must_change_password, u.created_at,
              e.emp_code, e.first_name, e.last_name, e.full_name, e.mobile_number,
              d.designation_name, dep.department_name
       FROM users u
       JOIN employees   e   ON u.emp_id         = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       ORDER BY e.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/users/unlinked-employees
//    Returns employees who do NOT yet have a user account ─────────────────────
router.get('/unlinked-employees', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.emp_id, e.emp_code, e.first_name, e.last_name, e.full_name, e.email,
              e.mobile_number, d.designation_name, dep.department_name
       FROM employees e
       LEFT JOIN users       u   ON e.emp_id         = u.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       WHERE u.emp_id IS NULL
       ORDER BY e.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/users  (create user from employee + send invite email) ─────────
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { emp_id, role, send_email } = req.body;

    if (!emp_id || !role)
      return res.status(400).json({ message: 'Employee and role are required.' });

    // Fetch employee details
    const [[emp]] = await db.query(
      'SELECT * FROM employees WHERE emp_id = ?', [emp_id]
    );
    if (!emp)
      return res.status(404).json({ message: 'Employee not found.' });

    // Check not already a user
    const [[existing]] = await db.query('SELECT user_id FROM users WHERE emp_id = ?', [emp_id]);
    if (existing)
      return res.status(409).json({ message: 'This employee already has a user account.' });

    // Generate a secure temp password  (e.g. "Temp#7kX9pQ")
    const tempPassword = 'Temp#' + crypto.randomBytes(5).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    const hash = await bcrypt.hash(tempPassword, 10);

    await db.query(
      `INSERT INTO users (emp_id, username, email, password, role, must_change_password)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [emp_id, emp.username, emp.email, hash, role]
    );

    // Send invite email (non-fatal if SMTP not configured)
    const loginUrl = `${process.env.CLIENT_URL}/login`;
    let emailSent  = false;
    let emailError = null;

    if (send_email !== false) {
      try {
        await sendInviteEmail({
          to:           emp.email,
          fullName:     emp.full_name || `${emp.first_name} ${emp.last_name}`,
          username:     emp.username,
          tempPassword,
          loginUrl,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error('Invite email failed:', mailErr.message);
        emailError = mailErr.message;
      }
    }

    res.status(201).json({
      message: emailSent
        ? `User created and invite email sent to ${emp.email}.`
        : `User created. ${emailError ? 'Email could not be sent: ' + emailError : 'Email sending was skipped.'}`,
      tempPassword: process.env.NODE_ENV !== 'production' ? tempPassword : undefined,
      email_sent: emailSent,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Username or email already in use.' });
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/users/:id  (update role / status) ───────────────────────────────
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { role, status, inactive_reason } = req.body;
    await db.query(
      'UPDATE users SET role=?, status=?, inactive_reason=? WHERE user_id=?',
      [role, status || 'active', inactive_reason || null, req.params.id]
    );
    res.json({ message: 'User updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PATCH /api/users/:id/status  (toggle active/inactive) ────────────────────
router.patch('/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { status, inactive_reason } = req.body;
    await db.query('UPDATE users SET status=?, inactive_reason=? WHERE user_id=?',
      [status, inactive_reason || null, req.params.id]);
    res.json({ message: 'Status updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/users/:id/resend-invite  (resend with new temp password) ───────
router.post('/:id/resend-invite', auth, adminOnly, async (req, res) => {
  try {
    const [[user]] = await db.query(
      `SELECT u.*, e.full_name, e.first_name, e.last_name, e.email AS emp_email
       FROM users u JOIN employees e ON u.emp_id = e.emp_id
       WHERE u.user_id = ?`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const tempPassword = 'Temp#' + crypto.randomBytes(5).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    const hash = await bcrypt.hash(tempPassword, 10);
    await db.query('UPDATE users SET password=?, must_change_password=1 WHERE user_id=?', [hash, req.params.id]);

    const loginUrl = `${process.env.CLIENT_URL}/login`;
    await sendInviteEmail({
      to:           user.email,
      fullName:     user.full_name || `${user.first_name} ${user.last_name}`,
      username:     user.username,
      tempPassword,
      loginUrl,
    });

    res.json({
      message: `Invite resent to ${user.email}.`,
      tempPassword: process.env.NODE_ENV !== 'production' ? tempPassword : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to resend invite: ' + err.message });
  }
});

// ── POST /api/users/:id/reset-password ───────────────────────────────────────
router.post('/:id/reset-password', auth, adminOnly, async (req, res) => {
  try {
    const [[user]] = await db.query(
      `SELECT u.*, e.full_name, e.first_name, e.last_name, e.email AS emp_email
       FROM users u JOIN employees e ON u.emp_id = e.emp_id
       WHERE u.user_id = ?`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const tempPassword = 'Reset#' + crypto.randomBytes(5).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    const hash = await bcrypt.hash(tempPassword, 10);
    await db.query('UPDATE users SET password=?, must_change_password=1 WHERE user_id=?', [hash, req.params.id]);

    const loginUrl = `${process.env.CLIENT_URL}/login`;
    try {
      await sendPasswordResetEmail({
        to:           user.email,
        fullName:     user.full_name || `${user.first_name} ${user.last_name}`,
        tempPassword,
        loginUrl,
      });
    } catch (mailErr) {
      console.warn('Reset email failed:', mailErr.message);
    }

    res.json({
      message: 'Password reset successfully.',
      tempPassword: process.env.NODE_ENV !== 'production' ? tempPassword : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── DELETE /api/users/:id ────────────────────────────────────────────────────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE user_id=?', [req.params.id]);
    res.json({ message: 'User account removed. Employee record is kept.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
