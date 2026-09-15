import {
  applyGuess,
  evaluateGuess,
  guessRows,
  mistakesLeft,
  startSession,
  unsolvedGroups,
  type Session,
} from "../guess";
import type { Puzzle } from "../puzzle";
import { makeRng } from "../rng";

const puzzle: Puzzle = {
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

const CITRUS = ["Lemon", "Lime", "Orange", "Grapefruit"];
const REDS = ["Crimson", "Scarlet", "Ruby", "Cherry"];
const CARDS = ["Jack", "Queen", "King", "Ace"];
const CHESS = ["Rook", "Bishop", "Knight", "Pawn"];

const fresh = (): Session => startSession(puzzle, makeRng(7));

describe("startSession", () => {
  it("puts all sixteen words on the board", () => {
    expect(fresh().board).toHaveLength(16);
  });

  it("shuffles rather than dealing them in bank order", () => {
    expect(fresh().board).not.toEqual(puzzle.groups.flatMap((g) => g.words));
  });

  it("is reproducible for a given seed", () => {
    expect(startSession(puzzle, makeRng(7)).board).toEqual(
      startSession(puzzle, makeRng(7)).board,
    );
  });

  it("starts with every mistake available", () => {
    expect(mistakesLeft(fresh())).toBe(4);
  });
});

describe("evaluateGuess", () => {
  it("accepts a whole group", () => {
    expect(evaluateGuess(fresh(), CITRUS)).toEqual({
      kind: "correct",
      theme: "Citrus",
    });
  });

  it("accepts a group typed in any case or order", () => {
    expect(
      evaluateGuess(fresh(), ["orange", " LIME", "Grapefruit", "lemon"]),
    ).toEqual({
      kind: "correct",
      theme: "Citrus",
    });
  });

  it("reports three of four as one away", () => {
    expect(evaluateGuess(fresh(), ["Lemon", "Lime", "Orange", "Ruby"])).toEqual(
      { kind: "oneAway" },
    );
  });

  it("reports a two-two split as simply wrong, not one away", () => {
    expect(evaluateGuess(fresh(), ["Lemon", "Lime", "Ruby", "Cherry"])).toEqual(
      { kind: "wrong" },
    );
  });

  it("refuses a selection that is not four words", () => {
    expect(evaluateGuess(fresh(), ["Lemon"])).toEqual({
      kind: "invalid",
      reason: "count",
    });
  });

  it("refuses the same word twice", () => {
    expect(evaluateGuess(fresh(), ["Lemon", "lemon", "Lime", "Ruby"])).toEqual({
      kind: "invalid",
      reason: "duplicate",
    });
  });

  it("refuses a word that is not in the puzzle", () => {
    expect(
      evaluateGuess(fresh(), ["Lemon", "Lime", "Orange", "Banana"]),
    ).toEqual({
      kind: "invalid",
      reason: "unknown",
    });
  });
});

describe("applyGuess", () => {
  it("takes a solved group off the board and records the theme", () => {
    const { session, outcome } = applyGuess(fresh(), CITRUS);
    expect(outcome.kind).toBe("correct");
    expect(session.solved).toEqual(["Citrus"]);
    expect(session.board).toHaveLength(12);
    expect(session.board).not.toEqual(expect.arrayContaining(["Lemon"]));
  });

  it("does not mutate the session it was given", () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    applyGuess(before, CITRUS);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("spends a mistake on a wrong guess", () => {
    const { session } = applyGuess(fresh(), [
      "Lemon",
      "Lime",
      "Ruby",
      "Cherry",
    ]);
    expect(mistakesLeft(session)).toBe(3);
    expect(session.board).toHaveLength(16);
  });

  it("spends a mistake on a near miss too", () => {
    const { session } = applyGuess(fresh(), [
      "Lemon",
      "Lime",
      "Orange",
      "Ruby",
    ]);
    expect(mistakesLeft(session)).toBe(3);
  });

  it("charges nothing for repeating a guess already made", () => {
    const first = applyGuess(fresh(), [
      "Lemon",
      "Lime",
      "Ruby",
      "Cherry",
    ]).session;
    const again = applyGuess(first, ["Cherry", "Ruby", "Lime", "Lemon"]);
    expect(again.outcome).toEqual({ kind: "invalid", reason: "repeat" });
    expect(mistakesLeft(again.session)).toBe(3);
  });

  it("refuses a selection containing an already-solved word", () => {
    const solved = applyGuess(fresh(), CITRUS).session;
    expect(evaluateGuess(solved, ["Lemon", "Crimson", "Jack", "Rook"])).toEqual(
      {
        kind: "invalid",
        reason: "solved",
      },
    );
  });

  it("wins when the fourth group is found", () => {
    let session = fresh();
    for (const group of [CITRUS, REDS, CARDS, CHESS])
      session = applyGuess(session, group).session;
    expect(session.status).toBe("won");
    expect(session.board).toHaveLength(0);
    expect(mistakesLeft(session)).toBe(4);
  });

  it("loses on the fourth mistake", () => {
    let session = fresh();
    const wrong = [
      ["Lemon", "Crimson", "Jack", "Rook"],
      ["Lime", "Scarlet", "Queen", "Bishop"],
      ["Orange", "Ruby", "King", "Knight"],
      ["Grapefruit", "Cherry", "Ace", "Pawn"],
    ];
    for (const guess of wrong) session = applyGuess(session, guess).session;
    expect(session.status).toBe("lost");
    expect(mistakesLeft(session)).toBe(0);
  });

  it("accepts nothing once the puzzle is over", () => {
    let session = fresh();
    for (const group of [CITRUS, REDS, CARDS, CHESS])
      session = applyGuess(session, group).session;
    expect(applyGuess(session, CITRUS).outcome).toEqual({ kind: "finished" });
  });

  it("survives a round trip through JSON", () => {
    const played = applyGuess(applyGuess(fresh(), CITRUS).session, [
      "Crimson",
      "Scarlet",
      "Jack",
      "Rook",
    ]).session;
    const restored = JSON.parse(JSON.stringify(played)) as Session;
    // The repeat rule has to survive too — it is state, not a side table.
    expect(
      evaluateGuess(restored, ["Rook", "Jack", "Scarlet", "Crimson"]),
    ).toEqual({
      kind: "invalid",
      reason: "repeat",
    });
    expect(mistakesLeft(restored)).toBe(3);
  });
});

describe("guessRows", () => {
  it("records the difficulty each chosen word really belonged to", () => {
    const session = applyGuess(fresh(), [
      "Lemon",
      "Crimson",
      "Jack",
      "Rook",
    ]).session;
    expect(guessRows(session)).toHaveLength(1);
    expect([...(guessRows(session)[0] as number[])].sort()).toEqual([
      1, 2, 3, 4,
    ]);
  });
});

describe("unsolvedGroups", () => {
  it("lists what is left, easiest first", () => {
    const session = applyGuess(fresh(), CARDS).session;
    expect(unsolvedGroups(session).map((g) => g.difficulty)).toEqual([1, 2, 4]);
  });

  it("is empty after a win", () => {
    let session = fresh();
    for (const group of [CITRUS, REDS, CARDS, CHESS])
      session = applyGuess(session, group).session;
    expect(unsolvedGroups(session)).toEqual([]);
  });
});
