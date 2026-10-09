'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client-api.js';
import { ErrorAlert, SectionHeader, StatusBadge, fmtDateTime } from '@/components/ui';

const PLAN_ACTIONS = {
  PLANNED: [['READY', 'Mark ready', 'btn-primary'], ['CANCELLED', 'Cancel plan', 'btn-danger']],
  READY: [['COMPLETED', 'Complete discharge', 'btn-primary'], ['PLANNED', 'Back to planned', 'btn-secondary'], ['CANCELLED', 'Cancel plan', 'btn-danger']],
};
const EMPTY_REQ = { recoveryId: '', resourceType: '', requiredForm: '', requiredUntil: '' };

export default function DischargePlanPage() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [req, setReq] = useState(EMPTY_REQ);
  const [epi, setEpi] = useState({ facilityId: '', startDate: '' });

  const load = useCallback(async () => {
    const d = await api(`/api/discharge-plans/${id}`);
    setPlan(d.dischargePlan);
    const r = await api(`/api/transition-readiness/${d.dischargePlan.patientId}`);
    setEpisodes(r.recoveryEpisodes.filter((e) => ['PLANNED', 'ACTIVE'].includes(e.status)));
  }, [id]);

  useEffect(() => {
    load().catch(setError);
    api('/api/facilities').then((d) => setFacilities(d.facilities)).catch(() => {});
  }, [load]);

  async function act(fn, success) {
    setBusy(true); setError(null); setNotice('');
    try { await fn(); await load(); if (success) setNotice(success); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  const changeStatus = (status, label) => {
    if (status === 'CANCELLED' && !window.confirm('Cancel this discharge plan? This cannot be undone.')) return;
    act(() => api(`/api/discharge-plans/${id}`, { method: 'PATCH', body: { status } }), `${label} done.`);
  };
  const setRequirement = (reqId, status) => {
    if (status === 'CANCELLED' && !window.confirm('Cancel this requirement? Any live booking for it is released.')) return;
    act(() => api(`/api/transition-requirements/${reqId}`, { method: 'PATCH', body: { status } }), `Requirement ${status.toLowerCase()}.`);
  };
  const addRequirement = (e) => {
    e.preventDefault();
    act(async () => {
      await api('/api/transition-requirements', { method: 'POST', body: {
        dischargeId: Number(id), recoveryId: Number(req.recoveryId), resourceType: req.resourceType.trim(),
        requiredForm: req.requiredForm.trim() || null, requiredUntil: req.requiredUntil || null,
      } });
      setReq(EMPTY_REQ);
    }, 'Requirement added.');
  };
  const addEpisode = (e) => {
    e.preventDefault();
    act(async () => {
      await api('/api/recovery-episodes', { method: 'POST', body: { patientId: plan.patientId, facilityId: Number(epi.facilityId), startDate: epi.startDate, status: 'ACTIVE' } });
      setEpi({ facilityId: '', startDate: '' });
    }, 'Recovery episode created.');
  };

  if (!plan) return <div className="page container">{error ? <ErrorAlert error={error} /> : <p className="muted">Loading...</p>}</div>;
  const open = plan.status === 'PLANNED' || plan.status === 'READY';
  const rd = plan.readiness;

  return (
    <div className="page container stack">
      <SectionHeader left tag={`Discharge plan #${plan.dischargeId}`} title={plan.patientName} sub={`Admission #${plan.admissionId} · responsible doctor ${plan.doctorName}`} />
      <ErrorAlert error={error} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <div className="panel">
        <div className="plan-head">
          <div className="row"><StatusBadge status={plan.status} />{rd && <StatusBadge status={rd.readinessStatus} />}</div>
          <div className="row">
            <Link href={`/dashboard?patient=${plan.patientId}`} className="btn btn-secondary btn-sm">View on dashboard</Link>
            {open && PLAN_ACTIONS[plan.status].map(([status, label, cls]) => (
              <button key={status} className={`btn btn-sm ${cls}`} disabled={busy} onClick={() => changeStatus(status, label)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-3">
          <div><h4>Discharge date</h4><p>{fmtDateTime(plan.dischargeDate)}</p></div>
          <div><h4>Destination</h4><p>{plan.destinationFacilityName ?? 'Home'}</p></div>
          <div><h4>Handoff</h4><p>{rd?.handoffStatus ? <StatusBadge status={rd.handoffStatus} /> : 'None yet'}</p></div>
        </div>
        {plan.notes && <p style={{ marginTop: 20 }}><strong style={{ color: 'var(--deep-navy)' }}>Notes: </strong>{plan.notes}</p>}
      </div>

      <div className="panel">
        <h3 style={{ marginBottom: 16 }}>Transition requirements</h3>
        {plan.requirements.length === 0 ? <p className="muted">No requirements yet. A plan with no requirements cannot be marked ready.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Resource type</th><th>Form</th><th>Needed until</th><th>Recovery</th><th>Status</th><th /></tr></thead>
            <tbody>{plan.requirements.map((r) => (
              <tr key={r.requirementId}>
                <td><strong>{r.resourceType}</strong></td><td>{r.requiredForm ?? '-'}</td><td>{fmtDateTime(r.requiredUntil) || '-'}</td><td>#{r.recoveryId}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{open && (r.status === 'PENDING' || r.status === 'ALLOCATED') && (
                  <div className="row" style={{ gap: 8 }}>
                    {r.status === 'PENDING' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setRequirement(r.requirementId, 'FULFILLED')}>Mark fulfilled</button>}
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setRequirement(r.requirementId, 'CANCELLED')}>Cancel</button>
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {plan.status === 'PLANNED' && (
        <div className="panel">
          <h3 style={{ marginBottom: 16 }}>Add a requirement</h3>
          {episodes.length === 0 ? (
            <form onSubmit={addEpisode} className="stack">
              <p>A requirement belongs to a recovery episode, and this patient has no open one. Create it first.</p>
              <div className="form-grid">
                <div>
                  <label htmlFor="ef">Recovery facility</label>
                  <select id="ef" required value={epi.facilityId} onChange={(e) => setEpi({ ...epi, facilityId: e.target.value })}>
                    <option value="">Select a facility</option>
                    {facilities.map((f) => <option key={f.facilityId} value={f.facilityId}>{f.name}</option>)}
                  </select>
                </div>
                <div><label htmlFor="es">Start date</label><input id="es" type="date" required value={epi.startDate} onChange={(e) => setEpi({ ...epi, startDate: e.target.value })} /></div>
              </div>
              <div><button className="btn btn-primary btn-sm" disabled={busy}>Create recovery episode</button></div>
            </form>
          ) : (
            <form onSubmit={addRequirement} className="stack">
              <div className="form-grid">
                <div>
                  <label htmlFor="re">Recovery episode</label>
                  <select id="re" required value={req.recoveryId} onChange={(e) => setReq({ ...req, recoveryId: e.target.value })}>
                    <option value="">Select an episode</option>
                    {episodes.map((e) => <option key={e.recoveryId} value={e.recoveryId}>#{e.recoveryId} · from {e.startDate} · {e.status}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="rt">Resource type</label>
                  <input id="rt" required maxLength={100} placeholder="e.g. WHEELCHAIR" value={req.resourceType} onChange={(e) => setReq({ ...req, resourceType: e.target.value })} />
                  <p className="hint">Must match the type used on resources, so it can be booked.</p>
                </div>
                <div><label htmlFor="rf">Required form (optional)</label><input id="rf" maxLength={200} value={req.requiredForm} onChange={(e) => setReq({ ...req, requiredForm: e.target.value })} /></div>
                <div><label htmlFor="ru">Needed until (optional)</label><input id="ru" type="datetime-local" value={req.requiredUntil} onChange={(e) => setReq({ ...req, requiredUntil: e.target.value })} /></div>
              </div>
              <div><button className="btn btn-primary btn-sm" disabled={busy}>Add requirement</button></div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}