'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '@/lib/client-api.js';
import PatientPicker from '@/components/PatientPicker';
import { ErrorAlert, SectionHeader, StatusBadge, fmtDateTime } from '@/components/ui';

const EMPTY = { admissionId: '', recoveryId: '', documentType: '', title: '', source: '', status: 'DRAFT', text: '' };
const TYPES = ['DISCHARGE_SUMMARY', 'REHAB_PLAN', 'MEDICATION_NOTE', 'HOME_ASSESSMENT', 'CLINICAL_NOTE'];
const ACTIONS = {
  DRAFT: [['APPROVED', 'Approve and ingest', 'btn-primary'], ['ARCHIVED', 'Archive', 'btn-danger']],
  APPROVED: [['APPROVED', 'Re-ingest', 'btn-secondary'], ['DRAFT', 'Back to draft', 'btn-secondary'], ['ARCHIVED', 'Archive', 'btn-danger']],
  ARCHIVED: [],
};

function IngestionResult({ r }) {
  if (!r) return null;
  const good = r.status === 'INGESTED' || r.status === 'REMOVED' || r.status === 'SKIPPED';
  const text = r.status === 'INGESTED' ? `Ingested: ${r.chunks} searchable chunk(s) created.`
    : r.status === 'REMOVED' ? 'Chunks removed; the document is no longer searchable.'
    : r.status === 'SKIPPED' ? 'Saved as a draft. It becomes searchable once approved.'
    : `Saved, but ingestion failed (${r.code}): ${r.message}`;
  return <div className={`alert ${good ? 'alert-success' : 'alert-error'}`} role="status">{text}</div>;
}

