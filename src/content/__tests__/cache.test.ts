import AsyncStorage from '@react-native-async-storage/async-storage';
import { coverageFrom, heldRange, storePack, puzzleOn, prune, noteManifestRead, servedThrough, clearForTests } from '../cache';
import type { Pack } from '../feed';

const puzzle = (id: string) => ({
  id,
  groups: [
    { theme: 'Citrus', words: ['Lemon', 'Lime', 'Pomelo', 'Yuzu'], difficulty: 1 as const },
    { theme: 'Chess', words: ['Rook', 'Bishop', 'Knight', 'Pawn'], difficulty: 2 as const },
    { theme: 'Reds', words: ['Crimson', 'Scarlet', 'Ruby', 'Vermilion'], difficulty: 3 as const },
    { theme: '___ tree', words: ['Family', 'Palm', 'Shoe', 'Money'], difficulty: 4 as const },
  ],
});

const packOf = (id: string, from: string, to: string): Pack => {
  const puzzles: Pack['puzzles'] = {};
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    puzzles[d.toISOString().slice(0, 10)] = puzzle(`${id}-${d.toISOString().slice(0, 10)}`);
  }
  return { id, from, to, puzzles };
};

beforeEach(async () => { await clearForTests(); await AsyncStorage.clear(); });

describe('coverageFrom', () => {
  it('is null when nothing reaches today', () => {
    expect(coverageFrom('2026-10-01', [{ from: '2026-08-01', to: '2026-09-30' }])).toBeNull();
  });

  it('joins two packs that meet exactly', () => {
    expect(coverageFrom('2026-10-01', [
      { from: '2026-10-01', to: '2026-10-15' },
      { from: '2026-10-16', to: '2026-10-31' },
    ])).toBe('2026-10-31');
  });

  // The number that matters is consecutive mornings, so a gap stops the count
  // even though the later pack is held and will be used when its turn comes.
  it('stops at a gap rather than counting the far side', () => {
    expect(coverageFrom('2026-10-01', [
      { from: '2026-10-01', to: '2026-10-15' },
      { from: '2026-10-20', to: '2026-10-31' },
    ])).toBe('2026-10-15');
  });

  it('counts a pack that started before today', () => {
    expect(coverageFrom('2026-10-05', [{ from: '2026-10-01', to: '2026-10-31' }])).toBe('2026-10-31');
  });
});

describe('the cache', () => {
  it('serves a stored day and reports its coverage', async () => {
    await storePack(packOf('now', '2026-10-01', '2026-10-10'));
    expect((await heldRange('2026-10-01')).coveredThrough).toBe('2026-10-10');
    expect((await puzzleOn('2026-10-04'))?.id).toBe('now-2026-10-04');
  });

  it('returns null for a day it does not hold', async () => {
    await storePack(packOf('now', '2026-10-01', '2026-10-10'));
    expect(await puzzleOn('2026-11-01')).toBeNull();
  });

  it('survives an index that is not JSON', async () => {
    await AsyncStorage.setItem('wordflock.content.index.v1', 'not json');
    const held = await heldRange('2026-10-01');
    expect(held).toEqual({ packIds: [], coveredThrough: null, manifestReadAt: null });
  });

  // Storage is editable on a rooted device, so what comes back out is checked
  // exactly as hard as what went in.
  it('refuses a stored pack that has been tampered with', async () => {
    const pack = packOf('now', '2026-10-01', '2026-10-02');
    pack.puzzles['2026-10-01']!.groups[1]!.words[0] = 'Lemon';
    await AsyncStorage.setItem('wordflock.content.pack.v1.now', JSON.stringify(pack));
    await storePack(packOf('now', '2026-10-01', '2026-10-02'));
    await AsyncStorage.setItem('wordflock.content.pack.v1.now', JSON.stringify(pack));
    expect(await puzzleOn('2026-10-01')).toBeNull();
  });

  it('remembers when the manifest was read and how far the feed goes', async () => {
    await noteManifestRead(1234, '2026-12-31');
    expect((await heldRange('2026-10-01')).manifestReadAt).toBe(1234);
    expect(await servedThrough()).toBe('2026-12-31');
  });

  it('prunes packs that are entirely in the past and keeps the rest', async () => {
    await storePack(packOf('old', '2026-08-01', '2026-08-10'));
    await storePack(packOf('now', '2026-10-01', '2026-10-10'));
    expect(await prune('2026-09-01')).toEqual(['old']);
    expect((await heldRange('2026-10-01')).packIds).toEqual(['now']);
    expect(await AsyncStorage.getItem('wordflock.content.pack.v1.old')).toBeNull();
  });

  it('keeps a pack the archive may still want', async () => {
    await storePack(packOf('recent', '2026-09-20', '2026-09-30'));
    expect(await prune('2026-09-01')).toEqual([]);
  });
});
