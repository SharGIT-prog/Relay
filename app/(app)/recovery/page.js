'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client-api.js';
import PatientPicker from '@/components/PatientPicker';
import { ErrorAlert, SectionHeader, StatusBadge, fmtDateTime } from '@/components/ui';

const EMPTY = { facilityId: '', startDate: '', endDate: '', status: 'PLANNED' };

export default function RecoveryPage() {
  const [patient, setPatient] = useState(null);
  const [episodes, setEpisodes] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p) => setEpisodes((await api(`/api/transition-readiness/${p.patientId}`)).recoveryEpisodes), []);
  useEffect(() => { api('/api/facilities').then((d) => setFacilities(d.facilities)).catch(() => {}); }, []);
  useEffect(() => {
    setEpisodes(null); setDetail(null); setForm(EMPTY); setNotice('');
    if (patient) load(patient).catch(setError);
  }, [patient, load]);

  const fname = (id) => facilities.find((f) => f.facilityId === id)?.name ?? `#${id}`;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function view(id) {
    setError(null);
    try { setDetail((await api(`/api/recovery-episodes/${id}`)).recoveryEpisode); } catch (e) { setError(e); }
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice('');
    try {
      const d = await api('/api/recovery-episodes', { method: 'POST', body: {
        patientId: patient.patientId, facilityId: Number(form.facilityId), startDate: form.startDate,
        endDate: form.endDate || null, status: form.status,
      } });
      setNotice(`Recovery episode #${d.recoveryEpisode.recoveryId} created.`);
      setForm(EMPTY);
      await load(patient);
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  return (
    <div className="page container stack">
      <SectionHeader left tag="Recovery" title="Recovery episodes" sub="A recovery episode is the patient's continuing recovery at a facility. Transition requirements belong to one." />
      <div className="panel"><h4 style={{ marginBottom: 12 }}>Patient</h4><PatientPicker onSelect={setPatient} selectedId={patient?.patientId} /></div>
      <ErrorAlert error={error} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {patient && episodes && (
        <>
          <div className="panel">
            <h3 style={{ marginBottom: 16 }}>Episodes for {patient.name}</h3>
            {episodes.length === 0 ? <p className="muted">No recovery episodes yet.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Episode</th><th>Facility</th><th>Start</th><th>End</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {episodes.map((r) => (
                      <tr key={r.recoveryId}>
                        <td>#{r.recoveryId}</td><td>{fname(r.facilityId)}</td><td>{r.startDate}</td><td>{r.endDate ?? '-'}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td><button className="btn btn-secondary btn-sm" onClick={() => view(r.recoveryId)}>Details</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {detail && (
            <div className="panel">
              <div className="plan-head">
                <div><h3>Episode #{detail.recoveryId}</h3><p className="small">{detail.facilityName} · from {detail.startDate}{detail.endDate ? ` to ${detail.endDate}` : ''}</p></div>
                <StatusBadge status={detail.status} />
              </div>
              <h4 style={{ marginBottom: 10 }}>Linked transition requirements</h4>
              {detail.requirements.length === 0 ? <p className="muted">None yet.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Requirement</th><th>Plan</th><th>Form</th><th>Needed until</th><th>Status</th></tr></thead>
                    <tbody>
                      {detail.requirements.map((q) => (
                        <tr key={q.requirementId}>
                          <td><strong>{q.resourceType}</strong></td><td>#{q.dischargeId}</td><td>{q.requiredForm ?? '-'}</td>
                          <td>{fmtDateTime(q.requiredUntil) || '-'}</td><td><StatusBadge status={q.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <form className="panel" onSubmit={create}>
            <h3 style={{ marginBottom: 16 }}>Start a new episode</h3>
            <div className="form-grid">
              <div className="full">
                <label htmlFor="fc">Facility</label>
                <select id="fc" required value={form.facilityId} onChange={set('facilityId')}>
                  <option value="">Select a facility</option>
                  {facilities.map((f) => <option key={f.facilityId} value={f.facilityId}>{f.name} ({f.facilityType})</option>)}
                </select>
              </div>
              <div><label htmlFor="sd">Start date</label><input id="sd" type="date" required value={form.startDate} onChange={set('startDate')} /></div>
              <div><label htmlFor="ed">Expected end date (optional)</label><input id="ed" type="date" min={form.startDate || undefined} value={form.endDate} onChange={set('endDate')} /></div>
              <div>
                <label htmlFor="stt">Status</label>
                <select id="stt" value={form.status} onChange={set('status')}><option>PLANNED</option><option>ACTIVE</option></select>
              </div>
            </div>
            <div style={{ marginTop: 20 }}><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating...' : 'Create episode'}</button></div>
          </form>
        </>
      )}
    </div>
  );
}