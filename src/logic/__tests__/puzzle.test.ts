import {
  allWords,
  groupOf,
  isShippable,
  normalizeWord,
  problemsWith,
  type Puzzle,
} from "../puzzle";

const good: Puzzle = {
  id: "test-1",
  groups: [
    {
      theme: "Citrus",
      words: ["Lemon", "Lime", "Orange", "Grapefruit"],
      difficulty: 1,
    },
    {
      theme: "Shades of red",
      words: ["Crimson", "Scarlet", "Ruby", "Cherry"],
      difficulty: 2,
    },
    {
      theme: "Playing cards",
      words: ["Jack", "Queen", "King", "Ace"],
      difficulty: 3,
    },
    {
      theme: "Chess pieces",
      words: ["Rook", "Bishop", "Knight", "Pawn"],
      difficulty: 4,
    },
  ],
};

const copy = (puzzle: Puzzle): Puzzle =>
  JSON.parse(JSON.stringify(puzzle)) as Puzzle;

/** A group by index, asserted present — every fixture here has four. */
const groupAt = (puzzle: Puzzle, index: number) => {
  const group = puzzle.groups[index];
  if (!group) throw new Error(`fixture has no group ${index}`);
  return group;
};

describe("normalizeWord", () => {
  it("ignores case, surrounding space and repeated inner space", () => {
    expect(normalizeWord("  Ice   Cream ")).toBe("ice cream");
  });
});

describe("allWords", () => {
  it("returns all sixteen", () => {
    expect(allWords(good)).toHaveLength(16);
  });
});

describe("groupOf", () => {
  it("finds a word regardless of how it is typed", () => {
    expect(groupOf(good, "lemon")?.theme).toBe("Citrus");
    expect(groupOf(good, "  KING ")?.theme).toBe("Playing cards");
  });

  it("returns null for a word that is not in the puzzle", () => {
    expect(groupOf(good, "Banana")).toBeNull();
  });
});

describe("problemsWith", () => {
  it("passes a well-formed puzzle", () => {
    expect(problemsWith(good)).toEqual([]);
    expect(isShippable(good)).toBe(true);
  });

  it("rejects a word that belongs to two groups", () => {
    const bad = copy(good);
    groupAt(bad, 1).words[0] = "Orange";
    expect(problemsWith(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining("appears in both")]),
    );
  });

  it("catches a duplicate that differs only in case or spacing", () => {
    const bad = copy(good);
    groupAt(bad, 2).words[0] = " lime ";
    expect(problemsWith(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining("appears in both")]),
    );
  });

  it("rejects the wrong number of groups", () => {
    const bad = copy(good);
    bad.groups.pop();
    expect(problemsWith(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining("needs 4")]),
    );
  });

  it("rejects the wrong number of words in a group", () => {
    const bad = copy(good);
    groupAt(bad, 0).words.push("Pomelo");
    expect(problemsWith(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining("needs 4")]),
    );
  });

  it("requires one group of each difficulty", () => {
    const bad = copy(good);
    groupAt(bad, 3).difficulty = 1;
    expect(problemsWith(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining("one each of 1,2,3,4")]),
    );
  });

  it("rejects empty ids, themes and words", () => {
    const bad = copy(good);
    bad.id = "  ";
    groupAt(bad, 0).theme = "";
    groupAt(bad, 1).words[0] = " ";
    const problems = problemsWith(bad);
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining("id is empty")]),
    );
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining("empty theme")]),
    );
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringContaining("empty word")]),
    );
  });

  it("rejects two groups sharing a theme", () => {
    const bad = copy(good);
    groupAt(bad, 1).theme = "citrus";
    expect(problemsWith(bad)).toEqual(
      expect.arrayContaining([expect.stringContaining("share a theme")]),
    );
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const bad = copy(good);
    bad.id = "";
    groupAt(bad, 0).theme = "";
    expect(problemsWith(bad).length).toBeGreaterThan(1);
  });
});
