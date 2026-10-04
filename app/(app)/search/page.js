'use client';
import { useState } from 'react';
import { api } from '@/lib/client-api.js';
import PatientPicker from '@/components/PatientPicker';
import { ErrorAlert, FadeIn, SectionHeader, StatusBadge, fmtDateTime } from '@/components/ui';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [patient, setPatient] = useState(null);
  const [picking, setPicking] = useState(false);
  const [documentType, setDocumentType] = useState('');
  const [limit, setLimit] = useState(10);
  const [out, setOut] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const filters = {};
      if (patient) filters.patientId = patient.patientId;
      if (documentType.trim()) filters.documentType = documentType.trim();
      setOut(await api('/api/semantic-search', { method: 'POST', body: { query: query.trim(), filters, limit: Number(limit) } }));
    } catch (err) { setError(err); setOut(null); }
    finally { setBusy(false); }
  }

  return (
    <div className="page container stack">
      <SectionHeader left tag="Semantic search" title="Search care documents by meaning" sub='Describe what you need in your own words, for example "how will she get into the house with the steps". Different wording for the same idea still matches.' />
      <form className="panel" onSubmit={submit}>
        <div className="stack">
          <div>
            <label htmlFor="q">What are you looking for?</label>
            <textarea id="q" required maxLength={2000} style={{ minHeight: 90 }} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="form-grid">
            <div>
              <label>Patient (optional)</label>
              {patient ? (
                <div className="row"><span className="badge badge-blue">{patient.name} · ID {patient.patientId}</span><button type="button" className="link-btn" onClick={() => setPatient(null)}>Clear</button></div>
              ) : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicking((p) => !p)}>{picking ? 'Hide patient list' : 'Limit to one patient'}</button>}
            </div>
            <div><label htmlFor="t">Document type (optional)</label><input id="t" maxLength={60} placeholder="e.g. REHAB_PLAN" value={documentType} onChange={(e) => setDocumentType(e.target.value)} /></div>
            <div>
              <label htmlFor="l">Number of results</label>
              <select id="l" value={limit} onChange={(e) => setLimit(e.target.value)}>{[5, 10, 20, 50].map((n) => <option key={n}>{n}</option>)}</select>
            </div>
          </div>
          {picking && !patient && <PatientPicker onSelect={(p) => { setPatient(p); setPicking(false); }} />}
          <ErrorAlert error={error} />
          <div><button className="btn btn-primary" disabled={busy || !query.trim()}>{busy ? 'Searching...' : 'Search'}</button></div>
          {busy && <p className="hint">The first search after the server starts loads the language model and can take a few seconds.</p>}
        </div>
      </form>

      {out && (
        <>
          <p className="muted">{out.count} result{out.count === 1 ? '' : 's'}, best match first. Only approved documents are searched.</p>
          {out.count === 0 && <div className="panel center"><p>Nothing matched. Try different words, or remove a filter.</p></div>}
          {out.results.map((r, i) => {
            const pct = Math.max(0, Math.min(100, Math.round(r.similarity * 100)));
            return (
              <FadeIn key={r.chunkId} delay={Math.min(i, 5) * 60}>
                <article className="panel">
                  <div className="plan-head">
                    <div>
                      <h3 style={{ fontSize: '1.2rem' }}>{i + 1}. {r.document.title}</h3>
                      <p className="small">{r.document.patientName} · document #{r.documentId} · chunk {r.chunkIndex + 1} · {r.document.source} · {fmtDateTime(r.document.createdAt)}</p>
                    </div>
                    <span className="badge badge-blue">{r.document.documentType}</span>
                  </div>
                  <div className="row" style={{ marginBottom: 14, flexWrap: 'nowrap' }}>
                    <div className="progress" style={{ flex: 1 }} aria-label={`Similarity ${pct}%`}><span style={{ width: `${pct}%` }} /></div>
                    <strong style={{ color: 'var(--primary-blue)', minWidth: 48 }}>{pct}%</strong>
                  </div>
                  <p style={{ color: 'var(--text-dark)', whiteSpace: 'pre-wrap' }}>{r.content}</p>
                  <div className="row" style={{ marginTop: 14, gap: 8 }}>
                    <StatusBadge status={r.document.status} />
                    {r.document.admissionId && <span className="badge badge-gray">admission #{r.document.admissionId}</span>}
                    {r.document.recoveryId && <span className="badge badge-gray">recovery #{r.document.recoveryId}</span>}
                  </div>
                </article>
              </FadeIn>
            );
          })}
        </>
      )}
    </div>
  );
}