export default function DocumentsPage() {
  const [filters, setFilters] = useState({ status: '', documentType: '', patientId: '' });
  const [docs, setDocs] = useState(null);
  const [patient, setPatient] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => api(`/api/documents${qs({ status: filters.status, documentType: filters.documentType.trim(), patientId: filters.patientId.trim(), limit: 100 })}`)
    .then((d) => setDocs(d.documents)).catch(setError), [filters]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    setAdmissions([]); setEpisodes([]); setForm((f) => ({ ...f, admissionId: '', recoveryId: '' }));
    if (!patient) return;
    api(`/api/admissions${qs({ patientId: patient.patientId })}`).then((d) => setAdmissions(d.admissions)).catch(setError);
    api(`/api/transition-readiness/${patient.patientId}`).then((d) => setEpisodes(d.recoveryEpisodes)).catch(setError);
  }, [patient]);

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function readFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200000) { setError('That file is too large (limit 200,000 characters). Split it into several documents.'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, text: String(reader.result), title: f.title || file.name.replace(/\.[^.]+$/, '') }));
    reader.readAsText(file);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const d = await api('/api/documents', { method: 'POST', body: {
        patientId: patient.patientId,
        admissionId: form.admissionId ? Number(form.admissionId) : null,
        recoveryId: form.recoveryId ? Number(form.recoveryId) : null,
        documentType: form.documentType.trim(), title: form.title.trim(), source: form.source.trim(), status: form.status,
        ...(form.text.trim() ? { text: form.text } : {}),
      } });
      setResult(d.ingestion);
      setForm(EMPTY);
      await refresh();
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  async function change(doc, status) {
    if (status === 'ARCHIVED' && !window.confirm('Archive this document? This is permanent and removes it from search.')) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const d = await api(`/api/documents/${doc.documentId}`, { method: 'PATCH', body: { status } });
      setResult(d.ingestion);
      await refresh();
    } catch (err) { setError(err); }
    finally { setBusy(false); }
  }

  return (
    <div className="page container stack">
      <SectionHeader left tag="Documents" title="Care documents" sub="Only approved documents are split into chunks and made searchable. Drafts and archived documents never appear in search." />
      <ErrorAlert error={error} />
      <IngestionResult r={result} />

      <div className="panel">
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3>All documents</h3>
          <div className="row">
            <select aria-label="Status" style={{ width: 150 }} value={filters.status} onChange={setF('status')}>
              <option value="">Any status</option><option>DRAFT</option><option>APPROVED</option><option>ARCHIVED</option>
            </select>
            <input aria-label="Document type" style={{ width: 180 }} placeholder="Type, e.g. REHAB_PLAN" value={filters.documentType} onChange={setF('documentType')} />
            <input aria-label="Patient ID" style={{ width: 120 }} placeholder="Patient ID" inputMode="numeric" value={filters.patientId} onChange={setF('patientId')} />
          </div>
        </div>
        {!docs && <p className="muted">Loading...</p>}
        {docs?.length === 0 && <p className="muted">No documents match.</p>}
        {docs?.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Title</th><th>Patient</th><th>Type</th><th>Created</th><th>Chunks</th><th>Status</th><th /></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.documentId}>
                    <td>#{d.documentId}</td><td><strong>{d.title}</strong><div className="small muted">{d.source}</div></td>
                    <td>{d.patientName}</td><td>{d.documentType}</td><td>{fmtDateTime(d.createdAt)}</td>
                    <td>{d.chunkCount}</td><td><StatusBadge status={d.status} /></td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        {ACTIONS[d.status].map(([s, label, cls]) => <button key={label} className={`btn btn-sm ${cls}`} disabled={busy} onClick={() => change(d, s)}>{label}</button>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel"><h3 style={{ marginBottom: 12 }}>Register a document</h3><h4 style={{ marginBottom: 12 }}>1. Patient</h4><PatientPicker onSelect={setPatient} selectedId={patient?.patientId} /></div>
      {patient && (
        <form className="panel" onSubmit={create}>
          <h4 style={{ marginBottom: 16 }}>2. Details for {patient.name}</h4>
          <div className="form-grid">
            <div>
              <label htmlFor="da">Admission (optional)</label>
              <select id="da" value={form.admissionId} onChange={set('admissionId')}>
                <option value="">None</option>
                {admissions.map((a) => <option key={a.admissionId} value={a.admissionId}>#{a.admissionId} · {a.facilityName} · {a.admissionDate.slice(0, 10)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dr">Recovery episode (optional)</label>
              <select id="dr" value={form.recoveryId} onChange={set('recoveryId')}>
                <option value="">None</option>
                {episodes.map((r) => <option key={r.recoveryId} value={r.recoveryId}>#{r.recoveryId} · from {r.startDate} · {r.status}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dt">Document type</label>
              <input id="dt" required maxLength={60} list="doc-types" value={form.documentType} onChange={set('documentType')} />
              <datalist id="doc-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
              <p className="hint">The type can be used as a search filter.</p>
            </div>
            <div><label htmlFor="ds">Source</label><input id="ds" required maxLength={150} placeholder="e.g. ward round, rehab clinic" value={form.source} onChange={set('source')} /></div>
            <div className="full"><label htmlFor="dti">Title</label><input id="dti" required maxLength={250} value={form.title} onChange={set('title')} /></div>
            <div>
              <label htmlFor="dst">Status</label>
              <select id="dst" value={form.status} onChange={set('status')}><option value="DRAFT">DRAFT (not searchable)</option><option value="APPROVED">APPROVED (ingest now)</option></select>
            </div>
            <div><label htmlFor="df">Upload a text file (optional)</label><input id="df" type="file" accept=".txt,.md,text/plain" onChange={readFile} /></div>
            <div className="full">
              <label htmlFor="dtx">Document text</label>
              <textarea id="dtx" style={{ minHeight: 180 }} maxLength={200000} value={form.text} onChange={set('text')} />
              <p className="hint">{form.text.length.toLocaleString()} characters. An approved document without text cannot be ingested.</p>
            </div>
          </div>
          <div style={{ marginTop: 20 }}><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : form.status === 'APPROVED' ? 'Save and ingest' : 'Save document'}</button></div>
        </form>
      )}
    </div>
  );
}