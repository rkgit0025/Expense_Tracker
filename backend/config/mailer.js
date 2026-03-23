const nodemailer = require('nodemailer');

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false }
});

/**
 * Send user invitation email with temp password
 */
async function sendInviteEmail({ to, fullName, username, tempPassword, loginUrl }) {
  const appName = process.env.APP_NAME;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 0; }
      .wrapper { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.10); }
      .header  { background: #0f2744; padding: 32px 40px; text-align: center; }
      .header h1 { color: #f59e0b; font-size: 26px; margin: 0 0 4px; }
      .header p  { color: rgba(255,255,255,.6); font-size: 13px; margin: 0; }
      .body    { padding: 32px 40px; }
      .body h2 { color: #0f2744; font-size: 18px; margin: 0 0 12px; }
      .body p  { color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
      .creds   { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
      .creds-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
      .creds-row:last-child { border-bottom: none; }
      .creds-label { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .5px; }
      .creds-value { color: #0f2744; font-weight: 700; font-family: monospace; font-size: 15px; }
      .btn     { display: block; width: fit-content; margin: 24px auto 0; background: #f59e0b; color: #0f2744; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 32px; border-radius: 8px; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin-top: 20px; }
      .footer  { background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header">
        <h1>💼 ${appName}</h1>
        <p>Enterprise Expense Management System</p>
      </div>
      <div class="body">
        <h2>Welcome, ${fullName}! 👋</h2>
        <p>Your account has been created on <strong>${appName}</strong>. Use the credentials below to log in for the first time.</p>

        <div class="creds">
          <div class="creds-row">
            <span class="creds-label">Username</span>
            <span class="creds-value">${username}</span>
          </div>
          <div class="creds-row">
            <span class="creds-label">Temporary Password</span>
            <span class="creds-value">${tempPassword}</span>
          </div>
          <div class="creds-row">
            <span class="creds-label">Login URL</span>
            <span class="creds-value">${loginUrl}</span>
          </div>
        </div>

        <a href="${loginUrl}" class="btn">🔐 Login to ${appName}</a>

        <div class="warning">
          ⚠️ <strong>Important:</strong> You will be prompted to change your password immediately after your first login. This temporary password will expire after first use.
        </div>
      </div>
      <div class="footer">
        This is an automated message from ${appName}. Please do not reply.<br />
        If you did not expect this email, please contact your system administrator.
      </div>
    </div>
  </body>
  </html>`;

  const text = `
Welcome to ${appName}, ${fullName}!

Your account has been created. Here are your login details:

  Username:           ${username}
  Temporary Password: ${tempPassword}
  Login URL:          ${loginUrl}

IMPORTANT: You will be required to change your password after your first login.

This is an automated message. Do not reply to this email.
  `.trim();

  await transporter.sendMail({
    from:    process.env.MAIL_FROM || `"${appName}" <noreply@expensetrack.com>`,
    to,
    subject: `🎉 Your ${appName} account is ready`,
    text,
    html,
  });
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail({ to, fullName, tempPassword, loginUrl }) {
  const appName = process.env.APP_NAME || 'ExpenseTrack';

  await transporter.sendMail({
    from:    process.env.MAIL_FROM,
    to,
    subject: `🔑 Your ${appName} password has been reset`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#0f2744">Password Reset</h2>
        <p>Hi ${fullName},</p>
        <p>Your password on <strong>${appName}</strong> has been reset by an administrator.</p>
        <p><strong>Temporary Password:</strong> <code style="background:#f1f5f9;padding:4px 8px;border-radius:4px;font-size:16px">${tempPassword}</code></p>
        <p>Please <a href="${loginUrl}">log in</a> and change your password immediately.</p>
      </div>`,
  });
}

// Verify connection on startup (non-fatal)
transporter.verify().then(() => {
  console.log('✅  SMTP mail server connected');
}).catch(err => {
  console.warn('⚠️  SMTP not configured or unreachable:', err.message);
  console.warn('   Invite emails will not be sent. Check SMTP_* env vars.');
});

/**
 * Notify coordinator(s) that a new expense has been submitted for their review
 */
async function sendExpenseSubmissionEmail({ coordinatorEmails, submitterName, expenseId, projectName, claimAmount, loginUrl }) {
  const appName = process.env.APP_NAME;
  const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(claimAmount || 0);

  const html = `
  <!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;margin:0;padding:0;}
    .wrapper{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);}
    .header{background:#0f2744;padding:28px 36px;text-align:center;}
    .header h1{color:#f59e0b;font-size:22px;margin:0 0 4px;}
    .header p{color:rgba(255,255,255,.6);font-size:13px;margin:0;}
    .body{padding:28px 36px;}
    .body h2{color:#0f2744;font-size:17px;margin:0 0 10px;}
    .body p{color:#475569;font-size:14px;line-height:1.7;margin:0 0 14px;}
    .info-box{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:16px 0;}
    .info-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e2e8f0;font-size:13px;}
    .info-row:last-child{border-bottom:none;}
    .info-label{color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.5px;}
    .info-value{color:#0f2744;font-weight:600;}
    .btn{display:inline-block;background:#f59e0b;color:#0f2744;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;margin-top:8px;}
    .footer{background:#f8fafc;padding:16px 36px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;}
  </style></head><body>
  <div class="wrapper">
    <div class="header"><h1>💼 ${appName}</h1><p>Expense Approval Required</p></div>
    <div class="body">
      <h2>New Expense Awaiting Your Approval</h2>
      <p>An expense claim has been submitted and requires your review.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Submitted By</span><span class="info-value">${submitterName}</span></div>
        <div class="info-row"><span class="info-label">Expense ID</span><span class="info-value">#${expenseId}</span></div>
        <div class="info-row"><span class="info-label">Project</span><span class="info-value">${projectName || '—'}</span></div>
        <div class="info-row"><span class="info-label">Claim Amount</span><span class="info-value">${INR}</span></div>
      </div>
      <a href="${loginUrl}" class="btn">🔍 Review Expense #${expenseId}</a>
    </div>
    <div class="footer">This is an automated notification from ${appName}. Please do not reply.</div>
  </div></body></html>`;

  if (!coordinatorEmails || coordinatorEmails.length === 0) return;

  await transporter.sendMail({
    from:    process.env.MAIL_FROM,
    to:      coordinatorEmails.join(','),
    subject: `📋 Expense #${expenseId} submitted by ${submitterName} — Action Required`,
    html,
  });
}

module.exports = { sendInviteEmail, sendPasswordResetEmail, sendExpenseSubmissionEmail, sendExpenseActionEmail, transporter };

/**
 * Notify the expense submitter when their claim is approved or rejected at any stage
 */
async function sendExpenseActionEmail({
  submitterEmail, submitterName, actionByName, action,  // 'approved' | 'rejected'
  expenseId, projectName, claimAmount, comment, newStatus, loginUrl
}) {
  const appName  = process.env.APP_NAME || 'SED Expense Tracker';
  const INR      = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(claimAmount || 0);
  const isApproved = action === 'approved';

  const statusLabel = {
    coordinator_approved: 'Coordinator Approved',
    coordinator_rejected: 'Coordinator Rejected — Resubmit Required',
    hr_approved:          'HR Approved',
    hr_rejected:          'HR Rejected — Resubmit Required',
    accounts_approved:    '✅ Final Approval — Fully Approved',
    accounts_rejected:    'Accounts Rejected — Resubmit Required',
  }[newStatus] || newStatus;

  const accentColor = isApproved ? '#10b981' : '#ef4444';
  const bgColor     = isApproved ? '#d1fae5' : '#fee2e2';
  const icon        = isApproved ? '✅' : '❌';

  const html = `
  <!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;margin:0;padding:0;}
    .wrapper{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10);}
    .header{background:#0f2744;padding:28px 36px;text-align:center;}
    .header h1{color:#f59e0b;font-size:22px;margin:0 0 4px;}
    .header p{color:rgba(255,255,255,.6);font-size:13px;margin:0;}
    .status-banner{background:${bgColor};padding:16px 36px;text-align:center;border-bottom:3px solid ${accentColor};}
    .status-banner h2{color:${accentColor};margin:0;font-size:18px;}
    .body{padding:28px 36px;}
    .body p{color:#475569;font-size:14px;line-height:1.7;margin:0 0 14px;}
    .info-box{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:16px 0;}
    .info-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:13px;}
    .info-row:last-child{border-bottom:none;}
    .info-label{color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.5px;}
    .info-value{color:#0f2744;font-weight:600;}
    .comment-box{background:#fffbeb;border:1.5px solid #fcd34d;border-radius:8px;padding:14px 18px;margin:16px 0;font-size:13px;color:#92400e;line-height:1.6;}
    .btn{display:inline-block;background:#f59e0b;color:#0f2744;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;margin-top:8px;}
    .footer{background:#f8fafc;padding:16px 36px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;}
  </style></head><body>
  <div class="wrapper">
    <div class="header"><h1>💼 ${appName}</h1><p>Expense Claim Update</p></div>
    <div class="status-banner"><h2>${icon} ${statusLabel}</h2></div>
    <div class="body">
      <p>Dear <strong>${submitterName}</strong>,</p>
      <p>Your expense claim has been <strong>${isApproved ? 'approved' : 'reviewed and returned'}</strong> by <strong>${actionByName}</strong>.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Expense ID</span><span class="info-value">#${expenseId}</span></div>
        <div class="info-row"><span class="info-label">Project</span><span class="info-value">${projectName || '—'}</span></div>
        <div class="info-row"><span class="info-label">Claim Amount</span><span class="info-value">${INR}</span></div>
        <div class="info-row"><span class="info-label">Current Status</span><span class="info-value">${statusLabel}</span></div>
      </div>
      ${comment ? `<div class="comment-box"><strong>💬 Reviewer Comment:</strong><br/>${comment}</div>` : ''}
      ${!isApproved ? '<p><strong>Action Required:</strong> Please review the comment above, make the necessary corrections, and resubmit your expense.</p>' : ''}
      ${newStatus === 'accounts_approved' ? '<p>🎉 Your expense has been <strong>fully approved</strong> by all levels. No further action needed.</p>' : ''}
      <a href="${loginUrl}" class="btn">View Expense #${expenseId}</a>
    </div>
    <div class="footer">This is an automated notification from ${appName}. Please do not reply.</div>
  </div></body></html>`;

  await transporter.sendMail({
    from:    process.env.MAIL_FROM || `"${appName}" <noreply@expensetrack.com>`,
    to:      submitterEmail,
    subject: `${icon} Expense #${expenseId} ${isApproved ? 'Approved' : 'Returned'} — ${statusLabel}`,
    html,
  });
}
