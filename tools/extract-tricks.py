# Pulls the 143 trick pages out of the-tricktionary-v1.pdf into JSON.
# The book's page geometry is identical on every trick page, so everything is
# located by (x0, top, font size) rather than by scraping the flat text dump.
import json, re, sys, unicodedata
import pdfplumber

SRC = r"C:\Users\dangeratio\Desktop\the-tricktionary-v1.pdf"
FIRST, LAST = 8, 150            # zero-based page indexes of the trick pages
DIFFS = ("Beginner", "Novice", "Intermediate", "Advanced", "Master")
MID = 310.0                     # x that divides the two note columns


def clean(s):
    s = s.replace("\ufffd", "\u00b7").replace("\u00a0", " ")
    return re.sub(r"\s+", " ", s).strip()


def lines_of(words):
    """Group words into visual lines keyed by rounded top, left-to-right."""
    out = {}
    for w in words:
        out.setdefault(round(w["top"], 0), []).append(w)
    return [(k, sorted(out[k], key=lambda w: w["x0"])) for k in sorted(out)]


def text_of(line):
    return clean(" ".join(w["text"] for w in line))


def paragraph(words):
    return clean(" ".join(text_of(l) for _, l in lines_of(words)))


def blocks(words, gap):
    """Split lines into blocks: a line further than `gap` below the previous
    line starts a new block. Used for the wrapped mastery / mistake items."""
    out, prev = [], None
    for top, line in lines_of(words):
        if prev is None or top - prev >= gap:
            out.append([])
        out[-1].append(text_of(line))
        prev = top
    return [clean(" ".join(b)) for b in out]


def parse_page(page):
    ws = page.extract_words(extra_attrs=["size", "fontname"])
    sz = lambda lo, hi: [w for w in ws if lo <= w["size"] <= hi]

    def band(top_lo, top_hi, x_lo=0, x_hi=1e4, size=None):
        r = [w for w in ws if top_lo <= w["top"] < top_hi and x_lo <= w["x0"] < x_hi]
        if size:
            r = [w for w in r if size[0] <= w["size"] <= size[1]]
        return r

    name = paragraph(band(50, 95, size=(20, 40)))
    head = paragraph(band(95, 118, size=(7.0, 8.0))).split()
    difficulty = head[0] if head and head[0] in DIFFS else ""
    category = " ".join(head[1:]) if difficulty else " ".join(head)

    # right column, above the mastery header
    mast_hdr = [w for w in ws if w["text"] == "MASTERY" and w["x0"] > MID]
    mast_top = mast_hdr[0]["top"] if mast_hdr else 300
    howto = paragraph(band(135, mast_top - 2, MID, 1e4, size=(8.8, 9.2)))

    mastery = blocks(band(mast_top + 5, 330, MID, 1e4, size=(8.0, 8.4)), 12.5)

    # step columns are anchored on the numbered markers at top ~356
    marks = sorted(band(348, 370, 0, 1e4, size=(8.8, 9.2)), key=lambda w: w["x0"])
    marks = [w for w in marks if w["text"].isdigit()]
    stops = [w["x0"] - 4 for w in marks]
    steps = ["" for _ in stops]
    if stops:
        cols = {i: [] for i in range(len(stops))}
        for w in band(370, 445, 0, 1e4, size=(7.4, 7.8)):
            i = max(j for j in range(len(stops)) if stops[j] <= w["x0"] + 2)
            cols[i].append(w)
        steps = [paragraph(cols[i]) for i in range(len(stops))]

    # notes band: prerequisites / practice on the left, mistakes on the right
    prereqs = [text_of(l) for _, l in lines_of(band(455, 575, 68, MID, size=(7.9, 8.1)))]
    practice = paragraph(band(455, 575, 60, MID, size=(7.7, 7.9)))

    # every mistake is introduced by a small glyph in the gutter at x~326
    marker_tops = sorted(w["top"] for w in band(455, 575, 320, 332))
    mist_words = band(455, 575, 332, 1e4, size=(7.9, 8.1))
    mistakes = []
    for top, line in lines_of(mist_words):
        if any(abs(top - m) < 4 for m in marker_tops) or not mistakes:
            mistakes.append(text_of(line))
        else:
            mistakes[-1] = clean(mistakes[-1] + " " + text_of(line))

    def pairs(x_lo, x_hi):
        """Name (8.2pt) + description (7.6pt) rows in the footer boxes."""
        out = []
        for _, line in lines_of(band(585, 700, x_lo, x_hi, size=(7.5, 8.3))):
            s = line[0]["size"]
            t = text_of(line)
            if s >= 8.0:
                out.append({"name": t, "note": ""})
            elif out:
                out[-1]["note"] = clean(out[-1]["note"] + " " + t)
        return out

    variations = pairs(60, MID)
    related = pairs(MID, 1e4)

    src = paragraph(band(735, 760, 0, 500, size=(6.6, 7.0)))
    src = re.sub(r"^Sources:\s*", "", src)
    sources = [clean(s) for s in src.split("\u00b7") if clean(s)]

    folio = paragraph(band(745, 762, 520, 1e4, size=(7.3, 7.7)))

    return {
        "name": name,
        "difficulty": difficulty,
        "category": category,
        "howto": howto,
        "mastery": mastery,
        "steps": [s for s in steps if s],
        "prereqs": prereqs,
        "practice": practice,
        "mistakes": mistakes,
        "variations": variations,
        "related": related,
        "sources": sources,
        "page": int(folio) if folio.isdigit() else None,
    }


def main():
    tricks = []
    with pdfplumber.open(SRC) as pdf:
        for i in range(FIRST, LAST + 1):
            t = parse_page(pdf.pages[i])
            t["pdfPage"] = i + 1
            tricks.append(t)
    warn = 0
    for t in tricks:
        problems = []
        if len(t["mastery"]) != 3:
            problems.append("mastery=%d" % len(t["mastery"]))
        if not t["steps"]:
            problems.append("no steps")
        if not t["difficulty"]:
            problems.append("no difficulty")
        if not t["howto"]:
            problems.append("no howto")
        if not t["sources"]:
            problems.append("no sources")
        if problems:
            warn += 1
            print("p%-4d %-34s %s" % (t["pdfPage"], t["name"], ", ".join(problems)))
    print("%d tricks, %d with warnings" % (len(tricks), warn))
    out = sys.argv[1] if len(sys.argv) > 1 else "tricks.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(tricks, f, ensure_ascii=False, indent=1)


main()
