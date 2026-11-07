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
            "loisirs": "loisirs", "sport": "loisirs"}

cands = json.load(open("data/candidates.json", encoding="utf-8"))
rapport = {r["card"]: r for r in json.load(open("data/rapport.json", encoding="utf-8"))}
out = []
for title, year, cat, emoji, wiki in cands:
    if title in ECARTEES:
        continue
    r = rapport[title]
    src = SOURCES.get(title) or ("fr:" + r["article"])
    out.append({"title": TITRES.get(title, title), "year": year, "cat": cat,
                "emoji": EMOJIS.get(title, emoji), "src": src})

out.sort(key=lambda c: (c["year"], c["title"]))
for i, c in enumerate(out):
    c["id"] = i + 1

lines = ["// Généré par data/construire.py à partir de data/candidates.json — ne pas modifier à la main.",
         "// Chaque date a été vérifiée sur Wikidata et/ou une phrase datée de l'article cité dans `src`.",
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
