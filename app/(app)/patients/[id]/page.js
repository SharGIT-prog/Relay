'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ErrorAlert,
  SectionHeader,
  StatusBadge,
} from '@/components/ui';

export default function PatientDetailsPage() {
  const { id } = useParams();

  const [patient, setPatient] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [admission, setAdmission] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [admissionForm, setAdmissionForm] = useState({
    facilityId: '',
    doctorId: '',
    admissionDate: '',
  });

  const [assignmentDoctorId, setAssignmentDoctorId] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');

    try {
      const [patientRes, doctorsRes, facilitiesRes] =
        await Promise.all([
          fetch(`/api/patients/${id}`),
          fetch('/api/doctors'),
          fetch('/api/facilities'),
        ]);

      const patientData = await patientRes.json();
      const doctorsData = await doctorsRes.json();
      const facilitiesData = await facilitiesRes.json();

      if (!patientRes.ok) {
        throw new Error(
          patientData.message || 'Unable to load patient'
        );
      }

      if (!doctorsRes.ok) {
        throw new Error(
          doctorsData.message || 'Unable to load doctors'
        );
      }

      if (!facilitiesRes.ok) {
        throw new Error(
          facilitiesData.message || 'Unable to load facilities'
        );
      }

      setPatient(patientData.patient);
      setDoctors(doctorsData.doctors ?? []);
      setFacilities(facilitiesData.facilities ?? []);

      if (patientData.patient?.admissionId) {
        const admissionRes = await fetch(
          `/api/admissions/${patientData.patient.admissionId}`
        );

        if (admissionRes.ok) {
          const admissionData = await admissionRes.json();
          setAdmission(admissionData.admission);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  function updateAdmissionField(name, value) {
    setAdmissionForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function createAdmission(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/admissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patientId: Number(id),
          facilityId: Number(admissionForm.facilityId),
          doctorId: Number(admissionForm.doctorId),
          admissionDate: admissionForm.admissionDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Unable to create admission'
        );
      }

      setAdmission(data.admission);
      setMessage('Admission created successfully.');

      setAdmissionForm({
        facilityId: '',
        doctorId: '',
        admissionDate: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function assignDoctor(event) {
    event.preventDefault();

    if (!assignmentDoctorId || !admission?.admissionId) {
      return;
    }

    setAssigning(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `/api/admissions/${admission.admissionId}/doctors`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            doctorId: Number(assignmentDoctorId),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Unable to assign doctor'
        );
      }

      setAdmission(data.admission);
      setAssignmentDoctorId('');
      setMessage('Doctor assigned successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return (
      <main className="section">
        <div className="container">
          <div className="panel">Loading patient...</div>
        </div>
      </main>
    );
  }

  if (!patient) {
    return (
      <main className="section">
        <div className="container">
          <ErrorAlert
            error={error || 'Patient not found'}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="section">
      <div className="container">
        <Link
          href="/patients"
          className="btn btn-secondary"
          style={{ marginBottom: 24 }}
        >
          ← Back to patients
        </Link>

        <SectionHeader
          tag="Patient"
          title={patient.name}
          sub={`Patient ID: ${patient.patientId}`}
        />

        <ErrorAlert error={error} />

        {message && (
          <div className="alert alert-success">
            {message}
          </div>
        )}

        <div className="grid grid-2">
          <section className="panel">
            <h2>Patient information</h2>

            <p>
              <strong>Name:</strong> {patient.name}
            </p>

            <p>
              <strong>Date of birth:</strong> {patient.DOB}
            </p>

            <p>
              <strong>Patient ID:</strong>{' '}
              {patient.patientId}
            </p>
          </section>

          <section className="panel">
            <h2>Current admission</h2>

            {admission ? (
              <>
                <p>
                  <strong>Admission ID:</strong>{' '}
                  {admission.admissionId}
                </p>

                <p>
                  <strong>Facility:</strong>{' '}
                  {admission.facilityName}
                </p>

                <p>
                  <strong>Admission date:</strong>{' '}
                  {admission.admissionDate}
                </p>

                <p>
                  <strong>Status:</strong>{' '}
                  <StatusBadge
                    status={
                      admission.dischargeDate
                        ? 'COMPLETED'
                        : 'ACTIVE'
                    }
                  />
                </p>
              </>
            ) : (
              <p>No admission currently recorded.</p>
            )}
          </section>
        </div>

        {!admission && (
          <section className="panel" style={{ marginTop: 24 }}>
            <h2>Create admission</h2>

            <form
              onSubmit={createAdmission}
              className="grid grid-2"
            >
              <label>
                Facility
                <select
                  className="input"
                  required
                  value={admissionForm.facilityId}
                  onChange={(e) =>
                    updateAdmissionField(
                      'facilityId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select facility
                  </option>

                  {facilities.map((facility) => (
                    <option
                      key={facility.facilityId}
                      value={facility.facilityId}
                    >
                      {facility.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Initial doctor
                <select
                  className="input"
                  required
                  value={admissionForm.doctorId}
                  onChange={(e) =>
                    updateAdmissionField(
                      'doctorId',
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select doctor
                  </option>

                  {doctors.map((doctor) => (
                    <option
                      key={doctor.doctorId}
                      value={doctor.doctorId}
                    >
                      {doctor.name} — {doctor.specialisation}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Admission date
                <input
                  className="input"
                  type="datetime-local"
                  required
                  value={admissionForm.admissionDate}
                  onChange={(e) =>
                    updateAdmissionField(
                      'admissionDate',
                      e.target.value
                    )
                  }
                />
              </label>

              <div style={{ alignSelf: 'end' }}>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? 'Creating...'
                    : 'Create admission'}
                </button>
              </div>
            </form>
          </section>
        )}

        {admission && (
          <section className="panel" style={{ marginTop: 24 }}>
            <h2>Assigned doctors</h2>

            {admission.doctors?.length ? (
              <div style={{ marginBottom: 24 }}>
                {admission.doctors.map((doctor) => (
                  <div
                    key={doctor.doctorId}
                    className="card"
                    style={{ marginBottom: 12 }}
                  >
                    <strong>{doctor.name}</strong>
                    <p>
                      {doctor.specialisation}
                    </p>
                    <small>
                      {doctor.contactNumber}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p>No doctors assigned.</p>
            )}

            <form
              onSubmit={assignDoctor}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <label style={{ flex: 1 }}>
                Assign another doctor
                <select
                  className="input"
                  value={assignmentDoctorId}
                  onChange={(e) =>
                    setAssignmentDoctorId(e.target.value)
                  }
                >
                  <option value="">
                    Select doctor
                  </option>

                  {doctors.map((doctor) => (
                    <option
                      key={doctor.doctorId}
                      value={doctor.doctorId}
                    >
                      {doctor.name} — {doctor.specialisation}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={assigning}
              >
                {assigning
                  ? 'Assigning...'
                  : 'Assign doctor'}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}