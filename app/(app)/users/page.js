'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '@/lib/client-api.js';
import { useAuth } from '@/components/AuthProvider';
import { ErrorAlert, SectionHeader, StatusBadge } from '@/components/ui';

export default function UsersPage() {
  const { user: me } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/api/users${qs({ status })}`).then((d) => setRows(d.users)).catch(setError), [status]);
  useEffect(() => { setRows(null); setError(null); load(); }, [load]);

  async function act(u, body, msg) {
    setBusy(true); setError(null); setNotice('');
    try { await api(`/api/users/${u.userId}`, { method: 'PATCH', body }); setNotice(`${u.name}: ${msg}.`); await load(); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }

  return (
    <div className="page container stack">
      <SectionHeader left tag="Administration" title="User accounts" sub="Approve new sign-ups, change roles, and deactivate accounts. You cannot change your own account." />
      <ErrorAlert error={error} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <div className="panel">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3>Accounts</h3>
          <select aria-label="Status" style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option><option>PENDING</option><option>ACTIVE</option><option>INACTIVE</option>
          </select>
        </div>
        {!rows && !error && <p className="muted">Loading...</p>}
        {rows?.length === 0 && <p className="muted">No accounts with this status.</p>}
        {rows?.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.userId}>
                <td><strong>{u.name}</strong></td><td>{u.email}</td>
                <td>{u.roles.join(', ') || '-'}</td><td><StatusBadge status={u.status} /></td>
                <td>{u.userId !== me.userId && (
                  <div className="row" style={{ gap: 8 }}>
                    {u.status !== 'ACTIVE' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(u, { status: 'ACTIVE' }, u.status === 'PENDING' ? 'approved' : 'reactivated')}>{u.status === 'PENDING' ? 'Approve' : 'Reactivate'}</button>}
                    {u.status === 'ACTIVE' && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => window.confirm(`Deactivate ${u.name}?`) && act(u, { status: 'INACTIVE' }, 'deactivated')}>Deactivate</button>}
                    {u.roles.includes('ADMIN')
                      ? <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(u, { role: 'CARE_COORDINATOR' }, 'set to care coordinator')}>Make coordinator</button>
                      : <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => window.confirm(`Give ${u.name} administrator rights?`) && act(u, { role: 'ADMIN' }, 'promoted to admin')}>Make admin</button>}
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}