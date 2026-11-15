"""Vérifie les cartes des familles Cinéma, Jeux vidéo et Mangas et animes.

Usage : python data/verifier-ecrans.py data/candidates-ecrans.json data/rapport-ecrans.json
Entrée : liste de [carte, année, cat, emoji, "fr:Article" | "en:Article" | "lol:Champion"].

- Articles Wikipédia : l'élément Wikidata (sa description, pour s'assurer qu'on vise la bonne
  œuvre : l'anime et non le manga, le film et non le roman), toutes ses dates de sortie (P577,
  avec le pays quand il est précisé), de début de diffusion (P580), de création (P571) ou de
  première (P1191), et la phrase de l'article qui cite l'année.
  « OK » : la plus ancienne date de sortie ou de diffusion tombe sur l'année de la carte, et
  l'article la cite ; « WD » ou « TEXTE » : l'une des deux seulement ; « A-VOIR » sinon.
- Champions de League of Legends : la date de sortie du module de données des champions du
  wiki League of Legends (leagueoflegends.fandom.com, Module:ChampionData/data), qui reprend
  les notes de mise à jour de Riot.
"""
import json, re, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "FriseCardCheck/1.0 (jeu entre amis; verification de dates)"}
PROPS = {"P577": "sortie", "P580": "début", "P571": "création", "P1191": "première"}
PAYS = {"Q17": "Japon", "Q30": "États-Unis", "Q142": "France", "Q46": "Europe", "Q49": "Amérique du Nord",
        "Q145": "Royaume-Uni", "Q183": "Allemagne", "Q408": "Australie", "Q13780930": "monde", "Q15": "Afrique"}


def get(url, as_json=True):
    for i in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                data = r.read().decode("utf-8")
                return json.loads(data) if as_json else data
        except Exception as e:  # noqa
            print("  nouvel essai", i, e, file=sys.stderr); time.sleep(3 * (i + 1))
    raise RuntimeError(url)


def article(lang, title):
    q = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": 1, "prop": "pageprops|extracts",
                                "ppprop": "wikibase_item", "explaintext": 1, "exintro": 0, "titles": title})
    d = get(f"https://{lang}.wikipedia.org/w/api.php?" + q)
    p = list(d["query"]["pages"].values())[0]
    if "missing" in p:
        return None
    return {"title": p["title"], "qid": p.get("pageprops", {}).get("wikibase_item"), "text": p.get("extract", "")}


def dates(qid):
    d = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "wbgetentities", "format": "json", "props": "claims|descriptions", "ids": qid, "languages": "fr|en"}))
    e = d["entities"][qid]
    desc = (e.get("descriptions", {}).get("fr") or e.get("descriptions", {}).get("en") or {}).get("value", "")
    out = []
    for prop, label in PROPS.items():
        for c in e.get("claims", {}).get(prop, []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if not isinstance(v, dict) or "time" not in v:
                continue
            m = re.match(r"([+-])0*(\d+)-(\d\d)-(\d\d)", v["time"])
            if not m:
                continue
            where = [PAYS.get(q["datavalue"]["value"]["id"], q["datavalue"]["value"]["id"])
                     for q in c.get("qualifiers", {}).get("P291", []) if "datavalue" in q]
            out.append({"prop": label, "year": int(m.group(2)), "date": f"{m.group(2)}-{m.group(3)}-{m.group(4)}",
                        "precision": v.get("precision"), "where": where})
    return desc, out


def lol_dates():
    txt = get("https://leagueoflegends.fandom.com/api.php?" + urllib.parse.urlencode(
        {"action": "query", "format": "json", "prop": "revisions", "rvprop": "content", "rvslots": "main",
         "titles": "Module:ChampionData/data"}))
    page = list(txt["query"]["pages"].values())[0]
    src = page["revisions"][0]["slots"]["main"]["*"]
    out = {}
    for m in re.finditer(r'\n  \["([^"]+)"\] = \{', src):
        dm = re.search(r'\["date"\]\s*=\s*"(\d{4}-\d\d-\d\d)"', src[m.end():m.end() + 4000])
        if dm:
            out[m.group(1)] = dm.group(1)
    return out


def main(src, dst):
    cards = json.load(open(src, encoding="utf-8"))
    lol = None
    report = []
    # Une carte déjà « OK » avec la même source n'est pas revérifiée (l'API limite le débit).
    try:
        old = {(r["card"], r["src"]): r for r in json.load(open(dst, encoding="utf-8")) if r["status"] == "OK"}
    except FileNotFoundError:
        old = {}
    for title, year, cat, emoji, ref in cards:
        if (title, ref) in old and old[(title, ref)]["year"] == year:
            report.append(old[(title, ref)]); continue
        lang, name = ref.split(":", 1)
        r = {"card": title, "year": year, "src": ref}
        if lang == "lol":
            lol = lol or lol_dates()
            d = lol.get(name)
            r["date"] = d
            r["status"] = "OK" if d and int(d[:4]) == year else "A-VOIR"
            report.append(r); print(r["status"], title, year, d); continue
        a = article(lang, name)
        time.sleep(0.6)
        if not a:
            r["status"] = "ARTICLE-INTROUVABLE"; report.append(r); print(r["status"], title, ref); continue
        r["article"] = a["title"]
        desc, ds = dates(a["qid"]) if a["qid"] else ("", [])
        time.sleep(0.6)
        r["description"] = desc
        r["dates"] = ds
        firsts = [x["year"] for x in ds if x["prop"] in ("sortie", "début", "première") and (x["precision"] or 0) >= 9]
        if not firsts:
            firsts = [x["year"] for x in ds if (x["precision"] or 0) >= 9]
        r["earliest"] = min(firsts) if firsts else None
        sents = re.split(r"(?<=[.!?])\s+", a["text"])
        hits = [s.strip().replace("\n", " ")[:240] for s in sents if re.search(r"\b%d\b" % year, s)]
        r["phrases"] = hits[:3]
        wd, tx = r["earliest"] == year, bool(hits)
        r["status"] = "OK" if wd and tx else ("WD" if wd else ("TEXTE" if tx else "A-VOIR"))
        report.append(r)
        print(r["status"], title, year, "|", a["title"], "|", desc, "| plus ancienne :", r["earliest"])
    json.dump(report, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(Counter(r["status"] for r in report))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
