/**
 * When to talk to the feed, and what to ask for.
 *
 * Kept free of fetch, storage and clocks so the decisions can be tested as
 * arithmetic. Everything that touches the network lives in `sync.ts`.
 *
 * The shape of the problem: a player must be able to lose their connection for
 * a week — a flight, a holiday, a bad month of roaming — and still open the app
 * every morning to a puzzle. So the app holds a horizon of days ahead, refills
 * it whenever it is online, and only ever shows an error when the day it is
 * actually asked for is not held.
 */

import { addDays, daysBetween, type DateKey } from '../logic/dateKey';
import type { Manifest, PackSummary } from './feed';

/**
 * How far ahead the app tries to hold content.
 *
 * Four weeks, not one. The requirement is that a week offline is survivable,
 * and a horizon equal to the requirement survives it only if the last sync
 * happened on the day the connection died. Four weeks means a player who was
 * last online three weeks ago still has a week of slack.
 */
export const HORIZON_DAYS = 28;

/**
 * Below this many days held, the app is running out and should sync even if it
 * synced recently. Above it, a sync can wait for the interval.
 */
export const REFILL_BELOW_DAYS = 14;

/** How long a manifest is trusted before it is worth re-reading. */
export const MANIFEST_TTL_MS = 12 * 60 * 60 * 1000;

export interface HeldRange {
  /** Pack ids already stored, so a sync does not re-download them. */
  packIds: string[];
  /** The last day the cache can serve continuously from `today`, or null for none. */
  coveredThrough: DateKey | null;
  /** When the manifest was last read, epoch ms, or null if never. */
  manifestReadAt: number | null;
}

/** Days of continuous coverage from `today` inclusive; 0 when today is not held. */
export function daysHeld(today: DateKey, held: HeldRange): number {
  if (held.coveredThrough === null) return 0;
  const span = daysBetween(today, held.coveredThrough);
  return span < 0 ? 0 : span + 1;
}

/**
 * Whether to reach for the network now.
 *
 * Running low always wins over the interval: a player about to run out is the
 * one case where a redundant request is cheaper than the alternative.
 */
export function shouldSync(today: DateKey, held: HeldRange, now: number): boolean {
  if (daysHeld(today, held) < REFILL_BELOW_DAYS) return true;
  if (held.manifestReadAt === null) return true;
  return now - held.manifestReadAt >= MANIFEST_TTL_MS;
}

/**
 * The packs worth downloading, nearest first.
 *
 * Nearest first matters on a slow or dying connection: the pack covering
 * tomorrow is worth more than the one covering five weeks out, and a sync that
 * is interrupted halfway should have spent its bytes on the days the player
 * reaches first.
 */
export function packsToFetch(today: DateKey, manifest: Manifest, held: HeldRange): PackSummary[] {
  const horizonEnd = addDays(today, HORIZON_DAYS);
  return manifest.packs
    .filter((p) => !held.packIds.includes(p.id))
    // Overlaps [today, today + horizon]. A pack entirely in the past is not
    // fetched: the archive reads what is already held, and re-downloading
    // history on every install would be the largest request the app ever makes.
    .filter((p) => p.to >= today && p.from <= horizonEnd)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/**
 * What the player should be told when a day cannot be served.
 *
 * `offline` and `unreachable` read almost the same to a player and are very
 * different to us: one is their connection, one is ours. Saying "check your
 * connection" when the feed is down is the kind of small lie that trains people
 * to distrust every message an app shows them.
 */
export type Shortfall =
  | { kind: 'offline'; lastDayHeld: DateKey | null }
  | { kind: 'unreachable'; lastDayHeld: DateKey | null }
  | { kind: 'exhausted'; servedThrough: DateKey };

export function shortfallFor(
  today: DateKey,
  held: HeldRange,
  online: boolean,
  feedReachable: boolean,
  servedThrough: DateKey | null,
): Shortfall {
  // The feed itself has run out: no amount of connectivity fixes it, so do not
  // send the player to look at their wifi.
  if (servedThrough !== null && today > servedThrough) {
    return { kind: 'exhausted', servedThrough };
  }
  if (!online) return { kind: 'offline', lastDayHeld: held.coveredThrough };
  if (!feedReachable) return { kind: 'unreachable', lastDayHeld: held.coveredThrough };
  // Online and the feed answered, yet the day is not held: treat it as the feed
  // being unreachable rather than inventing a fourth message. It resolves on
  // the next sync, and pretending otherwise would need a state the app cannot
  // observe.
  return { kind: 'unreachable', lastDayHeld: held.coveredThrough };
}
