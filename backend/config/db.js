const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,

  // ── Pool sizing ──────────────────────────────────────────────
  waitForConnections: true,
  connectionLimit:    15,       // max simultaneous connections
  queueLimit:         30,       // max queued requests before error

  // ── Keep-alive: prevent "Connection lost: PROTOCOL_CONNECTION_LOST" ──
  enableKeepAlive:    true,
  keepAliveInitialDelay: 10000, // ping every 10 s of idle

  // ── Query performance ─────────────────────────────────────────
  timezone:           'Z',      // store all dates as UTC
  charset:            'utf8mb4',
  multipleStatements: false,    // security: prevent SQL injection stacking

  // ── Timeouts ──────────────────────────────────────────────────
  connectTimeout:     10000,    // 10 s to establish connection
});

const promisePool = pool.promise();

// Test connection on startup
pool.getConnection((err, conn) => {
  if (err) { console.error('❌  MySQL connection error:', err.message); return; }
  console.log('✅  MySQL connected — pool ready');
  conn.release();
});

module.exports = promisePool;
