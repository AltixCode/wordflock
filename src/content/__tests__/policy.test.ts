import {
  daysHeld, shouldSync, packsToFetch, shortfallFor,
  HORIZON_DAYS, REFILL_BELOW_DAYS, MANIFEST_TTL_MS,
} from '../policy';
import type { Manifest } from '../feed';

const TODAY = '2026-10-01';
const held = (over: Partial<Parameters<typeof daysHeld>[1]> = {}) => ({
  packIds: [] as string[],
  coveredThrough: null,
  manifestReadAt: null,
  ...over,
});

describe('daysHeld', () => {
  it('counts today itself', () => {
    expect(daysHeld(TODAY, held({ coveredThrough: '2026-10-01' }))).toBe(1);
  });

  it('is zero when the cache ended yesterday', () => {
    expect(daysHeld(TODAY, held({ coveredThrough: '2026-09-30' }))).toBe(0);
  });

  it('is zero when nothing is held', () => {
    expect(daysHeld(TODAY, held())).toBe(0);
  });

  // The requirement, stated as a test: a week away from a connection.
  it('covers a week offline when the horizon was filled', () => {
    expect(daysHeld(TODAY, held({ coveredThrough: '2026-10-28' }))).toBeGreaterThan(7);
  });
});

describe('shouldSync', () => {
  const full = held({ coveredThrough: '2026-10-28', manifestReadAt: 1_000 });

  it('syncs when nothing has ever been read', () => {
    expect(shouldSync(TODAY, held(), 0)).toBe(true);
  });

  it('waits while the manifest is fresh and the cache is deep', () => {
    expect(shouldSync(TODAY, full, 1_000 + MANIFEST_TTL_MS - 1)).toBe(false);
  });

  it('syncs once the manifest is stale', () => {
    expect(shouldSync(TODAY, full, 1_000 + MANIFEST_TTL_MS)).toBe(true);
  });

  it('syncs while running low even with a fresh manifest', () => {
    const low = held({ coveredThrough: '2026-10-05', manifestReadAt: 1_000 });
    expect(daysHeld(TODAY, low)).toBeLessThan(REFILL_BELOW_DAYS);
    expect(shouldSync(TODAY, low, 1_001)).toBe(true);
  });
});

describe('packsToFetch', () => {
  const manifest: Manifest = {
    schema: 1,
    servedThrough: '2026-12-31',
    packs: [
      { id: 'past', from: '2026-08-01', to: '2026-09-30', path: 'p/past.json' },
      { id: 'now', from: '2026-10-01', to: '2026-10-15', path: 'p/now.json' },
      { id: 'next', from: '2026-10-16', to: '2026-10-31', path: 'p/next.json' },
      { id: 'far', from: '2026-12-01', to: '2026-12-31', path: 'p/far.json' },
    ],
  };

  it('takes the packs inside the horizon, nearest first', () => {
    expect(packsToFetch(TODAY, manifest, held()).map((p) => p.id)).toEqual(['now', 'next']);
  });

  it('skips what is already held', () => {
    expect(packsToFetch(TODAY, manifest, held({ packIds: ['now'] })).map((p) => p.id)).toEqual(['next']);
  });

  it('never re-downloads history', () => {
    expect(packsToFetch(TODAY, manifest, held()).map((p) => p.id)).not.toContain('past');
  });

  it('leaves content beyond the horizon for a later sync', () => {
    expect(packsToFetch(TODAY, manifest, held()).map((p) => p.id)).not.toContain('far');
    expect(HORIZON_DAYS).toBeLessThan(60);
  });

  // The horizon is inclusive: from 2026-10-01 it reaches 2026-10-29, so a pack
  // starting on that day is taken and one starting the day after is not.
  it('takes a pack that merely overlaps the horizon edge', () => {
    const at = (from: string): Manifest => ({
      ...manifest,
      packs: [{ id: 'edge', from, to: '2026-11-30', path: 'p/e.json' }],
    });
    expect(packsToFetch(TODAY, at('2026-10-29'), held()).map((p) => p.id)).toEqual(['edge']);
    expect(packsToFetch(TODAY, at('2026-10-30'), held()).map((p) => p.id)).toEqual([]);
  });
});

describe('shortfallFor', () => {
  it('blames the connection only when the device is offline', () => {
    expect(shortfallFor(TODAY, held(), false, false, '2026-12-31').kind).toBe('offline');
  });

  it('blames the feed when the device is online and the feed is not answering', () => {
    expect(shortfallFor(TODAY, held(), true, false, '2026-12-31').kind).toBe('unreachable');
  });

  // Telling someone to check their wifi when we have simply run out of puzzles
  // is the message that makes every later message worthless.
  it('says the feed has run out rather than blaming the connection', () => {
    const s = shortfallFor('2027-01-01', held(), false, false, '2026-12-31');
    expect(s.kind).toBe('exhausted');
  });

  it('carries the last day held so the screen can say how far it got', () => {
    const s = shortfallFor(TODAY, held({ coveredThrough: '2026-09-30' }), false, false, null);
    expect(s).toEqual({ kind: 'offline', lastDayHeld: '2026-09-30' });
  });
});
