import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useToast, useDialog } from '../../context/UIContext';

// ── Generic CRUD section component ───────────────────────────────────────────
function MasterSection({ title, icon, items, nameKey, idKey, onAdd, onDelete, addLabel = 'Add' }) {
  const [newName, setNewName] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [search,  setSearch]  = useState('');

  const filtered = items.filter(i => !search || i[nameKey]?.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await onAdd(newName.trim());
      setNewName('');
    } finally { setAdding(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span className="card-title">{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)' }}>
          {items.length} total
        </span>
      </div>

      {/* Add form */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="form-control"
          placeholder={`New ${title.toLowerCase()} name…`}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-amber" onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? '⏳' : `➕ ${addLabel}`}
        </button>
      </div>

      {/* Search */}
      {items.length > 5 && (
        <input className="form-control" placeholder="🔍 Search…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
      )}

      {/* List */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-300)', fontSize: 13 }}>
            No {title.toLowerCase()} found.
          </div>
        ) : (
          filtered.map(item => (
            <div key={item[idKey]} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 'var(--radius)',
              border: '1px solid var(--gray-100)',
              marginBottom: 6, background: 'var(--white)',
              transition: 'background .1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--white)'}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)' }}>
                {item[nameKey]}
              </span>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => onDelete(item[idKey], item[nameKey])}
                style={{ padding: '3px 10px', fontSize: 11 }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Master Data page ─────────────────────────────────────────────────────
export default function AdminMasterData() {
  const { success, error } = useToast();
  const { confirm }        = useDialog();

  const [departments,  setDepartments]  = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations,    setLocations]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState('departments');

  const load = async () => {
    setLoading(true);
    try {
      const [d, des, l] = await Promise.all([
        api.get('/admin/departments'),
        api.get('/admin/designations'),
        api.get('/admin/locations'),
      ]);
      setDepartments(d.data);
      setDesignations(des.data);
      setLocations(l.data);
    } catch { error('Failed to load data.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Department handlers ───────────────────────────────────────────────────
  const addDept = async (name) => {
    try {
      await api.post('/admin/departments', { department_name: name });
      success(`Department "${name}" created.`);
      load();
    } catch (err) { error(err.response?.data?.message || 'Failed to add.'); }
  };

  const delDept = async (id, name) => {
    const ok = await confirm({
      title: 'Delete Department',
      message: `Delete "${name}"? Employees in this department will lose their department assignment.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/departments/${id}`);
      success(`Department "${name}" deleted.`);
      load();
    } catch (err) { error(err.response?.data?.message || 'Delete failed.'); }
  };

  // ── Designation handlers ──────────────────────────────────────────────────
  const addDesig = async (name) => {
    try {
      await api.post('/admin/designations', { designation_name: name });
      success(`Designation "${name}" created.`);
      load();
    } catch (err) { error(err.response?.data?.message || 'Failed to add.'); }
  };

  const delDesig = async (id, name) => {
    const ok = await confirm({
      title: 'Delete Designation',
      message: `Delete "${name}"? This will remove allowance rates for this designation too.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/designations/${id}`);
      success(`Designation "${name}" deleted.`);
      load();
    } catch (err) { error(err.response?.data?.message || 'Delete failed.'); }
  };

  // ── Location handlers ─────────────────────────────────────────────────────
  const addLoc = async (name) => {
    try {
      await api.post('/admin/locations', { location_name: name });
      success(`Location "${name}" created.`);
      load();
    } catch (err) { error(err.response?.data?.message || 'Failed to add.'); }
  };

  const delLoc = async (id, name) => {
    const ok = await confirm({
      title: 'Delete Location',
      message: `Delete "${name}"?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/locations/${id}`);
      success(`Location "${name}" deleted.`);
      load();
    } catch (err) { error(err.response?.data?.message || 'Delete failed.'); }
  };

  const TABS = [
    { key: 'departments',  label: 'Departments',  icon: '🏢', count: departments.length },
    { key: 'designations', label: 'Designations', icon: '🎖️', count: designations.length },
    { key: 'locations',    label: 'Locations',    icon: '📍', count: locations.length },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>🗂️ Master Data</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>
          Manage departments, designations and office locations used across the system.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--gray-100)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer',
            background: 'transparent', fontFamily: 'var(--font)',
            fontSize: 14, fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? 'var(--navy)' : 'var(--gray-400)',
            borderBottom: tab === t.key ? '3px solid var(--navy)' : '3px solid transparent',
            marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.icon} {t.label}
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
              background: tab === t.key ? 'var(--navy)' : 'var(--gray-100)',
              color: tab === t.key ? 'white' : 'var(--gray-400)',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-wrap"><div className="spinner"/></div>
      ) : (
        <>
          {tab === 'departments' && (
            <MasterSection
              title="Departments" icon="🏢"
              items={departments} nameKey="department_name" idKey="department_id"
              onAdd={addDept} onDelete={delDept} addLabel="Add Dept"
            />
          )}
          {tab === 'designations' && (
            <MasterSection
              title="Designations" icon="🎖️"
              items={designations} nameKey="designation_name" idKey="designation_id"
              onAdd={addDesig} onDelete={delDesig} addLabel="Add Designation"
            />
          )}
          {tab === 'locations' && (
            <MasterSection
              title="Locations" icon="📍"
              items={locations} nameKey="location_name" idKey="location_id"
              onAdd={addLoc} onDelete={delLoc} addLabel="Add Location"
            />
          )}
        </>
      )}
    </div>
  );
}
