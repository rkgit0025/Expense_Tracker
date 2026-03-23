const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/db');
const auth     = require('../middleware/auth');

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password are required.' });

    const [rows] = await db.query(
      `SELECT u.user_id, u.emp_id, u.username, u.email, u.password, u.role, u.status,
              u.must_change_password,
              e.emp_code, e.first_name, e.last_name, e.full_name, e.mobile_number,
              e.designation_id, e.department_id, e.profile_image_path,
              d.designation_name, dep.department_name
       FROM users u
       JOIN employees   e   ON u.emp_id         = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       WHERE u.username = ?`,
      [username]
    );

    if (rows.length === 0)
      return res.status(401).json({ message: 'Invalid username or password.' });

    const user = rows[0];

    if (user.status !== 'active')
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact HR.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: 'Invalid username or password.' });

    const payload = {
      user_id:        user.user_id,
      emp_id:         user.emp_id,
      emp_code:       user.emp_code,
      role:           user.role,
      designation_id: user.designation_id
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({
      token,
      user: {
        user_id:               user.user_id,
        emp_id:                user.emp_id,
        emp_code:              user.emp_code,
        username:              user.username,
        email:                 user.email,
        full_name:             user.full_name || `${user.first_name} ${user.last_name}`,
        first_name:            user.first_name,
        last_name:             user.last_name,
        mobile_number:         user.mobile_number,
        role:                  user.role,
        designation_id:        user.designation_id,
        designation_name:      user.designation_name,
        department_id:         user.department_id,
        department_name:       user.department_name,
        profile_image:         user.profile_image_path,
        must_change_password:  !!user.must_change_password,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.user_id, u.emp_id, u.username, u.email, u.role, u.status,
              e.emp_code, e.first_name, e.last_name, e.full_name, e.mobile_number,
              e.designation_id, e.department_id, e.profile_image_path,
              d.designation_name, dep.department_name
       FROM users u
       JOIN employees   e   ON u.emp_id         = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       WHERE u.user_id = ?`,
      [req.user.user_id]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: 'User not found.' });

    const user = rows[0];
    res.json({
      user_id:          user.user_id,
      emp_id:           user.emp_id,
      emp_code:         user.emp_code,
      username:         user.username,
      email:            user.email,
      full_name:        user.full_name || `${user.first_name} ${user.last_name}`,
      role:             user.role,
      designation_id:   user.designation_id,
      designation_name: user.designation_name,
      department_id:    user.department_id,
      department_name:  user.department_name,
      profile_image:    user.profile_image_path
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const [rows] = await db.query('SELECT password FROM users WHERE user_id = ?', [req.user.user_id]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(current_password, rows[0].password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=?, must_change_password=0 WHERE user_id=?', [hash, req.user.user_id]);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/auth/seed  (dev only – creates admin user) ─────────────────────
router.post('/seed', async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ message: 'Not allowed in production.' });
  try {
    const hash = await bcrypt.hash('Admin@123', 10);
    await db.query(
      `INSERT INTO employees (emp_code,username,first_name,last_name,full_name,email,mobile_number,designation_id,department_id)
       VALUES ('EMP001','admin_user','System','Admin','System Admin','admin@company.com','9999999999',3,3)
       ON DUPLICATE KEY UPDATE emp_code=emp_code`,
      []
    );
    const [[emp]] = await db.query("SELECT emp_id FROM employees WHERE emp_code='EMP001'");
    await db.query(
      `INSERT INTO users (emp_id,username,email,password,role)
       VALUES (?,?,?,?,'admin')
       ON DUPLICATE KEY UPDATE password=?`,
      [emp.emp_id, 'admin_user', 'admin@company.com', hash, hash]
    );
    res.json({ message: 'Admin seeded. Login: admin_user / Admin@123' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Seed error', error: err.message });
  }
});

module.exports = router;
