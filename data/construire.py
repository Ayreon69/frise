"""Construit server/cards.ts à partir des candidates vérifiées.

Les cartes écartées (date douteuse) sont listées dans ECARTEES, avec la raison.
Les sources retenues après la seconde passe sont dans SOURCES (carte -> article).
"""
import json, re

ECARTEES = {
    "Monet peint Impression, soleil levant": "date d'exécution hypothétique (hiver 1872-1873)",
    "Inauguration de la pyramide du Louvre": "inaugurée deux fois, en 1988 et en 1989",
    "Premier timbre français, le Cérès": "« premier timbre » non confirmé par la source",
}
# Seconde passe : article où la phrase datée a été trouvée.
SOURCES = {
    "Premier vol humain en montgolfière": "fr:Jean-François Pilâtre de Rozier",
    "Blériot traverse la Manche en avion": "fr:Louis Blériot",
    "Première projection payante du cinématographe Lumière": "fr:Salon indien du Grand Café",
    "Brevet de la machine à vapeur de James Watt": "fr:James Watt",
    "Brevet de l'automobile de Carl Benz": "fr:Benz Patent Motorwagen",
    "Pasteur vaccine Joseph Meister contre la rage": "fr:Vaccin antirabique",
    "Watson et Crick décrivent la double hélice de l'ADN": "fr:Francis Crick",
    "Envoi du premier SMS": "en:SMS",
    "Roland Moreno dépose le brevet de la carte à puce": "fr:Roland Moreno",
    "Baird fait la démonstration de la télévision": "en:John Logie Baird",
    "Marconi envoie un message radio à travers l'Atlantique": "en:Guglielmo Marconi",
    "Premier message télégraphique de Morse": "en:Samuel Morse",
    "Première ligne du télégraphe Chappe": "fr:Télégraphe Chappe",
    "Laennec invente le stéthoscope": "fr:René Laennec",
    "Jenner teste le premier vaccin contre la variole": "en:Edward Jenner",
    "Brevet de la brique Lego moderne": "en:Lego",
    "Mattel lance la poupée Barbie": "fr:Barbie (poupée)",
    "Sortie de Pokémon Rouge et Vert": "fr:Pokémon Rouge et Bleu",
    "Brevet du jean à rivets de Levi Strauss": "en:Levi Strauss",
    "Première ascension de l'Everest": "fr:Edmund Hillary",
    "Première ascension du mont Blanc": "fr:Jacques Balmat",
    "Amundsen atteint le pôle Sud": "fr:Roald Amundsen",
    "Christophe Colomb atteint l'Amérique": "fr:Christophe Colomb",
    "L'expédition de Magellan achève le premier tour du monde": "fr:Juan Sebastián Elcano",
    "Les Françaises obtiennent le droit de vote": "fr:Droit de vote des femmes",
    "Champollion déchiffre les hiéroglyphes": "en:Jean-François Champollion",
    "Sortie de Blanche-Neige et les Sept Nains de Disney": "en:Snow White and the Seven Dwarfs (1937 film)",
    "Sortie du film Les Visiteurs": "fr:Les Visiteurs (film, 1993)",
    "Sortie du film Intouchables": "fr:Intouchables (film)",
    "Van Gogh peint La Nuit étoilée": "en:The Starry Night",
    "Première du Cid de Corneille": "fr:Le Cid (Corneille)",
    "Premiers congés payés en France": "fr:Congés payés",
    "Loi sur le mariage pour tous en France": "fr:Mariage entre personnes de même sexe en France",
    "Lancement du premier module de la Station spatiale internationale": "en:Zarya (ISS module)",
    "Premier vol de Thomas Pesquet dans l'espace": "fr:Thomas Pesquet",
    "Philae se pose sur une comète": "fr:Philae (atterrisseur)",
    "AlphaGo bat Lee Sedol au go": "fr:AlphaGo",
    "Premier saut en parachute de Garnerin": "fr:André-Jacques Garnerin",
    "Signature du traité de Rome": "fr:Traité instituant la Communauté économique européenne",
    "Première greffe du cœur": "fr:Christiaan Barnard",
    "Libération de Nelson Mandela": "fr:Nelson Mandela",
    "Mort de Louis XIV": "fr:Louis XIV",
}
TITRES = {  # reformulations plus exactes
    "Franklin attire la foudre avec un cerf-volant": "Franklin raconte son expérience du cerf-volant sous l'orage",
    "Dunlop invente le pneu à chambre à air": "Dunlop dépose le brevet du pneu gonflable",
    "La peste noire arrive à Marseille": "La peste noire atteint Marseille",
    "Le disque compact arrive en magasin": "Les premiers disques compacts sont mis en vente",
    "Alexeï Pajitnov crée Tetris": "Alexeï Pajitnov crée la première version de Tetris",
}
EMOJIS = {
    "Champollion déchiffre les hiéroglyphes": "🗝️",
    "Louis Braille publie son alphabet": "👆",
    "Publication du livre blanc du Bitcoin": "🔗",
    "Naufrage du Titanic": "🛟",
    "Première de La Flûte enchantée de Mozart": "🎼",
    # Les drapeaux ne s'affichent pas sous Windows (deux lettres à la place) : on les remplace.
    "Création de l'ONU": "🕊️",
    "Indépendance de l'Inde": "🪔",
    "Adoption de la Constitution de la Ve République": "📜",
    "Astérix, premier satellite français": "🛰️",
    "Barack Obama élu président des États-Unis": "🗳️",
    "Le Royaume-Uni quitte l'Union européenne": "🚪",
}

