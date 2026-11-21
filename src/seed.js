const path = require('path');
const fs = require('fs');
const { openDb } = require('./db');

// Seed users
const USERS = [
  { id: 'admin-1', name: 'Alex Admin',      role: 'ADMIN',       teamId: null },
  { id: 'doc-a',   name: 'Dr Ana Andreou',  role: 'DOCTOR',      teamId: 'team-a' },
  { id: 'doc-b',   name: 'Dr Ben Barker',   role: 'DOCTOR',      teamId: 'team-b' },
  { id: 'coord-a', name: 'Cora Coordinator', role: 'COORDINATOR', teamId: 'team-a' },
];
// Seed patients
const PATIENTS = [
  { id: 'patient-a', name: 'Pat Alpha', teamId: 'team-a' },
  { id: 'patient-b', name: 'Pat Beta',  teamId: 'team-b' },
];

// Deletes everything and inserts fixed seed records in one transaction.
// Repeatable i.e. running it twice gives same result
function seed(db) {
  const reset = db.transaction(() => { // Wrap in transaction so that if any insert fails nothing is changed
    db.exec('DELETE FROM appointments; DELETE FROM patients; DELETE FROM users;');
    const insertUser = db.prepare('INSERT INTO users (id, name, role, team_id) VALUES (?, ?, ?, ?)'); // '?' to avoid SQL injection
    for (const u of USERS) insertUser.run(u.id, u.name, u.role, u.teamId); 
    const insertPatient = db.prepare('INSERT INTO patients (id, name, team_id) VALUES (?, ?, ?)'); // '?' to avoid SQL injection
    for (const p of PATIENTS) insertPatient.run(p.id, p.name, p.teamId);
  });
  reset();
}

// If file is run directly, seed the database file specified in DB_FILE or default to data/clinic.db
if (require.main === module) {
  const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'clinic.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = openDb(file);
  seed(db);
  console.log(`Seeded ${USERS.length} users and ${PATIENTS.length} patients into ${file}`);
}

module.exports = { seed };