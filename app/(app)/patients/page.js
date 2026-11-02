'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ErrorAlert, SectionHeader } from '@/components/ui';
import { api } from '@/lib/client-api.js';

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
    const [newPatient, setNewPatient] = useState({ name: '', DOB: '' });
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [message, setMessage] = useState('');

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
    async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setCreateError(null);
    setMessage('');

    try {
      const data = await api('/api/patients', {
        method: 'POST',
        body: { name: newPatient.name.trim(), DOB: newPatient.DOB },
      });
      setMessage(`Patient ${data.patient.name} added (ID ${data.patient.patientId}).`);
      setNewPatient({ name: '', DOB: '' });
      setSearch('');
      await loadPatients();
    } catch (err) {
      setCreateError(err);
    } finally {
      setSaving(false);
    }
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
                <form
          onSubmit={handleCreate}
          className="panel"
          style={{ marginBottom: 24 }}
        >
          <h3 style={{ marginBottom: 16 }}>Add patient</h3>

          <ErrorAlert error={createError} />
          {message && (
            <div className="alert alert-success" role="status">
              {message}
            </div>
          )}

          <div className="form-grid">
            <div>
              <label htmlFor="pn">Full name</label>
              <input
                id="pn"
                required
                maxLength={150}
                value={newPatient.name}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, name: e.target.value })
                }
              />
            </div>

            <div>
              <label htmlFor="pd">Date of birth</label>
              <input
                id="pd"
                type="date"
                required
                value={newPatient.DOB}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, DOB: e.target.value })
                }
              />
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving...' : 'Add patient'}
            </button>
          </div>
        </form>
        
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
                key={patient.patientId}
                href={`/patients/${patient.patientId}`}
                className="card"
              >
                <h3>{patient.name}</h3>

                <p>
                  <strong>Patient ID:</strong>{' '}
                  {patient.patientId}
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