// Tests du moteur de Frise : la donne, la pose juste ou fausse, les dates égales, la fin du tour de table,
// le départage, la pioche qui se remélange, le classement, les bots et la liste de cartes elle-même.
import { describe, expect, it } from 'vitest';
import { FAMILIES, fits, startingHand, yearLabel } from '../shared/protocol';
import { Brain, SKILLS, naiveChoice } from '../server/bots';
import { CARDS } from '../server/cards';
import { BY_ID, Game, enoughCards, poolSize } from '../server/game';

const ALL = [...FAMILIES];
const year = (id: number) => BY_ID.get(id)!.year;

/** Une pioche choisie : les cartes données dans l'ordre (tour par tour), puis la carte de départ, puis le reste. */
function rigged(order: string[], hands: number[][], first: number, rest: number[] = []): Game {
  const deck: number[] = [];
  const n = hands[0].length;
  for (let k = 0; k < n; k++) for (let p = 0; p < order.length; p++) deck.push(hands[p][k]);
  deck.push(first, ...rest);
  return new Game(order, ALL, n as 3, deck);
}

/** Une carte par année demandée (la première trouvée). */
function byYear(y: number): number {
  const c = CARDS.find((x) => x.year === y);
  if (!c) throw new Error(`pas de carte en ${y}`);
  return c.id;
}

/** La place juste d'une carte dans la frise. */
function goodSlot(g: Game, id: number): number {
  const y = year(id);
  let s = 0;
  while (s < g.line.length && g.line[s].year <= y) s++;
  return s;
}

describe('les cartes', () => {
  it('ont toutes un titre, une date entière, un dessin et une source', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(250);
    const ids = new Set<number>();
    const titles = new Set<string>();
    for (const c of CARDS) {
      expect(Number.isInteger(c.year)).toBe(true);
      expect(c.year).not.toBe(0);
      expect(c.year).toBeLessThanOrEqual(2026);
      expect(c.title.length).toBeGreaterThan(5);
      expect(c.title.length).toBeLessThanOrEqual(70);
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.src).toMatch(/^(fr|en):/);
      expect(FAMILIES).toContain(c.family);
      expect(ids.has(c.id)).toBe(false);
      expect(titles.has(c.title)).toBe(false);
      ids.add(c.id);
      titles.add(c.title);
    }
  });

  it('chaque famille a assez de cartes pour une petite table', () => {
    for (const f of FAMILIES) expect(poolSize([f])).toBeGreaterThanOrEqual(25);
    expect(enoughCards(2, 0, ['loisirs'])).toBe(true);
    expect(enoughCards(8, 6, ['loisirs'])).toBe(false);
    expect(enoughCards(8, 0, ALL)).toBe(true);
  });

  it('les dates avant Jésus-Christ se lisent bien', () => {
    expect(yearLabel(-44)).toBe('44 av. J.-C.');
    expect(yearLabel(1789)).toBe('1789');
  });
});

describe('la donne', () => {
  it('suit la règle : 6, 5 ou 4 cartes selon la table', () => {
    expect(startingHand(2, 0)).toBe(6);
    expect(startingHand(3, 0)).toBe(6);
    expect(startingHand(4, 0)).toBe(5);
    expect(startingHand(5, 0)).toBe(5);
    expect(startingHand(6, 0)).toBe(4);
    expect(startingHand(8, 0)).toBe(4);
    expect(startingHand(8, 3)).toBe(3);
  });

  it('chacun reçoit ses cartes, la frise commence par une carte, sans doublon', () => {
    const g = new Game(['a', 'b', 'c', 'd'], ALL, 0);
    for (const id of ['a', 'b', 'c', 'd']) expect(g.handOf(id)).toHaveLength(5);
    expect(g.line).toHaveLength(1);
    expect(g.line[0].by).toBeNull();
    const all = [...g.deck, ...g.line.map((c) => c.id), ...['a', 'b', 'c', 'd'].flatMap((id) => g.handOf(id))];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(CARDS.length);
  });

  it('les thèmes retirés ne sont pas dans la pioche', () => {
    const g = new Game(['a', 'b'], ['culture'], 0);
    const all = [...g.deck, ...g.handOf('a'), ...g.handOf('b'), g.line[0].id];
    expect(all.every((id) => BY_ID.get(id)!.family === 'culture')).toBe(true);
  });
});

