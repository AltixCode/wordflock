/**
 * A day's session, kept across launches.
 *
 * A player who opens the app on the bus, guesses twice and gets off must find
 * those two guesses — and those two mistakes — still spent when they come back.
 * Dropping them would turn four mistakes into unlimited retries, which is the
 * whole game.
 *
 * `Session` is already plain JSON by design (see `src/logic/guess.ts`), so this
 * is storage and validation only, with no shape of its own to keep in step.
 *
 * Everything read back is untrusted: written by an older build, half-written
 * when the app was killed, or belonging to a different puzzle because the feed
 * replaced the day. Each of those yields `null` — a fresh session — rather than
 * a crash or, worse, yesterday's board under today's title.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DateKey } from '../logic/dateKey';
import type { Session } from '../logic/guess';
import { MISTAKES_ALLOWED, allWords, type Puzzle } from '../logic/puzzle';

export function sessionKeyFor(key: DateKey): string {
  return `wordflock.session.v1.${key}`;
}

interface StoredSession {
  /** The puzzle the session was played against, so a swapped day is detected. */
  puzzleId: string;
  session: Session;
}

const STATUSES: readonly Session['status'][] = ['playing', 'won', 'lost'];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function looksLikeSession(value: unknown, puzzle: Puzzle): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<Session>;
  if (!isStringArray(s.board) || !isStringArray(s.solved)) return false;
  if (!Array.isArray(s.guesses) || !s.guesses.every(isStringArray)) return false;
  if (typeof s.mistakes !== 'number' || !Number.isInteger(s.mistakes)) return false;
  if (s.mistakes < 0 || s.mistakes > MISTAKES_ALLOWED) return false;
  if (typeof s.status !== 'string' || !STATUSES.includes(s.status as Session['status'])) return false;
  // Words the puzzle does not contain would render a board the rules cannot
  // score. Cheaper to start over than to reason about a corrupt one.
  const known = new Set(allWords(puzzle));
  if (!s.board.every((w) => known.has(w))) return false;
  const themes = new Set(puzzle.groups.map((g) => g.theme));
  return s.solved.every((theme) => themes.has(theme));
}

export async function saveSession(key: DateKey, session: Session): Promise<void> {
  const record: StoredSession = { puzzleId: session.puzzle.id, session };
  try {
    await AsyncStorage.setItem(sessionKeyFor(key), JSON.stringify(record));
  } catch {
    // Losing the save is a bad day; crashing mid-guess because the disk is
    // full is a worse one. The session in memory is unaffected.
  }
}

export async function loadSession(key: DateKey, puzzle: Puzzle): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(sessionKeyFor(key));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Partial<StoredSession>;
    if (record.puzzleId !== puzzle.id) return null;
    if (!looksLikeSession(record.session, puzzle)) return null;
    // The stored puzzle is discarded in favour of the one resolved today: they
    // have the same id, and the live one is the one the rest of the app holds.
    return { ...(record.session as Session), puzzle };
  } catch {
    return null;
  }
}
