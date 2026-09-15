#!/usr/bin/env node
/**
 * Validates the puzzle bank before it can ship.
 *
 * The content *is* the product here — there is no generator whose output can be
 * machine-checked for solvability — so this is the closest thing Wordflock has
 * to a solver. It refuses the failure that ruins this genre: a word that
 * honestly belongs to two groups, which makes a player right and tells them
 * they are wrong.
 *
 *   node scripts/check-puzzles.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bank = JSON.parse(readFileSync(resolve(ROOT, 'data/puzzles.json'), 'utf8'));

const normalize = (w) => w.trim().toLowerCase().replace(/\s+/g, ' ');

let failures = 0;
const fail = (line) => {
  console.error(`  ✗ ${line}`);
  failures += 1;
};

if (!Array.isArray(bank.puzzles)) {
  fail('data/puzzles.json has no `puzzles` array');
} else {
  const ids = new Set();
  const signatures = new Map();

  for (const puzzle of bank.puzzles) {
    const where = puzzle.id || '(no id)';
    if (!puzzle.id || !String(puzzle.id).trim()) fail(`${where}: id is empty`);
    if (ids.has(puzzle.id)) fail(`${where}: duplicate id`);
    ids.add(puzzle.id);

    if (!Array.isArray(puzzle.groups) || puzzle.groups.length !== 4) {
      fail(`${where}: needs exactly 4 groups`);
      continue;
    }

    const difficulties = puzzle.groups.map((g) => g.difficulty).sort().join(',');
    if (difficulties !== '1,2,3,4') fail(`${where}: difficulties are ${difficulties}`);

    const owner = new Map();
    for (const group of puzzle.groups) {
      if (!group.theme || !group.theme.trim()) fail(`${where}: a group has no theme`);
      if (!Array.isArray(group.words) || group.words.length !== 4) {
        fail(`${where}: "${group.theme}" needs exactly 4 words`);
        continue;
      }
      for (const word of group.words) {
        if (!word || !String(word).trim()) fail(`${where}: "${group.theme}" has an empty word`);
        const key = normalize(word);
        if (owner.has(key)) {
          fail(`${where}: "${word}" is in both "${owner.get(key)}" and "${group.theme}"`);
        }
        owner.set(key, group.theme);
      }
    }

    const themes = puzzle.groups.map((g) => normalize(g.theme));
    if (new Set(themes).size !== themes.length) fail(`${where}: two groups share a theme`);

    // Two puzzles with the same sixteen words are the same puzzle wearing a hat.
    const signature = [...owner.keys()].sort().join('|');
    if (signatures.has(signature)) {
      fail(`${where}: the same sixteen words as ${signatures.get(signature)}`);
    }
    signatures.set(signature, puzzle.id);
  }

  // A word repeated across puzzles is fine and even good; a word repeated *often*
  // makes the bank feel thin, so it is reported rather than failed.
  const uses = new Map();
  for (const puzzle of bank.puzzles) {
    for (const group of puzzle.groups ?? []) {
      for (const word of group.words ?? []) {
        const key = normalize(word);
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
  }
  const overused = [...uses.entries()].filter(([, n]) => n > 3).sort((a, b) => b[1] - a[1]);
  if (overused.length) {
    console.log(`  note: ${overused.length} word(s) used more than three times — ` +
      overused.slice(0, 6).map(([w, n]) => `${w} ×${n}`).join(', '));
  }

  console.log(`check-puzzles: ${bank.puzzles.length} puzzles, ${uses.size} distinct words`);
}

if (failures) {
  console.error(`\ncheck-puzzles: ${failures} problem(s) — the bank is not shippable.`);
  process.exit(1);
}
console.log('check-puzzles: every puzzle is well formed.');
