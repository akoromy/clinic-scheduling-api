const express = require('express'); 
const crypto = require('crypto'); // For generating UUIDs for new appointments
const { isAdmin } = require('../identify'); 
const { toUtc } = require('../time');
const { badRequest, forbidden, notFound, conflict } = require('../errors');

// Columns to select for appointments with aliases to match the API response format
const COLUMNS = `a.id, a.patient_id AS patientId, a.doctor_id AS doctorId,
  a.start_at AS startAt, a.end_at AS endAt, a.created_by_id AS createdById`; 

function appointmentsRouter(db) {
  const router = express.Router();

  const listAll = db.prepare(`SELECT ${COLUMNS} FROM appointments a ORDER BY a.start_at`); // Get all appointments ordered by start time
  const listForTeam = db.prepare(`
    SELECT ${COLUMNS} FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE p.team_id = ?
    ORDER BY a.start_at`); // Get appointments for a specific team ordered by start time
  const findPatient = db.prepare('SELECT id, team_id AS teamId FROM patients WHERE id = ?'); // Get a patient by ID with team ID
  const findDoctor = db.prepare("SELECT id, team_id AS teamId FROM users WHERE id = ? AND role = 'DOCTOR'"); // Get a doctor by ID with team ID, ensuring user is a doctor
  const findClash = db.prepare(`
    SELECT id FROM appointments
    WHERE doctor_id = ? AND start_at < ? AND ? < end_at
    LIMIT 1`); // Find any existing appointment that clashes with proposed time slot
  const insert = db.prepare(`
    INSERT INTO appointments (id, patient_id, doctor_id, start_at, end_at, created_by_id)
    VALUES (@id, @patientId, @doctorId, @startAt, @endAt, @createdById)`); 

  // GET /appointments returns all appointments if user is an admin, otherwise only appointments for patients in the user's team
  router.get('/', (req, res) => {
    const rows = isAdmin(req.user) ? listAll.all() : listForTeam.all(req.user.teamId);
    res.json(rows);
  });

 
  // Clash check and insert in one transaction
  const book = db.transaction((appointment) => { 
    if (findClash.get(appointment.doctorId, appointment.endAt, appointment.startAt)) {
      throw conflict('The doctor already has an appointment that overlaps this time');
    }
    insert.run(appointment);
    return appointment;
  });

  router.post('/', (req, res) => { 
    // Validate the input (400)
    const { patientId, doctorId, startAt, endAt } = req.body || {}; // Destructure request body 
    for (const [field, value] of Object.entries({ patientId, doctorId })) { 
      if (typeof value !== 'string' || value.trim() === '') { // Check that patientId and doctorId are nonempty strings
        throw badRequest(`${field} is required and must be a string`);
      }
    }
    const start = toUtc(startAt);
    const end = toUtc(endAt);
    if (!start || !end) { // Check that startAt and endAt are valid
      throw badRequest('startAt and endAt must be ISO 8601 timestamps with a timezone, e.g. 2026-12-03T09:00:00Z');
    }
    if (start >= end) throw badRequest('startAt must be earlier than endAt');

    // Check that both exist (404)
    const patient = findPatient.get(patientId);
    if (!patient) throw notFound(`Patient ${patientId} not found`);
    const doctor = findDoctor.get(doctorId);
    if (!doctor) throw notFound(`Doctor ${doctorId} not found`);

    // Check permission (403)
    const user = req.user;
    if (!isAdmin(user) && (patient.teamId !== user.teamId || doctor.teamId !== user.teamId)) { 
      throw forbidden('You can only book patients and doctors in your own team');
    }

    // Book or report clash (409)
    // Lock the database before checking, so another process can't book the same slot in between
    const appointment = book.immediate({
      id: crypto.randomUUID(), // Generate new UUID for appointment
      patientId, doctorId, startAt: start, endAt: end, createdById: user.id,
    });
    res.status(201).json(appointment);
  });

  return router;
}

module.exports = { appointmentsRouter };