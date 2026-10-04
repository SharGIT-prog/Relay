'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api.js';
import PatientPicker from '@/components/PatientPicker';
import { ErrorAlert, SectionHeader, StatusBadge, fmtDateTime } from '@/components/ui';

const LIVE = ['PREPARED', 'SENT', 'ACKNOWLEDGED'];

export default function HandoffsPage() {
  const [patient, setPatient] = useState(null);
  const [data, setData] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [dates, setDates] = useState({});
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p) => setData(await api(`/api/transition-readiness/${p.patientId}`)), []);
  useEffect(() => { api('/api/facilities').then((d) => setFacilities(d.facilities)).catch(() => {}); }, []);
  useEffect(() => {
    setData(null); setNotice(''); setDates({});
    if (patient) load(patient).catch(setError);
  }, [patient, load]);

  const fname = (id) => facilities.find((f) => f.facilityId === id)?.name ?? `#${id}`;

  async function run(fn, success) {
    setBusy(true); setError(null); setNotice('');
    try { await fn(); await load(patient); setNotice(success); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  const prepare = (p) => run(() => api('/api/handoffs', { method: 'POST', body: { dischargeId: p.dischargeId, handoffDate: dates[p.dischargeId] } }), 'Handoff prepared.');
  const act = (h, action, label) => {
    if (action === 'reject' && !window.confirm('Reject this handoff? A new one can be prepared afterwards.')) return;
    run(() => api(`/api/handoffs/${h.handoffId}/${action}`, { method: 'POST' }), `Handoff #${h.handoffId} ${label}.`);
  };

  const plans = (data?.plans ?? []).filter((p) => p.destinationFacilityId != null);

  return (
    <div className="page container stack">
      <SectionHeader left tag="Handoff" title="Care handoffs" sub="The formal transfer of responsibility to the destination facility. A handoff can only be sent once the plan is ready, and the plan completes only after the receiver acknowledges." />
      <div className="panel"><h4 style={{ marginBottom: 12 }}>Patient</h4><PatientPicker onSelect={setPatient} selectedId={patient?.patientId} /></div>
      <ErrorAlert error={error} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {data && plans.length === 0 && (
        <div className="panel center"><p>No discharge plan for {patient.name} has a destination facility, so there is nothing to hand off. <Link href="/discharge-plans/new">Plan a discharge</Link></p></div>
      )}

      {plans.map((p) => {
        const closed = ['COMPLETED', 'CANCELLED'].includes(p.dischargeStatus);
        const live = p.handoffs.some((h) => LIVE.includes(h.status));
        return (
          <section className="panel" key={p.dischargeId}>
            <div className="plan-head">
              <div>
                <h3>Plan #{p.dischargeId}</h3>
                <p className="small">To {p.destinationFacilityName} · planned {fmtDateTime(p.dischargeDate)}</p>
              </div>
              <div className="row"><StatusBadge status={p.dischargeStatus} /><StatusBadge status={p.readinessStatus} /></div>
            </div>

            {p.handoffs.length === 0 ? <p className="muted">No handoff yet.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Handoff</th><th>From</th><th>To</th><th>Handoff date</th><th>Acknowledged</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {p.handoffs.map((h) => (
                      <tr key={h.handoffId}>
                        <td>#{h.handoffId}</td><td>{fname(h.fromFacilityId)}</td><td>{fname(h.toFacilityId)}</td>
                        <td>{fmtDateTime(h.handoffDate)}</td><td>{fmtDateTime(h.acknowledgedAt) || '-'}</td>
                        <td><StatusBadge status={h.status} /></td>
                        <td>
                          {!closed && h.status === 'PREPARED' && <button className="btn btn-primary btn-sm" disabled={busy || p.dischargeStatus !== 'READY'} title={p.dischargeStatus !== 'READY' ? 'The plan must be READY first' : ''} onClick={() => act(h, 'send', 'sent')}>Send</button>}
                          {!closed && h.status === 'SENT' && (
                            <div className="row" style={{ gap: 8 }}>
                              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(h, 'acknowledge', 'acknowledged')}>Acknowledge receipt</button>
                              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => act(h, 'reject', 'rejected')}>Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {p.handoffs.some((h) => h.status === 'PREPARED') && p.dischargeStatus !== 'READY' && !closed && (
              <p className="hint" style={{ marginTop: 12 }}>To send, first mark the plan ready on its <Link href={`/discharge-plans/${p.dischargeId}`}>plan page</Link>.</p>
            )}

            {!closed && !live && (
              <div className="row" style={{ marginTop: 20, alignItems: 'flex-end' }}>
                <div>
                  <label htmlFor={`hd${p.dischargeId}`}>Handoff date and time</label>
                  <input id={`hd${p.dischargeId}`} type="datetime-local" value={dates[p.dischargeId] ?? ''} onChange={(e) => setDates({ ...dates, [p.dischargeId]: e.target.value })} />
                </div>
                <button className="btn btn-primary btn-sm" disabled={busy || !dates[p.dischargeId]} onClick={() => prepare(p)}>Prepare handoff</button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}