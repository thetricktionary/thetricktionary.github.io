# Front and back matter: glossary, difficulty blurbs, learning progression,
# and the source list. Same geometry-driven approach as extract_tricks.py.
import json, re
import pdfplumber

SRC = r"C:\Users\dangeratio\Desktop\the-tricktionary-v1.pdf"
MID = 310.0


def clean(s):
    return re.sub(r"\s+", " ", s.replace("\ufffd", "\u00b7").replace("\u00a0", " ")).strip()


def lines_of(words):
    d = {}
    for w in words:
        d.setdefault(round(w["top"], 0), []).append(w)
    return [(k, sorted(d[k], key=lambda w: w["x0"])) for k in sorted(d)]


def txt(line):
    return clean(" ".join(w["text"] for w in line))


def glossary(page):
    ws = page.extract_words(extra_attrs=["size", "fontname"])
    out = []
    for lo, hi in ((0, MID), (MID, 1e4)):
        col = [w for w in ws if lo <= w["x0"] < hi and 120 < w["top"] < 730]
        for _, line in lines_of(col):
            if line[0]["size"] > 9.0:            # bold term
                out.append({"term": txt(line), "def": ""})
            elif out:
                out[-1]["def"] = clean(out[-1]["def"] + " " + txt(line))
    out.sort(key=lambda e: e["term"].lower())
    return out


def progression(pages):
    """Ordered checklist. x0 66/332 = base trick, 80/346 = variation of it."""
    tiers, cur = [], None
    for page in pages:
        ws = page.extract_words(extra_attrs=["size", "fontname"])
        for lo, hi in ((0, MID), (MID, 1e4)):
            col = [w for w in ws if lo <= w["x0"] < hi and 130 < w["top"] < 730]
            if not col:
                continue
            rows, seen_header = [], False
            for _, line in lines_of(col):
                t, x0, bold = txt(line), line[0]["x0"], "Bold" in line[0]["fontname"]
                if bold:
                    cur = {"tier": t, "items": []}
                    tiers.append(cur)
                    seen_header = True
                elif seen_header:          # anything before the first tier
                    rows.append((cur, t, x0))   # header is the page intro
            if rows:
                base = min(r[2] for r in rows)
                for owner, t, x0 in rows:
                    owner["items"].append({"name": t, "variation": x0 > base + 6})
    return tiers


def sources(page):
    ws = [w for w in page.extract_words(extra_attrs=["size"]) if 120 < w["top"] < 730]
    rows, cur = [], None
    for _, line in lines_of(ws):
        t = txt(line)
        if t.startswith("http"):
            if cur:
                cur["url"] = t
        elif t.isupper() and len(t) < 12:
            continue
        else:
            cur = {"title": t, "url": "", "note": ""}
            rows.append(cur)
    return [r for r in rows if r["url"]]


def main():
    with pdfplumber.open(SRC) as pdf:
        data = {
            "glossary": glossary(pdf.pages[7]),
            "progression": progression(pdf.pages[152:155]),
            "sources": sources(pdf.pages[151]),
        }
    n = sum(len(t["items"]) for t in data["progression"])
    print("glossary %d, progression %d tiers / %d items, sources %d"
          % (len(data["glossary"]), len(data["progression"]), n, len(data["sources"])))
    for t in data["progression"]:
        print("  %-14s %d" % (t["tier"], len(t["items"])))
    with open("front.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


main()
