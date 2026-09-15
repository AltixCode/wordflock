/**
 * The store is where the pure rules meet storage, the feed and the clock, so
 * these tests exercise it against the real cache (on the AsyncStorage mock) and
 * the real puzzle library. Only the two things that genuinely leave the device
 * -- the feed sync and the network state -- are mocked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MISTAKES_ALLOWED } from '@/logic/puzzle';
import { usePremiumStore } from '../usePremiumStore';
import { useGameStore } from '../useGameStore';

jest.mock('@/content/sync', () => ({
  syncContent: jest.fn().mockResolvedValue({ feedReachable: true, packsAdded: [], problems: [] }),
  servedThrough: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/monetization/interstitial', () => ({
  preloadInterstitial: jest.fn(),
  showInterstitial: jest.fn().mockReturnValue(true),
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

const { syncContent, servedThrough } = jest.requireMock('@/content/sync');
const { getNetworkStateAsync } = jest.requireMock('expo-network');
const { showInterstitial } = jest.requireMock('@/monetization/interstitial');

// A day inside the bundled bank's reach, with the install on the same day.
const TODAY = '2026-03-01';

beforeEach(async () => {
  await AsyncStorage.clear();
  useGameStore.getState().resetForTests();
  syncContent.mockResolvedValue({ feedReachable: true, packsAdded: [], problems: [] });
  servedThrough.mockResolvedValue(null);
  getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  showInterstitial.mockClear().mockReturnValue(true);
  usePremiumStore.setState({ isPremium: false, isReady: true });
});

async function completedCount(): Promise<number> {
  const raw = await AsyncStorage.getItem('wordflock.adPacing.v1');
  return raw === null ? 0 : (JSON.parse(raw) as { completed: number }).completed;
}

async function loaded() {
  await useGameStore.getState().load(TODAY);
  return useGameStore.getState();
}

describe('load', () => {
  it('reaches a playable board from the bundled bank', async () => {
    const s = await loaded();
    expect(s.phase).toBe('ready');
    expect(s.session?.board).toHaveLength(16);
    expect(s.session?.status).toBe('playing');
    expect(s.puzzleNumber).toBeGreaterThan(0);
  });

  it('lays the same day out identically on two devices', async () => {
    const first = (await loaded()).session?.board;
    await AsyncStorage.clear();
    useGameStore.getState().resetForTests();
    expect((await loaded()).session?.board).toEqual(first);
  });

  it('restores a session in progress rather than starting over', async () => {
    const s = await loaded();
    const group = s.session!.puzzle.groups[1]!;
    for (const w of group.words) useGameStore.getState().toggle(w);
    await useGameStore.getState().submit();
    expect(useGameStore.getState().session?.solved).toEqual([group.theme]);

    useGameStore.getState().resetForTests();
    expect((await loaded()).session?.solved).toEqual([group.theme]);
  });

  it('still reaches a board when the feed is unreachable', async () => {
    syncContent.mockResolvedValue({ feedReachable: false, packsAdded: [], problems: ['boom'] });
    expect((await loaded()).phase).toBe('ready');
  });

  it('survives a sync that throws', async () => {
    syncContent.mockRejectedValue(new Error('network down'));
    expect((await loaded()).phase).toBe('ready');
  });
});

describe('when no puzzle can be served', () => {
  // The real shape of this state: installed long ago, so the bundled bank has
  // been used up, and nothing cached this far ahead. A fresh install can never
  // reach it -- the bank covers from the install date -- which is exactly why
  // the first draft of these tests passed against a playable board.
  const FAR = '2029-01-01';

  beforeEach(async () => {
    await AsyncStorage.setItem('wordflock.installedOn.v1', '2026-01-01');
  });

  it('names the connection when the device is offline', async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await useGameStore.getState().load(FAR);
    const s = useGameStore.getState();
    expect(s.phase).toBe('unavailable');
    expect(s.shortfall?.kind).toBe('offline');
  });

  it('blames us, not the player, when the device is online but the feed is not', async () => {
    syncContent.mockResolvedValue({ feedReachable: false, packsAdded: [], problems: [] });
    await useGameStore.getState().load(FAR);
    expect(useGameStore.getState().shortfall?.kind).toBe('unreachable');
  });

  it('says the feed has run out when it has', async () => {
    servedThrough.mockResolvedValue('2028-12-31');
    await useGameStore.getState().load(FAR);
    expect(useGameStore.getState().shortfall?.kind).toBe('exhausted');
  });
});

describe('selection', () => {
  it('toggles a word on and off', async () => {
    const word = (await loaded()).session!.board[0]!;
    useGameStore.getState().toggle(word);
    expect(useGameStore.getState().selection).toEqual([word]);
    useGameStore.getState().toggle(word);
    expect(useGameStore.getState().selection).toEqual([]);
  });

  it('refuses a fifth word rather than silently dropping the first', async () => {
    const board = (await loaded()).session!.board;
    for (const w of board.slice(0, 5)) useGameStore.getState().toggle(w);
    expect(useGameStore.getState().selection).toEqual(board.slice(0, 4));
  });

  it('clears the selection on request', async () => {
    const board = (await loaded()).session!.board;
    useGameStore.getState().toggle(board[0]!);
    useGameStore.getState().clearSelection();
    expect(useGameStore.getState().selection).toEqual([]);
  });

  it('shuffles the board without disturbing the selection or the rules', async () => {
    const before = (await loaded()).session!.board;
    useGameStore.getState().toggle(before[0]!);
    useGameStore.getState().shuffle();
    const after = useGameStore.getState().session!.board;
    expect([...after].sort()).toEqual([...before].sort());
    expect(useGameStore.getState().selection).toEqual([before[0]]);
  });
});

describe('submit', () => {
  it('solves a group and clears the selection', async () => {
    const s = await loaded();
    const group = s.session!.puzzle.groups[0]!;
    for (const w of group.words) useGameStore.getState().toggle(w);
    await useGameStore.getState().submit();

    const after = useGameStore.getState();
    expect(after.lastOutcome).toEqual({ kind: 'correct', theme: group.theme });
    expect(after.selection).toEqual([]);
    expect(after.session?.board).toHaveLength(12);
  });

  it('reports the near miss that this genre is built on', async () => {
    const s = await loaded();
    const [a, b] = s.session!.puzzle.groups;
    for (const w of [...a!.words.slice(0, 3), b!.words[0]!]) useGameStore.getState().toggle(w);
    await useGameStore.getState().submit();
    expect(useGameStore.getState().lastOutcome).toEqual({ kind: 'oneAway' });
    expect(useGameStore.getState().session?.mistakes).toBe(1);
  });

  it('keeps the selection when the guess was not scoreable', async () => {
    const s = await loaded();
    useGameStore.getState().toggle(s.session!.board[0]!);
    await useGameStore.getState().submit();
    expect(useGameStore.getState().selection).toHaveLength(1);
    expect(useGameStore.getState().lastOutcome).toEqual({ kind: 'invalid', reason: 'count' });
  });

  it('ends the game after four mistakes and reveals nothing before that', async () => {
    const s = await loaded();
    const groups = s.session!.puzzle.groups;
    const wrong = groups.map((g) => g.words[0]!);
    // Four distinct wrong guesses; rotating the words keeps each one new.
    for (let i = 0; i < MISTAKES_ALLOWED; i += 1) {
      const pick = groups.map((g) => g.words[i]!);
      for (const w of pick) useGameStore.getState().toggle(w);
      await useGameStore.getState().submit();
    }
    expect(wrong).toHaveLength(4);
    expect(useGameStore.getState().session?.status).toBe('lost');
  });

  it('does nothing before a board exists', async () => {
    await expect(useGameStore.getState().submit()).resolves.toBeUndefined();
    expect(useGameStore.getState().lastOutcome).toBeNull();
  });
});

/**
 * The wiring, not the policy.
 *
 * `adPolicy` has its own passing unit test, and it kept passing in six sibling
 * apps whose call site hands it a literal `gamesPlayed: 1` -- below the
 * `MIN_GAMES_BEFORE_FIRST_INTERSTITIAL` of 2, so the branch is dead and the
 * full-screen ad can never appear. Their paywalls sell its removal regardless.
 * A test of the policy function cannot see that; only a test of the call site
 * can, which is what these are.
 */
