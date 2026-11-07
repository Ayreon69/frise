// Une table de Frise : salon, partie au tour par tour, bots, pilote automatique, chrono du tour, révélation et vue de chacun.
// Tout est public (la frise, les coups, le nombre de cartes de chacun) sauf la main : chacun ne reçoit que la sienne, sans les dates.
import crypto from 'node:crypto';
import {
  AVATARS,
  FAMILIES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_MS,
  isFamily,
  isHandSize,
  isTurnTime,
  type CardFamily,
  type FinalView,
  type GameView,
  type Move,
  type PlayerStatus,
  type RoomView,
  type Settings,
} from '../shared/protocol';
import { AUTOPILOT, Brain, randomSkill } from './bots';
import { BY_ID, Game, enoughCards, poolSize, shuffle } from './game';

const BOT_NAMES = ['Ada', 'Hypatie', 'Galilée', 'Curie', 'Gutenberg', 'Cléopâtre', 'Darwin', 'Nefertiti', 'Pasteur', 'Lovelace', 'Copernic', 'Hokusai', 'Voltaire', 'Champollion'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (FR_FAST=1) : révélations éclair, bots pressés, 1,5 s par tour. */
const FAST = process.env.FR_FAST === '1';
const T = {
  reveal: FAST ? 90 : REVEAL_MS,
  /** Un premier coup qui laisse le temps de découvrir la table. */
  opening: FAST ? 60 : 1_400,
  turn: (s: number) => (FAST ? (s ? 1_500 : 0) : s * 1000),
  think: (range: readonly [number, number]) => (FAST ? [8, 40] : range),
} as const;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function between([a, b]: readonly [number, number] | readonly number[]): number {
  return a + crypto.randomInt(Math.max(1, b - a + 1));
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { families: [...FAMILIES], turn: 60, hand: 0 };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  wins = new Map<string, number>();
  brains = new Map<string, Brain>();
  stage: 'turn' | 'reveal' = 'turn';
  /** Fin du tour en cours ; 0 : sans limite. */
  turnEndsAt = 0;
  /** Fin de la révélation du dernier coup. */
  revealUntil = 0;
  /** Quand le bot ou le pilote automatique jouera. */
  autoAt = 0;
  move: Move | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Ceux qu'on a déjà annoncés en pilote automatique. */
  private autoSeen = new Set<string>();
  private dirty = false;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined | null): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, this.phase === 'lobby' ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !used.has(n));
    const name = names.length ? names[crypto.randomInt(names.length)] : `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste à la table : le pilote automatique la tient.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else {
      p.left = true;
      if (this.phase === 'playing') this.autoSeen.add(id);
    }
    if (this.hostId === id) this.transferHost();
    this.planAuto();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    this.autoSeen.delete(p.id);
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
    // Revenu à temps : le pilote automatique ne jouera pas à sa place.
    if (this.phase === 'playing' && this.game?.turn === p.id && this.stage === 'turn') this.autoAt = 0;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if (isTurnTime(payload.turn)) this.settings.turn = payload.turn;
    if (isHandSize(payload.hand)) this.settings.hand = payload.hand;
    if (Array.isArray(payload.families)) {
      const fam = FAMILIES.filter((f) => (payload.families as unknown[]).some((x) => isFamily(x) && x === f));
      if (!fam.length) return 'Garde au moins un thème.';
      this.settings.families = fam;
    }
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    if (!enoughCards(seated.length, this.settings.hand, this.settings.families)) return 'Pas assez de cartes pour cette table : ajoute un thème, ou baisse le nombre de cartes en main.';
    for (const p of seated) p.status = 'playing';
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, this.settings.families, this.settings.hand);
    this.brains.clear();
    this.autoSeen.clear();
    for (const p of this.players) if (p.isBot && p.status === 'playing') this.brains.set(p.id, new Brain(randomSkill()));
    this.phase = 'playing';
    this.final = null;
    this.move = null;
    this.beginTurn(T.opening);
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.move = null;
    this.brains.clear();
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  /** Un nouveau tour commence : le chrono part, et un bot ou un absent jouera tout seul. */
  private beginTurn(extra = 0): void {
    const g = this.game!;
    // Un joueur sans carte (départage sans pioche) passe son tour.
    let guard = 0;
    while (!g.winner && !g.handOf(g.turn).length && guard++ < 20) {
      const r = g.advance();
      if (r.winner) return this.finishGame();
    }
    this.stage = 'turn';
    const now = Date.now();
    const ms = T.turn(this.settings.turn);
    this.turnEndsAt = ms ? now + extra + ms : 0;
    this.autoAt = 0;
    this.planAuto(extra);
  }

  /** Le joueur dont c'est le tour est un bot ou un absent : il jouera après un temps de réflexion. */
  private planAuto(extra = 0): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g || this.stage !== 'turn' || this.autoAt) return;
    const p = this.get(g.turn);
    if (!p || !this.isAuto(p)) return;
    const brain = this.brains.get(p.id);
    this.autoAt = Date.now() + extra + between(T.think(brain ? brain.skill.think : AUTOPILOT.think));
  }

  play(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return "Aucune partie n'est en cours.";
    if (!g.has(by)) return 'Tu regardes la partie : tu joueras à la prochaine.';
    if (this.stage !== 'turn') return 'Un instant : la date se dévoile.';
    return this.apply(by, Number(payload.card), Number(payload.slot), false);
  }

  private apply(by: string, card: number, slot: number, auto: boolean): string | undefined {
    const g = this.game!;
    const res = g.play(by, card, slot, auto);
    if (typeof res === 'string') return res;
    this.move = res.move;
    this.stage = 'reveal';
    this.revealUntil = Date.now() + T.reveal;
    this.turnEndsAt = 0;
    this.autoAt = 0;
    const p = this.get(by);
    if (p?.isBot && !FAST && Math.random() < 0.22) {
      const emoji = res.move.ok ? pickOne(['😎', '🧠', 'Facile !', '👍']) : pickOne(['🙈', 'Ouh là…', '😱', '🤔']);
      setTimeout(() => this.onEmote(by, emoji), 900 + crypto.randomInt(800));
    }
    return undefined;
  }

  /** Le coup automatique : un bot réfléchit, un absent ou un retardataire pose comme il peut. */
  private autoPlay(): void {
    const g = this.game!;
    const id = g.turn;
    const hand = g.handOf(id);
    if (!hand.length) return;
    let brain = this.brains.get(id);
    const isBot = !!brain;
    if (!brain) {
      brain = new Brain(AUTOPILOT);
      this.brains.set(`auto:${id}`, brain);
    }
    const choice = brain.choose(hand, g.line);
    this.apply(id, choice.card, choice.slot, !isBot);
  }

  private finishGame(): void {
    const g = this.game;
    if (!g) return;
    const rows = g.standings();
    for (const r of rows) if (r.place === 1) this.wins.set(r.id, (this.wins.get(r.id) ?? 0) + 1);
    this.final = {
      line: g.line.map((c) => ({ ...c })),
      tied: g.tiebreak ? [...g.tiebreak] : [],
      rounds: g.rounds,
      players: rows.map((r) => {
        const p = this.get(r.id);
        return {
          id: r.id,
          name: p?.name ?? '?',
          avatar: p?.avatar ?? AVATARS[0],
          seat: g.order.indexOf(r.id) + 1,
          place: r.place,
          good: g.good.get(r.id) ?? 0,
          bad: g.bad.get(r.id) ?? 0,
          left: g.leftOf(r.id),
          wins: this.wins.get(r.id) ?? 0,
          winner: r.id === g.winner,
          gone: !!p?.left,
        };
      }),
    };
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries et diffusion ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis envoie l'état à toute la table. */
  commit(changed = true): void {
    if (changed) this.dirty = true;
    this.planAuto();
    this.reschedule();
    if (this.dirty) {
      this.dirty = false;
      this.onChange();
    }
  }

  private dueAt(): number {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return Infinity;
    let due = Infinity;
    if (this.stage === 'reveal') due = this.revealUntil;
    else {
      if (this.turnEndsAt) due = Math.min(due, this.turnEndsAt);
      if (this.autoAt) due = Math.min(due, this.autoAt);
    }
    // Un absent qui bascule en pilote automatique : tout le monde le voit, et il ne doit plus faire attendre la table.
    const now = Date.now();
    for (const id of g.order) {
      const p = this.get(id);
      if (p && !p.isBot && !p.left && !p.connected && p.disconnectedAt + GRACE_MS > now) due = Math.min(due, p.disconnectedAt + GRACE_MS);
    }
    return due;
  }

  private reschedule(): void {
    this.clearTimer();
    const due = this.dueAt();
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      // Une minuterie peut sonner une milliseconde trop tôt : on se rendort sans rien diffuser.
      if (Date.now() < due) return this.reschedule();
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit(false);
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  /** Fait avancer la table. */
  tick(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();

    for (const id of g.order) {
      const p = this.get(id);
      if (!p || p.isBot) continue;
      const auto = this.isAuto(p);
      if (auto !== this.autoSeen.has(id)) {
        if (auto) this.autoSeen.add(id);
        else this.autoSeen.delete(id);
        this.dirty = true;
      }
    }

    if (this.stage === 'reveal') {
      if (now < this.revealUntil) return;
      this.dirty = true;
      if (g.winner) return this.finishGame();
      this.beginTurn();
      return;
    }
    if ((this.autoAt && now >= this.autoAt) || (this.turnEndsAt && now >= this.turnEndsAt)) {
      this.dirty = true;
      this.autoPlay();
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private gameView(g: Game, viewerId: string): GameView {
    const seated = g.has(viewerId);
    return {
      order: [...g.order],
      line: g.line.map((c) => ({ ...c })),
      turn: g.turn,
      stage: this.stage,
      endsAt: this.turnEndsAt,
      lastRound: g.lastRound,
      tiebreak: g.tiebreak ? [...g.tiebreak] : null,
      move: this.move ? { ...this.move, card: { ...this.move.card } } : null,
      hand: seated
        ? g.handOf(viewerId).map((id) => {
            const c = BY_ID.get(id)!;
            return { id: c.id, title: c.title, emoji: c.emoji, family: c.family };
          })
        : null,
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings, families: [...this.settings.families] },
      players: this.players.map((p) => {
        const seat = g ? g.order.indexOf(p.id) : -1;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isBot: p.isBot,
          isHost: p.id === this.hostId,
          connected: p.isBot || p.connected,
          autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
          status: p.status,
          wins: this.wins.get(p.id) ?? 0,
          seat: seat >= 0 ? seat + 1 : null,
          cards: g && seat >= 0 ? g.handOf(p.id).length : null,
          out: !!g && seat >= 0 && !g.alive.includes(p.id),
        };
      }),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
      pool: poolSize(this.settings.families as CardFamily[]),
    };
  }
}

function pickOne<T>(arr: T[]): T {
  return arr[crypto.randomInt(arr.length)];
}
