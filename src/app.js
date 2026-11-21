const express = require('express');
const { identify } = require('./identify');
const { patientsRouter } = require('./routes/patients');
const { appointmentsRouter } = require('./routes/appointments');
const { ApiError } = require('./errors');

// Creates Express app with the given database connection and routes
function createApp(db) { 
  const app = express(); 
  app.use(express.json()); 
  app.use(identify(db)); 
  app.use('/patients', patientsRouter(db)); 
  app.use('/appointments', appointmentsRouter(db)); 

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

   
  // Error handling middleware
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) { 
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err.type === 'entity.parse.failed') { // body-parser error for invalid JSON
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Body must be valid JSON' } });
    }
    if (err.code === 'SQLITE_CONSTRAINT_TRIGGER' && /APPOINTMENT_CONFLICT/.test(err.message)) { // database trigger error for overlapping appointments
      return res.status(409).json({ error: { code: 'BOOKING_CONFLICT', message: 'The doctor already has an appointment that overlaps this time' } });
    }
    console.error(err); // log unexpected errors to console for debugging
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });

  return app;
}

module.exports = { createApp };