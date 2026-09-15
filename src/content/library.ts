/**
 * What puzzle a player gets on a given day, and where it came from.
 *
 * Three sources, in order:
 *
 *  1. the feed cache, which is date-addressed and authoritative;
 *  2. the bundled bank, which is the grace period after an install;
 *  3. nothing — an error screen, and never a made-up or recycled puzzle.
 *
 * The bundled bank is thirty puzzles. Permuting it forever, which is what the
 * app did before the feed existed, means a player who stays a month starts
 * replaying puzzles they have already solved while the app presents them as
 * today's. That is the dishonest option and it is the one that costs nothing to
 * implement, so it is worth naming: the bank now covers exactly the first
 * `BUNDLED_DAYS` days after an install and then stops.
 *
 * Anchoring on the install rather than a fixed epoch is what makes the bank
 * real content instead of a placeholder: those thirty puzzles are genuinely
 * unseen by a new player, whenever they arrive. It also means a store reviewer
 * with no network still plays a real game, and a player who has never had a
 * connection gets a month before the app has to ask for one.
 */

import bank from '../../data/puzzles.json';
import { puzzleFor } from '../logic/daily';
import type { Puzzle } from '../logic/puzzle';
import { daysBetween, type DateKey } from '../logic/dateKey';
import { puzzleOn } from './cache';

export type PuzzleSource = 'feed' | 'bundled';

export interface ResolvedPuzzle {
  puzzle: Puzzle;
  source: PuzzleSource;
  /** Days of bundled content left after this one; only meaningful when bundled. */
  bundledDaysLeft: number;
}

/** The bundled bank, as shipped. Never empty — `check:puzzles` refuses that. */
export const BUNDLED: readonly Puzzle[] = (bank as { puzzles: Puzzle[] }).puzzles;

/** How many days the bundled bank can serve before it would have to repeat. */
export const BUNDLED_DAYS = BUNDLED.length;

/**
 * Whether the bundled bank still covers `key`, given when the app was installed.
 *
 * A key before the install date is covered too: the archive can look backwards,
 * and a device whose clock was wrong on first launch should not lock a player
 * out of the game.
 */
export function bundledCovers(key: DateKey, installedOn: DateKey): boolean {
  const since = daysBetween(installedOn, key);
  return since < BUNDLED_DAYS;
}

export async function resolvePuzzle(key: DateKey, installedOn: DateKey): Promise<ResolvedPuzzle | null> {
  const fromFeed = await puzzleOn(key);
  if (fromFeed !== null) return { puzzle: fromFeed, source: 'feed', bundledDaysLeft: 0 };
  if (BUNDLED.length === 0) return null;
  if (!bundledCovers(key, installedOn)) return null;
  const since = daysBetween(installedOn, key);
  return {
    puzzle: puzzleFor(key, BUNDLED),
    source: 'bundled',
    bundledDaysLeft: Math.max(0, BUNDLED_DAYS - 1 - Math.max(0, since)),
  };
}
