const Database = require('better-sqlite3');

// Opens database and ensures tables exist.
// Pass ':memory:' for a throwaway database (for tests).
function openDb(fileName) {
  const db = new Database(fileName);
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id      TEXT PRIMARY KEY,
      name    TEXT NOT NULL,
      role    TEXT NOT NULL CHECK (role IN ('ADMIN', 'DOCTOR', 'COORDINATOR')),
      team_id TEXT              -- NULL for admins; belong to all teams
    );

    CREATE TABLE IF NOT EXISTS patients (
      id      TEXT PRIMARY KEY,
      name    TEXT NOT NULL,
      team_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id            TEXT PRIMARY KEY,
      patient_id    TEXT NOT NULL REFERENCES patients(id),
      doctor_id     TEXT NOT NULL REFERENCES users(id),
      start_at      TEXT NOT NULL,   -- UTC, e.g. 2026-12-03T09:00:00.000Z
      end_at        TEXT NOT NULL,
      created_by_id TEXT NOT NULL REFERENCES users(id),
      CHECK (start_at < end_at)
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time
      ON appointments (doctor_id, start_at, end_at);

    -- Last line of defence; database itself refuses overlapping
    -- appointments for the same doctor, no matter the application code does
    CREATE TRIGGER IF NOT EXISTS no_doctor_overlap
    BEFORE INSERT ON appointments
    WHEN EXISTS (
      SELECT 1 FROM appointments
      WHERE doctor_id = NEW.doctor_id
        AND start_at < NEW.end_at
        AND NEW.start_at < end_at
    )
    BEGIN
      SELECT RAISE(ABORT, 'APPOINTMENT_CONFLICT');
    END;
  `);
}

module.exports = { openDb };