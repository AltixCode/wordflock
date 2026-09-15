/**
 * The one place that talks to the puzzle feed.
 *
 * Every rule about *when* to fetch lives in `policy.ts` and every rule about
 * *what is acceptable* lives in `feed.ts`; this file is the wiring, kept thin
 * on purpose so the decisions stay testable without a network.
 *
 * Nothing here can block a player. A sync runs in the background, and its worst
 * outcome is that the app keeps serving the content it already holds.
 */

import { addDays, todayKey, type DateKey } from '../logic/dateKey';
import { parseManifest, parsePack, type PackSummary } from './feed';
import { heldRange, noteManifestRead, prune, servedThrough, storePack } from './cache';
import { packsToFetch, shouldSync } from './policy';

/**
 * Where the feed lives.
 *
 * Read through the environment so a build can be pointed at a staging copy, but
 * with a real default: a build that silently has no feed would look exactly
 * like a build whose feed is down.
 */
export const FEED_BASE_URL =
  process.env.EXPO_PUBLIC_CONTENT_FEED_URL ?? 'https://altixcode.com/content/wordflock/v1/';

/**
 * How long to wait for the feed.
 *
 * Short. This runs while someone is trying to play; a request that hangs for
 * sixty seconds on a bad connection is indistinguishable from one that failed,
 * except that it also holds a socket open.
 */
const TIMEOUT_MS = 10_000;

/** How far back the cache is kept, for the archive. */
const KEEP_DAYS = 120;

export interface SyncResult {
  /** True when the feed answered at all, whatever it said. Drives which error a player sees. */
  feedReachable: boolean;
  packsAdded: string[];
  /** Human-readable, for the log. Never shown to a player. */
  problems: string[];
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return (await response.json()) as unknown;
}

/**
 * Brings the cache up to the horizon, if it is worth doing and possible.
 *
 * Returns rather than throws: the caller is a launch effect, and an unhandled
 * rejection there is a crash on a bad connection.
 */
export async function syncContent(now: number = Date.now(), today: DateKey = todayKey()): Promise<SyncResult> {
  const result: SyncResult = { feedReachable: false, packsAdded: [], problems: [] };
  const held = await heldRange(today);
  if (!shouldSync(today, held, now)) {
    // Not a failure: the cache is deep and the manifest is fresh. Reported as
    // reachable so a caller does not tell the player the feed is down.
    return { ...result, feedReachable: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const raw = await getJson(new URL('manifest.json', FEED_BASE_URL).toString(), controller.signal);
    result.feedReachable = true;
    const { manifest, problems } = parseManifest(raw);
    if (manifest === null) {
      result.problems.push(...problems);
      return result;
    }
    await noteManifestRead(now, manifest.servedThrough);

    for (const summary of packsToFetch(today, manifest, held)) {
      const added = await fetchPack(summary, controller.signal, result);
      if (added) result.packsAdded.push(summary.id);
    }
  } catch (error) {
    // An abort and a DNS failure are the same thing to a player: the feed did
    // not answer. Distinguishing them in the message would be noise.
    result.problems.push(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }

  await prune(addDays(today, -KEEP_DAYS));
  return result;
}

async function fetchPack(summary: PackSummary, signal: AbortSignal, result: SyncResult): Promise<boolean> {
  try {
    const raw = await getJson(new URL(summary.path, FEED_BASE_URL).toString(), signal);
    const { pack, problems } = parsePack(raw, summary);
    if (pack === null) {
      // A pack that fails validation is dropped and the sync carries on to the
      // next one. One bad quarter must not cost the player the quarter after it.
      result.problems.push(`pack ${summary.id} refused: ${problems.join('; ')}`);
      return false;
    }
    await storePack(pack);
    return true;
  } catch (error) {
    result.problems.push(`pack ${summary.id}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export { servedThrough };
