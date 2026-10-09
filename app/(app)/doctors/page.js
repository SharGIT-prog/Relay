'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '@/lib/client-api.js';
import { ErrorAlert, SectionHeader } from '@/components/ui';

const EMPTY = { name: '', specialisation: '', contactNumber: '' };

export default function DoctorsPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback((text = '') => api(`/api/doctors${qs({ q: text.trim() })}`).then((d) => setRows(d.doctors)).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(fn, msg) {
    setBusy(true); setError(null); setNotice('');
    try { await fn(); setNotice(msg); setForm(EMPTY); setEditing(null); await load(q); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  const save = (e) => { e.preventDefault(); run(() => (editing
    ? api(`/api/doctors/${editing}`, { method: 'PATCH', body: form })
    : api('/api/doctors', { method: 'POST', body: form })), editing ? 'Doctor updated.' : 'Doctor added.'); };
  const remove = (d) => window.confirm(`Delete ${d.name}? This fails if the doctor is assigned to an admission.`) && run(() => api(`/api/doctors/${d.doctorId}`, { method: 'DELETE' }), 'Doctor deleted.');

  return (
    <div className="page container stack">
      <SectionHeader left tag="Clinical" title="Doctors" sub="Register doctors, then assign them to admissions from the patient page." />
      <ErrorAlert error={error} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <form className="panel" onSubmit={save}>
        <h3 style={{ marginBottom: 16 }}>{editing ? `Edit doctor #${editing}` : 'Add a doctor'}</h3>
        <div className="form-grid">
          <div><label htmlFor="dn">Name</label><input id="dn" required maxLength={150} value={form.name} onChange={set('name')} /></div>
          <div><label htmlFor="ds">Specialisation</label><input id="ds" required maxLength={120} value={form.specialisation} onChange={set('specialisation')} /></div>
          <div className="full"><label htmlFor="dc">Contact number</label><input id="dc" required maxLength={20} value={form.contactNumber} onChange={set('contactNumber')} /></div>
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn btn-primary btn-sm" disabled={busy}>{editing ? 'Save changes' : 'Add doctor'}</button>
          {editing && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel</button>}
        </div>
      </form>
      <div className="panel">
        <form className="row" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); load(q); }}>
          <input style={{ flex: 1, minWidth: 220 }} placeholder="Search by name or specialisation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search doctors" />
          <button className="btn btn-primary btn-sm">Search</button>
        </form>
        {!rows && <p className="muted">Loading...</p>}
        {rows?.length === 0 && <p className="muted">No doctors found.</p>}
        {rows?.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>ID</th><th>Name</th><th>Specialisation</th><th>Contact</th><th /></tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.doctorId}>
                <td>#{d.doctorId}</td><td><strong>{d.name}</strong></td><td>{d.specialisation}</td><td>{d.contactNumber}</td>
                <td><div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(d.doctorId); setForm({ name: d.name, specialisation: d.specialisation, contactNumber: d.contactNumber }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                  <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => remove(d)}>Delete</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}