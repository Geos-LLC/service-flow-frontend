/**
 * Availability interval math — frontend counterpart to
 * service-flow-backend/lib/lb-orchestration-capacity.js.
 *
 * Reads team_members.availability (jsonb, ZB-sourced post-Aug 2026) and
 * returns per-day working intervals, plus utilities to intersect them
 * against booked-job intervals. Used by the SF Schedule > Availability
 * tab to derive real capacity per (cleaner, day) instead of the old
 * "derived from scheduled jobs" pretend availability.
 *
 * All times are minutes-since-midnight (0..1440). Intervals are
 * [startMin, endMin] pairs.
 */

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseHHMMToMin(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

function dayNameFromDateString(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(d.getTime())) return null;
  return DAY_NAMES[d.getDay()];
}

function normalizeEntryToBlocks(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.available === false) return [];
  if (Array.isArray(entry.hours) && entry.hours.length > 0) {
    const out = [];
    for (const h of entry.hours) {
      const s = parseHHMMToMin(h?.start);
      const e = parseHHMMToMin(h?.end);
      if (s == null || e == null || e <= s) continue;
      out.push([s, e]);
    }
    return out.length > 0 ? out : null;
  }
  const s = parseHHMMToMin(entry.start);
  const e = parseHHMMToMin(entry.end);
  if (s == null || e == null || e <= s) return null;
  return [[s, e]];
}

/**
 * Returns [[startMin, endMin], ...] for a cleaner's working intervals on
 * a given date. Empty array = explicitly off; null = no signal at all
 * (caller decides how to render — Schedule shows "No schedule set" only
 * when EVERY cleaner returns null, otherwise treats null as "off").
 */
export function getWorkingIntervals(availability, dateStr) {
  if (!availability || typeof availability !== 'object') return null;
  const custom = Array.isArray(availability.customAvailability) ? availability.customAvailability : [];
  const override = custom.find(e => e && e.date === dateStr);
  if (override) {
    const blocks = normalizeEntryToBlocks(override);
    if (blocks !== null) return blocks;
  }
  const dayName = dayNameFromDateString(dateStr);
  if (!dayName) return null;
  const weekly = availability[dayName];
  if (!weekly) return null;
  return normalizeEntryToBlocks(weekly);
}

/**
 * Subtract intervals: returns portions of `base` not covered by any
 * interval in `subtract`. Both inputs are arrays of [start, end] in
 * minutes-of-day.
 */
export function subtractIntervals(base, subtract) {
  const sorted = [...(subtract || [])]
    .filter(iv => Array.isArray(iv) && iv.length === 2 && iv[1] > iv[0])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of sorted) {
    if (merged.length && iv[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
    } else {
      merged.push([iv[0], iv[1]]);
    }
  }
  const out = [];
  for (const [bs, be] of base) {
    let cur = bs;
    for (const [ss, se] of merged) {
      if (se <= cur) continue;
      if (ss >= be) break;
      if (ss > cur) out.push([cur, Math.min(ss, be)]);
      cur = Math.max(cur, se);
      if (cur >= be) break;
    }
    if (cur < be) out.push([cur, be]);
  }
  return out;
}

export function sumIntervalMinutes(intervals) {
  let total = 0;
  for (const [s, e] of (intervals || [])) {
    if (e > s) total += (e - s);
  }
  return total;
}

/**
 * Extract the portion of a job's interval that falls on `dateStr`.
 * Returns [startMin, endMin] clamped to the day, or null if the job
 * doesn't touch the day.
 */
export function jobIntervalOnDate(jobStartDate, durationMin, dateStr) {
  if (!(jobStartDate instanceof Date) || Number.isNaN(jobStartDate.getTime())) return null;
  const dayStart = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(dayStart.getTime())) return null;
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const jobStartMs = jobStartDate.getTime();
  const jobEndMs = jobStartMs + Math.max(1, Number(durationMin) || 60) * 60 * 1000;
  const s = Math.max(jobStartMs, dayStart.getTime());
  const e = Math.min(jobEndMs, dayEnd.getTime());
  if (e <= s) return null;
  return [
    Math.floor((s - dayStart.getTime()) / 60000),
    Math.ceil((e - dayStart.getTime()) / 60000),
  ];
}

/**
 * Format YYYY-MM-DD (local) from a Date. Matches the shape SF stores in
 * customAvailability.
 */
export function formatDateKey(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
