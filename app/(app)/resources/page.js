'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, qs } from '@/lib/client-api.js';
import { ErrorAlert, SectionHeader, StatusBadge } from '@/components/ui';

const PAGE = 25;
const EMPTY = { resourceType: '', facilityId: '', availability: '', start: '', end: '' };

export default function ResourcesPage() {
  const [form, setForm] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [offset, setOffset] = useState(0);
  const [facilities, setFacilities] = useState([]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const windowMode = Boolean(applied.start && applied.end);

  useEffect(() => { api('/api/facilities').then((d) => setFacilities(d.facilities)).catch(setError); }, []);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    const call = windowMode
      ? api(`/api/resources/available${qs({ start: applied.start, end: applied.end, resourceType: applied.resourceType.trim(), facilityId: applied.facilityId, limit: 200 })}`)
      : api(`/api/resources${qs({ resourceType: applied.resourceType.trim(), facilityId: applied.facilityId, availability: applied.availability, limit: PAGE + 1, offset })}`);
    call.then((d) => live && setRows(d.resources)).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [applied, offset, windowMode]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  function submit(e) {
    e.preventDefault();
    if (Boolean(form.start) !== Boolean(form.end)) { setError('Enter both a start and an end to check a time window, or leave both empty.'); return; }
    setOffset(0);
    setApplied(form);
  }
  const reset = () => { setForm(EMPTY); setApplied(EMPTY); setOffset(0); };
  const shown = rows ? (windowMode ? rows : rows.slice(0, PAGE)) : [];
  const hasNext = !windowMode && rows && rows.length > PAGE;
  const facilityName = (id) => facilities.find((f) => f.facilityId === id)?.name ?? `#${id}`;

  return (
    <div className="page container stack">
      <SectionHeader left tag="Resources" title="Resource availability" sub="Filter by type and facility. Add a start and end time to see only resources that are free for that whole window." />
      <form className="panel" onSubmit={submit}>
        <div className="form-grid">
          <div><label htmlFor="rt">Resource type</label><input id="rt" placeholder="e.g. WHEELCHAIR" value={form.resourceType} onChange={set('resourceType')} /></div>
          <div>
            <label htmlFor="fac">Facility</label>
            <select id="fac" value={form.facilityId} onChange={set('facilityId')}>
              <option value="">All facilities</option>
              {facilities.map((f) => <option key={f.facilityId} value={f.facilityId}>{f.name}</option>)}
            </select>
          </div>
          <div><label htmlFor="st">Free from (optional)</label><input id="st" type="datetime-local" value={form.start} onChange={set('start')} /></div>
          <div><label htmlFor="en">Free until (optional)</label><input id="en" type="datetime-local" value={form.end} onChange={set('end')} /></div>
          <div>
            <label htmlFor="av">Current state</label>
            <select id="av" value={form.availability} onChange={set('availability')} disabled={Boolean(form.start && form.end)}>
              <option value="">Any</option><option>AVAILABLE</option><option>UNAVAILABLE</option><option>MAINTENANCE</option>
            </select>
            {form.start && form.end && <p className="hint">A time window only lists AVAILABLE resources.</p>}
          </div>
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn btn-primary btn-sm">Apply filters</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>Reset</button>
          <Link href="/allocations" className="btn btn-secondary btn-sm">Go to allocation</Link>
        </div>
      </form>

      <ErrorAlert error={error} />
      <div className="panel">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3>{windowMode ? `Free ${applied.start.replace('T', ' ')} to ${applied.end.replace('T', ' ')}` : 'All resources'}</h3>
          {rows && <span className="muted small">{shown.length} shown</span>}
        </div>
        {!rows && !error && <p className="muted">Loading...</p>}
        {rows && shown.length === 0 && <p className="muted">No resources match these filters.</p>}
        {shown.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Type</th><th>Facility</th><th>{windowMode ? 'Window' : 'State'}</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.resourceId}>
                    <td>#{r.resourceId}</td><td><strong>{r.resourceType}</strong></td><td>{r.facilityName ?? facilityName(r.facilityId)}</td>
                    <td>{windowMode ? <span className="badge badge-green">FREE</span> : <StatusBadge status={r.availability} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!windowMode && (offset > 0 || hasNext) && (
          <div className="row between" style={{ marginTop: 16 }}>
            <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <button className="btn btn-secondary btn-sm" disabled={!hasNext} onClick={() => setOffset(offset + PAGE)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}