describe('la pose', () => {
  it('une carte bien placée reste dans la frise, à sa place', () => {
    const g = rigged(['a', 'b'], [[byYear(1789), byYear(1066), byYear(1969)], [byYear(1492), byYear(1944), byYear(2001)]], byYear(1903));
    const r = g.play('a', byYear(1789), 0);
    expect(typeof r).not.toBe('string');
    if (typeof r === 'string') return;
    expect(r.move.ok).toBe(true);
    expect(g.line.map((c) => c.year)).toEqual([1789, 1903]);
    expect(g.handOf('a')).toHaveLength(2);
    expect(g.turn).toBe('b');
  });

  it('une carte mal placée part, et on en pioche une autre', () => {
    const g = rigged(['a', 'b'], [[byYear(1789), byYear(1066), byYear(1969)], [byYear(1492), byYear(1944), byYear(2001)]], byYear(1903), [byYear(1815)]);
    const r = g.play('a', byYear(1789), 1);
    if (typeof r === 'string') throw new Error(r);
    expect(r.move.ok).toBe(false);
    expect(r.move.drew).toBe(true);
    expect(g.line).toHaveLength(1);
    expect(g.handOf('a')).toHaveLength(3);
    expect(g.handOf('a')).toContain(byYear(1815));
    expect(g.discard).toContain(byYear(1789));
  });

  it('deux dates égales : les deux places sont justes', () => {
    const same = CARDS.filter((c) => c.year === 1969).map((c) => c.id);
    expect(same.length).toBeGreaterThanOrEqual(2);
    const line = [{ year: 1969 }];
    expect(fits(line, 0, 1969)).toBe(true);
    expect(fits(line, 1, 1969)).toBe(true);
    expect(fits([{ year: 1900 }, { year: 1969 }, { year: 2000 }], 1, 1969)).toBe(true);
    expect(fits([{ year: 1900 }, { year: 1969 }, { year: 2000 }], 2, 1969)).toBe(true);
    expect(fits([{ year: 1900 }, { year: 1969 }, { year: 2000 }], 3, 1969)).toBe(false);
  });

  it('refuse un coup hors de son tour, une carte absente ou une place inconnue', () => {
    const g = new Game(['a', 'b'], ALL, 0);
    const own = g.handOf('a')[0];
    expect(g.play('b', g.handOf('b')[0], 0)).toBe("Ce n'est pas ton tour.");
    expect(g.play('a', g.handOf('b')[0], 0)).toBe("Cette carte n'est pas dans ta main.");
    expect(g.play('a', own, 5)).toBe('Place inconnue dans la frise.');
    expect(g.play('a', own, -1)).toBe('Place inconnue dans la frise.');
    expect(g.handOf('a')).toHaveLength(6);
  });
});

