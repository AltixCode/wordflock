import { parseManifest, parsePack, nextDay, FEED_SCHEMA } from '../feed';

const goodPuzzle = (id: string) => ({
  id,
  groups: [
    { theme: 'Citrus', words: ['Lemon', 'Lime', 'Pomelo', 'Yuzu'], difficulty: 1 },
    { theme: 'Chess', words: ['Rook', 'Bishop', 'Knight', 'Pawn'], difficulty: 2 },
    { theme: 'Reds', words: ['Crimson', 'Scarlet', 'Ruby', 'Vermilion'], difficulty: 3 },
    { theme: '___ tree', words: ['Family', 'Palm', 'Shoe', 'Money'], difficulty: 4 },
  ],
});

const manifest = (over: Record<string, unknown> = {}) => ({
  schema: FEED_SCHEMA,
  servedThrough: '2026-12-31',
  packs: [{ id: '2026-Q4', from: '2026-10-01', to: '2026-10-02', path: 'packs/2026-Q4.json' }],
  ...over,
});

const pack = (over: Record<string, unknown> = {}) => ({
  id: '2026-Q4',
  from: '2026-10-01',
  to: '2026-10-02',
  puzzles: { '2026-10-01': goodPuzzle('a'), '2026-10-02': goodPuzzle('b') },
  ...over,
});

describe('nextDay', () => {
  it('crosses a month boundary', () => {
    expect(nextDay('2026-01-31')).toBe('2026-02-01');
  });

  it('crosses a leap day', () => {
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });

  // A pack range is a sequence of labels the server wrote, so it must not move
  // with the device's clock. Europe/Athens springs forward on 2026-03-29.
  it('does not skip a day across a DST boundary', () => {
    expect(nextDay('2026-03-28')).toBe('2026-03-29');
    expect(nextDay('2026-03-29')).toBe('2026-03-30');
  });
});

describe('parseManifest', () => {
  it('accepts a well-formed manifest', () => {
    const { manifest: m, problems } = parseManifest(manifest());
    expect(problems).toEqual([]);
    expect(m?.packs).toHaveLength(1);
  });

  it.each([
    ['not an object', 'no'],
    ['a future schema', manifest({ schema: FEED_SCHEMA + 1 })],
    ['a missing servedThrough', manifest({ servedThrough: undefined })],
    ['packs that are not an array', manifest({ packs: {} })],
  ])('refuses %s', (_label, raw) => {
    const { manifest: m, problems } = parseManifest(raw);
    expect(m).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
  });

  it.each([
    ['walks out of the feed', '../../etc/passwd'],
    ['is absolute', '/packs/x.json'],
    ['is another origin', 'https://elsewhere.example/x.json'],
  ])('refuses a pack whose path %s', (_label, path) => {
    const { manifest: m, problems } = parseManifest(
      manifest({ packs: [{ id: 'p', from: '2026-10-01', to: '2026-10-02', path }] }),
    );
    expect(m).toBeNull();
    expect(problems.join(' ')).toContain('leaves the feed');
  });

  it('refuses a pack that ends before it starts', () => {
    const { problems } = parseManifest(
      manifest({ packs: [{ id: 'p', from: '2026-10-05', to: '2026-10-01', path: 'p.json' }] }),
    );
    expect(problems.join(' ')).toContain('ends before it starts');
  });
});

describe('parsePack', () => {
  it('accepts a well-formed pack', () => {
    const { pack: p, problems } = parsePack(pack());
    expect(problems).toEqual([]);
    expect(Object.keys(p!.puzzles)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('refuses a pack whose identity does not match the manifest entry', () => {
    const summary = { id: '2026-Q4', from: '2026-10-01', to: '2026-10-02', path: 'p.json' };
    const { pack: p, problems } = parsePack(pack({ id: 'something-else' }), summary);
    expect(p).toBeNull();
    expect(problems.join(' ')).toContain('manifest said 2026-Q4');
  });

  // The fault this genre dies of. One of them condemns the whole pack, because
  // a partially-good pack still puts a wrongly-scored puzzle on a fixed day.
  it('refuses the whole pack when one puzzle has a word in two groups', () => {
    const bad = goodPuzzle('bad');
    bad.groups[1]!.words[0] = 'Lemon';
    const { pack: p, problems } = parsePack(
      pack({ puzzles: { '2026-10-01': goodPuzzle('a'), '2026-10-02': bad } }),
    );
    expect(p).toBeNull();
    expect(problems.join(' ')).toContain('appears in both');
  });

  it('refuses a pack with a gap in its range', () => {
    const { pack: p, problems } = parsePack(
      pack({ from: '2026-10-01', to: '2026-10-03', puzzles: { '2026-10-01': goodPuzzle('a'), '2026-10-03': goodPuzzle('c') } }),
    );
    expect(p).toBeNull();
    expect(problems.join(' ')).toContain('2026-10-02 has no puzzle');
  });

  it('refuses a puzzle dated outside the pack range', () => {
    const { problems } = parsePack(
      pack({ puzzles: { '2026-10-01': goodPuzzle('a'), '2026-10-02': goodPuzzle('b'), '2026-11-01': goodPuzzle('c') } }),
    );
    expect(problems.join(' ')).toContain('outside the pack');
  });

  it('refuses a puzzle whose difficulties are not one of each', () => {
    const bad = goodPuzzle('bad');
    bad.groups[3]!.difficulty = 1;
    const { problems } = parsePack(pack({ puzzles: { '2026-10-01': goodPuzzle('a'), '2026-10-02': bad } }));
    expect(problems.length).toBeGreaterThan(0);
  });

  it.each([
    ['a null payload', null],
    ['a JSON array', []],
    ['a missing puzzles object', pack({ puzzles: undefined })],
  ])('refuses %s', (_label, raw) => {
    expect(parsePack(raw).pack).toBeNull();
  });
});