describe('the interstitial actually reaches the screen', () => {
  async function finishAPuzzle(day: string) {
    await useGameStore.getState().load(day);
    const groups = useGameStore.getState().session!.puzzle.groups;
    for (const g of groups) {
      for (const w of g.words) useGameStore.getState().toggle(w);
      await useGameStore.getState().submit();
    }
    expect(useGameStore.getState().session?.status).toBe('won');
  }

  it('stays quiet for the first puzzles, then shows one the pacing has earned', async () => {
    await finishAPuzzle('2026-03-01');
    expect(showInterstitial).not.toHaveBeenCalled();
    await finishAPuzzle('2026-03-02');
    expect(showInterstitial).not.toHaveBeenCalled();

    // The third completed puzzle is the first the policy allows.
    await finishAPuzzle('2026-03-03');
    expect(showInterstitial).toHaveBeenCalledTimes(1);
  });

  it('counts completed puzzles across launches, not within one session', async () => {
    await finishAPuzzle('2026-03-01');
    await finishAPuzzle('2026-03-02');
    // A cold start: the count must survive it, or the gate is never reached.
    useGameStore.getState().resetForTests();
    await finishAPuzzle('2026-03-03');
    expect(showInterstitial).toHaveBeenCalledTimes(1);
  });

  it('never shows one to a player who has paid to remove it', async () => {
    usePremiumStore.setState({ isPremium: true, isReady: true });
    for (const d of ['2026-03-01', '2026-03-02', '2026-03-03']) await finishAPuzzle(d);
    expect(showInterstitial).not.toHaveBeenCalled();
  });

  it('does not count a puzzle that is still in play', async () => {
    await useGameStore.getState().load('2026-03-01');
    const g = useGameStore.getState().session!.puzzle.groups[0]!;
    for (const w of g.words) useGameStore.getState().toggle(w);
    await useGameStore.getState().submit();
    expect(await completedCount()).toBe(0);
  });
});
