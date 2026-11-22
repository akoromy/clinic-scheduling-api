const fs = require('fs');
const path = require('path');
const { openDb } = require('./db');
const { createApp } = require('./app');

const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'clinic.db'); // Use DB_FILE env var if set, otherwise default to data/clinic.db
fs.mkdirSync(path.dirname(file), { recursive: true }); // Ensure directory exists
const port = Number(process.env.PORT) || 3000; // Use PORT env var if set, otherwise default to 3000

const app = createApp(openDb(file)); 
app.listen(port, () => console.log(`Clinic API listening on http://localhost:${port}`)); // Start the server and log the URL to console