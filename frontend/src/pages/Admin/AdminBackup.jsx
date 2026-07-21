import React, { useState } from 'react';
import { useToast, useDialog } from '../../context/UIContext';

export default function AdminBackup() {
  const { success, error } = useToast();
  const { confirm } = useDialog();
  const [downloading, setDownloading] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState(null);

  const handleBackup = async () => {
    const ok = await confirm({
      title:        'Download Database Backup',
      message:      'Download a full backup of the database now?',
      details:      'This generates a .sql file containing every table and every row in the system — including employees, projects, and all expense records. Keep it somewhere safe.',
      confirmLabel: 'Download Backup',
      cancelLabel:  'Cancel',
      variant:      'primary',
    });
    if (!ok) return;

    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const resp  = await fetch('/api/admin/backup-database', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        error(body.message || 'Backup failed. Please try again.');
        return;
      }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      a.href     = url;
      a.download = `expense_tracker_backup_${stamp}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackupAt(new Date());
      success('Backup downloaded successfully.');
    } catch {
      error('Backup failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>🗄️ Backup Database</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
          Download a complete snapshot of the database whenever you need one.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span style={{ fontSize: 20 }}>💾</span>
          <span className="card-title">Full Database Backup</span>
        </div>

        <p style={{ fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.7, marginBottom: 16 }}>
          This generates a standard <code>.sql</code> file with every table's structure and data —
          employees, users, projects, allowance rates, and every expense claim with its full history.
          The file downloads straight to your device; nothing is stored on the server.
        </p>

        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          💡 <strong>Tip:</strong> Store backups somewhere outside this server (a shared drive, cloud
          storage, etc.) and take one before making any major changes — like bulk uploads, role
          changes, or deleting projects.
        </div>

        <button className="btn btn-amber" onClick={handleBackup} disabled={downloading}>
          {downloading ? '⏳ Preparing backup…' : '⬇️ Download Backup Now'}
        </button>

        {lastBackupAt && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)' }}>
            Last backup downloaded in this session at {lastBackupAt.toLocaleTimeString('en-IN')}.
          </div>
        )}
      </div>

      <div className="card" style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--amber)' }}>
        <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 6, fontSize: 14 }}>
          ⚠️ Handle backup files carefully
        </div>
        <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.7 }}>
          The backup file contains sensitive data — employee contact details, salaries-adjacent
          allowance rates, and financial claim history. Only share it with people who are authorised
          to see this data, and delete old copies you no longer need.
        </div>
      </div>
    </div>
  );
}
