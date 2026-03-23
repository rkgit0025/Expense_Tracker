const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const PDFDocument = require('pdfkit');
const db      = require('../config/db');
const { sendExpenseSubmissionEmail, sendExpenseActionEmail } = require('../config/mailer');
const { logAudit } = require('../config/audit');
const auth    = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const upload  = require('../middleware/upload');

// ──────────────────────────────────────────────────────────────────────────────
// Helper: build role-based WHERE clause for expense listing
// Coordinator sees ONLY own expenses + expenses from their assigned departments
// ──────────────────────────────────────────────────────────────────────────────
async function buildListQuery(role, empId) {
  switch (role) {
    case 'employee':
      return { where: 'ef.emp_id = ?', params: [empId] };

    case 'coordinator': {
      const [depts] = await db.query(
        'SELECT department_id FROM coordinator_departments WHERE coordinator_emp_id = ?', [empId]
      );
      const deptIds = depts.map(d => d.department_id);
      if (deptIds.length === 0)
        return { where: 'ef.emp_id = ?', params: [empId] };
      const ph = deptIds.map(() => '?').join(',');
      // Own expenses + dept employees' submitted (non-draft) expenses, excluding self from dept filter
      return {
        where:  `(
          ef.emp_id = ?
          OR (
            e.department_id IN (${ph})
            AND ef.emp_id != ?
            AND ef.status IN ('pending','coordinator_approved','coordinator_rejected',
                              'hr_approved','hr_rejected','accounts_approved','accounts_rejected')
          )
        )`,
        params: [empId, ...deptIds, empId]
      };
    }

    case 'hr':
      return {
        where:  `(ef.emp_id = ? OR ef.status IN ('coordinator_approved','hr_approved','hr_rejected','accounts_approved','accounts_rejected'))`,
        params: [empId]
      };

    case 'accounts':
      return {
        where:  `(ef.emp_id = ? OR ef.status IN ('hr_approved','accounts_approved','accounts_rejected'))`,
        params: [empId]
      };

    default: // admin
      return { where: '1=1', params: [] };
  }
}

// ── GET /api/expenses ────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { where, params } = await buildListQuery(req.user.role, req.user.emp_id);
    const [rows] = await db.query(
      `SELECT ef.expense_id, ef.emp_id, ef.status, ef.claim_amount,
              ef.created_at, ef.submitted_at,
              ef.coordinator_comment, ef.hr_comment, ef.accounts_comment,
              e.full_name AS employee_name, e.emp_code, e.department_id,
              d.designation_name, dep.department_name,
              p.project_code, p.project_name
       FROM expense_form ef
       JOIN employees   e   ON ef.emp_id         = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       JOIN projects    p   ON ef.project_id      = p.project_id
       WHERE ${where}
       ORDER BY ef.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/expenses/export/csv  — must be BEFORE /:id to avoid param conflict ──
router.get('/export/csv', auth, async (req, res) => {
  try {
    if (!['coordinator','hr','accounts','admin'].includes(req.user.role))
      return res.status(403).json({ message: 'Access denied.' });

    const { where, params } = await buildListQuery(req.user.role, req.user.emp_id);
    const [rows] = await db.query(
      `SELECT ef.expense_id, ef.status, ef.claim_amount, ef.created_at, ef.submitted_at,
              e.full_name AS employee_name, e.emp_code, e.mobile_number,
              d.designation_name, dep.department_name,
              p.project_code, p.project_name,
              ef.coordinator_comment, ef.hr_comment, ef.accounts_comment
       FROM expense_form ef
       JOIN employees   e   ON ef.emp_id   = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       JOIN projects p ON ef.project_id = p.project_id
       WHERE ${where}
       ORDER BY ef.created_at DESC`,
      params
    );

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '';
    const fmtAmt  = (v) => parseFloat(v || 0).toFixed(2);
    const esc     = (v) => `"${String(v || '').replace(/"/g, '""')}"`;

    const headers = [
      'Expense ID','Employee Name','Employee Code','Department','Designation',
      'Project Code','Project Name','Claim Amount (INR)',
      'Status','Submitted Date','Created Date',
      'Coordinator Comment','HR Comment','Accounts Comment'
    ];

    const csvLines = [
      headers.map(esc).join(','),
      ...rows.map(r => [
        r.expense_id, r.employee_name, r.emp_code, r.department_name, r.designation_name,
        r.project_code, r.project_name, fmtAmt(r.claim_amount),
        r.status, fmtDate(r.submitted_at), fmtDate(r.created_at),
        r.coordinator_comment, r.hr_comment, r.accounts_comment
      ].map(esc).join(','))
    ];

    const csv = csvLines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses_export_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Export failed.' });
  }
});