FAMILLES = {"invention": "inventions", "science": "sciences", "espace": "sciences",
            "histoire": "histoire", "monument": "histoire", "culture": "culture",
            "loisirs": "loisirs", "sport": "loisirs",
            "film": "cinema", "jeuvideo": "jeuxvideo", "console": "jeuxvideo", "lol": "jeuxvideo",
            "anime": "animes", "manga": "animes"}

# 15/11/2026 : les films, jeux vidéo et mangas du premier paquet rejoignent les nouvelles familles.
RECLASSER = {
    "Première projection payante du cinématographe Lumière": "film",
    "Méliès tourne Le Voyage dans la Lune": "film",
    "Le Chanteur de jazz, premier film parlant": "film",
    "Mickey apparaît dans Steamboat Willie": "film",
    "Première cérémonie des Oscars": "film",
    "Sortie de Blanche-Neige et les Sept Nains de Disney": "film",
    "Premier Festival de Cannes": "film",
    "Sortie du premier film Star Wars": "film",
    "Sortie de Jurassic Park": "film",
    "Sortie du film Les Visiteurs": "film",
    "Sortie du Roi lion de Disney": "film",
    "Sortie de Toy Story": "film",
    "Sortie du film Titanic de James Cameron": "film",
    "Sortie de Bienvenue chez les Ch'tis": "film",
    "Sortie du film Intouchables": "film",
    "Sortie de Pac-Man": "jeuvideo",
    "Alexeï Pajitnov crée Tetris": "jeuvideo",
    "Sortie de Super Mario Bros.": "jeuvideo",
    "Sortie de la Game Boy": "console",
    "Sortie de la PlayStation au Japon": "console",
    "Sortie de Pokémon Rouge et Vert": "jeuvideo",
    "Première version publique de Minecraft": "jeuvideo",
    "Sortie de Fortnite": "jeuvideo",
    "Début du manga Dragon Ball": "manga",
    "Début du manga One Piece": "manga",
    "Début du manga Naruto": "manga",
}

cands = json.load(open("data/candidates.json", encoding="utf-8"))
rapport = {r["card"]: r for r in json.load(open("data/rapport.json", encoding="utf-8"))}
out = []
for title, year, cat, emoji, wiki in cands:
    if title in ECARTEES:
        continue
    r = rapport[title]
    src = SOURCES.get(title) or ("fr:" + r["article"])
    out.append({"title": TITRES.get(title, title), "year": year, "cat": RECLASSER.get(title, cat),
                "emoji": EMOJIS.get(title, emoji), "src": src})
assert all(t in {c[0] for c in cands} for t in RECLASSER), "RECLASSER : titre inconnu"

