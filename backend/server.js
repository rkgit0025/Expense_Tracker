const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const compression  = require('compression');
require('dotenv').config();

const app = express();

// ── Gzip compression — reduces response size 60–80% ─────────────────────────
app.use(compression({
  level: 6,           // sweet spot between speed and size
  threshold: 1024,    // only compress responses > 1 KB
  filter: (req, res) => {
    // Don't compress SSE streams, images, or PDFs (already compressed)
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  }
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:         process.env.CLIENT_URL || 'http://localhost:5173',
  credentials:    true,
  methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Serve uploaded files with cache headers ───────────────────────────────────
// Uploaded receipts/documents rarely change so cache them aggressively
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ── Security + cache headers for all API responses ───────────────────────────
app.use('/api', (req, res, next) => {
  res.setHeader('X-Content-Type-Options',  'nosniff');
  res.setHeader('X-Frame-Options',         'DENY');
  res.setHeader('X-XSS-Protection',        '1; mode=block');
  // API responses should not be cached by browsers
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/expenses',   require('./routes/expenses'));
app.use('/api/projects',   require('./routes/projects'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/allowances', require('./routes/allowances'));
app.use('/api/users',      require('./routes/users'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ message: 'File size exceeds 5 MB limit.' });
  res.status(500).json({ message: err.message || 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀  ExpenseTrack API  →  http://localhost:${PORT}`);
  console.log(`📄  Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⚡  Gzip compression: enabled`);
});
