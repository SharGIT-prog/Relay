'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/client-api.js';
import PatientPicker from '@/components/PatientPicker';
import { Counter, ErrorAlert, FadeIn, SectionHeader, StatusBadge, fmtDateTime } from '@/components/ui';

function PlanCard({ p }) {
  const total = Number(p.totalRequirements), done = Number(p.fulfilledRequirements);
  const pct = total ? Math.round((100 * done) / total) : 0;
  const handoff = p.handoffs.at(-1);
  return (
    <FadeIn>
      <article className="panel">
        <div className="plan-head">
          <div>
            <h3>Discharge plan #{p.dischargeId}</h3>
            <p className="small">Planned {fmtDateTime(p.dischargeDate)} · to {p.destinationFacilityName ?? 'home'} · plan {p.dischargeStatus}</p>
          </div>
          <StatusBadge status={p.readinessStatus} />
        </div>
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        <p className="small" style={{ margin: '8px 0 20px' }}>{done} of {total} requirements fulfilled</p>
        {p.requirements.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Requirement</th><th>Form</th><th>Needed until</th><th>Booked resources</th><th>Status</th></tr></thead>
            <tbody>{p.requirements.map((r) => (
              <tr key={r.requirementId}>
                <td><strong>{r.resourceType}</strong></td><td>{r.requiredForm ?? '-'}</td><td>{fmtDateTime(r.requiredUntil) || '-'}</td>
                <td>{r.allocations.length ? r.allocations.map((a) => `#${a.resourceId} (${a.allocationStatus})`).join(', ') : '-'}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="row between" style={{ marginTop: 20 }}>
          <span className="small">Handoff: {handoff ? <StatusBadge status={handoff.status} /> : <span className="muted">none yet</span>}</span>
          <Link href={`/discharge-plans/${p.dischargeId}`} className="btn btn-secondary btn-sm">Open plan</Link>
        </div>
      </article>
    </FadeIn>
  );
}

function DashboardInner() {
  const router = useRouter();
  const patientId = useSearchParams().get('patient');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null); setError(null);
    if (!patientId) return undefined;
    let live = true;
    api(`/api/transition-readiness/${patientId}`).then((d) => live && setData(d)).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [patientId]);

  return (
    <div className="page container stack">
      <SectionHeader left tag="Dashboard" title="Transition readiness" sub="Pick a patient to see what is outstanding, which resources are booked and where the handoff stands." />
      {!patientId && <div className="panel"><PatientPicker onSelect={(p) => router.push(`/dashboard?patient=${p.patientId}`)} /></div>}
      <ErrorAlert error={error} />
      {patientId && !data && !error && <p className="muted">Loading...</p>}
      {data && (
        <>
          <div className="row between">
            <div><h3>{data.patient.name}</h3><p className="small">Patient ID {data.patient.patientId} · born {data.patient.DOB}</p></div>
            <div className="row">
              <button className="btn btn-secondary btn-sm" onClick={() => router.push('/dashboard')}>Change patient</button>
              <Link href="/discharge-plans/new" className="btn btn-primary btn-sm">New discharge plan</Link>
            </div>
          </div>
          <section className="stats"><div className="grid grid-4">
            <Counter value={data.summary.plans} label="Discharge plans" />
            <Counter value={data.summary.ready} label="Ready to transition" />
            <Counter value={data.summary.outstandingRequirements} label="Outstanding requirements" />
            <Counter value={data.recoveryEpisodes.length} label="Recovery episodes" />
          </div></section>
          {data.plans.length === 0 && <div className="panel center"><p>This patient has no discharge plans yet.</p></div>}
          {data.plans.map((p) => <PlanCard key={p.dischargeId} p={p} />)}
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<div className="page container"><p className="muted">Loading...</p></div>}><DashboardInner /></Suspense>;
}