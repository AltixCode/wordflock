import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { create } from 'zustand';

import { heldRange } from '@/content/cache';
import { resolvePuzzle, type PuzzleSource } from '@/content/library';
import { shortfallFor, type Shortfall } from '@/content/policy';
import { servedThrough, syncContent } from '@/content/sync';
import { boardSeedFor, EPOCH } from '@/logic/daily';
import { dayIndex, todayKey, type DateKey } from '@/logic/dateKey';
import { applyGuess, startSession, type GuessOutcome, type Session } from '@/logic/guess';
import { WORDS_PER_GROUP } from '@/logic/puzzle';
import { makeRng, shuffled } from '@/logic/rng';
import { loadSession, saveSession } from '@/game/persist';

const INSTALLED_KEY = 'wordflock.installedOn.v1';

/**
 * `unavailable` is a real, reachable state, not an error: the player is offline
 * past the cache, or has run ahead of the feed. It carries a `shortfall` saying
 * which, because "check your connection" shown when our own server is down is
 * the kind of small lie that teaches people to ignore every message we show.
 */
type Phase = 'idle' | 'loading' | 'ready' | 'unavailable';

interface GameState {
  phase: Phase;
  key: DateKey | null;
  /** The day's number, as printed on the shared grid. 1 on the epoch. */
  puzzleNumber: number;
  source: PuzzleSource | null;
  session: Session | null;
  selection: string[];
  shortfall: Shortfall | null;
  /** The result of the most recent submit, for the near-miss toast. */
  lastOutcome: GuessOutcome | null;
  load: (today?: DateKey, now?: number) => Promise<void>;
  toggle: (word: string) => void;
  clearSelection: () => void;
  shuffle: () => void;
  submit: () => Promise<void>;
  resetForTests: () => void;
}

const INITIAL = {
  phase: 'idle' as Phase,
  key: null,
  puzzleNumber: 0,
  source: null,
  session: null,
  selection: [] as string[],
  shortfall: null,
  lastOutcome: null,
};

/**
 * The day the app first ran, which is what decides how far the bundled bank
 * reaches. Written on first launch and never again — if it is missing we are on
 * a first launch by definition, and treating today as the install date is both
 * true and the most generous reading.
 */
async function installedOn(today: DateKey): Promise<DateKey> {
  try {
    const stored = await AsyncStorage.getItem(INSTALLED_KEY);
    if (stored !== null) return stored;
    await AsyncStorage.setItem(INSTALLED_KEY, today);
  } catch {
    // Storage is unavailable; today is still the honest answer.
  }
  return today;
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await getNetworkStateAsync();
    // `isInternetReachable` is the stronger claim and can be undefined before
    // the OS has probed; fall back rather than calling an unknown a failure.
    return state.isInternetReachable ?? state.isConnected ?? false;
  } catch {
    return false;
  }
}

export const useGameStore = create<GameState>((set, get) => ({
  ...INITIAL,

  load: async (today = todayKey(), now = Date.now()) => {
    set({ ...INITIAL, phase: 'loading', key: today, puzzleNumber: dayIndex(today, EPOCH) + 1 });

    const since = await installedOn(today);

    // Best effort: a failed sync is normal on a train, and the cache or the
    // bundled bank may well cover today anyway. Never let it stop the game.
    let feedReachable = false;
    try {
      feedReachable = (await syncContent(now, today)).feedReachable;
    } catch {
      feedReachable = false;
    }

    const resolved = await resolvePuzzle(today, since);
    if (resolved === null) {
      const [held, online, served] = await Promise.all([heldRange(today), isOnline(), servedThrough()]);
      set({
        phase: 'unavailable',
        shortfall: shortfallFor(today, held, online, feedReachable, served),
      });
      return;
    }

    const restored = await loadSession(today, resolved.puzzle);
    set({
      phase: 'ready',
      source: resolved.source,
      // Seeded by the date, so every device lays the day out the same way and a
      // screenshot of the board means the same thing to whoever it is sent to.
      session: restored ?? startSession(resolved.puzzle, makeRng(boardSeedFor(today))),
    });
  },

  toggle: (word) => {
    const { selection } = get();
    if (selection.includes(word)) {
      set({ selection: selection.filter((w) => w !== word), lastOutcome: null });
      return;
    }
    // A fifth tap is refused rather than evicting the first: silently dropping
    // a word the player chose is how a wrong guess gets submitted on their
    // behalf, and it costs one of only four mistakes.
    if (selection.length >= WORDS_PER_GROUP) return;
    set({ selection: [...selection, word], lastOutcome: null });
  },

  clearSelection: () => set({ selection: [], lastOutcome: null }),

  shuffle: () => {
    const { session } = get();
    if (session === null) return;
    // The selection survives: shuffling is for reading the board differently,
    // not for starting the guess again.
    set({
      session: { ...session, board: shuffled(session.board, makeRng(Date.now() >>> 0)) },
      lastOutcome: null,
    });
  },

  submit: async () => {
    const { session, selection, key } = get();
    if (session === null || key === null) return;

    const { session: next, outcome } = applyGuess(session, selection);
    // An invalid guess costs nothing and changes nothing, so the selection
    // stays put for the player to fix rather than being wiped for them.
    const scored = outcome.kind !== 'invalid' && outcome.kind !== 'finished';
    set({ session: next, lastOutcome: outcome, ...(scored ? { selection: [] } : {}) });
    if (scored) await saveSession(key, next);
  },

  resetForTests: () => set({ ...INITIAL }),
}));
