const request = require('supertest');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');

// Create a new in-memory database and seed it before each test, and create a new app instance
let app; 
let db;
beforeEach(() => {
  db = openDb(':memory:'); 
  seed(db);
  app = createApp(db); 
});

// Close the database after each test
afterEach(() => db.close());

// Helper function to make requests as a specific user
const as = (userId) => ({
  get: (url) => request(app).get(url).set('X-User-Id', userId),
  post: (url, body) => request(app).post(url).set('X-User-Id', userId).send(body),
});

// Helper function to create a booking object with default values, allowing overrides
const booking = (overrides = {}) => ({
  patientId: 'patient-a',
  doctorId: 'doc-a',
  startAt: '2026-12-03T09:00:00Z',
  endAt: '2026-12-03T09:30:00Z',
  ...overrides,
});

// Tests for the identify middleware and the /patients and /appointments routes
describe('identity', () => {
  test('rejects a request with no X-User-Id', async () => {
    const res = await request(app).get('/patients');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('rejects an unknown user id', async () => {
    const res = await as('nobody').get('/patients');
    expect(res.status).toBe(401);
  });
});

describe('GET /patients', () => {
  test('coord-a sees only patient-a', async () => {
    const res = await as('coord-a').get('/patients');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.id)).toEqual(['patient-a']);
  });

  test('admin sees all patients', async () => {
    const res = await as('admin-1').get('/patients');
    expect(res.body.map((p) => p.id)).toEqual(['patient-a', 'patient-b']);
  });
});

describe('POST /appointments', () => {
  test('coord-a books patient-a with doc-a (the example request)', async () => {
    const res = await as('coord-a').post('/appointments', booking());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      patientId: 'patient-a',
      doctorId: 'doc-a',
      startAt: '2026-12-03T09:00:00.000Z',
      endAt: '2026-12-03T09:30:00.000Z',
      createdById: 'coord-a',
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  test('times with an offset are normalised to UTC', async () => {
    const res = await as('coord-a').post('/appointments', booking({
      startAt: '2026-12-03T11:00:00+02:00',
      endAt: '2026-12-03T11:30:00+02:00',
    }));
    expect(res.status).toBe(201);
    expect(res.body.startAt).toBe('2026-12-03T09:00:00.000Z');
  });

  test.each([
    ['patient-b', 'doc-a'],
    ['patient-a', 'doc-b'],
  ])('coord-a cannot book %s with %s (other team)', async (patientId, doctorId) => {
    const res = await as('coord-a').post('/appointments', booking({ patientId, doctorId }));
    expect(res.status).toBe(403);
    const all = await as('admin-1').get('/appointments');
    expect(all.body).toHaveLength(0); // nothing was created
  });

  test('admin can book across teams', async () => {
    const res = await as('admin-1').post('/appointments', booking({ patientId: 'patient-b', doctorId: 'doc-b' }));
    expect(res.status).toBe(201);
  });

  test('an overlapping booking for the same doctor is rejected', async () => {
    await as('coord-a').post('/appointments', booking());
    const res = await as('coord-a').post('/appointments', booking({
      startAt: '2026-12-03T09:15:00Z',
      endAt: '2026-12-03T09:45:00Z',
    }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_CONFLICT');
  });

  test('a booking that starts exactly when another ends is accepted', async () => {
    await as('coord-a').post('/appointments', booking());
    const res = await as('coord-a').post('/appointments', booking({
      startAt: '2026-12-03T09:30:00Z',
      endAt: '2026-12-03T10:00:00Z',
    }));
    expect(res.status).toBe(201);
  });

  test('an overlap written with a different timezone is still caught', async () => {
    await as('coord-a').post('/appointments', booking());
    const res = await as('coord-a').post('/appointments', booking({
      startAt: '2026-12-03T11:10:00+02:00', // 09:10 UTC
      endAt: '2026-12-03T11:20:00+02:00',
    }));
    expect(res.status).toBe(409);
  });

  test('two simultaneous requests for the same slot: exactly one succeeds', async () => {
    const [first, second] = await Promise.all([
      as('coord-a').post('/appointments', booking()),
      as('admin-1').post('/appointments', booking()),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const all = await as('admin-1').get('/appointments');
    expect(all.body).toHaveLength(1);
  });

  test('the database trigger blocks an overlap even if the API check is bypassed', () => {
    const insert = db.prepare(`INSERT INTO appointments (id, patient_id, doctor_id, start_at, end_at, created_by_id)
      VALUES (?, 'patient-a', 'doc-a', ?, ?, 'admin-1')`);
    insert.run('x1', '2026-12-03T09:00:00.000Z', '2026-12-03T09:30:00.000Z');
    expect(() => insert.run('x2', '2026-12-03T09:10:00.000Z', '2026-12-03T09:20:00.000Z')).toThrow(/APPOINTMENT_CONFLICT/);
  });

  describe('invalid input returns 400', () => {
    test.each([
      ['missing patientId', { patientId: undefined }],
      ['missing startAt', { startAt: undefined }],
      ['timestamp without a timezone', { startAt: '2026-12-03T09:00:00' }],
      ['not a date', { startAt: 'tomorrow' }],
      ['impossible date', { startAt: '2026-13-45T09:00:00Z' }],
      ['30 February', { startAt: '2026-02-30T09:00:00Z' }],
      ['start after end', { startAt: '2026-12-03T10:00:00Z' }],
      ['start equal to end', { endAt: '2026-12-03T09:00:00Z' }],
    ])('%s', async (_label, overrides) => {
      const res = await as('coord-a').post('/appointments', booking(overrides));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    test('malformed JSON', async () => {
      const res = await request(app).post('/appointments')
        .set('X-User-Id', 'coord-a').set('Content-Type', 'application/json').send('{bad json');
      expect(res.status).toBe(400);
    });
  });

  test.each([
    ['unknown patient', { patientId: 'patient-z' }],
    ['unknown doctor', { doctorId: 'doc-z' }],
    ['a user who is not a doctor', { doctorId: 'coord-a' }],
  ])('%s returns 404', async (_label, overrides) => {
    const res = await as('admin-1').post('/appointments', booking(overrides));
    expect(res.status).toBe(404);
  });
});

describe('GET /appointments', () => {
  test('non-admins see no other team\'s appointments; admin sees all', async () => {
    await as('admin-1').post('/appointments', booking());
    await as('admin-1').post('/appointments', booking({ patientId: 'patient-b', doctorId: 'doc-b' }));

    const coord = await as('coord-a').get('/appointments');
    expect(coord.status).toBe(200);
    expect(coord.body.map((a) => a.patientId)).toEqual(['patient-a']);

    const docB = await as('doc-b').get('/appointments');
    expect(docB.body.map((a) => a.patientId)).toEqual(['patient-b']);

    const admin = await as('admin-1').get('/appointments');
    expect(admin.body).toHaveLength(2);
  });
});