// ── GET /api/expenses/:id ────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const [[form]] = await db.query(
      `SELECT ef.*, e.full_name AS employee_name, e.emp_code, e.mobile_number,
              e.department_id,
              d.designation_name, dep.department_name,
              p.project_code, p.project_name, p.site_location, p.project_coordinator_hod
       FROM expense_form ef
       JOIN employees   e   ON ef.emp_id         = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       JOIN projects    p   ON ef.project_id      = p.project_id
       WHERE ef.expense_id = ?`,
      [expenseId]
    );
    if (!form) return res.status(404).json({ message: 'Expense not found.' });

    const role  = req.user.role;
    const empId = req.user.emp_id;

    if (role === 'employee' && form.emp_id !== empId)
      return res.status(403).json({ message: 'Access denied.' });

    if (role === 'coordinator') {
      const [depts] = await db.query(
        'SELECT department_id FROM coordinator_departments WHERE coordinator_emp_id=?', [empId]
      );
      const deptIds = depts.map(d => d.department_id);
      if (form.emp_id !== empId && !deptIds.includes(form.department_id))
        return res.status(403).json({ message: 'Access denied. Not your department.' });
    }

    const [journey]  = await db.query('SELECT * FROM journey_allowance  WHERE expense_id=?', [expenseId]);
    const [returns]  = await db.query('SELECT * FROM return_allowance   WHERE expense_id=?', [expenseId]);
    const [stay]     = await db.query('SELECT * FROM stay_allowance     WHERE expense_id=?', [expenseId]);
    const [travel]   = await db.query('SELECT * FROM travel_entries     WHERE expense_id=?', [expenseId]);
    const [food]     = await db.query('SELECT * FROM food_expenses      WHERE expense_id=?', [expenseId]);
    const [hotel]    = await db.query('SELECT * FROM hotel_expenses     WHERE expense_id=?', [expenseId]);
    const [misc]     = await db.query('SELECT * FROM misc_expenses      WHERE expense_id=?', [expenseId]);
    const [receipts] = await db.query('SELECT * FROM expense_receipts   WHERE expense_id=?', [expenseId]);
    const [history]  = await db.query(
      `SELECT eh.*, e.full_name AS action_by_name
       FROM expense_history eh
       JOIN employees e ON eh.action_by_emp_id = e.emp_id
       WHERE eh.expense_id=? ORDER BY eh.action_at DESC`,
      [expenseId]
    );

    res.json({ form, journey, returns, stay, travel, food, hotel, misc, receipts, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/expenses (create draft) ───────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { project_id, journey, returns, stay, travel, food, hotel, misc } = req.body;
    if (!project_id) return res.status(400).json({ message: 'Project is required.' });

    const sumArr = (arr, key) => (arr || []).reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);
    const totalClaim = sumArr(journey,'total_amount') + sumArr(returns,'total_amount') +
                       sumArr(stay,'total_amount')    + sumArr(travel,'amount') +
                       sumArr(food,'amount')          + sumArr(hotel,'amount') + sumArr(misc,'amount');

    const [result] = await conn.query(
      `INSERT INTO expense_form (emp_id,project_id,claim_amount,status) VALUES (?,?,?,'draft')`,
      [req.user.emp_id, project_id, totalClaim]
    );
    const expenseId = result.insertId;

    await insertAllowances(conn, expenseId, req.user.emp_id, 'journey_allowance', journey);
    await insertAllowances(conn, expenseId, req.user.emp_id, 'return_allowance',  returns);
    await insertAllowances(conn, expenseId, req.user.emp_id, 'stay_allowance',    stay);
    await insertTravel(conn, expenseId, travel);
    await insertFood  (conn, expenseId, food);
    await insertHotel (conn, expenseId, hotel);
    await insertMisc  (conn, expenseId, misc);

    await conn.commit();

    await logAudit(db, req, 'expense_created', 'expense', expenseId,
      `Expense #${expenseId}`, `Created expense draft #${expenseId} (project_id: ${project_id})`);

    res.status(201).json({ message: 'Draft created.', expense_id: expenseId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error.', error: err.message });
  } finally { conn.release(); }
});

