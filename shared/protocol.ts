// Contrat partagé entre le serveur et le client de Frise : constantes, réglages et vues.
// Chacun ne reçoit que sa propre vue : ses cartes sans leur date, le nombre de cartes des autres,
// et la frise commune, dont toutes les dates sont dévoilées. Jamais la pioche ni la date d'une carte en main.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Les huit familles de cartes : l'hôte peut en retirer. */
export const FAMILIES = ['inventions', 'sciences', 'histoire', 'culture', 'loisirs', 'cinema', 'jeuxvideo', 'animes'] as const;
export type CardFamily = (typeof FAMILIES)[number];

/** Secondes par tour ; 0 : sans limite. */
export const TURN_TIMES = [30, 60, 90, 0] as const;
export type TurnTime = (typeof TURN_TIMES)[number];
/** Cartes en main au départ ; 0 : selon la règle (6 à 2 ou 3, 5 à 4 ou 5, 4 à partir de 6). */
export const HAND_SIZES = [0, 3, 4, 5, 6] as const;
export type HandSize = (typeof HAND_SIZES)[number];

/** Le temps de la révélation : la carte posée montre sa date, puis on passe au suivant. */
export const REVEAL_MS = 2_600;

export const AVATARS = ['plume', 'loupe', 'sablier', 'boussole', 'globe', 'ampoule', 'fusee', 'appareil', 'couronne', 'palette', 'telescope', 'parchemin'] as const;
export const EMOTES = ['👍', '😂', '😮', '🤔', '😱', '🧠', '👏', '🙈'] as const;
export const TAUNTS = ['Facile !', 'Aucune idée…', 'Bien vu !', 'Ouh là…', 'Je le savais'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface Settings {
  families: CardFamily[];
  turn: TurnTime;
  hand: HandSize;
}

export function isTurnTime(v: unknown): v is TurnTime {
  return typeof v === 'number' && (TURN_TIMES as readonly number[]).includes(v);
}

export function isHandSize(v: unknown): v is HandSize {
  return typeof v === 'number' && (HAND_SIZES as readonly number[]).includes(v);
}

export function isFamily(v: unknown): v is CardFamily {
  return typeof v === 'string' && (FAMILIES as readonly string[]).includes(v);
}

/** Cartes en main au départ, selon la règle : 6 à 2 ou 3 joueurs, 5 à 4 ou 5, 4 de 6 à 8. */
export function startingHand(players: number, setting: HandSize): number {
  if (setting) return setting;
  return players <= 3 ? 6 : players <= 5 ? 5 : 4;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  wins: number;
  /** Place autour de la table, de 1 à 8 ; null hors partie. */
  seat: number | null;
  /** Cartes en main (tout le monde les voit, posées devant soi, face cachée) ; null hors partie. */
  cards: number | null;
  /** Écarté par un départage : il ne joue plus cette partie. */
  out: boolean;
}

/** Une carte telle qu'on la voit dans sa main : sans sa date. */
export interface HandCard {
  id: number;
  title: string;
  emoji: string;
  family: CardFamily;
}

/** Une carte de la frise : date dévoilée. */
export interface LineCard extends HandCard {
  year: number;
  /** Qui l'a posée ; null pour la carte de départ. */
  by: string | null;
}

/** Le dernier coup : qui a posé quoi, où, et si la date tombait juste. */
export interface Move {
  n: number;
  by: string;
  card: LineCard;
  /** La place visée : entre la carte slot - 1 et la carte slot de la frise d'avant le coup. */
  slot: number;
  ok: boolean;
  /** Une carte mal placée : on en a pioché une autre. */
  drew: boolean;
  /** Posé par le pilote automatique ou à la fin du temps. */
  auto: boolean;
}

export type Stage = 'turn' | 'reveal';

export interface GameView {
  order: string[];
  line: LineCard[];
  turn: string;
  stage: Stage;
  /** Fin du tour en cours (heure du serveur) ; 0 : sans limite. */
  endsAt: number;
  /** Quelqu'un n'a plus de carte : on finit le tour de table. */
  lastRound: boolean;
  /** Un départage est en cours entre ces joueurs (les autres sont écartés). */
  tiebreak: string[] | null;
  move: Move | null;
  /** Mes cartes, sans leur date ; null pour un spectateur. */
  hand: HandCard[] | null;
}

export interface FinalPlayer {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  place: number;
  /** Cartes bien placées pendant la partie. */
  good: number;
  /** Cartes mal placées. */
  bad: number;
  /** Les cartes qui lui restaient, dates dévoilées. */
  left: LineCard[];
  wins: number;
  winner: boolean;
  gone: boolean;
}

export interface FinalView {
  players: FinalPlayer[];
  line: LineCard[];
  /** Les joueurs du départage, s'il y en a eu un (le gagnant l'a emporté entre eux). */
  tied: string[];
  rounds: number;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
  /** Combien de cartes contiennent les familles choisies (pour le salon). */
  pool: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/** Une date lisible : « 1789 », « 44 av. J.-C. ». */
export function yearLabel(year: number): string {
  return year < 0 ? `${-year} av. J.-C.` : String(year);
}

/** La place est-elle juste ? Une date égale à sa voisine convient des deux côtés. */
export function fits(line: { year: number }[], slot: number, year: number): boolean {
  const left = slot > 0 ? line[slot - 1].year : -Infinity;
  const right = slot < line.length ? line[slot].year : Infinity;
  return left <= year && year <= right;
}
