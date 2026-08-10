# The parts of a book page that are not text and so could not be read back out
# of the PDF: the per-step twin-stick inputs, the originator credit, and the
# URLs behind the source labels in the footer.
#
# Prose is deliberately NOT taken from here. trick_content.py carries mojibake
# where its dashes were re-encoded, and the PDF text extraction is clean, so
# each source is used for what it is authoritative about: the PDF for what it
# printed, this module for the structure behind it.
import json, os, sys, re, io

SRC_DIR = r"C:\Users\dangeratio\Documents\development\claudecode\the-tricktionary"
HERE = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, SRC_DIR)
os.chdir(SRC_DIR)
import trick_content as tc                       # noqa: E402
import render_isometric as ri                    # noqa: E402

MASTER = json.load(open("tricktionary_master.json", encoding="utf-8"))
IDX = {t["id"]: t for t in MASTER["master_index"]}


def slug(name):
    s = name.lower().replace("&", "and").replace("+", " plus ")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def vec(v):
    """A stick input is (dx, dy) in -1..1, None for centered, or a list of
    vectors for a pumped input. Normalised here to a list of pairs so the
    browser never has to guess which of the three shapes it has."""
    if v is None:
        return None
    if isinstance(v[0], (tuple, list)):
        return [[round(a, 3), round(b, 3)] for a, b in v]
    return [[round(v[0], 3), round(v[1], 3)]]


def main():
    site = json.load(open(os.path.join(HERE, "tricks.json"), encoding="utf-8"))
    by_slug = {slug(t["name"]): t for t in site}
    # dataset id -> site slug, bridged on canonical_name the same way the
    # illustration exporter does it
    id_to_slug = {}
    for tid, meta in IDX.items():
        s = slug(meta["canonical_name"])
        if s in by_slug:
            id_to_slug[tid] = s

    out, mismatched, nosteps = {}, [], []
    for tid, e in tc.ENTRIES.items():
        s = id_to_slug.get(tid)
        if not s:
            continue
        rec = {}

        # ---- per-step stick inputs -------------------------------------
        # The site's step text came from the PDF; these vectors are keyed by
        # position, so a differing step count means they cannot be trusted to
        # line up and the whole trick is skipped rather than mis-paired.
        printed = by_slug[s]["steps"]
        if len(e["steps"]) == len(printed):
            inputs = []
            for st in e["steps"]:
                inputs.append({
                    "L": vec(st.get("L")), "R": vec(st.get("R")),
                    "Lh": bool(st.get("Lh")), "Rh": bool(st.get("Rh")),
                })
            if any(i["L"] or i["R"] for i in inputs):
                rec["inputs"] = inputs
            else:
                nosteps.append(s)
        else:
            mismatched.append("%s (%d printed vs %d authored)"
                              % (s, len(printed), len(e["steps"])))

        # ---- originator -------------------------------------------------
        if e.get("originator"):
            rec["originator"] = e["originator"]

        # ---- clickable sources -----------------------------------------
        # links_for() is the book's own footer builder, so the labels and the
        # URLs match what is printed under each entry.
        links = [{"label": lbl, "url": url} for lbl, url in ri.links_for(tid)]
        if links:
            rec["links"] = links

        if rec:
            out[s] = rec

    dest = os.path.join(HERE, "inputs.json")
    with io.open(dest, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    have = sum(1 for v in out.values() if "inputs" in v)
    print("%d tricks enriched: %d with stick inputs, %d with an originator, %d with links"
          % (len(out), have,
             sum(1 for v in out.values() if "originator" in v),
             sum(1 for v in out.values() if "links" in v)))
    if mismatched:
        print("SKIPPED stick inputs, step counts disagree (%d): %s"
              % (len(mismatched), "; ".join(mismatched)))
    if nosteps:
        print("%d tricks author every step as centered: %s" % (len(nosteps), ", ".join(nosteps)))


main()
