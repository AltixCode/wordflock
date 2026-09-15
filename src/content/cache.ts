/**
 * Where downloaded packs live on the device.
 *
 * AsyncStorage rather than the filesystem: a quarter of puzzles is about 40 KB
 * of JSON, so four quarters is smaller than one of the app's icons. Adding
 * `expo-file-system` for that would be a native dependency and a prebuild for
 * nothing.
 *
 * The index is stored separately from the packs so the app can answer "what do
 * I hold, and how far does it reach" on launch without parsing every pack.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays, type DateKey } from '../logic/dateKey';
import { parsePack, type Pack } from './feed';
import type { HeldRange } from './policy';

const INDEX_KEY = 'wordflock.content.index.v1';
const packKey = (id: string) => `wordflock.content.pack.v1.${id}`;

interface StoredIndex {
  packs: { id: string; from: DateKey; to: DateKey }[];
  manifestReadAt: number | null;
  /** The feed's own last servable day, so an exhausted feed can be named. */
  servedThrough: DateKey | null;
}

const EMPTY: StoredIndex = { packs: [], manifestReadAt: null, servedThrough: null };

async function readIndex(): Promise<StoredIndex> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (raw === null) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const { packs, manifestReadAt, servedThrough } = parsed as StoredIndex;
    if (!Array.isArray(packs)) return EMPTY;
    return { packs, manifestReadAt: manifestReadAt ?? null, servedThrough: servedThrough ?? null };
  } catch {
    // A corrupt index is recoverable: the packs themselves are still keyed by
    // id, and the next sync rebuilds coverage. Losing the day's puzzle over a
    // bad JSON parse would not be.
    return EMPTY;
  }
}

async function writeIndex(index: StoredIndex): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

/**
 * Continuous coverage from `today`.
 *
 * Continuous, not total: two packs with a gap between them cover fewer usable
 * days than their sum, and the number the app reasons about is how many
 * mornings in a row it can open without a connection.
 */
export function coverageFrom(today: DateKey, ranges: { from: DateKey; to: DateKey }[]): DateKey | null {
  const sorted = [...ranges].sort((a, b) => (a.from < b.from ? -1 : 1));
  let reach: DateKey | null = null;
  for (const range of sorted) {
    if (range.to < today) continue;
    const startsBy = reach === null ? today : addDays(reach, 1);
    if (range.from > startsBy) break;
    if (reach === null || range.to > reach) reach = range.to;
  }
  return reach;
}

export async function heldRange(today: DateKey): Promise<HeldRange> {
  const index = await readIndex();
  return {
    packIds: index.packs.map((p) => p.id),
    coveredThrough: coverageFrom(today, index.packs),
    manifestReadAt: index.manifestReadAt,
  };
}

export async function servedThrough(): Promise<DateKey | null> {
  return (await readIndex()).servedThrough;
}

/** Stores a verified pack and records it in the index. */
export async function storePack(pack: Pack): Promise<void> {
  await AsyncStorage.setItem(packKey(pack.id), JSON.stringify(pack));
  const index = await readIndex();
  const packs = index.packs.filter((p) => p.id !== pack.id);
  packs.push({ id: pack.id, from: pack.from, to: pack.to });
  await writeIndex({ ...index, packs });
}

export async function noteManifestRead(at: number, through: DateKey): Promise<void> {
  const index = await readIndex();
  await writeIndex({ ...index, manifestReadAt: at, servedThrough: through });
}

/**
 * The pack holding a day, re-validated on read.
 *
 * Re-validating costs a fraction of a millisecond and closes the gap between
 * "it was checked when we downloaded it" and "it is correct now" — storage can
 * be edited on a rooted device, and a schema change can outlive a cache.
 */
export async function puzzleOn(key: DateKey): Promise<Pack['puzzles'][string] | null> {
  const index = await readIndex();
  const summary = index.packs.find((p) => p.from <= key && key <= p.to);
  if (summary === undefined) return null;
  try {
    const raw = await AsyncStorage.getItem(packKey(summary.id));
    if (raw === null) return null;
    const { pack } = parsePack(JSON.parse(raw));
    return pack?.puzzles[key] ?? null;
  } catch {
    return null;
  }
}

/** Drops packs that ended before `before`, so the cache cannot grow forever. */
export async function prune(before: DateKey): Promise<string[]> {
  const index = await readIndex();
  const stale = index.packs.filter((p) => p.to < before);
  if (stale.length === 0) return [];
  await AsyncStorage.multiRemove(stale.map((p) => packKey(p.id)));
  await writeIndex({ ...index, packs: index.packs.filter((p) => p.to >= before) });
  return stale.map((p) => p.id);
}

export async function clearForTests(): Promise<void> {
  const index = await readIndex();
  await AsyncStorage.multiRemove([INDEX_KEY, ...index.packs.map((p) => packKey(p.id))]);
}
