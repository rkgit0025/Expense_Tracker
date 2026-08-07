const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const xlsx    = require('xlsx');
const db      = require('../config/db');
const auth    = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const { logAudit }  = require('../config/audit');

const adminOrHR = authorize('admin', 'hr');

// Admin/HR can always manage project codes. A coordinator can too, but only
// if they're assigned (via coordinator_departments) to the "Projects"
// department — i.e. they're the coordinator responsible for that department,
// not just anyone with the coordinator role.
const canAddProjectCode = async (req, res, next) => {
  if (['admin', 'hr'].includes(req.user.role)) return next();
  if (req.user.role === 'coordinator') {
    try {
      const [[row]] = await db.query(
        `SELECT 1 FROM coordinator_departments cd
           JOIN departments d ON d.department_id = cd.department_id
          WHERE cd.coordinator_emp_id = ? AND d.department_name = 'Projects'
          LIMIT 1`,
        [req.user.emp_id]
      );
      if (row) return next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Server error.' });
    }
  }
  return res.status(403).json({ message: 'Forbidden: only admin, HR, or the Projects-department coordinator can add project codes.' });
};

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
  const headers = ['project_code', 'project_name', 'site_location', 'project_coordinator_hod_emp_code'];
  const sample  = ['PRJ-010', 'New Bridge Project', 'Mumbai', 'EMP-000'];

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

    // Look up employees so the coordinator/HOD column can be supplied as an
    // emp_code and auto-resolved to "Full Name (EMP_CODE)" — same format
    // used in the Project Coordinator / HOD dropdown elsewhere in the app.
    const [emps]   = await db.query('SELECT emp_code, full_name FROM employees');
    const empByCode = new Map(emps.map(e => [String(e.emp_code).toLowerCase().trim(), e]));

    let created = 0, updated = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;

      if (!r.project_code || !r.project_name) {
        errors.push(`Row ${rowNum}: project_code and project_name are required.`);
        skipped++; continue;
      }

      // Resolve coordinator/HOD by emp_code (new column). Also checks the
      // legacy free-text "project_coordinator_hod" column in case that value
      // is actually an emp_code (e.g. someone used an older template) — if it
      // matches a known employee it still gets auto-resolved to "Name (Code)".
      // Otherwise the legacy column is kept as-is (plain text name).
      let coordinatorHod = '';
      const coordCode = String(r.project_coordinator_hod_emp_code || '').trim();
      const legacyVal  = String(r.project_coordinator_hod || '').trim();
      if (coordCode) {
        const emp = empByCode.get(coordCode.toLowerCase());
        if (emp) {
          coordinatorHod = `${emp.full_name} (${emp.emp_code})`;
        } else {
          errors.push(`Row ${rowNum} (${r.project_code}): coordinator/HOD emp_code "${coordCode}" not found — left blank.`);
        }
      } else if (legacyVal) {
        const empByLegacyCode = empByCode.get(legacyVal.toLowerCase());
        coordinatorHod = empByLegacyCode
          ? `${empByLegacyCode.full_name} (${empByLegacyCode.emp_code})`
          : legacyVal;
      }

      try {
        // ON DUPLICATE KEY UPDATE now refreshes all editable fields, so
        // re-uploading the same project_code with changes actually updates it.
        const [result] = await db.query(
          `INSERT INTO projects (project_code, project_name, site_location, project_coordinator_hod)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             project_name=VALUES(project_name),
             site_location=VALUES(site_location),
             project_coordinator_hod=VALUES(project_coordinator_hod)`,
          [String(r.project_code).trim(), String(r.project_name).trim(),
           r.site_location || '', coordinatorHod]
        );
        if (result.affectedRows === 2) updated++;
        else if (result.affectedRows === 1) created++;
        else updated++;
      } catch (e) {
        errors.push(`Row ${rowNum} (${r.project_code}): ${e.message}`);
        skipped++;
      }
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

// ── POST create project (admin + HR + the Projects-department coordinator) ──
router.post('/', auth, canAddProjectCode, async (req, res) => {
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
