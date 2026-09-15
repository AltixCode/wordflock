import { boardSeedFor, puzzleFor, puzzleIndexFor } from "../daily";
import type { Puzzle } from "../puzzle";
import { rowToEmoji, shareText } from "../share";
import type { Difficulties } from "../guess";

const bank: Puzzle[] = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`,
  groups: [],
}));

describe("puzzleIndexFor", () => {
  it("is stable for a given day", () => {
    expect(puzzleIndexFor("2026-03-04", 30)).toBe(
      puzzleIndexFor("2026-03-04", 30),
    );
  });

  it("always lands inside the bank", () => {
    for (let d = 0; d < 400; d += 1) {
      const key = new Date(2026, 0, 1 + d);
      const iso = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, "0")}-${String(key.getDate()).padStart(2, "0")}`;
      const index = puzzleIndexFor(iso, 30);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(30);
    }
  });

  it("uses every entry exactly once per cycle", () => {
    const seen = new Set<number>();
    for (let d = 0; d < 30; d += 1) {
      const date = new Date(2026, 0, 1 + d);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      seen.add(puzzleIndexFor(iso, 30));
    }
    expect(seen.size).toBe(30);
  });

  it("does not simply walk the bank in file order", () => {
    const first = puzzleIndexFor("2026-01-01", 30);
    const second = puzzleIndexFor("2026-01-02", 30);
    // It may occasionally be adjacent by chance, but not across a whole week.
    const walk = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const date = new Date(2026, 0, 1 + d);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return puzzleIndexFor(iso, 30);
    });
    expect(walk).not.toEqual([
      first,
      first + 1,
      first + 2,
      first + 3,
      first + 4,
      first + 5,
      first + 6,
    ]);
    expect(second).toBeDefined();
  });

  it("gives a different order on the second pass through the bank", () => {
    const cycleOne: number[] = [];
    const cycleTwo: number[] = [];
    for (let d = 0; d < 30; d += 1) {
      const a = new Date(2026, 0, 1 + d);
      const b = new Date(2026, 0, 31 + d);
      const iso = (x: Date) =>
        `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      cycleOne.push(puzzleIndexFor(iso(a), 30));
      cycleTwo.push(puzzleIndexFor(iso(b), 30));
    }
    expect(cycleTwo).not.toEqual(cycleOne);
  });

  it("handles a day before the epoch rather than going negative", () => {
    const index = puzzleIndexFor("2025-12-20", 30);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(30);
  });

  it("refuses an empty bank instead of returning undefined", () => {
    expect(() => puzzleIndexFor("2026-01-01", 0)).toThrow(/empty/);
  });
});

describe("puzzleFor", () => {
  it("returns a real entry", () => {
    expect(bank).toContain(puzzleFor("2026-05-05", bank));
  });
});

describe("boardSeedFor", () => {
  it("differs between days", () => {
    expect(boardSeedFor("2026-01-01")).not.toBe(boardSeedFor("2026-01-02"));
  });

  it("is stable for a day", () => {
    expect(boardSeedFor("2026-01-01")).toBe(boardSeedFor("2026-01-01"));
  });
});

describe("share", () => {
  const rows: Difficulties[] = [
    [1, 1, 2, 3],
    [1, 1, 1, 1],
  ];

  it("colours a row by the group each word really belonged to", () => {
    expect(rowToEmoji([1, 2, 3, 4])).toBe("🟨🟩🟦🟪");
  });

  it("never leaks a word or a theme", () => {
    const text = shareText({
      key: "2026-01-01",
      puzzleNumber: 12,
      rows,
      status: "won",
      title: "Wordflock",
    }) as string;
    expect(text).toContain("Wordflock #12");
    expect(text).toMatch(/^[^A-Za-z]*Wordflock #12\n[🟨🟩🟦🟪⬜\n]+$/u);
  });

  it("offers nothing to share while the puzzle is still in play", () => {
    expect(
      shareText({
        key: "2026-01-01",
        puzzleNumber: 1,
        rows,
        status: "playing",
        title: "Wordflock",
      }),
    ).toBeNull();
  });

  it("still produces a header for a puzzle finished without a scoring guess", () => {
    expect(
      shareText({
        key: "2026-01-01",
        puzzleNumber: 3,
        rows: [],
        status: "won",
        title: "Wordflock",
      }),
    ).toBe("Wordflock #3");
  });
});
