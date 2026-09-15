/**
 * The four group colours.
 *
 * These are the one place in Wordflock where colour is the information rather
 * than the decoration: a solved band says which group it was by its fill, and
 * the shared grid repeats that in emoji. So they are ordered by lightness as
 * well as hue — yellow, green, blue, purple — which keeps them separable for
 * the common colour-vision deficiencies, where a red/green pairing would not.
 * `src/logic/share.ts` picks its squares to match; changing one without the
 * other makes the shared grid describe a board the player never saw.
 *
 * Difficulty is 1 (easiest, yellow) to 4 (trickiest, purple), matching
 * `Group.difficulty`.
 */
import type { Difficulty } from '../logic/puzzle';
import type { Palette } from './tokens';

export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4];

export interface DifficultyColor {
  fill: string;
  /** The theme name printed on the band; verified >= 4.5:1 against `fill`. */
  onFill: string;
}

/**
 * Both sets are ordered by lightness, not only by hue.
 *
 * Contrast ratio measures lightness alone, which is also what a player with a
 * colour-vision deficiency has left to go on. Two hues a designer would call
 * obviously different -- a saturated green and a saturated blue -- routinely
 * measure 1.06:1 against each other, meaning they are the same colour to that
 * player and the same shade in a greyscale screenshot. So each tier steps down
 * in lightness from the one before, and a test asserts every pair stays apart.
 */
const LIGHT: Record<Difficulty, DifficultyColor> = {
  1: { fill: '#B45309', onFill: '#FFFFFF' },
  2: { fill: '#166534', onFill: '#FFFFFF' },
  3: { fill: '#1E3A8A', onFill: '#FFFFFF' },
  4: { fill: '#3B0764', onFill: '#FFFFFF' },
};

const DARK: Record<Difficulty, DifficultyColor> = {
  1: { fill: '#FDE047', onFill: '#1A1204' },
  2: { fill: '#34D399', onFill: '#04160B' },
  3: { fill: '#2E9BE0', onFill: '#02121C' },
  4: { fill: '#6D4FD6', onFill: '#F5F3FF' },
};

/**
 * Chosen by background lightness rather than by a theme name, so a palette
 * added later gets a legible set without editing this file.
 */
export function difficultyColors(palette: Palette): Record<Difficulty, DifficultyColor> {
  return palette.background === '#F7F7F5' ? LIGHT : DARK;
}
