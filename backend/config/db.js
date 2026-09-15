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

// The driver's `timezone: 'Z'` option (above) tells mysql2 to treat every
// date it reads/writes as UTC — but that's a JS-side interpretation only.
// It does NOT make the *server's own* NOW()/CURRENT_TIMESTAMP return UTC —
// those depend entirely on the MySQL server's configured time_zone, which
// on an India-hosted server is very often already IST. When that's the
// case, a bare NOW() returns IST, mysql2 then mislabels that IST value as
// UTC, and the frontend's UTC→IST display conversion runs a SECOND time on
// top of it — e.g. an 11:17 AM login ends up displaying as 10:17 PM (two
// +5:30 shifts stacked). Setting the session's own time_zone to UTC on
// every connection makes NOW() reliably return true UTC regardless of the
// server's own default, which is what the rest of the app already assumes.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'", (err) => {
    if (err) console.error('⚠️  Could not set session time_zone to UTC:', err.message);
  });
});

// Test connection on startup
pool.getConnection((err, conn) => {
  if (err) { console.error('❌  MySQL connection error:', err.message); return; }
  console.log('✅  MySQL connected — pool ready');
  conn.release();
});

module.exports = promisePool;
