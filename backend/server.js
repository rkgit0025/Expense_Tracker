const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL,
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/expenses',   require('./routes/expenses'));
app.use('/api/projects',   require('./routes/projects'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/allowances', require('./routes/allowances'));
app.use('/api/users',      require('./routes/users'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ message: 'File size exceeds 5 MB limit.' });
  res.status(500).json({ message: err.message || 'Internal server error.' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`🚀  Expense Tracker API running on http://localhost:${PORT}`);
  console.log(`📄  Environment: ${process.env.NODE_ENV}`);
});
