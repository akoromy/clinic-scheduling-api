# Mini Clinic Scheduling API

A small REST API for booking clinic appointments with team-based access rules
and double-booking prevention. Node.js, Express and SQLite (better-sqlite3).

## Run it

Requires Node 20+ (built with Node 24). No database server needed.

```bash
npm install
npm run seed     # creates data/clinic.db with the sample users and patients
npm start        # http://localhost:3000
npm test         
```

## Seed data (fictional)

| Id | Role | Team |
|---|---|---|
| admin-1 | ADMIN | none |
| doc-a | DOCTOR | team-a |
| doc-b | DOCTOR | team-b |
| coord-a | COORDINATOR | team-a |
| patient-a | patient | team-a |
| patient-b | patient | team-b |

## Endpoints

Every request needs an `X-User-Id` header.

- `GET /patients`: admins see all patients; others see their team's patients.
- `GET /appointments`: admins see all appointments; others see appointments of their team's patients.
- `POST /appointments`: body `{ patientId, doctorId, startAt, endAt }`, times in
  ISO 8601 with a timezone (`Z` or `+02:00`).

```bash
curl localhost:3000/appointments -H "X-User-Id: coord-a" -H "Content-Type: application/json" \
  -d '{"patientId":"patient-a","doctorId":"doc-a","startAt":"2026-12-03T09:00:00Z","endAt":"2026-12-03T09:30:00Z"}'
```

| Status | When |
|---|---|
| 201 | Booked; returns the appointment |
| 400 | Invalid body, missing fields, a time without a timezone, an impossible date, or start not before end |
| 401 | Missing or unknown `X-User-Id` |
| 403 | A non-admin booking a patient or doctor outside their team |
| 404 | Unknown patient, or a doctorId that isn't a doctor |
| 409 | The doctor already has an overlapping appointment |

Errors always look like `{ "error": { "code": "...", "message": "..." } }`.

## Design note

**Storage.** SQLite keeps setup to `npm install`, with no database server. The
schema uses foreign keys, a CHECK that start is before end, and an index on
(doctor_id, start_at, end_at) for the overlap query. For production I'd use
PostgreSQL, the tables and queries would carry over, and the trigger and locking would be replaced by an exclusion constraint.

**Time.** Times must include a timezone and are stored as UTC ISO strings.
A time without a zone is ambiguous and could double-book a doctor, so it's
rejected. Because every stored time has the same UTC
format, comparing them as text (alphabetically) gives the right order. 
Dates are validated part by part, because JavaScript can silently shift overflowing
dates into the next month (e.g. 30 February into 2 March).

**Double-booking.** Two appointments overlap when each starts before the
other ends, but back-to-back appointments are allowed. The check and insert run in
one `BEGIN IMMEDIATE` transaction, and a database trigger rejects overlapping inserts even
if some other code skips the API. Importantly, in a single Node process,
requests already run one at a time, but these protections matter when several
processes share the database. In PostgreSQL I'd use an exclusion constraint.

**Access.** Teams are filtered in SQL, so other teams' data don't leave the
database. I check existence (404) before permission (403), as it is clearer,
but it reveals that a patient in another team exists. Therefore, a stricter system may
return 404 for both.

**For a real clinical system I would consider:** real authentication instead of a header; 
an audit log of who viewed or changed what;
cancellation and rescheduling with history instead of deletion; pagination
and date filters; rate limiting; showing times in the clinic's timezone; and
mapping appointments to FHIR Appointment resources for interoperability.

## Known limitations

- No cancelling or rescheduling appointments.
- Bookings in the past are allowed.
- Checking existence (404) before permission (403) reveals which patient IDs exist.
- The overlap trigger covers inserts only. The API has no update endpoint, but direct database edits are not checked.
- The locking only matters when several processes share the database; one Node process already handles requests one at a time.
- Running `npm run seed` again deletes all appointments.
- Identity comes from the `X-User-Id` header, a stand-in for real authentication.

## Use of AI

I used Claude as a tutor and code reviewer throughout the build: walking through and brainstorming logic, 
explaining unfamiliar areas (e.g. SQLite), helping draft the README, and reviewing code and tests (and their scope).
