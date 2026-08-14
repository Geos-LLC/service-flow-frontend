import {
  getWorkingIntervals,
  subtractIntervals,
  sumIntervalMinutes,
  jobIntervalOnDate,
  formatDateKey,
} from './availabilityMath';

describe('getWorkingIntervals', () => {
  const avail = {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { hours: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
    wednesday: { available: false },
    customAvailability: [
      { date: '2026-08-14', available: false, source: 'zenbooker' },
      { date: '2026-08-20', available: true, hours: [{ start: '10:00', end: '15:00' }], source: 'zenbooker' },
    ],
  };

  test('weekly single block', () => {
    expect(getWorkingIntervals(avail, '2026-08-10')).toEqual([[540, 1020]]); // 9:00 - 17:00
  });
  test('weekly multi block', () => {
    expect(getWorkingIntervals(avail, '2026-08-11')).toEqual([[480, 720], [780, 1020]]);
  });
  test('weekly explicit off', () => {
    expect(getWorkingIntervals(avail, '2026-08-12')).toEqual([]);
  });
  test('customAvailability override wins', () => {
    expect(getWorkingIntervals(avail, '2026-08-14')).toEqual([]);
    expect(getWorkingIntervals(avail, '2026-08-20')).toEqual([[600, 900]]);
  });
  test('null availability → null', () => {
    expect(getWorkingIntervals(null, '2026-08-10')).toBeNull();
  });
  test('day missing from weekly → null', () => {
    expect(getWorkingIntervals(avail, '2026-08-13')).toBeNull();
  });
});

describe('subtractIntervals', () => {
  test('empty subtract returns base', () => {
    expect(subtractIntervals([[540, 1020]], [])).toEqual([[540, 1020]]);
  });
  test('job splits base', () => {
    expect(subtractIntervals([[540, 1020]], [[600, 720]])).toEqual([[540, 600], [720, 1020]]);
  });
  test('job fully covers base', () => {
    expect(subtractIntervals([[540, 1020]], [[0, 1440]])).toEqual([]);
  });
});

describe('sumIntervalMinutes', () => {
  test('single block', () => {
    expect(sumIntervalMinutes([[540, 1020]])).toBe(480);
  });
  test('multi block', () => {
    expect(sumIntervalMinutes([[480, 720], [780, 1020]])).toBe(480);
  });
  test('empty', () => {
    expect(sumIntervalMinutes([])).toBe(0);
  });
});

describe('jobIntervalOnDate', () => {
  test('same-day job returns intersected minutes', () => {
    const start = new Date('2026-08-10T10:00:00');
    expect(jobIntervalOnDate(start, 120, '2026-08-10')).toEqual([600, 720]);
  });
  test('job on different date returns null', () => {
    const start = new Date('2026-08-11T10:00:00');
    expect(jobIntervalOnDate(start, 60, '2026-08-10')).toBeNull();
  });
  test('invalid input returns null', () => {
    expect(jobIntervalOnDate(null, 60, '2026-08-10')).toBeNull();
  });
});

describe('formatDateKey', () => {
  test('formats local YYYY-MM-DD', () => {
    // Note: local-time construction ensures no TZ shift
    const d = new Date(2026, 7, 10); // Aug 10, 2026 local
    expect(formatDateKey(d)).toBe('2026-08-10');
  });
});
