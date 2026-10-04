'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api.js';

export default function PatientPicker({ onSelect, selectedId }) {
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    api('/api/patients').then((d) => setPatients(d.patients ?? d)).catch(() => {});
  }, []);

  return (
    <select
      value={selectedId ?? ''}
      onChange={(e) => {
        const p = patients.find((p) => String(p.patientId) === e.target.value);
        onSelect(p ?? null);
      }}
    >
      <option value="">Select a patient</option>
      {patients.map((p) => (
        <option key={p.patientId} value={p.patientId}>
          {p.name} (#{p.patientId})
        </option>
      ))}
    </select>
  );
}