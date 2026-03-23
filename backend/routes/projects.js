const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const xlsx    = require('xlsx');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const { logAudit }  = require('../config/audit');

const adminOrHR = authorize('admin', 'hr');

// in-memory multer for bulk upload parsing
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── GET all projects ──────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, e.full_name AS incharge_name
       FROM projects p
       LEFT JOIN employees e ON p.site_incharge_emp_code = e.emp_code
       ORDER BY p.project_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET bulk template — MUST be before /:id ──────────────────────────────────
router.get('/bulk-template', auth, adminOrHR, (req, res) => {
  const headers = ['project_code', 'project_name', 'site_location', 'project_coordinator_hod'];
  const sample  = ['PRJ-010', 'New Bridge Project', 'Mumbai', 'Rajesh Kumar'];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(() => ({ wch: 28 }));
  xlsx.utils.book_append_sheet(wb, ws, 'Projects');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="project_bulk_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── POST bulk upload — MUST be before /:id ───────────────────────────────────
router.post('/bulk-upload', auth, adminOrHR, uploadMem.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const wb   = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) return res.status(400).json({ message: 'File is empty.' });

    let created = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;

      if (!r.project_code || !r.project_name) {
        errors.push(`Row ${rowNum}: project_code and project_name are required.`);
        skipped++; continue;
      }

      try {
        await db.query(
          `INSERT INTO projects (project_code, project_name, site_location, project_coordinator_hod)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE project_name=VALUES(project_name)`,
          [String(r.project_code).trim(), String(r.project_name).trim(),
           r.site_location || '', r.project_coordinator_hod || '']
        );
        created++;
      } catch (e) {
        errors.push(`Row ${rowNum} (${r.project_code}): ${e.message}`);
        skipped++;
      }
    }

    res.json({
      message: `Bulk upload complete. ${created} created/updated, ${skipped} skipped.`,
      created, skipped, errors
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Bulk upload failed: ' + err.message });
  }
});

// ── GET single project ────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, e.full_name AS incharge_name
       FROM projects p
       LEFT JOIN employees e ON p.site_incharge_emp_code = e.emp_code
       WHERE p.project_id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Project not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST create project (admin + HR) ─────────────────────────────────────────
router.post('/', auth, adminOrHR, async (req, res) => {
  try {
    const { project_code, project_name, site_location, project_coordinator_hod, site_incharge_emp_code } = req.body;
    if (!project_code || !project_name)
      return res.status(400).json({ message: 'Project code and name are required.' });

    const [result] = await db.query(
      `INSERT INTO projects (project_code, project_name, site_location, project_coordinator_hod, site_incharge_emp_code)
       VALUES (?, ?, ?, ?, ?)`,
      [project_code, project_name, site_location || '', project_coordinator_hod || '', site_incharge_emp_code || null]
    );
    await logAudit(db, req, 'project_created', 'project', result.insertId,
      project_name, `Created project ${project_name} (${project_code})`);
    res.status(201).json({ message: 'Project created.', project_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Project code already exists.' });
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT update project (admin + HR) ──────────────────────────────────────────
router.put('/:id', auth, adminOrHR, async (req, res) => {
  try {
    const { project_code, project_name, site_location, project_coordinator_hod, site_incharge_emp_code } = req.body;
    await db.query(
      `UPDATE projects SET project_code=?, project_name=?, site_location=?,
        project_coordinator_hod=?, site_incharge_emp_code=?
       WHERE project_id=?`,
      [project_code, project_name, site_location || '', project_coordinator_hod || '',
       site_incharge_emp_code || null, req.params.id]
    );
    await logAudit(db, req, 'project_updated', 'project', req.params.id,
      project_name, `Updated project ${project_name} (${project_code})`);
    res.json({ message: 'Project updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── DELETE project (admin + HR) ───────────────────────────────────────────────
router.delete('/:id', auth, adminOrHR, async (req, res) => {
  try {
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) as cnt FROM expense_form WHERE project_id=?', [req.params.id]
    );
    if (cnt > 0)
      return res.status(409).json({
        message: `Cannot delete: ${cnt} expense claim${cnt > 1 ? 's are' : ' is'} linked to this project. Remove those expenses first.`
      });
    const [[proj]] = await db.query('SELECT project_code, project_name FROM projects WHERE project_id=?', [req.params.id]);
    await db.query('DELETE FROM projects WHERE project_id = ?', [req.params.id]);
    await logAudit(db, req, 'project_deleted', 'project', req.params.id,
      proj?.project_name, `Deleted project ${proj?.project_name} (${proj?.project_code})`);
    res.json({ message: 'Project deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ message: 'Cannot delete: this project is referenced by expense records.' });
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
