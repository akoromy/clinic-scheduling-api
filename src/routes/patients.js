const express = require('express');
const { isAdmin } = require('../identify'); 

function patientsRouter(db) { // Returns an Express router for /patients endpoints using the given database connection
  const router = express.Router();
  const all = db.prepare('SELECT id, name, team_id AS teamId FROM patients ORDER BY id'); // Get all patients ordered by ID
  const byTeam = db.prepare('SELECT id, name, team_id AS teamId FROM patients WHERE team_id = ? ORDER BY id'); // Get patients by team ID ordered by ID

  // GET /patients returns all patients if the user is an admin, or only patients in the user's team otherwise.
  // The user is identified by the identify middleware, which attaches the user to req.user.
  router.get('/', (req, res) => {
    const patients = isAdmin(req.user) ? all.all() : byTeam.all(req.user.teamId);
    res.json(patients); // Return the patients as JSON
  });

  return router; 
}

module.exports = { patientsRouter }; 