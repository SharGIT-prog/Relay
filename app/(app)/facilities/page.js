'use client';

import { useEffect, useState } from 'react';
import {
  ErrorAlert,
  SectionHeader,
} from '@/components/ui';

export default function FacilitiesPage() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    name: '',
    facilityType: '',
    address: '',
    contactNumber: '',
  });

  async function loadFacilities() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/facilities');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Unable to load facilities'
        );
      }

      setFacilities(data.facilities ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFacilities();
  }, []);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function createFacility(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/facilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Unable to create facility'
        );
      }

      setFacilities((current) => [
        ...current,
        data.facility,
      ]);

      setForm({
        name: '',
        facilityType: '',
        address: '',
        contactNumber: '',
      });

      setMessage('Facility created successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="section">
      <div className="container">
        <SectionHeader
          tag="Clinical"
          title="Facilities"
          sub="Manage hospitals, clinics and other care facilities."
        />

        <ErrorAlert error={error} />

        {message && (
          <div className="alert alert-success">
            {message}
          </div>
        )}

        <section className="panel" style={{ marginBottom: 24 }}>
          <h2>Register facility</h2>

          <form
            onSubmit={createFacility}
            className="grid grid-2"
          >
            <label>
              Name
              <input
                className="input"
                required
                value={form.name}
                onChange={(e) =>
                  updateField('name', e.target.value)
                }
                placeholder="Facility name"
              />
            </label>

            <label>
              Facility type
              <input
                className="input"
                required
                value={form.facilityType}
                onChange={(e) =>
                  updateField(
                    'facilityType',
                    e.target.value
                  )
                }
                placeholder="Hospital, Clinic, etc."
              />
            </label>

            <label>
              Address
              <input
                className="input"
                required
                value={form.address}
                onChange={(e) =>
                  updateField(
                    'address',
                    e.target.value
                  )
                }
                placeholder="Facility address"
              />
            </label>

            <label>
              Contact number
              <input
                className="input"
                required
                value={form.contactNumber}
                onChange={(e) =>
                  updateField(
                    'contactNumber',
                    e.target.value
                  )
                }
                placeholder="Contact number"
              />
            </label>

            <div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : 'Register facility'}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2>Registered facilities</h2>

          {loading ? (
            <div className="panel">
              Loading facilities...
            </div>
          ) : facilities.length === 0 ? (
            <div className="panel">
              No facilities registered.
            </div>
          ) : (
            <div className="grid grid-2">
              {facilities.map((facility) => (
                <div
                  key={facility.facility_id}
                  className="card"
                >
                  <h3>{facility.name}</h3>

                  <p>
                    <strong>Type:</strong>{' '}
                    {facility.facility_type}
                  </p>

                  <p>
                    <strong>Address:</strong>{' '}
                    {facility.address}
                  </p>

                  <p>
                    <strong>Contact:</strong>{' '}
                    {facility.contact_number}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}