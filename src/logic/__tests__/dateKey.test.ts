import { addDays, dayIndex, daysBetween, keyOf, noonOf, todayKey } from '../dateKey';

describe('keyOf', () => {
  it('formats a local date, zero-padded', () => {
    expect(keyOf(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('uses the local calendar day, not UTC', () => {
    // 23:30 local on the 5th is the 6th in UTC for any eastern offset; the key
    // must still be the 5th, or a player's "today" flips mid-evening.
    const late = new Date(2026, 5, 5, 23, 30);
    expect(keyOf(late)).toBe('2026-06-05');
  });
});

describe('todayKey', () => {
  it('reads the supplied instant', () => {
    expect(todayKey(new Date(2026, 8, 15, 9, 0))).toBe('2026-09-15');
  });
});

describe('noonOf', () => {
  it('anchors at midday local', () => {
    const noon = noonOf('2026-03-29');
    expect(noon.getHours()).toBe(12);
    expect(noon.getDate()).toBe(29);
    expect(noon.getMonth()).toBe(2);
  });
});

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays('2026-09-15', 1)).toBe('2026-09-16');
    expect(addDays('2026-09-15', -1)).toBe('2026-09-14');
  });

  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('survives a spring-forward DST boundary', () => {
    // The day is 23 hours long here in most of Europe and the US. Adding
    // 86,400,000 ms would land on the same date and the streak would stall.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('survives an autumn fall-back DST boundary', () => {
    // 25 hours long: a fixed-millisecond add would skip a day entirely.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('daysBetween', () => {
  it('counts forward, backward and zero', () => {
    expect(daysBetween('2026-09-15', '2026-09-18')).toBe(3);
    expect(daysBetween('2026-09-18', '2026-09-15')).toBe(-3);
    expect(daysBetween('2026-09-15', '2026-09-15')).toBe(0);
  });

  it('counts whole days across a DST change', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('counts a whole year', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });
});

describe('dayIndex', () => {
  it('starts at zero on the epoch', () => {
    expect(dayIndex('2026-01-01')).toBe(0);
  });

  it('increases by one a day', () => {
    expect(dayIndex('2026-01-02')).toBe(1);
    expect(dayIndex('2026-02-01')).toBe(31);
  });
});