// ── PUT /api/expenses/:id (update draft) ────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const expenseId = req.params.id;
    const [[form]] = await conn.query('SELECT emp_id,status FROM expense_form WHERE expense_id=?', [expenseId]);
    if (!form) return res.status(404).json({ message: 'Not found.' });
    if (form.emp_id !== req.user.emp_id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Access denied.' });
    if (!['draft','coordinator_rejected','hr_rejected','accounts_rejected'].includes(form.status) && req.user.role !== 'admin')
      return res.status(400).json({ message: 'Cannot edit at this status.' });

    const { project_id, journey, returns, stay, travel, food, hotel, misc } = req.body;
    const sumArr = (arr, key) => (arr || []).reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);
    const totalClaim = sumArr(journey,'total_amount') + sumArr(returns,'total_amount') +
                       sumArr(stay,'total_amount')    + sumArr(travel,'amount') +
                       sumArr(food,'amount')          + sumArr(hotel,'amount') + sumArr(misc,'amount');

    await conn.query('UPDATE expense_form SET project_id=?,claim_amount=? WHERE expense_id=?',
      [project_id, totalClaim, expenseId]);

    for (const tbl of ['journey_allowance','return_allowance','stay_allowance',
                        'travel_entries','food_expenses','hotel_expenses','misc_expenses'])
      await conn.query(`DELETE FROM ${tbl} WHERE expense_id=?`, [expenseId]);

    await insertAllowances(conn, expenseId, req.user.emp_id, 'journey_allowance', journey);
    await insertAllowances(conn, expenseId, req.user.emp_id, 'return_allowance',  returns);
    await insertAllowances(conn, expenseId, req.user.emp_id, 'stay_allowance',    stay);
    await insertTravel(conn, expenseId, travel);
    await insertFood  (conn, expenseId, food);
    await insertHotel (conn, expenseId, hotel);
    await insertMisc  (conn, expenseId, misc);

    await conn.commit();
    await logAudit(db, req, 'expense_updated', 'expense', expenseId, `Expense #${expenseId}`, `Expense #${expenseId} draft updated`);
    res.json({ message: 'Expense updated.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  } finally { conn.release(); }
});

