import { makeRng, shuffled } from '../rng';

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).toEqual(second);
  });

  it('gives different streams for different seeds', () => {
    expect(makeRng(1).next()).not.toEqual(makeRng(2).next());
  });

  it('stays inside [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('does not immediately repeat — a seed of 0 must not degenerate', () => {
    // A weak LCG seeded with 0 can emit 0 forever, and every puzzle generated
    // from it would be identical.
    const rng = makeRng(0);
    const values = new Set(Array.from({ length: 50 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(40);
  });

  describe('int', () => {
    it('stays within the half-open range', () => {
      const rng = makeRng(7);
      for (let i = 0; i < 500; i += 1) {
        const value = rng.int(5);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(5);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('covers the whole range given enough draws', () => {
      const rng = makeRng(3);
      const seen = new Set(Array.from({ length: 300 }, () => rng.int(4)));
      expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    });

    it('returns 0 for a range of one', () => {
      expect(makeRng(1).int(1)).toBe(0);
    });
  });
});

describe('shuffled', () => {
  it('keeps every element exactly once', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    expect([...shuffled(input, makeRng(42))].sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5];
    shuffled(input, makeRng(42));
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a seed', () => {
    expect(shuffled([1, 2, 3, 4, 5, 6], makeRng(8))).toEqual(shuffled([1, 2, 3, 4, 5, 6], makeRng(8)));
  });

  it('actually reorders — a shuffle that returns the input is a bug, not luck', () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    expect(shuffled(input, makeRng(5))).not.toEqual(input);
  });

  it('handles empty and single-element inputs', () => {
    expect(shuffled([], makeRng(1))).toEqual([]);
    expect(shuffled(['x'], makeRng(1))).toEqual(['x']);
  });
});
