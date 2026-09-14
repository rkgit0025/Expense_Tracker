const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const { logAudit }  = require('../config/audit');

// GET flat per-km rates for Own Bike / Own Car — any authenticated user
// (needed by every employee filling out Travel Entries, not just admin/HR).
// Returns { 'Own Bike': 5, 'Own Car': 10 }, defaulting a mode to 0 if the
// table doesn't exist yet (migration not run) or has no row for it.
router.get('/vehicle-rates', auth, async (req, res) => {
  try {
    const [tables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicle_rates'`
    );
    const rateMap = { 'Own Bike': 0, 'Own Car': 0 };
    if (tables.length) {
      const [rows] = await db.query('SELECT mode, rate_per_km FROM vehicle_rates');
      rows.forEach(r => { rateMap[r.mode] = parseFloat(r.rate_per_km); });
    }
    res.json(rateMap);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST / PUT upsert a flat vehicle rate (admin + HR)
router.post('/vehicle-rates', auth, authorize('admin', 'hr'), async (req, res) => {
  try {
    const { mode, rate_per_km } = req.body;
    if (!['Own Bike', 'Own Car'].includes(mode)) {
      return res.status(400).json({ message: 'Mode must be "Own Bike" or "Own Car".' });
    }
    await db.query(
      `INSERT INTO vehicle_rates (mode, rate_per_km) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE rate_per_km = VALUES(rate_per_km)`,
      [mode, rate_per_km]
    );
    await logAudit(db, req, 'vehicle_rate_saved', 'allowance', null,
      `Mode: ${mode}`, `Vehicle rate saved — mode:${mode}, rate_per_km:${rate_per_km}`);
    res.json({ message: 'Rate saved.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET rates for current user's designation
router.get('/my-rates', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ar.id, ar.scope, ar.amount, d.designation_name
       FROM allowance_rates ar
       JOIN designations d ON ar.designation_id = d.designation_id
       WHERE ar.designation_id = ?`,
      [req.user.designation_id]
    );
    // Build a map  { 'DA-Metro': 500, 'DA-Non-Metro': 350, 'Site-Allowance': 200 }
    const rateMap = {};
    rows.forEach(r => { rateMap[r.scope] = parseFloat(r.amount); });
    res.json({ rates: rows, rateMap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET all rates (admin / HR)
router.get('/', auth, authorize('admin', 'hr'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ar.*, d.designation_name
       FROM allowance_rates ar
       JOIN designations d ON ar.designation_id = d.designation_id
       ORDER BY d.designation_name, ar.scope`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST / PUT upsert rate (admin + HR)
router.post('/', auth, authorize('admin', 'hr'), async (req, res) => {
  try {
    const { designation_id, scope, amount } = req.body;
    await db.query(
      `INSERT INTO allowance_rates (designation_id, scope, amount) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
      [designation_id, scope, amount]
    );
    await logAudit(db, req, 'allowance_rate_saved', 'allowance', null,
      `Scope: ${scope}`, `Allowance rate saved — designation_id:${designation_id}, scope:${scope}, amount:${amount}`);
    res.json({ message: 'Rate saved.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE rate (admin + HR)
router.delete('/:id', auth, authorize('admin', 'hr'), async (req, res) => {
  try {
    await db.query('DELETE FROM allowance_rates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Rate deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
