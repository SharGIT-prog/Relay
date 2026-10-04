'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ErrorAlert, SectionHeader } from '@/components/ui';

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadPatients(value = '') {
    setLoading(true);
    setError('');

    try {
      const query = value
        ? `?search=${encodeURIComponent(value)}`
        : '';

      const response = await fetch(`/api/patients${query}`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load patients');
      }

      setPatients(data.patients ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    loadPatients(search);
  }

  return (
    <main className="section">
      <div className="container">
        <SectionHeader
          tag="Clinical"
          title="Patients"
          sub="Search patients and open their clinical record."
        />

        <form
          onSubmit={handleSubmit}
          className="panel"
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 24,
            alignItems: 'center',
          }}
        >
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient name"
            style={{ flex: 1 }}
          />

          <button className="btn btn-primary" type="submit">
            Search
          </button>
        </form>

        <ErrorAlert error={error} />

        {loading ? (
          <div className="panel">Loading patients...</div>
        ) : patients.length === 0 ? (
          <div className="panel">
            No patients found.
          </div>
        ) : (
          <div className="grid grid-2">
            {patients.map((patient) => (
              <Link
                key={patient.patient_id}
                href={`/patients/${patient.patient_id}`}
                className="card"
              >
                <h3>{patient.name}</h3>

                <p>
                  <strong>Patient ID:</strong>{' '}
                  {patient.patient_id}
                </p>

                <p>
                  <strong>Date of birth:</strong>{' '}
                  {patient.DOB}
                </p>

                <span className="btn btn-secondary">
                  View patient
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}