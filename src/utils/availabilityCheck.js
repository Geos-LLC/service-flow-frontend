/**
 * Team member availability check.
 *
 * Reads team_members.availability (jsonb) — the shape written by the
 * SF availability editor and the ZB availability reconcile cron —
 * and answers "is `member` available at `date` from `time` for
 * `durationMin` minutes?".
 *
 * Availability shape:
 *   {
 *     monday: { start: "09:00", end: "17:00", break?: { start, end } },
 *     tuesday: {...}, ... sunday: {...},
 *     customAvailability: [
 *       { date: "YYYY-MM-DD", available: true|false, hours?: [{start,end}], source?: 'zenbooker' }
 *     ]
 *   }
 *
 * Precedence:
 *   1. customAvailability entry for the date wins.
 *      - available: false → { ok: false, reason: 'time_off' }
 *      - hours: [{start, end}, ...] → time must fit inside one of them.
 *   2. Weekly schedule fallback (availability[dayName]).
 *   3. No signal at all → { ok: true, reason: 'no_data' }.
 *      Missing availability is treated as "unknown", NOT "unavailable" —
 *      cleaners who haven't set anything up don't spam false warnings.
 *
 * Advisory only. Never blocks; caller decides whether to render UI.
 */

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function toDayName(dateString) {
  if (!dateString || typeof dateString !== 'string') return null;
  const parts = dateString.split('-').map(x => parseInt(x, 10));
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return null;
  return DAY_NAMES[d.getDay()];
}

function normalizeHoursList(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (Array.isArray(entry.hours) && entry.hours.length > 0) {
    return entry.hours.filter(h => h && typeof h.start === 'string' && typeof h.end === 'string');
  }
  if (typeof entry.start === 'string' && typeof entry.end === 'string') {
    return [{ start: entry.start, end: entry.end }];
  }
  return [];
}

function fitsInAnyWindow(hoursList, startMin, endMin) {
  for (const h of hoursList) {
    const winStart = parseHHMM(h.start);
    const winEnd = parseHHMM(h.end);
    if (winStart == null || winEnd == null) continue;
    if (startMin >= winStart && endMin <= winEnd) return { ok: true, window: h };
  }
  return { ok: false };
}

/**
 * @param {object} member  team_members row (needs `availability` field)
 * @param {string} dateString  YYYY-MM-DD
 * @param {string} timeString  HH:MM (24h)
 * @param {number} durationMin defaults to 60
 * @returns {object} { ok: boolean, reason: string, memberName?, hours?, source? }
 */
function checkTeamMemberAvailability(member, dateString, timeString, durationMin = 60) {
  const memberName = member
    ? [member.first_name, member.last_name].filter(Boolean).join(' ').trim()
    : '';
  const startMin = parseHHMM(timeString);
  if (startMin == null) return { ok: true, reason: 'invalid_time', memberName };
  const endMin = startMin + Math.max(0, Number(durationMin) || 0);

  const availability = member?.availability;
  if (!availability || typeof availability !== 'object') {
    return { ok: true, reason: 'no_data', memberName };
  }

  const custom = Array.isArray(availability.customAvailability)
    ? availability.customAvailability
    : [];
  const override = custom.find(e => e && e.date === dateString);

  if (override) {
    if (override.available === false) {
      return { ok: false, reason: 'time_off', memberName, source: override.source };
    }
    const hoursList = normalizeHoursList(override);
    if (hoursList.length === 0) {
      // Override says available but no hours specified → treat as no signal.
      return { ok: true, reason: 'no_data', memberName };
    }
    const fit = fitsInAnyWindow(hoursList, startMin, endMin);
    if (fit.ok) return { ok: true, reason: 'in_window', memberName, source: override.source, hours: fit.window };
    return { ok: false, reason: 'outside_hours', memberName, source: override.source, hours: hoursList };
  }

  const dayName = toDayName(dateString);
  if (!dayName) return { ok: true, reason: 'no_data', memberName };
  const weekly = availability[dayName];
  if (!weekly || typeof weekly !== 'object') {
    return { ok: true, reason: 'no_data', memberName };
  }
  if (weekly.available === false) {
    return { ok: false, reason: 'time_off', memberName };
  }
  const hoursList = normalizeHoursList(weekly);
  if (hoursList.length === 0) return { ok: true, reason: 'no_data', memberName };
  const fit = fitsInAnyWindow(hoursList, startMin, endMin);
  if (fit.ok) return { ok: true, reason: 'in_window', memberName, hours: fit.window };
  return { ok: false, reason: 'outside_hours', memberName, hours: hoursList };
}

export { checkTeamMemberAvailability, parseHHMM, toDayName };
