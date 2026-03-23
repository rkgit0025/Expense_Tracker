import React, { useRef, useState } from 'react';
import api from '../../api/axios';

const MAX_FILES   = 5;
const MAX_SIZE_MB = 5;

// Category config — check function decides whether the upload zone is enabled
const CATEGORIES = [
  {
    key:   'Travel',
    icon:  '✈️',
    label: 'Travel Receipts',
    hint:  'Fill Section 3 (Travel Entries) first',
    // enabled if travel section has at least one row with a from_location or from_date
    check: (sd) => !!(sd?.travel?.length && sd.travel.some(r => r.from_location || r.from_date)),
  },
  {
    key:   'Hotel',
    icon:  '🏨',
    label: 'Hotel Receipts',
    hint:  'Fill Section 5 (Hotel Expenses) first',
    check: (sd) => !!(sd?.hotel?.length && sd.hotel.some(r => r.location || r.from_date)),
  },
  {
    key:   'Food',
    icon:  '🍽️',
    label: 'Food Receipts',
    hint:  'Fill Section 4 (Food Expenses) first',
    check: (sd) => !!(sd?.food?.length && sd.food.some(r => r.location || r.from_date)),
  },
  {
    key:   'Miscellaneous',
    icon:  '📦',
    label: 'Miscellaneous Receipts',
    hint:  'Fill Section 6 (Miscellaneous) first',
    check: (sd) => !!(sd?.misc?.length && sd.misc.some(r => r.reason || r.expense_date)),
  },
  {
    key:   'Special-Permission',
    icon:  '⭐',
    label: 'Special Permission',
    hint:  '',
    check: () => true,  // always enabled
  },
];

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)            return bytes + ' B';
  if (bytes < 1024 * 1024)     return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function Section7_Receipts({
  expenseId,
  receipts = [],
  onRefresh,
  readOnly,
  sectionData,   // { travel, food, hotel, misc } — used to enable/disable categories
}) {
  const [uploading, setUploading] = useState({});
  const [errors,    setErrors]    = useState({});
  const fileRefs = useRef({});

  const byCategory = (cat) => receipts.filter(r => r.category === cat);

  const handleUpload = async (cat, files) => {
    if (!expenseId) {
      setErrors(p => ({ ...p, [cat]: 'Save the expense as a draft first before uploading.' }));
      return;
    }
    setErrors(p => ({ ...p, [cat]: '' }));

    const existing = byCategory(cat).length;
    if (existing + files.length > MAX_FILES) {
      setErrors(p => ({ ...p, [cat]: `Maximum ${MAX_FILES} files per category. You have ${existing} already.` }));
      return;
    }
    for (const f of files) {
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        setErrors(p => ({ ...p, [cat]: `"${f.name}" exceeds the ${MAX_SIZE_MB} MB limit.` }));
        return;
      }
    }

    const formData = new FormData();
    formData.append('category', cat);
    for (const f of files) formData.append('files', f);

    setUploading(p => ({ ...p, [cat]: true }));
    try {
      await api.post(`/expenses/${expenseId}/receipts`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onRefresh && onRefresh();
    } catch (err) {
      setErrors(p => ({ ...p, [cat]: err.response?.data?.message || 'Upload failed.' }));
    } finally {
      setUploading(p => ({ ...p, [cat]: false }));
      if (fileRefs.current[cat]) fileRefs.current[cat].value = '';
    }
  };

  const handleDelete = async (receiptId) => {
    // Handled by parent — delete directly
    try {
      await api.delete(`/expenses/${expenseId}/receipts/${receiptId}`);
      onRefresh && onRefresh();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const fileIcon = (name = '') => {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
    return '📎';
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="section-number">7</div>
        <span className="card-title">Receipts &amp; Attachments</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)' }}>
          Max {MAX_FILES} files per category · {MAX_SIZE_MB} MB each · JPG, PNG, PDF
        </span>
      </div>

      {!expenseId && !readOnly && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          💡 <strong>Save the expense as a draft first</strong>, then upload your receipts here.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {CATEGORIES.map(cat => {
          const catFiles  = byCategory(cat.key);
          const isEnabled = cat.check(sectionData);
          const canUpload = !readOnly && isEnabled && !!expenseId && catFiles.length < MAX_FILES;

          return (
            <div key={cat.key} style={{
              border: '1px solid var(--gray-100)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              opacity: isEnabled ? 1 : 0.55,
            }}>
              {/* Header */}
              <div style={{
                padding: '10px 14px',
                background: isEnabled ? 'var(--navy)' : 'var(--gray-400)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{cat.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'white' }}>{cat.label}</span>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                  {catFiles.length}/{MAX_FILES}
                </span>
              </div>

              {/* Disabled hint */}
              {!isEnabled && !readOnly && (
                <div style={{
                  padding: '8px 14px',
                  background: 'var(--gray-50)',
                  fontSize: 12,
                  color: 'var(--gray-400)',
                  borderBottom: '1px solid var(--gray-100)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  🔒 {cat.hint}
                </div>
              )}

              <div style={{ padding: 12 }}>
                {/* Existing uploaded files */}
                {catFiles.map(f => (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                    padding: '8px 10px',
                    background: 'var(--gray-50)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--gray-100)',
                  }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(f.original_name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.original_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{formatBytes(f.file_size)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <a href={`/uploads/${f.file_path}`} target="_blank" rel="noreferrer"
                        className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 11 }}>
                        View
                      </a>
                      {!readOnly && (
                        <button onClick={() => handleDelete(f.id)}
                          title="Remove"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Upload zone — only shown when enabled */}
                {canUpload && (
                  <div>
                    <label style={{ cursor: 'pointer', display: 'block' }}>
                      <input
                        type="file" multiple accept="image/*,.pdf"
                        style={{ display: 'none' }}
                        ref={el => fileRefs.current[cat.key] = el}
                        onChange={e => handleUpload(cat.key, Array.from(e.target.files))}
                        disabled={uploading[cat.key]}
                      />
                      <div className="upload-zone" style={{ padding: '16px 12px' }}>
                        {uploading[cat.key] ? (
                          <div>
                            <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Uploading…</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 22, marginBottom: 4 }}>📎</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                              Click to attach · JPG, PNG, PDF · max {MAX_SIZE_MB} MB
                            </div>
                          </div>
                        )}
                      </div>
                    </label>
                    {errors[cat.key] && (
                      <div className="alert alert-danger" style={{ marginTop: 6, padding: '6px 10px', fontSize: 11 }}>
                        {errors[cat.key]}
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {catFiles.length === 0 && !canUpload && (
                  <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--gray-300)', fontSize: 12 }}>
                    {readOnly ? 'No attachments' : isEnabled ? 'No files uploaded yet' : 'Section not filled in'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
