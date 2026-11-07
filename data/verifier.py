"""Vérifie chaque date de carte contre Wikidata et l'introduction de l'article Wikipédia FR.

Usage : python data/verifier.py data/candidates.json data/rapport.json
Pour chaque carte : l'article FR (redirections suivies), son élément Wikidata, les années
trouvées dans les propriétés de date, et si l'année apparaît dans l'introduction.
"""
import json, re, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "FriseCardCheck/1.0 (jeu entre amis; verification de dates)"}
DATE_PROPS = {
    "P575": "découverte/invention", "P571": "création", "P585": "date", "P577": "publication",
    "P580": "début", "P582": "fin", "P1619": "ouverture", "P619": "lancement", "P606": "premier vol",
    "P1191": "première", "P729": "mise en service", "P569": "naissance", "P570": "mort",
    "P793": "événement", "P3999": "fermeture", "P1249": "première mention",
}


def get(url):
    for i in range(8):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa
            print("  nouvel essai", i, e, file=sys.stderr); time.sleep(3 * (i + 1))
    raise RuntimeError("échec " + url)


def wiki_batch(titles):
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "redirects": 1, "prop": "pageprops|extracts",
        "ppprop": "wikibase_item", "exintro": 1, "explaintext": 1, "exlimit": "max",
        "titles": "|".join(titles),
    })
    d = get("https://fr.wikipedia.org/w/api.php?" + q)
    norm = {n["from"]: n["to"] for n in d["query"].get("normalized", [])}
    redir = {n["from"]: n["to"] for n in d["query"].get("redirects", [])}
    pages = {p["title"]: p for p in d["query"]["pages"].values()}
    out = {}
    for t in titles:
        tt = norm.get(t, t)
        tt = redir.get(tt, tt)
        p = pages.get(tt)
        if not p or "missing" in p:
            out[t] = None
        else:
            out[t] = {"title": tt, "qid": p.get("pageprops", {}).get("wikibase_item"), "intro": p.get("extract", "")}
    return out


def years_of(claims):
    found = {}
    for prop, label in DATE_PROPS.items():
        for c in claims.get(prop, []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if not isinstance(v, dict) or "time" not in v:
                continue
            m = re.match(r"([+-])0*(\d+)-", v["time"])
            if not m:
                continue
            y = int(m.group(2)) * (-1 if m.group(1) == "-" else 1)
            found.setdefault(label, []).append((y, v.get("precision")))
        # qualificatifs de date (ex. P793 événement significatif avec P585)
        for c in claims.get(prop, []):
            for qp, qs in c.get("qualifiers", {}).items():
                if qp in ("P585", "P580"):
                    for q in qs:
                        v = q.get("datavalue", {}).get("value")
                        if isinstance(v, dict) and "time" in v:
                            m = re.match(r"([+-])0*(\d+)-", v["time"])
                            if m:
                                y = int(m.group(2)) * (-1 if m.group(1) == "-" else 1)
                                found.setdefault(label + "/qualif", []).append((y, v.get("precision")))
    return found


def main(src, dst):
    cards = json.load(open(src, encoding="utf-8"))
    titles = [c[4] for c in cards]
    info = {}
    for i in range(0, len(titles), 20):
        info.update(wiki_batch(titles[i:i + 20]))
        time.sleep(1.0)
    qids = [v["qid"] for v in info.values() if v and v.get("qid")]
    claims = {}
    for i in range(0, len(qids), 40):
        q = urllib.parse.urlencode({"action": "wbgetentities", "format": "json", "props": "claims", "ids": "|".join(qids[i:i + 40])})
        d = get("https://www.wikidata.org/w/api.php?" + q)
        for k, e in d.get("entities", {}).items():
            claims[k] = e.get("claims", {})
        time.sleep(1.0)
    report = []
    for c in cards:
        title, year, cat, emoji, wt = c
        w = info.get(wt)
        r = {"card": title, "year": year, "wiki": wt}
        if not w:
            r["status"] = "ARTICLE-INTROUVABLE"
            report.append(r)
            continue
        r["article"] = w["title"]
        ys = years_of(claims.get(w["qid"], {})) if w.get("qid") else {}
        r["wikidata"] = ys
        flat = [y for lst in ys.values() for (y, p) in lst if (p or 0) >= 9]
        r["wd_match"] = year in flat
        a = abs(year)
        pat = (r"\b%d\b" % a) if year > 0 else (r"\b%d\b[^.]{0,30}(av|avant)" % a)
        r["intro_match"] = bool(re.search(pat, w["intro"]))
        m = re.search(r"[^.]*\b%d\b[^.]*" % a, w["intro"])
        r["intro_phrase"] = m.group(0).strip()[:220] if m else w["intro"][:220]
        r["status"] = "OK" if (r["wd_match"] and r["intro_match"]) else ("WD" if r["wd_match"] else ("TEXTE" if r["intro_match"] else "A-VOIR"))
        report.append(r)
    json.dump(report, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(Counter(r["status"] for r in report))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
