/**
 * The four group colours are the only place in this app where colour carries
 * meaning on its own, so they get their own contrast test rather than riding
 * along with the palette one.
 */
import { contrastRatio } from '../color';
import { difficultyColors, DIFFICULTIES } from '../difficulty';
import { darkPalette, lightPalette } from '../tokens';

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
] as const)('%s difficulty colours', (_name, palette) => {
  const colors = difficultyColors(palette);

  it.each(DIFFICULTIES)('keeps the theme name readable on fill %i', (d) => {
    expect(contrastRatio(colors[d].onFill, colors[d].fill)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(DIFFICULTIES)('separates fill %i from the board background', (d) => {
    expect(contrastRatio(colors[d].fill, palette.background)).toBeGreaterThanOrEqual(3);
  });

  it('keeps every pair of fills distinguishable from each other', () => {
    // Colour is the only thing telling two solved bands apart. Two fills a
    // player cannot separate is the same defect as invisible text.
    for (const a of DIFFICULTIES) {
      for (const b of DIFFICULTIES) {
        if (a >= b) continue;
        expect(contrastRatio(colors[a].fill, colors[b].fill)).toBeGreaterThanOrEqual(1.3);
      }
    }
  });
});