describe('la fin', () => {
  it('celui qui pose sa dernière carte laisse finir le tour, puis gagne seul', () => {
    // a (premier) a une seule carte juste ; b se trompe.
    const g = rigged(['a', 'b'], [[byYear(1789)], [byYear(1066)]], byYear(1903), [byYear(1515), byYear(1610)]);
    const r1 = g.play('a', byYear(1789), 0);
    if (typeof r1 === 'string') throw new Error(r1);
    expect(r1.winner).toBeNull();
    expect(g.lastRound).toBe(true);
    expect(g.turn).toBe('b');
    const r2 = g.play('b', byYear(1066), 2);
    if (typeof r2 === 'string') throw new Error(r2);
    expect(r2.move.ok).toBe(false);
    expect(r2.winner).toBe('a');
    expect(g.standings()[0]).toEqual({ id: 'a', place: 1 });
  });

  it('deux joueurs sans carte au même tour : départage, les autres sont écartés', () => {
    const g = rigged(['a', 'b', 'c'], [[byYear(1789)], [byYear(1969)], [byYear(1066)]], byYear(1903), [byYear(1610), byYear(1515), byYear(1431)]);
    g.play('a', byYear(1789), 0); // juste
    g.play('b', byYear(1969), 2); // juste
    const r = g.play('c', byYear(1066), 3); // faux
    if (typeof r === 'string') throw new Error(r);
    expect(r.winner).toBeNull();
    expect(r.tiebreak).toEqual(['a', 'b']);
    expect(g.alive).toEqual(['a', 'b']);
    expect(g.handOf('a')).toHaveLength(1);
    expect(g.handOf('b')).toHaveLength(1);
    expect(g.turn).toBe('a');
    // Au départage, a se trompe et b réussit : b gagne.
    const ca = g.handOf('a')[0];
    const bad = goodSlot(g, ca) === 0 ? g.line.length : 0;
    g.play('a', ca, bad);
    const cb = g.handOf('b')[0];
    const r2 = g.play('b', cb, goodSlot(g, cb));
    if (typeof r2 === 'string') throw new Error(r2);
    expect(r2.winner).toBe('b');
    const st = g.standings();
    expect(st[0]).toEqual({ id: 'b', place: 1 });
    expect(st[1].id).toBe('a');
    expect(st[2].id).toBe('c');
  });

  it('la pioche vide se remélange avec les cartes ratées', () => {
    const g = rigged(['a', 'b'], [[byYear(1789), byYear(1815)], [byYear(1066), byYear(1453)]], byYear(1903), []);
    expect(g.deck).toHaveLength(0);
    const r = g.play('a', byYear(1789), 1); // faux : la carte part, et la pioche est vide
    if (typeof r === 'string') throw new Error(r);
    expect(r.move.drew).toBe(true);
    // La seule carte de la défausse est revenue dans sa main.
    expect(g.handOf('a')).toContain(byYear(1789));
  });

  it('une partie entière se termine toujours', () => {
    for (let k = 0; k < 40; k++) {
      const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, 2 + (k % 7));
      const g = new Game(order, ALL, 0);
      let guard = 0;
      while (!g.winner && guard++ < 5000) {
        const id = g.turn;
        if (!g.handOf(id).length) {
          g.advance();
          continue;
        }
        const c = naiveChoice(g.handOf(id), g.line);
        g.play(id, c.card, c.slot);
      }
      expect(g.winner).not.toBeNull();
      // La frise est toujours rangée.
      for (let i = 1; i < g.line.length; i++) expect(g.line[i - 1].year).toBeLessThanOrEqual(g.line[i].year);
    }
  });
});

describe('les bots', () => {
  it('choisissent une carte de leur main et une place qui existe', () => {
    const g = new Game(['a', 'b'], ALL, 0);
    for (const s of SKILLS) {
      const b = new Brain(s);
      const c = b.choose(g.handOf('a'), g.line);
      expect(g.handOf('a')).toContain(c.card);
      expect(c.slot).toBeGreaterThanOrEqual(0);
      expect(c.slot).toBeLessThanOrEqual(g.line.length);
    }
  });

  it('un bot expert place juste bien plus souvent que le hasard', () => {
    let expert = 0;
    let naive = 0;
    const N = 400;
    for (let k = 0; k < N; k++) {
      const g = new Game(['a', 'b'], ALL, 0);
      // Une frise de 6 cartes.
      for (let i = 0; i < 5; i++) g.line.push({ ...g.line[0], id: -i - 1, year: [-300, 1200, 1700, 1900, 1990][i] });
      g.line.sort((x, y) => x.year - y.year);
      const hand = g.handOf('a');
      const e = new Brain(SKILLS[2]).choose(hand, g.line);
      if (fits(g.line, e.slot, year(e.card))) expert++;
      const n = naiveChoice(hand, g.line);
      if (fits(g.line, n.slot, year(n.card))) naive++;
    }
    expect(expert / N).toBeGreaterThan(0.75);
    expect(expert).toBeGreaterThan(naive * 2);
  });
});
