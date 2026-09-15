/**
 * The shareable result.
 *
 * A grid of coloured squares, one row per guess, one square per word coloured
 * by the group that word really belonged to. It says how the puzzle went and
 * nothing about what the answers were — which is the entire point: a result
 * posted at breakfast must not spoil the puzzle for anyone who reads it.
 *
 * The emoji are chosen to match the tile colours on screen, and to stay legible
 * for the most common colour-vision deficiencies: yellow, green, blue and
 * purple differ in lightness as well as hue, where the usual red/green pairing
 * does not.
 */

import type { Difficulties } from "./guess";
import type { DateKey } from "./dateKey";

const SQUARES: Record<number, string> = {
  1: "🟨",
  2: "🟩",
  3: "🟦",
  4: "🟪",
};

/** A square for an unknown difficulty — never expected, never a crash. */
const UNKNOWN = "⬜";

export function rowToEmoji(row: Difficulties): string {
  return row.map((d) => SQUARES[d] ?? UNKNOWN).join("");
}

export interface ShareInput {
  key: DateKey;
  puzzleNumber: number;
  rows: Difficulties[];
  status: "won" | "lost" | "playing";
  /** Localised app name and the "mistakes" word come from the caller. */
  title: string;
}

/**
 * The text a player copies.
 *
 * Returns null while the puzzle is still in play: there is no honest result to
 * share yet, and offering one invites posting a half-finished grid that leaks
 * which groups are already found.
 */
export function shareText(input: ShareInput): string | null {
  if (input.status === "playing") return null;
  const grid = input.rows.map(rowToEmoji).join("\n");
  const header = `${input.title} #${input.puzzleNumber}`;
  return grid ? `${header}\n${grid}` : header;
}
