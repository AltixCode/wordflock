/**
 * Which puzzle a given day gets.
 *
 * Deterministic and offline: the same date yields the same puzzle on every
 * device, forever, with no server. The bank is bundled, so a determined player
 * can read tomorrow's puzzle out of the app — that is accepted here rather than
 * defended against, because the alternative is a server and this genre is not
 * high-stakes enough to justify one.
 *
 * The order is a seeded permutation per cycle rather than the file order, so
 * "today is entry 41, therefore tomorrow is entry 42" is not true, and so a
 * second pass through the bank does not repeat the first pass's sequence.
 */

import { dayIndex, type DateKey } from "./dateKey";
import type { Puzzle } from "./puzzle";
import { makeRng, shuffled } from "./rng";

/** The first day the app serves a puzzle. Moving this reshuffles history. */
export const EPOCH: DateKey = "2026-01-01";

/**
 * The bank index for a day.
 *
 * Exported for the archive screen, which needs to know a past day's puzzle
 * without constructing one.
 */
export function puzzleIndexFor(
  key: DateKey,
  bankSize: number,
  epoch: DateKey = EPOCH,
): number {
  if (bankSize <= 0) throw new Error("the puzzle bank is empty");
  const day = dayIndex(key, epoch);
  // Days before the epoch wrap backwards rather than throwing: the archive can
  // ask for them, and a negative modulo in JS is negative.
  const cycle = Math.floor(day / bankSize);
  const within = ((day % bankSize) + bankSize) % bankSize;
  // A fresh permutation per cycle. Seeded by the cycle alone, so it is the same
  // on every device and stable across releases.
  const order = shuffled(
    Array.from({ length: bankSize }, (_, i) => i),
    makeRng(cycle * 2654435761 + 1),
  );
  return order[within] as number;
}

export function puzzleFor(
  key: DateKey,
  bank: readonly Puzzle[],
  epoch: DateKey = EPOCH,
): Puzzle {
  return bank[puzzleIndexFor(key, bank.length, epoch)] as Puzzle;
}

/**
 * The seed a day's board shuffle uses.
 *
 * Derived from the date rather than the puzzle, so two days that happen to draw
 * the same bank entry still lay the tiles out differently.
 */
export function boardSeedFor(key: DateKey): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
