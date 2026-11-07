// Mesure la force des bots de Frise et la durée des parties.
//   npx tsx test/sim.ts [parties]
// 1. Chaque niveau seul contre un joueur naïf (carte et place au hasard), à deux.
// 2. Tables mêlées de 2 à 8 bots de niveaux au hasard : nombre de tours de table, cartes jouées, départages.
import { FAMILIES, fits } from '../shared/protocol';
import { Brain, SKILLS, naiveChoice, type Skill } from '../server/bots';
import { BY_ID, Game } from '../server/game';

const N = Number(process.argv[2] ?? 2000);
const ALL = [...FAMILIES];

type Player = Skill | 'naive';

function play(players: Player[]): { winner: number; rounds: number; moves: number; ok: number; tiebreak: boolean; perPlayer: { good: number; bad: number }[] } {
  const ids = players.map((_, i) => `p${i}`);
  const brains = players.map((p) => (p === 'naive' ? null : new Brain(p)));
  // L'ordre de la table est tiré au hasard, comme dans la vraie partie.
  const order = [...ids].sort(() => Math.random() - 0.5);
  const g = new Game(order, ALL, 0);
  let moves = 0;
  let ok = 0;
  let tiebreak = false;
  const stats = ids.map(() => ({ good: 0, bad: 0 }));
  while (!g.winner && moves < 10_000) {
    const id = g.turn;
    const hand = g.handOf(id);
    if (!hand.length) {
      g.advance();
      continue;
    }
    const i = ids.indexOf(id);
    const c = brains[i] ? brains[i]!.choose(hand, g.line) : naiveChoice(hand, g.line);
    const right = fits(g.line, c.slot, BY_ID.get(c.card)!.year);
    const r = g.play(id, c.card, c.slot);
    if (typeof r === 'string') throw new Error(r);
    moves++;
    if (right) {
      ok++;
      stats[i].good++;
    } else stats[i].bad++;
    if (r.tiebreak) tiebreak = true;
  }
  return { winner: ids.indexOf(g.winner!), rounds: g.rounds, moves, ok, tiebreak, perPlayer: stats };
}

const pct = (x: number) => `${(100 * x).toFixed(1)} %`;

console.log(`Frise : ${N} parties par mesure\n`);
console.log('Chaque niveau contre un joueur naïf (à deux) :');
for (const s of SKILLS) {
  let wins = 0;
  let good = 0;
  let total = 0;
  for (let k = 0; k < N; k++) {
    const r = play([s, 'naive']);
    if (r.winner === 0) wins++;
    good += r.perPlayer[0].good;
    total += r.perPlayer[0].good + r.perPlayer[0].bad;
  }
  console.log(`  ${s.name.padEnd(7)} gagne ${pct(wins / N)}, place juste ${pct(good / total)}`);
}

console.log('\nNiveaux entre eux (novice, habile, expert à la même table) :');
{
  const wins = [0, 0, 0];
  for (let k = 0; k < N; k++) wins[play([...SKILLS]).winner]++;
  console.log(`  ${SKILLS.map((s, i) => `${s.name} ${pct(wins[i] / N)}`).join(', ')}`);
}

console.log('\nDurée selon la table (bots de niveaux au hasard) :');
for (const n of [2, 3, 4, 5, 6, 8]) {
  let rounds = 0;
  let moves = 0;
  let ok = 0;
  let tb = 0;
  const M = Math.max(200, Math.floor(N / 4));
  for (let k = 0; k < M; k++) {
    const table = Array.from({ length: n }, () => SKILLS[Math.floor(Math.random() * 3)]);
    const r = play(table);
    rounds += r.rounds;
    moves += r.moves;
    ok += r.ok;
    if (r.tiebreak) tb++;
  }
  console.log(`  ${n} joueurs : ${(rounds / M).toFixed(1)} tours de table, ${(moves / M).toFixed(0)} cartes jouées, ${pct(ok / moves)} justes, départage ${pct(tb / M)}`);
}
