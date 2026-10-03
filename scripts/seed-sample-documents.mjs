// Dev seeder: creates a demo facility, user, patient, admission, recovery episode and four
// care documents (three APPROVED, one DRAFT), and writes their text to data/documents/<id>.txt.
// Safe to re-run: existing rows are reused, text files are rewritten.
// The demo user's password_hash is a placeholder and cannot log in.
import fs from 'node:fs/promises';
import path from 'node:path';
import { getMysqlPool, closeMysql } from '../lib/db-mysql.mjs';
import { DOCUMENT_TEXT_DIR } from '../lib/document-source.mjs';

const pool = getMysqlPool();

async function findOrCreate(selectSql, selectParams, insertSql, insertParams) {
  const [rows] = await pool.execute(selectSql, selectParams);
  if (rows.length) return Object.values(rows[0])[0];
  const [res] = await pool.execute(insertSql, insertParams);
  return res.insertId;
}

const DOCS = [
  {
    type: 'DISCHARGE_SUMMARY', title: 'Discharge summary - hip fracture repair', status: 'APPROVED',
    admission: true, recovery: false,
    text: `Mrs. Demo was admitted after a fall at home and underwent a right hip hemiarthroplasty. Recovery on the ward was uneventful. She is mobilising with a walking frame under supervision and can climb a short flight of stairs with one rail.

On discharge she will need a wheelchair for longer distances and a raised toilet seat. The family home has two steps at the front door, so a temporary ramp or step-free entry must be arranged before she leaves hospital.

Pain is controlled with regular paracetamol; stronger analgesia is only for breakthrough pain. She should not bend the hip beyond ninety degrees for the first six weeks, and a seat cushion is advised for all chairs.`,
  },
  {
    type: 'REHAB_PLAN', title: 'Rehabilitation plan - mobility and strength', status: 'APPROVED',
    admission: false, recovery: true,
    text: `The rehabilitation centre will provide physiotherapy twice a week for six weeks. Sessions focus on walking re-training with a frame, gradual weight bearing, and strengthening of the hip and thigh muscles.

A daily home exercise programme is given on a printed sheet. The patient should practise sit-to-stand transfers and short supervised walks, increasing distance each week as pain allows.

Falls prevention is a priority: remove loose rugs, add night lighting on the route to the bathroom, and keep frequently used items at waist height. An occupational therapist will visit the home in the first week to review the layout.`,
  },
  {
    type: 'MEDICATION_NOTE', title: 'Medication and follow-up instructions', status: 'APPROVED',
    admission: true, recovery: false,
    text: `Blood-thinning injections continue for twenty-eight days after surgery to reduce the risk of clots. A district nurse will teach the family to give them or will visit daily if the family prefers.

The wound dressing is checked at the clinic after two weeks. Report increasing redness, swelling, discharge, fever, or a sudden rise in pain to the surgical team straight away.

Follow-up appointments: surgical review at six weeks, then an x-ray and outpatient physiotherapy assessment at three months. Bring the medication chart to every appointment.`,
  },
  {
    type: 'HOME_ASSESSMENT', title: 'Draft home assessment (not yet approved)', status: 'DRAFT',
    admission: true, recovery: false,
    text: `Draft notes from the first home visit. Bathroom has a high bath edge and no grab rails. Bedroom is upstairs. Final recommendations to follow after the occupational therapist signs off.`,
  },
];

try {
  const facility = await findOrCreate(
    'SELECT facility_id FROM facility WHERE name = ?', ['Demo General Hospital'],
    `INSERT INTO facility (name, facility_type, address, contact_number) VALUES (?, 'HOSPITAL', '1 Demo Road', '0000000000')`,
    ['Demo General Hospital']);
  const user = await findOrCreate(
    'SELECT user_id FROM app_user WHERE email = ?', ['demo.coordinator@example.test'],
    `INSERT INTO app_user (name, email, password_hash, status) VALUES ('Demo Coordinator', ?, '!demo-no-login', 'ACTIVE')`,
    ['demo.coordinator@example.test']);
  const patient = await findOrCreate(
    'SELECT patient_id FROM patient WHERE name = ?', ['Demo Patient'],
    `INSERT INTO patient (name, DOB) VALUES ('Demo Patient', '1950-03-14')`, []);
  const admission = await findOrCreate(
    'SELECT admission_id FROM admission WHERE patient_id = ? AND facility_id = ?', [patient, facility],
    `INSERT INTO admission (patient_id, facility_id, admission_date) VALUES (?, ?, '2026-09-01 09:00:00')`,
    [patient, facility]);
  const recovery = await findOrCreate(
    'SELECT recovery_id FROM recovery_episode WHERE patient_id = ? AND facility_id = ?', [patient, facility],
    `INSERT INTO recovery_episode (patient_id, facility_id, start_date, status) VALUES (?, ?, '2026-09-08', 'ACTIVE')`,
    [patient, facility]);

  await fs.mkdir(DOCUMENT_TEXT_DIR, { recursive: true });
  console.log(`patient ${patient}, admission ${admission}, recovery ${recovery}, user ${user}`);
  for (const d of DOCS) {
    const docId = await findOrCreate(
      'SELECT document_id FROM care_document WHERE patient_id = ? AND title = ?', [patient, d.title],
      `INSERT INTO care_document (patient_id, admission_id, recovery_id, document_type, title, source, created_by, status)
       VALUES (?, ?, ?, ?, ?, 'demo-seed', ?, ?)`,
      [patient, d.admission ? admission : null, d.recovery ? recovery : null, d.type, d.title, user, d.status]);
    await fs.writeFile(path.join(DOCUMENT_TEXT_DIR, `${docId}.txt`), d.text + '\n');
    console.log(`document ${docId}  ${d.status.padEnd(8)} ${d.title}`);
  }
  console.log('\nNext: npm run ingest -- --all');
} finally {
  await closeMysql();
}