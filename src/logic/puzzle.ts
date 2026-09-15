/**
 * The shape of one day's puzzle, and the rules that decide whether a bank entry
 * is fit to ship.
 *
 * The whole product here is the content — there is no generator to lean on — so
 * validation is the engineering. The failure this genre dies of is a word that
 * honestly belongs to two groups: the player finds a grouping that is *right*
 * and the app calls it wrong. `problemsWith` is what stops one reaching a
 * player, and `npm run check:puzzles` runs it over the whole bank.
 */

/** Difficulty is the reveal order, easiest first, and picks the tile colour. */
export type Difficulty = 1 | 2 | 3 | 4;

export interface Group {
  /** The connection, shown when the group is solved. */
  theme: string;
  /** Exactly four. */
  words: string[];
  difficulty: Difficulty;
}

export interface Puzzle {
  /** Stable across releases: a result shared today must still parse next year. */
  id: string;
  /** Exactly four, one of each difficulty. */
  groups: Group[];
}

export const GROUPS_PER_PUZZLE = 4;
export const WORDS_PER_GROUP = 4;
export const MISTAKES_ALLOWED = 4;

/** Case- and space-insensitive: the player taps tiles, but a bank is typed by hand. */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Every word in the puzzle, in bank order. Display order is shuffled elsewhere. */
export function allWords(puzzle: Puzzle): string[] {
  return puzzle.groups.flatMap((group) => group.words);
}

export function groupOf(puzzle: Puzzle, word: string): Group | null {
  const wanted = normalizeWord(word);
  return (
    puzzle.groups.find((g) =>
      g.words.some((w) => normalizeWord(w) === wanted),
    ) ?? null
  );
}

/**
 * Everything wrong with a puzzle, as human-readable lines. Empty means shippable.
 *
 * Returns all of them rather than the first: a bank is fixed in one editing
 * pass, and a validator that stops at the first fault turns that into twenty.
 */
export function problemsWith(puzzle: Puzzle): string[] {
  const problems: string[] = [];

  if (!puzzle.id.trim()) problems.push("id is empty");
  if (puzzle.groups.length !== GROUPS_PER_PUZZLE) {
    problems.push(
      `has ${puzzle.groups.length} groups, needs ${GROUPS_PER_PUZZLE}`,
    );
  }

  const difficulties = puzzle.groups.map((g) => g.difficulty).sort();
  if (difficulties.join(",") !== "1,2,3,4") {
    problems.push(
      `difficulties are ${difficulties.join(",")}, need one each of 1,2,3,4`,
    );
  }

  for (const group of puzzle.groups) {
    if (!group.theme.trim()) problems.push("a group has an empty theme");
    if (group.words.length !== WORDS_PER_GROUP) {
      problems.push(
        `"${group.theme}" has ${group.words.length} words, needs ${WORDS_PER_GROUP}`,
      );
    }
    for (const word of group.words) {
      if (!word.trim()) problems.push(`"${group.theme}" has an empty word`);
    }
  }

  // The one that actually ruins a puzzle: a word in two groups means a player
  // can be right and be told they are wrong.
  const seen = new Map<string, string>();
  for (const group of puzzle.groups) {
    for (const word of group.words) {
      const key = normalizeWord(word);
      const owner = seen.get(key);
      if (owner !== undefined) {
        problems.push(
          `"${word}" appears in both "${owner}" and "${group.theme}"`,
        );
      } else {
        seen.set(key, group.theme);
      }
    }
  }

  const themes = puzzle.groups.map((g) => g.theme.trim().toLowerCase());
  if (new Set(themes).size !== themes.length)
    problems.push("two groups share a theme");

  return problems;
}

export function isShippable(puzzle: Puzzle): boolean {
  return problemsWith(puzzle).length === 0;
}
