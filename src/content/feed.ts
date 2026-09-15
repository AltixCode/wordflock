/**
 * The wire format of the puzzle feed, and the rules a payload must satisfy
 * before any of it reaches a player.
 *
 * Wordflock's bundled bank is thirty puzzles: one month, and then it repeats.
 * That is not a daily. The feed is how the bank grows without a release — and
 * the reason it can be trusted is that nothing here believes the server.
 *
 * The portfolio rule is generate-then-verify: decide the property you need,
 * then produce output that has it. Over a network the same rule reads
 * fetch-then-verify. A pack is parsed defensively, every puzzle in it goes
 * through the same `problemsWith` that gates the bundled bank, and a pack with
 * one bad puzzle is discarded whole. A partially-good pack is worse than none:
 * it puts a puzzle in front of a player that the app will score wrongly, on a
 * day they cannot skip.
 */

import { problemsWith, type Difficulty, type Group, type Puzzle } from '../logic/puzzle';
import type { DateKey } from '../logic/dateKey';

/** Bumped only when the shape changes incompatibly. An app refuses what it cannot read. */
export const FEED_SCHEMA = 1;

export interface PackSummary {
  /** Stable and unique. A pack is replaced by publishing a new id, never edited. */
  id: string;
  /** Inclusive local-date bounds, `YYYY-MM-DD`. */
  from: DateKey;
  to: DateKey;
  /** Relative to the manifest's own URL. */
  path: string;
}

export interface Manifest {
  schema: number;
  /** The last day the feed can serve. Lets the app say how far ahead it is covered. */
  servedThrough: DateKey;
  packs: PackSummary[];
}

export interface Pack {
  id: string;
  from: DateKey;
  to: DateKey;
  /** Date-addressed: the server owns the schedule, not a client-side permutation. */
  puzzles: Record<DateKey, Puzzle>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isDate = (v: unknown): v is DateKey => typeof v === 'string' && DATE.test(v);

/**
 * A manifest, or the reasons it was refused.
 *
 * Every parse here returns problems rather than throwing, for the same reason
 * `problemsWith` does: one editing pass should see every fault, and a caller
 * that has to catch cannot log what was wrong.
 */
export function parseManifest(raw: unknown): { manifest: Manifest | null; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(raw)) return { manifest: null, problems: ['manifest is not an object'] };

  if (raw.schema !== FEED_SCHEMA) {
    // A newer schema is not an error the player should ever see: the app keeps
    // playing what it holds and simply stops taking updates until it is itself
    // updated. Saying so here is what makes that visible in a log.
    problems.push(`manifest schema is ${String(raw.schema)}, this build reads ${FEED_SCHEMA}`);
  }
  if (!isDate(raw.servedThrough)) problems.push('servedThrough is not a YYYY-MM-DD date');
  if (!Array.isArray(raw.packs)) problems.push('packs is not an array');

  if (problems.length > 0) return { manifest: null, problems };

  const packs: PackSummary[] = [];
  for (const [i, entry] of (raw.packs as unknown[]).entries()) {
    if (!isObject(entry)) { problems.push(`packs[${i}] is not an object`); continue; }
    const { id, from, to, path } = entry;
    if (typeof id !== 'string' || id.trim() === '') problems.push(`packs[${i}] has no id`);
    else if (!isDate(from)) problems.push(`pack ${id} has a bad "from"`);
    else if (!isDate(to)) problems.push(`pack ${id} has a bad "to"`);
    else if (to < from) problems.push(`pack ${id} ends before it starts`);
    else if (typeof path !== 'string' || path.trim() === '') problems.push(`pack ${id} has no path`);
    // A path is joined onto the feed's own base URL, so anything that could
    // walk out of it is refused rather than normalised -- a redirect to another
    // origin is how a content feed becomes a code-delivery channel.
    else if (path.includes('..') || path.startsWith('/') || path.includes('://')) {
      problems.push(`pack ${id} has a path that leaves the feed`);
    } else {
      packs.push({ id, from, to, path });
    }
  }

  if (problems.length > 0) return { manifest: null, problems };
  return {
    manifest: { schema: FEED_SCHEMA, servedThrough: raw.servedThrough as DateKey, packs },
    problems: [],
  };
}

