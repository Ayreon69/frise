// Les bots de Frise : ils ne voient que ce qu'un joueur voit (leurs cartes sans date, la frise dévoilée).
// Chaque bot a une idée approximative de la date de chaque carte : une estimation tirée une fois pour toutes,
// plus floue pour les époques anciennes et pour un bot novice. Il joue la carte, et la place, dont il est le plus sûr.
import crypto from 'node:crypto';
import type { LineCard } from '../shared/protocol';
import { BY_ID } from './game';

export interface Skill {
  name: 'novice' | 'habile' | 'expert';
  /** Multiplie l'incertitude de base. */
  spread: number;
  /** Une chance de jouer un peu au hasard (une hésitation). */
  slip: number;
  /** Le temps de réflexion, en millisecondes. */
  think: readonly [number, number];
}

export const SKILLS: Skill[] = [
  { name: 'novice', spread: 3, slip: 0.12, think: [2_200, 4_800] },
  { name: 'habile', spread: 1.5, slip: 0.06, think: [1_800, 4_000] },
  { name: 'expert', spread: 0.8, slip: 0.03, think: [1_500, 3_400] },
];

/** Le pilote automatique d'un absent : il pose ce qu'il peut, sans trop réfléchir. */
export const AUTOPILOT: Skill = { name: 'novice', spread: 3, slip: 0.3, think: [900, 1_800] };

export function randomSkill(): Skill {
  const r = crypto.randomInt(100);
  return r < 30 ? SKILLS[0] : r < 75 ? SKILLS[1] : SKILLS[2];
}

/** L'incertitude d'un joueur moyen sur une date, selon son époque (en années). */
export function baseSigma(year: number): number {
  if (year >= 1950) return 7;
  if (year >= 1900) return 11;
  if (year >= 1800) return 18;
  if (year >= 1600) return 35;
  if (year >= 1000) return 70;
  return 160;
}

function gauss(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Fonction de répartition de la loi normale (approximation d'Abramowitz et Stegun). */
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export class Brain {
  /** Ce que ce bot croit savoir de chaque carte : une estimation et son incertitude. */
  private beliefs = new Map<number, { est: number; sigma: number }>();

  constructor(readonly skill: Skill) {}

  belief(cardId: number): { est: number; sigma: number } {
    let b = this.beliefs.get(cardId);
    if (!b) {
      const year = BY_ID.get(cardId)!.year;
      const sigma = baseSigma(year) * this.skill.spread;
      // Une estimation tirée une fois : le bot se trompe toujours de la même façon sur une même carte.
      b = { est: year + gauss() * sigma, sigma };
      this.beliefs.set(cardId, b);
    }
    return b;
  }

  /** La chance, selon ce bot, que la carte tombe juste à cette place. */
  chance(cardId: number, line: LineCard[], slot: number): number {
    const { est, sigma } = this.belief(cardId);
    const lo = slot > 0 ? line[slot - 1].year : -Infinity;
    const hi = slot < line.length ? line[slot].year : Infinity;
    const a = lo === -Infinity ? 0 : phi((lo - 0.5 - est) / sigma);
    const b = hi === Infinity ? 1 : phi((hi + 0.5 - est) / sigma);
    return Math.max(0, b - a);
  }

  /** Le coup qui a, selon lui, le plus de chances d'être juste. */
  choose(hand: number[], line: LineCard[]): { card: number; slot: number; p: number } {
    if (Math.random() < this.skill.slip) {
      const card = hand[crypto.randomInt(hand.length)];
      const slots = Array.from({ length: line.length + 1 }, (_, s) => s).sort((x, y) => this.chance(card, line, y) - this.chance(card, line, x));
      // Une hésitation : la deuxième meilleure place, quand il y en a une.
      const slot = slots[Math.min(1, slots.length - 1)];
      return { card, slot, p: this.chance(card, line, slot) };
    }
    let best = { card: hand[0], slot: 0, p: -1 };
    for (const card of hand) {
      for (let slot = 0; slot <= line.length; slot++) {
        const p = this.chance(card, line, slot);
        if (p > best.p) best = { card, slot, p };
      }
    }
    return best;
  }
}

/** Une référence naïve pour mesurer les bots : une carte et une place au hasard. */
export function naiveChoice(hand: number[], line: LineCard[]): { card: number; slot: number } {
  return { card: hand[crypto.randomInt(hand.length)], slot: crypto.randomInt(line.length + 1) };
}
