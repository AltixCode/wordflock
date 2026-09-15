/**
 * What comes back from storage is untrusted input: it was written by an older
 * build, or half-written when the app was killed, or belongs to a different
 * day's puzzle. Every one of those must yield a fresh session rather than a
 * crash or — worse — yesterday's board under today's title.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadSession, saveSession, sessionKeyFor } from '../persist';
import { startSession } from '@/logic/guess';
import { makeRng } from '@/logic/rng';
import type { Puzzle } from '@/logic/puzzle';

const puzzle: Puzzle = {
  id: 'test-1',
  groups: [
    { theme: 'Reds', difficulty: 1, words: ['CRIMSON', 'SCARLET', 'RUBY', 'CHERRY'] },
    { theme: 'Dogs', difficulty: 2, words: ['BEAGLE', 'BOXER', 'COLLIE', 'HUSKY'] },
    { theme: 'Rivers', difficulty: 3, words: ['NILE', 'AMAZON', 'THAMES', 'DANUBE'] },
    { theme: 'Keys', difficulty: 4, words: ['SHIFT', 'ENTER', 'TAB', 'SPACE'] },
  ],
};

const other: Puzzle = { ...puzzle, id: 'test-2' };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('saveSession / loadSession', () => {
  it('round-trips a session in progress', async () => {
    const session = startSession(puzzle, makeRng(1));
    const played = { ...session, mistakes: 2, guesses: [['A', 'B', 'C', 'D']] };
    await saveSession('2026-03-01', played);

    expect(await loadSession('2026-03-01', puzzle)).toEqual(played);
  });

  it('returns null for a day never played', async () => {
    expect(await loadSession('2026-03-02', puzzle)).toBeNull();
  });

  it('refuses a session saved against a different puzzle', async () => {
    await saveSession('2026-03-01', startSession(puzzle, makeRng(1)));
    expect(await loadSession('2026-03-01', other)).toBeNull();
  });

  it('refuses malformed JSON rather than throwing', async () => {
    await AsyncStorage.setItem(sessionKeyFor('2026-03-01'), '{not json');
    expect(await loadSession('2026-03-01', puzzle)).toBeNull();
  });

  it.each([
    ['a missing board', { solved: [], guesses: [], mistakes: 0, status: 'playing' }],
    ['a non-array board', { board: 'CRIMSON', solved: [], guesses: [], mistakes: 0, status: 'playing' }],
    ['an unknown status', { board: [], solved: [], guesses: [], mistakes: 0, status: 'paused' }],
    ['a negative mistake count', { board: [], solved: [], guesses: [], mistakes: -1, status: 'playing' }],
    ['a word not in the puzzle', { board: ['NOTAWORD'], solved: [], guesses: [], mistakes: 0, status: 'playing' }],
  ])('refuses a record with %s', async (_why, body) => {
    await AsyncStorage.setItem(
      sessionKeyFor('2026-03-01'),
      JSON.stringify({ puzzleId: puzzle.id, session: body }),
    );
    expect(await loadSession('2026-03-01', puzzle)).toBeNull();
  });

  it('keeps each day under its own key', () => {
    expect(sessionKeyFor('2026-03-01')).not.toBe(sessionKeyFor('2026-03-02'));
  });
});
