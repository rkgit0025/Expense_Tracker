const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { authorize } = require('../middleware/auth');

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
