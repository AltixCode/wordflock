/**
 * Guessing rules, and the session state a screen renders.
 *
 * Pure, and deliberately without a notion of time. Everything the rules need is
 * in the session itself — including the exact guesses made — so a session
 * serialises to JSON and back with nothing lost. That is what lets a player
 * close the app mid-puzzle and come back to exactly where they were, and it is
 * why repeat detection lives in the state rather than in a side table.
 */

import {
  GROUPS_PER_PUZZLE,
  MISTAKES_ALLOWED,
  WORDS_PER_GROUP,
  normalizeWord,
  type Group,
  type Puzzle,
} from "./puzzle";
import { shuffled, type Rng } from "./rng";

export type GuessOutcome =
  /** All four belong to one group. */
  | { kind: "correct"; theme: string }
  /** Three of the four share a group — the near-miss this genre is built on. */
  | { kind: "oneAway" }
  | { kind: "wrong" }
  /** Not four distinct unsolved words, or a guess already made; nothing is spent. */
  | {
      kind: "invalid";
      reason: "count" | "unknown" | "duplicate" | "solved" | "repeat";
    }
  /** The puzzle is already over. */
  | { kind: "finished" };

/** One guess recorded as the difficulty each chosen word actually belonged to. */
export type Difficulties = [number, number, number, number];

export interface Session {
  puzzle: Puzzle;
  /** Display order of the unsolved words. A solved group leaves the board. */
  board: string[];
  /** Themes solved, in the order the player found them. */
  solved: string[];
  /** Every scoring guess, normalised and sorted, oldest first. */
  guesses: string[][];
  mistakes: number;
  status: "playing" | "won" | "lost";
}

export function startSession(puzzle: Puzzle, rng: Rng): Session {
  return {
    puzzle,
    board: shuffled(
      puzzle.groups.flatMap((g) => g.words),
      rng,
    ),
    solved: [],
    guesses: [],
    mistakes: 0,
    status: "playing",
  };
}

export function mistakesLeft(session: Session): number {
  return Math.max(0, MISTAKES_ALLOWED - session.mistakes);
}

function groupFor(puzzle: Puzzle, word: string): Group | undefined {
  const wanted = normalizeWord(word);
  return puzzle.groups.find((g) =>
    g.words.some((w) => normalizeWord(w) === wanted),
  );
}

/** How many of `selection` share their most-common group. */
function largestShare(puzzle: Puzzle, selection: string[]): number {
  const counts = new Map<string, number>();
  for (const word of selection) {
    const group = groupFor(puzzle, word);
    if (!group) continue;
    counts.set(group.theme, (counts.get(group.theme) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

/** The same four words in any order, in one comparable form. */
function canonical(selection: string[]): string[] {
  return selection.map(normalizeWord).sort();
}

function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

/**
 * Judges a selection without changing anything.
 *
 * Split from `applyGuess` so a screen can light up the tiles for a near-miss
 * before the state moves, and so the rules can be tested without a session.
 */
export function evaluateGuess(
  session: Session,
  selection: string[],
): GuessOutcome {
  if (session.status !== "playing") return { kind: "finished" };
  if (selection.length !== WORDS_PER_GROUP)
    return { kind: "invalid", reason: "count" };

  const keys = canonical(selection);
  if (new Set(keys).size !== keys.length)
    return { kind: "invalid", reason: "duplicate" };

  for (const word of selection) {
    const group = groupFor(session.puzzle, word);
    if (!group) return { kind: "invalid", reason: "unknown" };
    if (session.solved.includes(group.theme))
      return { kind: "invalid", reason: "solved" };
  }

  // A repeated guess costs nothing. Charging for it punishes a mis-tap, and the
  // information was already spent the first time.
  if (session.guesses.some((g) => sameSelection(g, keys))) {
    return { kind: "invalid", reason: "repeat" };
  }

  const share = largestShare(session.puzzle, selection);
  if (share === WORDS_PER_GROUP) {
    const theme = groupFor(session.puzzle, selection[0] as string)
      ?.theme as string;
    return { kind: "correct", theme };
  }
  return share === WORDS_PER_GROUP - 1
    ? { kind: "oneAway" }
    : { kind: "wrong" };
}

export interface GuessResult {
  session: Session;
  outcome: GuessOutcome;
}

/**
 * Applies a guess, returning a new session. Never mutates the one passed in —
 * the screens keep the previous state to animate from.
 */
export function applyGuess(session: Session, selection: string[]): GuessResult {
  const outcome = evaluateGuess(session, selection);
  if (outcome.kind === "invalid" || outcome.kind === "finished")
    return { session, outcome };

  const guesses = [...session.guesses, canonical(selection)];

  if (outcome.kind === "correct") {
    const solved = [...session.solved, outcome.theme];
    return {
      outcome,
      session: {
        ...session,
        solved,
        guesses,
        board: session.board.filter(
          (w) => groupFor(session.puzzle, w)?.theme !== outcome.theme,
        ),
        status: solved.length === GROUPS_PER_PUZZLE ? "won" : "playing",
      },
    };
  }

  const mistakes = session.mistakes + 1;
  return {
    outcome,
    session: {
      ...session,
      mistakes,
      guesses,
      status: mistakes >= MISTAKES_ALLOWED ? "lost" : "playing",
    },
  };
}

/** Each guess as the difficulties of the words chosen — the share grid's rows. */
export function guessRows(session: Session): Difficulties[] {
  return session.guesses.map(
    (guess) =>
      guess.map(
        (w) => groupFor(session.puzzle, w)?.difficulty ?? 0,
      ) as Difficulties,
  );
}

/**
 * The groups still hidden when a puzzle ends, easiest first.
 *
 * A lost puzzle reveals them: the point of a daily is the conversation about
 * it, and a player who never learns the fourth connection cannot have that.
 */
export function unsolvedGroups(session: Session): Group[] {
  return session.puzzle.groups
    .filter((g) => !session.solved.includes(g.theme))
    .sort((a, b) => a.difficulty - b.difficulty);
}
