import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncContent, FEED_BASE_URL } from '../sync';
import { heldRange, clearForTests } from '../cache';
import { FEED_SCHEMA } from '../feed';

const puzzle = (id: string) => ({
  id,
  groups: [
    { theme: 'Citrus', words: ['Lemon', 'Lime', 'Pomelo', 'Yuzu'], difficulty: 1 },
    { theme: 'Chess', words: ['Rook', 'Bishop', 'Knight', 'Pawn'], difficulty: 2 },
    { theme: 'Reds', words: ['Crimson', 'Scarlet', 'Ruby', 'Vermilion'], difficulty: 3 },
    { theme: '___ tree', words: ['Family', 'Palm', 'Shoe', 'Money'], difficulty: 4 },
  ],
});

const days = (from: string, to: string) => {
  const out: Record<string, unknown> = {};
  for (const d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out[d.toISOString().slice(0, 10)] = puzzle(`p-${d.toISOString().slice(0, 10)}`);
  }
  return out;
};

const MANIFEST = {
  schema: FEED_SCHEMA,
  servedThrough: '2026-10-31',
  packs: [{ id: 'oct', from: '2026-10-01', to: '2026-10-31', path: 'packs/oct.json' }],
};
const PACK = { id: 'oct', from: '2026-10-01', to: '2026-10-31', puzzles: days('2026-10-01', '2026-10-31') };

const serve = (routes: Record<string, unknown>, status = 200) =>
  jest.fn(async (url: string) => {
    const key = String(url).replace(FEED_BASE_URL, '');
    if (!(key in routes)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: status === 200, status, json: async () => routes[key] };
  });

beforeEach(async () => { await clearForTests(); await AsyncStorage.clear(); });
afterEach(() => { jest.restoreAllMocks(); });

const install = (fn: unknown) => { (globalThis as { fetch?: unknown }).fetch = fn; };

it('downloads a pack and reports it reachable', async () => {
  install(serve({ 'manifest.json': MANIFEST, 'packs/oct.json': PACK }));
  const result = await syncContent(0, '2026-10-01');
  expect(result).toMatchObject({ feedReachable: true, packsAdded: ['oct'], problems: [] });
  expect((await heldRange('2026-10-01')).coveredThrough).toBe('2026-10-31');
});

it('does not reach the network again while the cache is deep and the manifest is fresh', async () => {
  const fetcher = serve({ 'manifest.json': MANIFEST, 'packs/oct.json': PACK });
  install(fetcher);
  await syncContent(0, '2026-10-01');
  const before = (fetcher as jest.Mock).mock.calls.length;
  await syncContent(1_000, '2026-10-01');
  expect((fetcher as jest.Mock).mock.calls.length).toBe(before);
});

// A player on a plane. Nothing is added, nothing is lost, and the caller is
// told the feed did not answer so the right message can be chosen.
it('survives a network that is not there', async () => {
  install(jest.fn(async () => { throw new Error('Network request failed'); }));
  const result = await syncContent(0, '2026-10-01');
  expect(result.feedReachable).toBe(false);
  expect(result.packsAdded).toEqual([]);
  expect(result.problems.join(' ')).toContain('Network request failed');
});

it('marks the feed reachable but stores nothing when the manifest is garbage', async () => {
  install(serve({ 'manifest.json': { schema: 99 } }));
  const result = await syncContent(0, '2026-10-01');
  expect(result.feedReachable).toBe(true);
  expect(result.packsAdded).toEqual([]);
  expect((await heldRange('2026-10-01')).coveredThrough).toBeNull();
});

// The one that matters. A pack the feed served but that would score a player
// wrongly is refused, and the app is left holding nothing rather than holding
// something broken.
it('refuses a pack containing a word in two groups', async () => {
  const bad = JSON.parse(JSON.stringify(PACK));
  bad.puzzles['2026-10-05'].groups[1].words[0] = 'Lemon';
  install(serve({ 'manifest.json': MANIFEST, 'packs/oct.json': bad }));
  const result = await syncContent(0, '2026-10-01');
  expect(result.packsAdded).toEqual([]);
  expect(result.problems.join(' ')).toContain('appears in both');
  expect((await heldRange('2026-10-01')).coveredThrough).toBeNull();
});

it('refuses a pack that is not the one the manifest named', async () => {
  install(serve({ 'manifest.json': MANIFEST, 'packs/oct.json': { ...PACK, id: 'nov' } }));
  const result = await syncContent(0, '2026-10-01');
  expect(result.packsAdded).toEqual([]);
  expect(result.problems.join(' ')).toContain('manifest said oct');
});

it('carries on to the next pack when one is refused', async () => {
  const manifest = {
    ...MANIFEST,
    packs: [
      { id: 'oct', from: '2026-10-01', to: '2026-10-15', path: 'packs/oct.json' },
      { id: 'late', from: '2026-10-16', to: '2026-10-31', path: 'packs/late.json' },
    ],
  };
  install(serve({
    'manifest.json': manifest,
    'packs/oct.json': { id: 'oct', from: '2026-10-01', to: '2026-10-15', puzzles: {} },
    'packs/late.json': { id: 'late', from: '2026-10-16', to: '2026-10-31', puzzles: days('2026-10-16', '2026-10-31') },
  }));
  const result = await syncContent(0, '2026-10-01');
  expect(result.packsAdded).toEqual(['late']);
});

it('does not fetch a pack it already holds', async () => {
  const fetcher = serve({ 'manifest.json': MANIFEST, 'packs/oct.json': PACK });
  install(fetcher);
  await syncContent(0, '2026-10-01');
  (fetcher as jest.Mock).mockClear();
  // Far enough in the future that the manifest is stale and the cache is thin.
  await syncContent(0, '2026-10-25');
  const urls = (fetcher as jest.Mock).mock.calls.map((c) => String(c[0]));
  expect(urls.some((u) => u.includes('packs/oct.json'))).toBe(false);
});

it('survives a feed that answers with an HTTP error', async () => {
  install(serve({ 'manifest.json': MANIFEST }, 503));
  const result = await syncContent(0, '2026-10-01');
  expect(result.feedReachable).toBe(false);
  expect(result.problems.join(' ')).toContain('503');
});