# Cinéma, jeux vidéo et consoles, champions de League of Legends, mangas et animes (15/11/2026) :
# vérifiés par data/verifier-ecrans.py (rapport-ecrans.json), puis à la main pour les cas à revoir.
# Écartées avant d'entrer dans candidates-ecrans.json :
#   Baldur's Gate 3 : accès anticipé en 2020, version complète en 2023 ; « sortie » prêtait à discussion.
#   Anime Solo Leveling : diffusé en janvier 2024, mais premier épisode projeté en salles en décembre 2023.
#   Autant en emporte le vent, Casablanca, Le Corniaud, Halo, Saint Seiya… : écartés pour ne pas
#   doubler une autre carte du même thème la même année (ou une date de sortie discutée, pour Casablanca).
ECARTEES_ECRANS = {}
SOURCES_ECRANS = {}
# Cartes que le script n'a pas pu marquer « OK » seul, vérifiées à la main (rapport-ecrans.json) :
VERIFIEES_A_LA_MAIN = {
    "Sortie du premier film Avengers": "article : « sorti en 2012 » ; Wikidata donne 2012 pour toutes les sorties en salles (un 2011 isolé)",
    "Sortie de Candy Crush Saga": "Wikidata : sortie le 12/04/2012",
    "Premier épisode de l'anime Code Geass au Japon": "article : « broadcast in Japan on MBS from October 2006 »",
    "Premier épisode de l'anime One Punch Man au Japon": "article : « aired in Japan on TV Tokyo […] from October 5 to December 21, 2015 »",
    "Premier épisode de l'anime Spy × Family au Japon": "Wikidata : début de diffusion le 09/04/2022",
    # Avant 1900 (rapport-avant1900.json, puis phrases.py sur a-revoir-avant1900*.json) :
    "Fondation de Rome, selon la légende": "Wikidata : 753 av. J.-C., date de la tradition, dite sur la carte",
    "Mort de Socrate": "Wikidata : mort en 399 av. J.-C.",
    "Auguste devient le premier empereur romain": "article : « Titré Augustus par le Sénat romain en 27 av. J.-C. »",
    "Attila battu aux champs Catalauniques": "article : « La bataille des champs Catalauniques oppose en 451 […] »",
    "Bataille de Poitiers, Charles Martel arrête les Omeyyades": "Wikidata : 732",
    "Hugues Capet devient roi de France": "article : « élu et sacré roi des Francs en 987 »",
    "Le pape Urbain II appelle à la première croisade": "article : « Le concile de Clermont de 1095 et l'appel à la croisade »",
    "Marco Polo part pour la Chine": "article : « Marco Polo part en 1271 avec ses père et oncle »",
    "La peste noire arrive à Marseille": "article : « Depuis Marseille, en novembre 1347 »",
    "Michel-Ange achève le plafond de la chapelle Sixtine": "article : « inaugurée par le pape Jules II le 31 octobre 1512 »",
    "Franklin attire la foudre avec un cerf-volant": "article : lettre publiée dans la Pennsylvania Gazette le 19 octobre 1752",
    "James Cook atteint l'Australie": "article : « On 19 April 1770, Point Hicks was sighted »",
    "Drais invente la draisienne, ancêtre du vélo": "Wikidata : invention en 1817",
    "Victoria devient reine du Royaume-Uni": "article : « reine du Royaume-Uni […] du 20 juin 1837 »",
    "Napoléon III devient empereur des Français": "article : « Le 2 décembre 1852, Louis-Napoléon Bonaparte devient l'Empereur Napoléon III »",
    "Big Ben sonne pour la première fois": "article : « This new bell first chimed on 11 July 1859 »",
    "Edison présente son ampoule électrique": "Wikidata : invention de la lampe à incandescence en 1879",
    "Dunlop invente le pneu à chambre à air": "article : « dépose le brevet du pneu à air avec valve le 7 décembre 1888 »",
    "Destruction de Carthage par Rome": "article : « In early 146 BC the Romans […] destroyed the city »",
    "Luther publie ses 95 thèses": "article : « written in 1517 by Martin Luther »",
    "Cortés s'empare de Tenochtitlan, capitale aztèque": "article : « Le siège de Tenochtitlán par Hernán Cortés en 1521 (30 mai-13 août) »",
    "Premier match international de football, Écosse–Angleterre": "article : « The 1872 association football match […] the first international »",
}
# Écartée avant 1900 : Inauguration du Colisée (80 selon l'article, 81 ou 82 selon Wikidata).
# 16/11/2026 : cartes d'avant 1900 (le paquet penchait vers le XXe siècle), même vérification.
for nom in ("ecrans", "avant1900"):
    lot = json.load(open(f"data/candidates-{nom}.json", encoding="utf-8"))
    rapport_e = {r["card"]: r for r in json.load(open(f"data/rapport-{nom}.json", encoding="utf-8"))}
    for title, year, cat, emoji, ref in lot:
        if title in ECARTEES_ECRANS:
            continue
        r = rapport_e[title]
        assert r["status"] == "OK" or title in VERIFIEES_A_LA_MAIN, title
        out.append({"title": TITRES.get(title, title), "year": year, "cat": cat, "emoji": emoji, "src": SOURCES_ECRANS.get(title, ref)})

out.sort(key=lambda c: (c["year"], c["title"]))
for i, c in enumerate(out):
    c["id"] = i + 1

lines = ["// Généré par data/construire.py à partir de data/candidates.json — ne pas modifier à la main.",
         "// Chaque date a été vérifiée sur Wikidata et/ou une phrase datée de l'article cité dans `src` (lol: : wiki League of Legends).",
         "import type { CardFamily } from '../shared/protocol';", "",
         "export interface CardData { id: number; title: string; year: number; cat: string; family: CardFamily; emoji: string; src: string }", "",
         "export const CARDS: CardData[] = ["]
for c in out:
    lines.append("  " + json.dumps({"id": c["id"], "title": c["title"], "year": c["year"], "cat": c["cat"],
                                     "family": FAMILLES[c["cat"]], "emoji": c["emoji"], "src": c["src"]}, ensure_ascii=False) + ",")
lines.append("];")
open("server/cards.ts", "w", encoding="utf-8").write("\n".join(lines) + "\n")
from collections import Counter
print(len(out), Counter(FAMILLES[c["cat"]] for c in out))
print(Counter(c["year"] for c in out).most_common(6))
