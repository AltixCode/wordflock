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
import { shouldShowInterstitial } from '@/monetization/adPolicy';
import { shouldShowAds } from '@/monetization/entitlements';
import { showInterstitial } from '@/monetization/interstitial';
import { loadSession, saveSession } from '@/game/persist';
import { usePremiumStore } from './usePremiumStore';

const INSTALLED_KEY = 'wordflock.installedOn.v1';
const PACING_KEY = 'wordflock.adPacing.v1';

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

interface AdPacing {
  /** Puzzles carried to a result, won or lost. */
  completed: number;
  lastInterstitialAt: number;
}

const NO_PACING: AdPacing = { completed: 0, lastInterstitialAt: 0 };

async function readPacing(): Promise<AdPacing> {
  try {
    const raw = await AsyncStorage.getItem(PACING_KEY);
    if (raw === null) return NO_PACING;
    const parsed = JSON.parse(raw) as Partial<AdPacing>;
    return {
      completed: typeof parsed.completed === 'number' ? parsed.completed : 0,
      lastInterstitialAt:
        typeof parsed.lastInterstitialAt === 'number' ? parsed.lastInterstitialAt : 0,
    };
  } catch {
    return NO_PACING;
  }
}

/**
 * The interstitial, at the one moment this game has: the day's puzzle ending.
 *
 * The count is persisted, which is the whole point. Wordflock is played once a
 * day, so a counter that lived in memory would reset before it ever reached
 * `MIN_GAMES_BEFORE_FIRST_INTERSTITIAL` and the ad would never appear -- while
 * the paywall went on selling its removal. Six sibling apps hand the policy a
 * literal `gamesPlayed: 1` and have exactly that bug; `adPolicy`'s own unit
 * test passes in every one of them, because the defect is in the call site.
 */
async function noteCompletedPuzzle(): Promise<void> {
  const pacing = await readPacing();
  const next: AdPacing = { ...pacing, completed: pacing.completed + 1 };
  const now = Date.now();

  const { isPremium, isReady } = usePremiumStore.getState();
  const show =
    shouldShowAds({ isPremium, isReady }) &&
    shouldShowInterstitial({
      gamesPlayed: next.completed,
      lastInterstitialAt: next.lastInterstitialAt,
      now,
      adsRemoved: isPremium,
    });

  // Recorded only when one was actually put on screen: a failed fill must not
  // start the 90-second clock, or a genuine ad is skipped later for one that
  // never appeared.
  if (show && showInterstitial()) next.lastInterstitialAt = now;

  try {
    await AsyncStorage.setItem(PACING_KEY, JSON.stringify(next));
  } catch {
    // Pacing is a nicety; losing it must never fail the guess that ended the
    // puzzle, which has already been saved.
  }
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
    if (!scored) return;
    await saveSession(key, next);
    // The transition, not the state: a restored finished session must not be
    // counted again every time the player reopens the app.
    if (session.status === 'playing' && next.status !== 'playing') await noteCompletedPuzzle();
  },

  resetForTests: () => set({ ...INITIAL }),
}));
