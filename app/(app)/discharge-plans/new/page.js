'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, qs } from '@/lib/client-api.js';
import PatientPicker from '@/components/PatientPicker';
import { ErrorAlert, SectionHeader } from '@/components/ui';

const EMPTY = { admissionId: '', doctorId: '', dischargeDate: '', destinationFacilityId: '', notes: '' };

export default function NewDischargePlan() {
  const router = useRouter();
  const [patient, setPatient] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/api/facilities').then((d) => setFacilities(d.facilities)).catch(setError); }, []);
  useEffect(() => {
    if (!patient) return;
    setAdmissions([]); setForm(EMPTY);
    api(`/api/lookups/admissions${qs({ patientId: patient.patientId })}`).then((d) => setAdmissions(d.admissions)).catch(setError);
  }, [patient]);

  const admission = admissions.find((a) => String(a.admissionId) === form.admissionId);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'admissionId' ? { doctorId: '', destinationFacilityId: '' } : {}) }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await api('/api/discharge-plans', { method: 'POST', body: {
        admissionId: Number(form.admissionId), doctorId: Number(form.doctorId), dischargeDate: form.dischargeDate,
        destinationFacilityId: form.destinationFacilityId ? Number(form.destinationFacilityId) : null, notes: form.notes.trim() || null,
      } });
      router.push(`/discharge-plans/${d.dischargePlan.dischargeId}`);
    } catch (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="page container stack">
      <SectionHeader left tag="Discharge plan" title="Plan a discharge" sub="Choose the patient and admission, the responsible doctor and where the patient goes next." />
      <div className="panel"><h4 style={{ marginBottom: 12 }}>1. Patient</h4><PatientPicker onSelect={setPatient} selectedId={patient?.patientId} /></div>
      {patient && (
        <form className="panel" onSubmit={submit}>
          <h4 style={{ marginBottom: 16 }}>2. Plan details for {patient.name}</h4>
          <div className="stack">
            <ErrorAlert error={error} />
            {admissions.length === 0 && <p className="muted">This patient has no admissions.</p>}
            <div className="form-grid">
              <div className="full">
                <label htmlFor="adm">Admission</label>
                <select id="adm" required value={form.admissionId} onChange={set('admissionId')}>
                  <option value="">Select an admission</option>
                  {admissions.map((a) => <option key={a.admissionId} value={a.admissionId}>#{a.admissionId} · {a.facilityName} · admitted {a.admissionDate.slice(0, 10)}{a.dischargeDate ? ' · discharged' : ''}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="doc">Responsible doctor</label>
                <select id="doc" required value={form.doctorId} onChange={set('doctorId')} disabled={!admission}>
                  <option value="">Select a doctor</option>
                  {admission?.doctors.map((d) => <option key={d.doctorId} value={d.doctorId}>{d.name} ({d.specialisation})</option>)}
                </select>
                {admission && admission.doctors.length === 0 && <p className="hint">No doctor is assigned to this admission yet. Assign one on the patient page.</p>}
              </div>
              <div><label htmlFor="dt">Discharge date and time</label><input id="dt" type="datetime-local" required value={form.dischargeDate} onChange={set('dischargeDate')} /></div>
              <div className="full">
                <label htmlFor="dest">Destination facility</label>
                <select id="dest" value={form.destinationFacilityId} onChange={set('destinationFacilityId')}>
                  <option value="">Home (no destination facility)</option>
                  {facilities.filter((f) => f.facilityId !== admission?.facilityId).map((f) => <option key={f.facilityId} value={f.facilityId}>{f.name} ({f.facilityType})</option>)}
                </select>
              </div>
              <div className="full"><label htmlFor="notes">Notes</label><textarea id="notes" maxLength={10000} value={form.notes} onChange={set('notes')} /></div>
            </div>
            <button className="btn btn-primary" disabled={busy || !form.doctorId}>{busy ? 'Creating...' : 'Create discharge plan'}</button>
          </div>
        </form>
      )}
    </div>
  );
}