// Les mots de la table : noms, familles, époques, places.
import type { CardFamily, RoomView, TurnTime } from '../../../shared/protocol';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « de Curie », mais « d'Ada » : l'élision devant une voyelle ou un h. */
export function deName(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** « Léa, Zino et Sam ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** « 1re », « 2e ». */
export function placeLabel(n: number): string {
  return n === 1 ? '1re' : `${n}e`;
}

export const FAMILY_NAME: Record<CardFamily, string> = {
  inventions: 'Inventions',
  sciences: 'Sciences et espace',
  histoire: 'Histoire',
  culture: 'Arts et culture',
  loisirs: 'Sport et loisirs',
  cinema: 'Cinéma',
  jeuxvideo: 'Jeux vidéo et consoles',
  animes: 'Mangas et animes',
};

export const FAMILY_SHORT: Record<CardFamily, string> = {
  inventions: 'Invention',
  sciences: 'Science',
  histoire: 'Histoire',
  culture: 'Culture',
  loisirs: 'Loisirs',
  cinema: 'Cinéma',
  jeuxvideo: 'Jeu vidéo',
  animes: 'Manga, anime',
};

/** L'époque d'une date : elle donne sa couleur au ruban de la frise. */
export type Era = 'antiquite' | 'moyen-age' | 'moderne' | 'xix' | 'xx' | 'xxi';
export function eraOf(year: number): Era {
  if (year < 476) return 'antiquite';
  if (year < 1492) return 'moyen-age';
  if (year < 1789) return 'moderne';
  if (year < 1914) return 'xix';
  if (year < 2000) return 'xx';
  return 'xxi';
}

export const ERA_NAME: Record<Era, string> = {
  antiquite: 'Antiquité',
  'moyen-age': 'Moyen Âge',
  moderne: 'Temps modernes',
  xix: 'XIXe siècle',
  xx: 'XXe siècle',
  xxi: 'XXIe siècle',
};

/** La date en deux morceaux pour la grande typographie : « 44 » et « av. J.-C. ». */
export function yearParts(year: number): { n: string; suffix: string } {
  return year < 0 ? { n: String(-year), suffix: 'av. J.-C.' } : { n: String(year), suffix: '' };
}

export function turnLabel(t: TurnTime): string {
  return t ? `${t} s` : 'Sans limite';
}
