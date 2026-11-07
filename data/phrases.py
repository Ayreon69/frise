"""Cherche, dans le texte complet d'un article, les phrases qui citent l'année avec un mot clé.

Usage : python data/phrases.py data/a-revoir.json
Entrée : liste de [carte, année, langue, article, motif]. Sortie : les phrases trouvées.
"""
import json, re, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "FriseCardCheck/1.0 (jeu entre amis; verification de dates)"}


def get(url):
    for i in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa
            time.sleep(3 * (i + 1))
    raise RuntimeError(url)


for card, year, lang, art, motif in json.load(open(sys.argv[1], encoding="utf-8")):
    q = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "prop": "extracts",
                                "explaintext": 1, "titles": art})
    d = get(f"https://{lang}.wikipedia.org/w/api.php?" + q)
    p = list(d["query"]["pages"].values())[0]
    txt = p.get("extract", "")
    sents = re.split(r"(?<=[.!?])\s+", txt)
    a = str(abs(year))
    hits = [s for s in sents if re.search(r"\b%s\b" % a, s) and re.search(motif, s, re.I)]
    print(f"== {card} [{year}] {lang}:{p.get('title')} ({'absent' if 'missing' in p else len(txt)} car.)")
    for s in hits[:3]:
        print("   ·", s.strip().replace("\n", " ")[:260])
    if not hits:
        print("   (aucune phrase)")
    time.sleep(1.2)