function parseGroup(raw: unknown, where: string, problems: string[]): Group | null {
  if (!isObject(raw)) { problems.push(`${where}: a group is not an object`); return null; }
  const { theme, words, difficulty } = raw;
  if (typeof theme !== 'string') { problems.push(`${where}: a group has no theme`); return null; }
  if (!Array.isArray(words) || !words.every((w) => typeof w === 'string')) {
    problems.push(`${where}: "${theme}" has words that are not strings`);
    return null;
  }
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3 && difficulty !== 4) {
    problems.push(`${where}: "${theme}" has difficulty ${String(difficulty)}`);
    return null;
  }
  return { theme, words: words as string[], difficulty: difficulty as Difficulty };
}

/**
 * A pack, or the reasons it was refused.
 *
 * `problemsWith` runs over every puzzle, so a pack cannot introduce the fault
 * the bundled bank is gated against: a word that honestly belongs to two
 * groups, which makes a player right and tells them they are wrong.
 */
export function parsePack(raw: unknown, expected?: PackSummary): { pack: Pack | null; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(raw)) return { pack: null, problems: ['pack is not an object'] };

  const { id, from, to, puzzles } = raw;
  if (typeof id !== 'string' || id.trim() === '') problems.push('pack has no id');
  if (!isDate(from)) problems.push('pack has a bad "from"');
  if (!isDate(to)) problems.push('pack has a bad "to"');
  if (!isObject(puzzles)) problems.push('pack has no puzzles object');
  if (problems.length > 0) return { pack: null, problems };

  if (expected) {
    // The manifest is what the app decided to trust; a pack that does not match
    // the entry that sent us for it is not the pack we asked for.
    if (id !== expected.id) problems.push(`pack id is ${String(id)}, manifest said ${expected.id}`);
    if (from !== expected.from) problems.push(`pack ${expected.id} starts ${String(from)}, manifest said ${expected.from}`);
    if (to !== expected.to) problems.push(`pack ${expected.id} ends ${String(to)}, manifest said ${expected.to}`);
  }

  const out: Record<DateKey, Puzzle> = {};
  for (const [key, value] of Object.entries(puzzles as Record<string, unknown>)) {
    if (!isDate(key)) { problems.push(`"${key}" is not a YYYY-MM-DD date`); continue; }
    if (key < (from as DateKey) || key > (to as DateKey)) {
      problems.push(`${key} is outside the pack's own range`);
      continue;
    }
    if (!isObject(value)) { problems.push(`${key}: puzzle is not an object`); continue; }
    if (typeof value.id !== 'string' || value.id.trim() === '') { problems.push(`${key}: puzzle has no id`); continue; }
    if (!Array.isArray(value.groups)) { problems.push(`${key}: puzzle has no groups`); continue; }

    const groups: Group[] = [];
    let ok = true;
    for (const g of value.groups as unknown[]) {
      const group = parseGroup(g, key, problems);
      if (group === null) ok = false;
      else groups.push(group);
    }
    if (!ok) continue;

    const puzzle: Puzzle = { id: value.id, groups };
    const faults = problemsWith(puzzle);
    if (faults.length > 0) {
      faults.forEach((f) => problems.push(`${key}: ${f}`));
      continue;
    }
    out[key] = puzzle;
  }

  // Every day in the range must be covered. A gap is a day with no puzzle, and
  // the app would show the "you are offline" screen to someone who is online.
  if (problems.length === 0) {
    for (let d = from as DateKey; d <= (to as DateKey); d = nextDay(d)) {
      if (out[d] === undefined) problems.push(`${d} has no puzzle`);
    }
  }

  if (problems.length > 0) return { pack: null, problems };
  return { pack: { id: id as string, from: from as DateKey, to: to as DateKey, puzzles: out }, problems: [] };
}

/**
 * The next calendar day of a `YYYY-MM-DD` key, by UTC arithmetic.
 *
 * Deliberately not `addDays` from `dateKey`: that one works in the device's own
 * timezone because a player's "today" is local, while a pack's range is a plain
 * sequence of labels the server wrote. Using the local helper here would make
 * range iteration skip or repeat a label on a DST boundary.
 */
function nextDay(key: DateKey): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

export { nextDay };
