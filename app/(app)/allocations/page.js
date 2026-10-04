'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '@/lib/client-api.js';
import PatientPicker from '@/components/PatientPicker';
import { ErrorAlert, SectionHeader, StatusBadge, fmtDateTime } from '@/components/ui';

const EMPTY = { requirementId: '', start: '', end: '', facilityId: '' };

export default function AllocationsPage() {
  const [patient, setPatient] = useState(null);
  const [data, setData] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [avail, setAvail] = useState(null);
  const [resourceId, setResourceId] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p) => setData(await api(`/api/transition-readiness/${p.patientId}`)), []);
  useEffect(() => { api('/api/facilities').then((d) => setFacilities(d.facilities)).catch(() => {}); }, []);
  useEffect(() => {
    setData(null); setForm(EMPTY); setAvail(null); setResourceId(''); setNotice('');
    if (patient) load(patient).catch(setError);
  }, [patient, load]);

  // Open requirements that still need a resource, with the plan (and so the admission) they belong to.
  const open = (data?.plans ?? []).filter((p) => ['PLANNED', 'READY'].includes(p.dischargeStatus))
    .flatMap((p) => p.requirements.filter((r) => r.status === 'PENDING').map((r) => ({ ...r, admissionId: p.admissionId, dischargeId: p.dischargeId })));
  const requirement = open.find((r) => String(r.requirementId) === form.requirementId);
  const bookings = (data?.plans ?? []).flatMap((p) => p.requirements.flatMap((r) => r.allocations.map((a) => ({ ...a, dischargeId: p.dischargeId }))));

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setAvail(null); setResourceId(''); };

  async function findAvailable(e) {
    e.preventDefault();
    setError(null); setNotice(''); setBusy(true);
    try {
      const d = await api(`/api/resources/available${qs({ start: form.start, end: form.end, resourceType: requirement.resourceType, facilityId: form.facilityId, limit: 100 })}`);
      setAvail(d.resources); setResourceId('');
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  async function book() {
    setError(null); setNotice(''); setBusy(true);
    try {
      await api('/api/resource-allocations', { method: 'POST', body: {
        admissionId: requirement.admissionId, resourceId: Number(resourceId), startTime: form.start, endTime: form.end, requirementId: requirement.requirementId,
      } });
      setNotice(`Resource #${resourceId} booked for requirement #${requirement.requirementId}.`);
      setForm(EMPTY); setAvail(null); setResourceId('');
      await load(patient);
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  async function change(a, status) {
    if (status === 'CANCELLED' && !window.confirm('Cancel this booking? The resource becomes free again.')) return;
    setError(null); setNotice(''); setBusy(true);
    try {
      const d = await api(`/api/resource-allocations/${a.allocationId}`, { method: 'PATCH', body: { status } });
      setNotice(`Booking #${a.allocationId} ${status.toLowerCase()}. Requirement is now ${d.requirementStatus}.`);
      await load(patient);
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  return (
    <div className="page container stack">
      <SectionHeader left tag="Allocation" title="Book a resource" sub="Choose a requirement, give a time window, and pick from the resources that are free for all of it." />
      <div className="panel"><h4 style={{ marginBottom: 12 }}>1. Patient</h4><PatientPicker onSelect={setPatient} selectedId={patient?.patientId} /></div>
      <ErrorAlert error={error} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {patient && data && (
        <>
          <form className="panel" onSubmit={findAvailable}>
            <h4 style={{ marginBottom: 16 }}>2. Requirement and time window for {patient.name}</h4>
            {open.length === 0 ? <p className="muted">No pending requirements. Add one on the discharge plan page.</p> : (
              <div className="stack">
                <div className="form-grid">
                  <div className="full">
                    <label htmlFor="rq">Pending requirement</label>
                    <select id="rq" required value={form.requirementId} onChange={set('requirementId')}>
                      <option value="">Select a requirement</option>
                      {open.map((r) => <option key={r.requirementId} value={r.requirementId}>#{r.requirementId} · {r.resourceType} · plan #{r.dischargeId}{r.requiredUntil ? ` · until ${fmtDateTime(r.requiredUntil)}` : ''}</option>)}
                    </select>
                  </div>
                  <div><label htmlFor="s">Start</label><input id="s" type="datetime-local" required value={form.start} onChange={set('start')} /></div>
                  <div><label htmlFor="e">End</label><input id="e" type="datetime-local" required value={form.end} onChange={set('end')} /></div>
                  <div className="full">
                    <label htmlFor="f">Facility (optional)</label>
                    <select id="f" value={form.facilityId} onChange={set('facilityId')}>
                      <option value="">Any facility</option>
                      {facilities.map((f) => <option key={f.facilityId} value={f.facilityId}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
                <div><button className="btn btn-primary btn-sm" disabled={busy || !form.requirementId}>Find free resources</button></div>
              </div>
            )}
          </form>

          {avail && (
            <div className="panel">
              <h4 style={{ marginBottom: 12 }}>3. Choose a free {requirement?.resourceType}</h4>
              {avail.length === 0 ? <p className="muted">Nothing of this type is free for the whole window. Try another time or facility.</p> : (
                <>
                  {avail.map((r) => (
                    <button type="button" key={r.resourceId} className={`list-row ${String(r.resourceId) === resourceId ? 'selected' : ''}`} onClick={() => setResourceId(String(r.resourceId))}>
                      <span><strong>#{r.resourceId}</strong> · {r.resourceType}</span><span className="muted small">{r.facilityName}</span>
                    </button>
                  ))}
                  <div style={{ marginTop: 20 }}><button className="btn btn-primary" disabled={busy || !resourceId} onClick={book}>{busy ? 'Booking...' : 'Book selected resource'}</button></div>
                </>
              )}
            </div>
          )}

          <div className="panel">
            <h3 style={{ marginBottom: 16 }}>Current bookings</h3>
            {bookings.length === 0 ? <p className="muted">No active or completed bookings for this patient.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Booking</th><th>Resource</th><th>From</th><th>To</th><th>Plan</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {bookings.map((a) => (
                      <tr key={a.allocationId}>
                        <td>#{a.allocationId}</td><td>#{a.resourceId} · {a.resourceType}</td><td>{fmtDateTime(a.startTime)}</td><td>{fmtDateTime(a.endTime)}</td><td>#{a.dischargeId}</td>
                        <td><StatusBadge status={a.allocationStatus} /></td>
                        <td>{a.allocationStatus === 'ACTIVE' && (
                          <div className="row" style={{ gap: 8 }}>
                            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => change(a, 'COMPLETED')}>Complete</button>
                            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => change(a, 'CANCELLED')}>Cancel</button>
                          </div>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}