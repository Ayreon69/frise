// Le moteur de Frise, sans réseau : la pioche, les mains, la frise commune, le tour de table et le départage.
// Règle : chacun pose une carte par tour ; bien placée, elle reste dans la frise ; mal placée, elle part
// et on en pioche une autre. Quand quelqu'un pose sa dernière carte, on finit le tour de table :
// s'il est seul à n'avoir plus rien, il gagne ; sinon les ex æquo piochent une carte et rejouent entre eux.
import crypto from 'node:crypto';
import { fits, startingHand, type CardFamily, type HandSize, type LineCard, type Move } from '../shared/protocol';
import { CARDS, type CardData } from './cards';

export const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function poolSize(families: readonly CardFamily[]): number {
  return CARDS.filter((c) => families.includes(c.family)).length;
}

/** Assez de cartes pour la donne, la carte de départ et une bonne réserve d'erreurs. */
export function enoughCards(players: number, hand: HandSize, families: readonly CardFamily[]): boolean {
  return poolSize(families) >= players * startingHand(players, hand) + 1 + Math.max(12, players * 3);
}

export function lineCard(c: CardData, by: string | null): LineCard {
  return { id: c.id, title: c.title, emoji: c.emoji, family: c.family, year: c.year, by };
}

export interface PlayResult {
  move: Move;
  /** La partie est finie : ce joueur gagne. */
  winner: string | null;
  /** Un départage commence entre ces joueurs. */
  tiebreak: string[] | null;
}

export class Game {
  readonly order: string[];
  deck: number[];
  discard: number[] = [];
  line: LineCard[] = [];
  hands = new Map<string, number[]>();
  /** Les joueurs encore en lice : tout le monde, puis les seuls ex æquo d'un départage. */
  alive: string[];
  turnIndex = 0;
  /** Quelqu'un a posé sa dernière carte pendant ce tour de table. */
  lastRound = false;
  tiebreak: string[] | null = null;
  moves = 0;
  rounds = 1;
  good = new Map<string, number>();
  bad = new Map<string, number>();
  winner: string | null = null;

  constructor(order: string[], families: readonly CardFamily[], handSetting: HandSize, deck?: number[]) {
    this.order = [...order];
    this.alive = [...order];
    this.deck = deck ? [...deck] : shuffle(CARDS.filter((c) => families.includes(c.family)).map((c) => c.id));
    const n = startingHand(order.length, handSetting);
    for (const id of order) {
      this.hands.set(id, []);
      this.good.set(id, 0);
      this.bad.set(id, 0);
    }
    for (let k = 0; k < n; k++) for (const id of order) this.hands.get(id)!.push(this.draw()!);
    const first = this.draw()!;
    this.line = [lineCard(BY_ID.get(first)!, null)];
  }

  has(id: string): boolean {
    return this.order.includes(id);
  }

  get turn(): string {
    return this.alive[this.turnIndex];
  }

  handOf(id: string): number[] {
    return this.hands.get(id) ?? [];
  }

  /** Une carte de la pioche ; vide, on remélange la défausse. */
  draw(): number | undefined {
    if (!this.deck.length && this.discard.length) {
      this.deck = shuffle(this.discard);
      this.discard = [];
    }
    return this.deck.shift();
  }

  /** Le joueur dont c'est le tour pose une de ses cartes à la place `slot` (0 : avant la première carte de la frise). */
  play(by: string, cardId: number, slot: number, auto = false): PlayResult | string {
    if (this.winner) return 'La partie est finie.';
    if (by !== this.turn) return "Ce n'est pas ton tour.";
    const hand = this.hands.get(by)!;
    const at = hand.indexOf(cardId);
    if (at < 0) return "Cette carte n'est pas dans ta main.";
    if (!Number.isInteger(slot) || slot < 0 || slot > this.line.length) return 'Place inconnue dans la frise.';
    const card = BY_ID.get(cardId)!;
    hand.splice(at, 1);
    const ok = fits(this.line, slot, card.year);
    const placed = lineCard(card, by);
    let drew = false;
    if (ok) {
      this.line.splice(slot, 0, placed);
      this.good.set(by, (this.good.get(by) ?? 0) + 1);
    } else {
      this.discard.push(cardId);
      this.bad.set(by, (this.bad.get(by) ?? 0) + 1);
      const next = this.draw();
      if (next !== undefined) {
        hand.push(next);
        drew = true;
      }
    }
    this.moves++;
    const move: Move = { n: this.moves, by, card: placed, slot, ok, drew, auto };
    if (!hand.length) this.lastRound = true;
    return { move, ...this.advance() };
  }

  /** Passe au joueur suivant ; au bout du tour de table, on regarde qui n'a plus de carte. */
  advance(): { winner: string | null; tiebreak: string[] | null } {
    if (this.turnIndex < this.alive.length - 1) {
      this.turnIndex++;
      return { winner: null, tiebreak: null };
    }
    this.turnIndex = 0;
    this.rounds++;
    const empty = this.alive.filter((id) => !this.hands.get(id)!.length);
    this.lastRound = false;
    if (empty.length === 1) {
      this.winner = empty[0];
      return { winner: this.winner, tiebreak: null };
    }
    if (empty.length > 1) {
      // Départage : les autres sont écartés, les ex æquo piochent une carte et rejouent un tour entre eux.
      this.alive = this.alive.filter((id) => empty.includes(id));
      this.tiebreak = [...this.alive];
      for (const id of this.alive) {
        const c = this.draw();
        if (c !== undefined) this.hands.get(id)!.push(c);
      }
      // Plus aucune carte nulle part (cas extrême) : le premier des ex æquo l'emporte.
      if (this.alive.every((id) => !this.hands.get(id)!.length)) {
        this.winner = this.alive[0];
        return { winner: this.winner, tiebreak: null };
      }
      return { winner: null, tiebreak: [...this.alive] };
    }
    return { winner: null, tiebreak: null };
  }

  /** Les cartes encore en main de quelqu'un, dates dévoilées (pour la fin). */
  leftOf(id: string): LineCard[] {
    return this.handOf(id).map((c) => lineCard(BY_ID.get(c)!, id));
  }

  /** Le classement : le gagnant, puis les ex æquo du départage, puis au nombre de cartes qui restent. */
  standings(): { id: string; place: number }[] {
    const rank = (id: string) => {
      if (id === this.winner) return 0;
      const inTie = this.tiebreak?.includes(id) ? 1 : 2;
      return inTie * 1000 + this.handOf(id).length;
    };
    const sorted = [...this.order].sort((a, b) => rank(a) - rank(b));
    const out: { id: string; place: number }[] = [];
    sorted.forEach((id, i) => {
      const prev = out[i - 1];
      const place = prev && rank(sorted[i - 1]) === rank(id) ? prev.place : i + 1;
      out.push({ id, place });
    });
    return out;
  }
}
