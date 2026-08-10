import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { checkTeamMemberAvailability } from '../utils/availabilityCheck';

/**
 * Advisory (non-blocking) warning when the scheduled date/time falls outside
 * a picked team member's availability. Reads team_members.availability, which
 * is populated by the SF availability editor and the ZB availability
 * reconcile cron (source: 'zenbooker').
 *
 * Props:
 *   members       — array of team_member rows (must include `availability`)
 *   date          — YYYY-MM-DD
 *   time          — HH:MM 24h
 *   durationMin   — number, defaults to 60
 */
const AvailabilityWarning = ({ members, date, time, durationMin = 60 }) => {
  if (!Array.isArray(members) || members.length === 0) return null;
  if (!date || !time) return null;

  const conflicts = members
    .map(m => ({ member: m, result: checkTeamMemberAvailability(m, date, time, durationMin) }))
    .filter(x => !x.result.ok);

  if (conflicts.length === 0) return null;

  const describe = ({ member, result }) => {
    const name = result.memberName || `Team member ${member?.id ?? ''}`;
    const isZbSourced = result.source === 'zenbooker';
    const suffix = isZbSourced ? ' (per Zenbooker availability)' : '';
    if (result.reason === 'time_off') {
      return `${name} is marked off on this date${suffix}.`;
    }
    if (result.reason === 'outside_hours') {
      const windows = Array.isArray(result.hours)
        ? result.hours
        : (result.hours ? [result.hours] : []);
      const range = windows.length > 0
        ? windows.map(h => `${h.start}–${h.end}`).join(', ')
        : null;
      return range
        ? `${name} is scheduled ${range} on this day${suffix} — this slot is outside those hours.`
        : `${name} is not scheduled at this time${suffix}.`;
    }
    return `${name} may not be available at this time${suffix}.`;
  };

  return (
    <div
      className="mb-4 p-3 rounded-lg border border-yellow-300 bg-yellow-50"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-sm text-yellow-900" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>
          <p className="font-medium mb-1" style={{ fontWeight: 500 }}>
            Availability check
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {conflicts.map((c, idx) => (
              <li key={`${c.member?.id ?? idx}-${c.result.reason}`}>{describe(c)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityWarning;
