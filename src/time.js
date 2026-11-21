// Accepts only ISO 8601 timestamps that say which timezone they are in
// "...Z" (UTC) or offset like "+02:00"
// "2026-12-03T09:00:00" is rejected; cannot tell between 09:00 in (e.g.) Nicosia or Singapore
const ISO_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

// Returns the time as a UTC string (e.g. "2026-12-03T07:00:00.000Z"),
// null if the value is missing/ no timezone/ not a real date/time
function toUtc(value) {
  if (typeof value !== 'string') return null;
  const m = ISO_WITH_ZONE.exec(value);
  if (!m) return null;
  const [, year, month, day, hour, minute, second = '0'] = m;
  // Check that the date/time is valid (e.g. not 2026-02-30 or 25:00)
  const daysInMonth = new Date(Date.UTC(+year, +month, 0)).getUTCDate();
  if (+month < 1 || +month > 12 || +day < 1 || +day > daysInMonth) return null;
  if (+hour > 23 || +minute > 59 || +second > 59) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

module.exports = { toUtc };