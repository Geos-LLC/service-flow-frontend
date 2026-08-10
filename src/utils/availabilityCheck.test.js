import { checkTeamMemberAvailability, parseHHMM, toDayName } from './availabilityCheck';

describe('parseHHMM', () => {
  test('converts HH:MM to minutes-of-day', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('09:30')).toBe(9 * 60 + 30);
    expect(parseHHMM('23:59')).toBe(23 * 60 + 59);
  });
  test('returns null for invalid input', () => {
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('9:00')).toBe(9 * 60);
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('nope')).toBeNull();
  });
});

describe('toDayName', () => {
  test('resolves day-of-week for known dates', () => {
    // 2026-08-10 is a Monday
    expect(toDayName('2026-08-10')).toBe('monday');
    expect(toDayName('2026-08-11')).toBe('tuesday');
    expect(toDayName('2026-08-15')).toBe('saturday');
    expect(toDayName('2026-08-16')).toBe('sunday');
  });
  test('returns null for invalid input', () => {
    expect(toDayName(null)).toBeNull();
    expect(toDayName('not-a-date')).toBeNull();
  });
});

describe('checkTeamMemberAvailability — customAvailability precedence', () => {
  const member = {
    id: 1,
    first_name: 'Alex',
    last_name: 'Kim',
    availability: {
      monday: { start: '09:00', end: '17:00' },
      customAvailability: [
        { date: '2026-08-11', available: false, source: 'zenbooker' },
        { date: '2026-08-12', available: true, hours: [{ start: '10:00', end: '14:00' }], source: 'zenbooker' },
      ],
    },
  };

  test('custom entry available:false → time_off', () => {
    const r = checkTeamMemberAvailability(member, '2026-08-11', '09:00', 60);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('time_off');
    expect(r.source).toBe('zenbooker');
    expect(r.memberName).toBe('Alex Kim');
  });

  test('custom entry with hours: slot fits → ok', () => {
    const r = checkTeamMemberAvailability(member, '2026-08-12', '11:00', 60);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('in_window');
  });

  test('custom entry with hours: slot before window → outside_hours', () => {
    const r = checkTeamMemberAvailability(member, '2026-08-12', '09:00', 60);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('outside_hours');
    expect(r.source).toBe('zenbooker');
  });

  test('custom entry with hours: slot end past window → outside_hours', () => {
    const r = checkTeamMemberAvailability(member, '2026-08-12', '13:30', 60);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('outside_hours');
  });

  test('date with no custom entry → falls through to weekly', () => {
    // 2026-08-10 is Monday → 09:00-17:00 → 11:00+60 fits
    const r = checkTeamMemberAvailability(member, '2026-08-10', '11:00', 60);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('in_window');
  });
});

describe('checkTeamMemberAvailability — weekly fallback', () => {
  const member = {
    availability: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { available: false },
    },
  };

  test('weekly hours: slot in window → ok', () => {
    const r = checkTeamMemberAvailability(member, '2026-08-10', '10:00', 60);
    expect(r.ok).toBe(true);
  });

  test('weekly hours: slot outside → outside_hours', () => {
    const r = checkTeamMemberAvailability(member, '2026-08-10', '18:00', 60);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('outside_hours');
  });

  test('weekly explicit available:false → time_off', () => {
    // 2026-08-11 is Tuesday
    const r = checkTeamMemberAvailability(member, '2026-08-11', '10:00', 60);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('time_off');
  });

  test('day with no weekly entry (Wednesday) → no_data, silently ok', () => {
    const r = checkTeamMemberAvailability(member, '2026-08-12', '10:00', 60);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('no_data');
  });
});

describe('checkTeamMemberAvailability — defensive paths', () => {
  test('no availability object → no_data (silent)', () => {
    const r = checkTeamMemberAvailability({ id: 1 }, '2026-08-10', '10:00', 60);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('no_data');
  });

  test('invalid time → returns ok=true with invalid_time reason (never blocks)', () => {
    const r = checkTeamMemberAvailability({ availability: { monday: { start: '09:00', end: '17:00' } } }, '2026-08-10', 'bogus', 60);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('invalid_time');
  });

  test('multi-hours override: matches any window', () => {
    const member = {
      availability: {
        customAvailability: [
          { date: '2026-08-11', available: true, hours: [
            { start: '08:00', end: '11:00' },
            { start: '14:00', end: '17:00' },
          ]},
        ],
      },
    };
    expect(checkTeamMemberAvailability(member, '2026-08-11', '09:00', 60).ok).toBe(true);
    expect(checkTeamMemberAvailability(member, '2026-08-11', '15:00', 60).ok).toBe(true);
    expect(checkTeamMemberAvailability(member, '2026-08-11', '12:00', 60).ok).toBe(false);
  });

  test('duration zero → treated as instantaneous, still checks start', () => {
    const member = { availability: { monday: { start: '09:00', end: '17:00' } } };
    // 09:00 with 0 duration → endMin == startMin, in window
    expect(checkTeamMemberAvailability(member, '2026-08-10', '09:00', 0).ok).toBe(true);
    // 18:00 with 0 duration → outside
    expect(checkTeamMemberAvailability(member, '2026-08-10', '18:00', 0).ok).toBe(false);
  });

  test('ZB-sourced conflict surfaces source marker', () => {
    const member = {
      availability: {
        customAvailability: [
          { date: '2026-08-11', available: false, source: 'zenbooker' },
        ],
      },
    };
    const r = checkTeamMemberAvailability(member, '2026-08-11', '10:00', 60);
    expect(r.source).toBe('zenbooker');
  });
});
