import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolvePuzzle, bundledCovers, BUNDLED, BUNDLED_DAYS } from '../library';
import { storePack, clearForTests } from '../cache';
import type { Pack } from '../feed';

const INSTALL = '2026-10-01';

const puzzle = (id: string) => ({
  id,
  groups: [
    { theme: 'Citrus', words: ['Lemon', 'Lime', 'Pomelo', 'Yuzu'], difficulty: 1 as const },
    { theme: 'Chess', words: ['Rook', 'Bishop', 'Knight', 'Pawn'], difficulty: 2 as const },
    { theme: 'Reds', words: ['Crimson', 'Scarlet', 'Ruby', 'Vermilion'], difficulty: 3 as const },
    { theme: '___ tree', words: ['Family', 'Palm', 'Shoe', 'Money'], difficulty: 4 as const },
  ],
});

beforeEach(async () => { await clearForTests(); await AsyncStorage.clear(); });

it('ships a bank that is not empty', () => {
  expect(BUNDLED.length).toBeGreaterThan(0);
});

describe('the bundled grace period', () => {
  it('covers the install day', () => {
    expect(bundledCovers(INSTALL, INSTALL)).toBe(true);
  });

  it('covers the last day of the bank and not the day after', () => {
    const last = new Date(`${INSTALL}T12:00:00`);
    last.setDate(last.getDate() + BUNDLED_DAYS - 1);
    const after = new Date(`${INSTALL}T12:00:00`);
    after.setDate(after.getDate() + BUNDLED_DAYS);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    expect(bundledCovers(key(last), INSTALL)).toBe(true);
    expect(bundledCovers(key(after), INSTALL)).toBe(false);
  });

  it('covers a day before the install, for the archive and a wrong clock', () => {
    expect(bundledCovers('2026-09-20', INSTALL)).toBe(true);
  });
});

describe('resolvePuzzle', () => {
  it('serves the bundled bank during the grace period', async () => {
    const resolved = await resolvePuzzle(INSTALL, INSTALL);
    expect(resolved?.source).toBe('bundled');
    expect(resolved?.bundledDaysLeft).toBe(BUNDLED_DAYS - 1);
  });

  // The point of the whole feed: after a month the app asks for a connection
  // rather than replaying puzzles the player has already solved.
  it('serves nothing once the bundled bank has run out and no feed has arrived', async () => {
    expect(await resolvePuzzle('2027-01-01', INSTALL)).toBeNull();
  });

  it('prefers the feed over the bundled bank even inside the grace period', async () => {
    const pack: Pack = { id: 'p', from: INSTALL, to: INSTALL, puzzles: { [INSTALL]: puzzle('from-feed') } };
    await storePack(pack);
    const resolved = await resolvePuzzle(INSTALL, INSTALL);
    expect(resolved?.source).toBe('feed');
    expect(resolved?.puzzle.id).toBe('from-feed');
  });

  it('serves a day far past the grace period once the feed has covered it', async () => {
    const pack: Pack = { id: 'p', from: '2027-01-01', to: '2027-01-01', puzzles: { '2027-01-01': puzzle('later') } };
    await storePack(pack);
    expect((await resolvePuzzle('2027-01-01', INSTALL))?.source).toBe('feed');
  });
});
