/**
 * Local calendar days.
 *
 * Every date here is a *local* day, not a UTC instant. A player in Auckland and
 * one in Los Angeles should each get "today's" puzzle on their own calendar,
 * and a streak must not break because midnight UTC fell mid-afternoon.
 *
 * Arithmetic goes through a local-noon anchor rather than by adding 86 400 000
 * milliseconds: on a DST boundary a day is 23 or 25 hours long, and adding a
 * fixed day lands on the wrong date twice a year. Noon is far enough from
 * either boundary that no real-world offset can cross it.
 */

/** A `YYYY-MM-DD` key in the device's own timezone. */
export type DateKey = string;

const pad = (n: number): string => String(n).padStart(2, '0');

export function keyOf(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return keyOf(now);
}

/** Midday on the given key, in local time. */
export function noonOf(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** The key `days` after `key` — negative goes backwards. */
export function addDays(key: DateKey, days: number): DateKey {
  const anchor = noonOf(key);
  anchor.setDate(anchor.getDate() + days);
  return keyOf(anchor);
}

/** Whole local days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const ms = noonOf(to).getTime() - noonOf(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** A stable day number, used to index generated content. */
export function dayIndex(key: DateKey, epoch: DateKey = '2026-01-01'): number {
  return daysBetween(epoch, key);
}