// ── POST /api/expenses/:id/submit ────────────────────────────────────────────
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const [[form]] = await db.query('SELECT emp_id,status FROM expense_form WHERE expense_id=?', [expenseId]);
    if (!form) return res.status(404).json({ message: 'Not found.' });
    if (form.emp_id !== req.user.emp_id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Access denied.' });
    if (!['draft','coordinator_rejected','hr_rejected','accounts_rejected'].includes(form.status))
      return res.status(400).json({ message: 'Cannot submit at this status.' });

    // If submitter is coordinator/hr/accounts, auto-skip the coordinator stage.
    // A coordinator cannot approve their own expense, so submitting to 'pending'
    // would deadlock it. We advance to coordinator_approved so HR can review it.
    const skipCoordinator = ['coordinator', 'hr', 'accounts'].includes(req.user.role);

    if (skipCoordinator) {
      await db.query(
        `UPDATE expense_form SET status='coordinator_approved', submitted_at=NOW(),
         coordinator_comment='Submitted by coordinator/senior role — coordinator stage auto-skipped',
         coordinator_reviewed_by=?, coordinator_reviewed_at=NOW()
         WHERE expense_id=?`,
        [req.user.emp_id, expenseId]
      );
      await logHistory(db, expenseId, req.user.emp_id, 'submitted', form.status, 'coordinator_approved',
        'Submitted by coordinator/senior role — sent directly to HR.');

      await logAudit(db, req, 'expense_submitted', 'expense', expenseId,
        `Expense #${expenseId}`, `Expense #${expenseId} submitted (senior role — coordinator stage skipped, sent to HR)`);

      return res.json({ message: 'Expense submitted. Sent directly to HR for approval.' });
    }

    // Regular employee — routes to their department coordinator first
    await db.query("UPDATE expense_form SET status='pending',submitted_at=NOW() WHERE expense_id=?", [expenseId]);
    await logHistory(db, expenseId, req.user.emp_id, 'submitted', form.status, 'pending', 'Expense submitted for coordinator approval.');

    // ── Email all coordinators assigned to the submitter's department ─────────
    try {
      const [[submitterEmp]] = await db.query(
        `SELECT e.full_name, e.department_id, p.project_name, ef.claim_amount
         FROM employees e
         JOIN expense_form ef ON ef.expense_id = ?
         JOIN projects p ON ef.project_id = p.project_id
         WHERE e.emp_id = ?`,
        [expenseId, req.user.emp_id]
      );

      if (submitterEmp?.department_id) {
        const [coordEmails] = await db.query(
          `SELECT u.email
           FROM coordinator_departments cd
           JOIN users u ON cd.coordinator_emp_id = u.emp_id
           WHERE cd.department_id = ? AND u.status = 'active'`,
          [submitterEmp.department_id]
        );

        const emails = coordEmails.map(c => c.email).filter(Boolean);
        if (emails.length > 0) {
          const loginUrl = `${process.env.CLIENT_URL}/expenses/${expenseId}`;
          await sendExpenseSubmissionEmail({
            coordinatorEmails: emails,
            submitterName:     submitterEmp.full_name,
            expenseId,
            projectName:       submitterEmp.project_name,
            claimAmount:       submitterEmp.claim_amount,
            loginUrl,
          });
        }
      }
    } catch (mailErr) {
      console.warn('Coordinator notification email failed (non-fatal):', mailErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    await logAudit(db, req, 'expense_submitted', 'expense', expenseId, `Expense #${expenseId}`, `Expense #${expenseId} submitted for coordinator approval`);
    res.json({ message: 'Expense submitted for coordinator approval.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/expenses/:id/approve ───────────────────────────────────────────
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const { comment } = req.body;

    // Mandatory comment
    if (!comment || !comment.trim())
      return res.status(400).json({ message: 'An approval reason / comment is required.' });

    const [[form]] = await db.query('SELECT emp_id,status FROM expense_form WHERE expense_id=?', [expenseId]);
    if (!form) return res.status(404).json({ message: 'Not found.' });

    // Block self-approval
    if (form.emp_id === req.user.emp_id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'You cannot approve your own expense claim.' });

    const role = req.user.role;
    let newStatus, updateFields;

    if (role === 'coordinator' && form.status === 'pending') {
      await assertCoordinatorDept(req.user.emp_id, form.emp_id);
      newStatus    = 'coordinator_approved';
      updateFields = `status='coordinator_approved',coordinator_comment=?,coordinator_reviewed_by=?,coordinator_reviewed_at=NOW()`;
    } else if (role === 'hr' && form.status === 'coordinator_approved') {
      newStatus    = 'hr_approved';
      updateFields = `status='hr_approved',hr_comment=?,hr_reviewed_by=?,hr_reviewed_at=NOW()`;
    } else if (role === 'accounts' && form.status === 'hr_approved') {
      newStatus    = 'accounts_approved';
      updateFields = `status='accounts_approved',accounts_comment=?,accounts_reviewed_by=?,accounts_reviewed_at=NOW()`;
    } else if (role === 'admin') {
      return res.status(403).json({ message: 'Administrators are not permitted to approve expenses. Please use the correct approval role.' });
    } else {
      return res.status(403).json({ message: 'Not authorised to approve at this stage.' });
    }

    await db.query(`UPDATE expense_form SET ${updateFields} WHERE expense_id=?`,
      [comment.trim(), req.user.emp_id, expenseId]);
    await logHistory(db, expenseId, req.user.emp_id, 'approved', form.status, newStatus, comment.trim());

    // ── Notify submitter by email (non-fatal) ─────────────────────────────
    try {
      const [[submitter]] = await db.query(
        `SELECT e.email, e.full_name, p.project_name, ef.claim_amount,
                reviewer.full_name AS reviewer_name
         FROM expense_form ef
         JOIN employees e ON ef.emp_id = e.emp_id
         JOIN projects p ON ef.project_id = p.project_id
         JOIN employees reviewer ON reviewer.emp_id = ?
         WHERE ef.expense_id = ?`,
        [req.user.emp_id, expenseId]
      );
      if (submitter?.email) {
        const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/expenses/${expenseId}`;
        await sendExpenseActionEmail({
          submitterEmail: submitter.email,
          submitterName:  submitter.full_name,
          actionByName:   submitter.reviewer_name,
          action:         'approved',
          expenseId,
          projectName:    submitter.project_name,
          claimAmount:    submitter.claim_amount,
          comment:        comment.trim(),
          newStatus,
          loginUrl,
        });
      }
    } catch (mailErr) {
      console.warn('Approval notification email failed (non-fatal):', mailErr.message);
    }

    await logAudit(db, req, 'expense_approved', 'expense', expenseId, `Expense #${expenseId}`, `Expense #${expenseId} approved by ${req.user.role} — new status: ${newStatus}`);
    res.json({ message: 'Expense approved.', new_status: newStatus });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/expenses/:id/reject ────────────────────────────────────────────
router.post('/:id/reject', auth, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const { comment } = req.body;

    // Mandatory comment
    if (!comment || !comment.trim())
      return res.status(400).json({ message: 'A reason for rejection is required.' });

    const [[form]] = await db.query('SELECT emp_id,status FROM expense_form WHERE expense_id=?', [expenseId]);
    if (!form) return res.status(404).json({ message: 'Not found.' });

    // Block self-rejection
    if (form.emp_id === req.user.emp_id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'You cannot reject your own expense claim.' });

    const role = req.user.role;
    let newStatus, updateFields;

    if (role === 'coordinator' && form.status === 'pending') {
      await assertCoordinatorDept(req.user.emp_id, form.emp_id);
      newStatus    = 'coordinator_rejected';
      updateFields = `status='coordinator_rejected',coordinator_comment=?,coordinator_reviewed_by=?,coordinator_reviewed_at=NOW()`;
    } else if (role === 'hr' && form.status === 'coordinator_approved') {
      newStatus    = 'hr_rejected';
      updateFields = `status='hr_rejected',hr_comment=?,hr_reviewed_by=?,hr_reviewed_at=NOW()`;
    } else if (role === 'accounts' && form.status === 'hr_approved') {
      newStatus    = 'accounts_rejected';
      updateFields = `status='accounts_rejected',accounts_comment=?,accounts_reviewed_by=?,accounts_reviewed_at=NOW()`;
    } else if (role === 'admin') {
      return res.status(403).json({ message: 'Administrators are not permitted to reject expenses. Please use the correct approval role.' });
    } else {
      return res.status(403).json({ message: 'Not authorised to reject at this stage.' });
    }

    await db.query(`UPDATE expense_form SET ${updateFields} WHERE expense_id=?`,
      [comment.trim(), req.user.emp_id, expenseId]);
    await logHistory(db, expenseId, req.user.emp_id, 'rejected', form.status, newStatus, comment.trim());

    // ── Notify submitter by email (non-fatal) ─────────────────────────────
    try {
      const [[submitter]] = await db.query(
        `SELECT e.email, e.full_name, p.project_name, ef.claim_amount,
                reviewer.full_name AS reviewer_name
         FROM expense_form ef
         JOIN employees e ON ef.emp_id = e.emp_id
         JOIN projects p ON ef.project_id = p.project_id
         JOIN employees reviewer ON reviewer.emp_id = ?
         WHERE ef.expense_id = ?`,
        [req.user.emp_id, expenseId]
      );
      if (submitter?.email) {
        const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/expenses/${expenseId}`;
        await sendExpenseActionEmail({
          submitterEmail: submitter.email,
          submitterName:  submitter.full_name,
          actionByName:   submitter.reviewer_name,
          action:         'rejected',
          expenseId,
          projectName:    submitter.project_name,
          claimAmount:    submitter.claim_amount,
          comment:        comment.trim(),
          newStatus,
          loginUrl,
        });
      }
    } catch (mailErr) {
      console.warn('Rejection notification email failed (non-fatal):', mailErr.message);
    }

    await logAudit(db, req, 'expense_rejected', 'expense', expenseId, `Expense #${expenseId}`, `Expense #${expenseId} rejected by ${req.user.role} — new status: ${newStatus}`);
    res.json({ message: 'Expense rejected. The submitter will be notified to resubmit with corrections.', new_status: newStatus });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── Receipts ─────────────────────────────────────────────────────────────────
router.post('/:id/receipts', auth, upload.array('files', 5), async (req, res) => {
  try {
    const expenseId = req.params.id;
    const { category } = req.body;
    if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded.' });

    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) as cnt FROM expense_receipts WHERE expense_id=? AND category=?',
      [expenseId, category]
    );
    if (parseInt(cnt) + req.files.length > 5)
      return res.status(400).json({ message: 'Maximum 5 attachments per category.' });

    await Promise.all(req.files.map(f =>
      db.query(
        'INSERT INTO expense_receipts (expense_id,category,file_path,original_name,file_size) VALUES (?,?,?,?,?)',
        [expenseId, category, f.filename, f.originalname, f.size]
      )
    ));
    res.json({ message: 'Files uploaded.', count: req.files.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/:id/receipts/:receiptId', auth, async (req, res) => {
  try {
    const [[receipt]] = await db.query('SELECT * FROM expense_receipts WHERE id=? AND expense_id=?',
      [req.params.receiptId, req.params.id]);
    if (!receipt) return res.status(404).json({ message: 'Not found.' });

    const fp = path.join(__dirname, '../uploads', receipt.file_path);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await db.query('DELETE FROM expense_receipts WHERE id=?', [req.params.receiptId]);
    res.json({ message: 'Receipt deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const [[form]] = await db.query('SELECT emp_id,status FROM expense_form WHERE expense_id=?', [req.params.id]);
    if (!form) return res.status(404).json({ message: 'Not found.' });
    if (form.emp_id !== req.user.emp_id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Access denied.' });
    if (form.status !== 'draft' && req.user.role !== 'admin')
      return res.status(400).json({ message: 'Only drafts can be deleted.' });
    await db.query('DELETE FROM expense_form WHERE expense_id=?', [req.params.id]);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── Private helpers ───────────────────────────────────────────────────────────
async function assertCoordinatorDept(coordinatorEmpId, submitterEmpId) {
  const [[emp]] = await db.query('SELECT department_id FROM employees WHERE emp_id=?', [submitterEmpId]);
  const [depts] = await db.query('SELECT department_id FROM coordinator_departments WHERE coordinator_emp_id=?', [coordinatorEmpId]);
  const deptIds = depts.map(d => d.department_id);
  if (!deptIds.includes(emp?.department_id)) {
    const err = new Error('This expense is not from your assigned department.');
    err.status = 403;
    throw err;
  }
}

async function insertAllowances(conn, expenseId, empId, table, rows) {
  if (!rows?.length) return;
  await conn.query(
    `INSERT INTO ${table} (expense_id,emp_id,from_date,to_date,scope,no_of_days,amount_per_day,total_amount) VALUES ?`,
    [rows.map(r => [expenseId, empId, r.from_date, r.to_date, r.scope, r.no_of_days, r.amount_per_day||0, r.total_amount||0])]
  );
}
async function insertTravel(conn, expenseId, rows) {
  if (!rows?.length) return;
  await conn.query('INSERT INTO travel_entries (expense_id,from_date,to_date,from_location,to_location,mode_of_travel,amount) VALUES ?',
    [rows.map(r => [expenseId, r.from_date, r.to_date, r.from_location, r.to_location, r.mode_of_travel, r.amount])]);
}
async function insertFood(conn, expenseId, rows) {
  if (!rows?.length) return;
  await conn.query('INSERT INTO food_expenses (expense_id,from_date,to_date,sharing,location,amount) VALUES ?',
    [rows.map(r => [expenseId, r.from_date, r.to_date, r.sharing, r.location, r.amount])]);
}
async function insertHotel(conn, expenseId, rows) {
  if (!rows?.length) return;
  await conn.query('INSERT INTO hotel_expenses (expense_id,from_date,to_date,sharing,location,amount) VALUES ?',
    [rows.map(r => [expenseId, r.from_date, r.to_date, r.sharing, r.location, r.amount])]);
}
async function insertMisc(conn, expenseId, rows) {
  if (!rows?.length) return;
  await conn.query('INSERT INTO misc_expenses (expense_id,expense_date,reason,location,amount) VALUES ?',
    [rows.map(r => [expenseId, r.expense_date, r.reason, r.location, r.amount])]);
}
async function logHistory(dbConn, expenseId, actionByEmpId, action, prevStatus, newStatus, comment) {
  await dbConn.query(
    `INSERT INTO expense_history (expense_id,action_by_emp_id,action,previous_status,new_status,comment) VALUES (?,?,?,?,?,?)`,
    [expenseId, actionByEmpId, action, prevStatus, newStatus, comment]
  );
}

// ── GET /api/expenses/:id/pdf  — individual expense PDF ──────────────────────
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const [[form]] = await db.query(
      `SELECT ef.*, e.full_name AS employee_name, e.emp_code, e.mobile_number,
              e.department_id, d.designation_name, dep.department_name,
              p.project_code, p.project_name, p.site_location, p.project_coordinator_hod
       FROM expense_form ef
       JOIN employees   e   ON ef.emp_id   = e.emp_id
       LEFT JOIN designations d   ON e.designation_id = d.designation_id
       LEFT JOIN departments  dep ON e.department_id  = dep.department_id
       JOIN projects    p   ON ef.project_id = p.project_id
       WHERE ef.expense_id = ?`, [expenseId]
    );
    if (!form) return res.status(404).json({ message: 'Not found.' });

    const [journey]  = await db.query('SELECT * FROM journey_allowance  WHERE expense_id=?', [expenseId]);
    const [returns]  = await db.query('SELECT * FROM return_allowance   WHERE expense_id=?', [expenseId]);
    const [stay]     = await db.query('SELECT * FROM stay_allowance     WHERE expense_id=?', [expenseId]);
    const [travel]   = await db.query('SELECT * FROM travel_entries     WHERE expense_id=?', [expenseId]);
    const [food]     = await db.query('SELECT * FROM food_expenses      WHERE expense_id=?', [expenseId]);
    const [hotel]    = await db.query('SELECT * FROM hotel_expenses     WHERE expense_id=?', [expenseId]);
    const [misc]     = await db.query('SELECT * FROM misc_expenses      WHERE expense_id=?', [expenseId]);

    const INR = (v) => `Rs. ${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expense_${expenseId}.pdf"`);
    doc.pipe(res);

    const W = 515; // usable width
    const NAVY = '#0f2744';
    const AMBER = '#f59e0b';
    const GRAY = '#64748b';
    const LightGray = '#f1f5f9';

    // ── Header ──
    doc.rect(40, 40, W, 56).fill(NAVY);
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold').text('EXPENSE CLAIM', 50, 52);
    doc.fillColor(AMBER).fontSize(11).text(`#${expenseId}`, 50, 74);
    doc.fillColor('white').fontSize(10).text(
      `Status: ${form.status.replace(/_/g,' ').toUpperCase()}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`,
      300, 62, { width: 240, align: 'right' }
    );

    let y = 112;

    // ── Section helper ──
    const section = (title, num) => {
      doc.rect(40, y, W, 22).fill(NAVY);
      doc.fillColor(AMBER).fontSize(8).font('Helvetica-Bold')
        .text(num, 45, y + 7);
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
        .text(title, 60, y + 7);
      y += 28;
    };

    const row2 = (l1, v1, l2, v2) => {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text(l1, 44, y);
      doc.fillColor('#1e293b').fontSize(9).font('Helvetica').text(v1 || '—', 44, y + 10);
      if (l2 !== undefined) {
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text(l2, 300, y);
        doc.fillColor('#1e293b').fontSize(9).font('Helvetica').text(v2 || '—', 300, y + 10);
      }
      y += 26;
    };

    const tableHeader = (cols) => {
      doc.rect(40, y, W, 16).fill(LightGray);
      let x = 44;
      cols.forEach(c => {
        doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text(c.label, x, y + 4, { width: c.w, align: c.align || 'left' });
        x += c.w;
      });
      y += 18;
    };

    const tableRow = (cols, vals, even) => {
      if (even) doc.rect(40, y, W, 14).fill('#f8fafc');
      let x = 44;
      cols.forEach((c, i) => {
        doc.fillColor('#334155').fontSize(8).font('Helvetica').text(String(vals[i] || '—'), x, y + 3, { width: c.w, align: c.align || 'left' });
        x += c.w;
      });
      y += 16;
    };

    const tableFoot = (label, amount) => {
      doc.rect(40, y, W, 18).fill(NAVY);
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold').text(label, 44, y + 4);
      doc.fillColor(AMBER).fontSize(10).font('Helvetica-Bold').text(amount, 44, y + 4, { width: W - 8, align: 'right' });
      y += 24;
    };

    // ── 1. Project & Employee ──
    section('Project & Employee Details', '1');
    row2('Employee', form.employee_name, 'Employee Code', form.emp_code);
    row2('Designation', form.designation_name, 'Department', form.department_name);
    row2('Project Code', form.project_code, 'Project Name', form.project_name);
    row2('Site Location', form.site_location, 'Coordinator / HOD', form.project_coordinator_hod);
    y += 4;

    // ── 2. Daily Allowance ──
    const daSections = [['Travel Journey', journey], ['Return Journey', returns], ['Stay Details', stay]];
    let daTotal = 0;
    daSections.forEach(([title, rows]) => {
      if (!rows || !rows.length) return;
      section(`Daily Allowance — ${title}`, '2');
      const cols = [
        { label: 'From Date', w: 80 }, { label: 'To Date', w: 80 },
        { label: 'Scope', w: 130 }, { label: 'Days', w: 40, align: 'right' },
        { label: 'Rate/Day', w: 80, align: 'right' }, { label: 'Total', w: 85, align: 'right' }
      ];
      tableHeader(cols);
      rows.forEach((r, i) => {
        tableRow(cols, [fmtDate(r.from_date), fmtDate(r.to_date), r.scope, r.no_of_days, INR(r.amount_per_day), INR(r.total_amount)], i % 2 === 0);
        daTotal += parseFloat(r.total_amount || 0);
      });
      y += 4;
    });

    // ── 3. Travel ──
    if (travel && travel.length) {
      section('Travel Entries', '3');
      const cols = [
        { label: 'From Date', w: 68 }, { label: 'To Date', w: 68 },
        { label: 'From', w: 90 }, { label: 'To', w: 90 },
        { label: 'Mode', w: 80 }, { label: 'Amount', w: 79, align: 'right' }
      ];
      tableHeader(cols);
      travel.forEach((r, i) => tableRow(cols, [fmtDate(r.from_date), fmtDate(r.to_date), r.from_location, r.to_location, r.mode_of_travel, INR(r.amount)], i % 2 === 0));
      y += 4;
    }

    // ── 4. Food ──
    if (food && food.length) {
      section('Food Expenses', '4');
      const cols = [
        { label: 'From', w: 80 }, { label: 'To', w: 80 },
        { label: 'Sharing', w: 60 }, { label: 'Location', w: 165 }, { label: 'Amount', w: 90, align: 'right' }
      ];
      tableHeader(cols);
      food.forEach((r, i) => tableRow(cols, [fmtDate(r.from_date), fmtDate(r.to_date), r.sharing, r.location, INR(r.amount)], i % 2 === 0));
      y += 4;
    }

    // ── 5. Hotel ──
    if (hotel && hotel.length) {
      section('Hotel Expenses', '5');
      const cols = [
        { label: 'Check-in', w: 80 }, { label: 'Check-out', w: 80 },
        { label: 'Sharing', w: 60 }, { label: 'Location', w: 165 }, { label: 'Amount', w: 90, align: 'right' }
      ];
      tableHeader(cols);
      hotel.forEach((r, i) => tableRow(cols, [fmtDate(r.from_date), fmtDate(r.to_date), r.sharing, r.location, INR(r.amount)], i % 2 === 0));
      y += 4;
    }

    // ── 6. Misc ──
    if (misc && misc.length) {
      section('Miscellaneous Expenses', '6');
      const cols = [
        { label: 'Date', w: 80 }, { label: 'Reason', w: 235 },
        { label: 'Location', w: 110 }, { label: 'Amount', w: 90, align: 'right' }
      ];
      tableHeader(cols);
      misc.forEach((r, i) => tableRow(cols, [fmtDate(r.expense_date), r.reason, r.location, INR(r.amount)], i % 2 === 0));
      y += 4;
    }

    // ── Total Summary ──
    y += 8;
    tableFoot('TOTAL CLAIM AMOUNT', INR(form.claim_amount));

    // ── Review comments ──
    if (form.coordinator_comment || form.hr_comment || form.accounts_comment) {
      y += 8;
      doc.rect(40, y, W, 22).fill(LightGray);
      doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('Review Comments', 44, y + 6);
      y += 28;
      if (form.coordinator_comment) {
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('Coordinator:', 44, y);
        doc.fillColor('#334155').fontSize(9).font('Helvetica').text(form.coordinator_comment, 120, y);
        y += 16;
      }
      if (form.hr_comment) {
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('HR:', 44, y);
        doc.fillColor('#334155').fontSize(9).font('Helvetica').text(form.hr_comment, 120, y);
        y += 16;
      }
      if (form.accounts_comment) {
        doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text('Accounts:', 44, y);
        doc.fillColor('#334155').fontSize(9).font('Helvetica').text(form.accounts_comment, 120, y);
        y += 16;
      }
    }

    // ── Footer ──
    doc.rect(40, doc.page.height - 50, W, 1).fill(LightGray);
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
      .text(`ExpenseTrack — Expense #${expenseId} — Confidential`, 40, doc.page.height - 40, { align: 'center', width: W });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'PDF generation failed: ' + err.message });
  }
});


module.exports = router;
