# Ports the book's isometric flight-path illustrations to SVG.
#
# The art already exists as Python: the-tricktionary/render_isometric.py draws
# each trick onto a ReportLab canvas. Rather than re-implement 143 scenes, this
# stands up a canvas-shaped object that emits SVG instead of PDF operators and
# replays the same draw functions through it. The geometry is therefore the
# book's, exactly, not a redrawing of it.
#
# Palette colours are swapped for CSS custom properties on the way out so one
# SVG serves both themes. The orange flight-path gradient stays literal: it
# reads on light and dark alike, and it is the one thing that must not shift.
import math, os, sys, json, io, re

SRC_DIR = r"C:\Users\dangeratio\Documents\development\claudecode\the-tricktionary"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "iso.js")

sys.path.insert(0, SRC_DIR)
os.chdir(SRC_DIR)
import render_isometric as ri            # noqa: E402  (needs the chdir above)

# The illustration panel on a book page, in PDF points: see the hero row in
# render_full_entry.py. Keeping the same box and the same iso origin means the
# scenes frame here exactly as they do in the book.
BOX_W, BOX_H = 229.92, 184.0
ISO_OX, ISO_OY, ISO_SCALE = 36.0, 34.0, 15.5


def hexof(col):
    if isinstance(col, str):
        return col.lower()
    return "#%02x%02x%02x" % (round(col.red * 255), round(col.green * 255), round(col.blue * 255))


TH = ri.LIGHT

# Role colours become variables; anything else is written out literally.
VARS = {
    hexof(TH["grid"]): "--iso-grid",
    hexof(TH["ink"]): "--iso-ink",
    hexof(TH["muted"]): "--iso-muted",
    hexof(TH["shadow"]): "--iso-shadow",
    hexof(TH["card"]): "--iso-card",
    hexof(TH["bg"]): "--iso-card",
    hexof(TH["obstacle_edge"]): "--iso-ob-edge",
    "#ffffff": "--iso-card",
}
# box() shades the obstacle fill by three fixed factors; each shade gets its
# own variable so a dark theme can re-pick all three rather than invert them.
for fac, name in ((1.30, "--iso-ob-top"), (1.00, "--iso-ob-side"), (0.78, "--iso-ob-dark")):
    VARS[hexof(ri._shade(TH["obstacle"], fac))] = name


def paint(col):
    h = hexof(col)
    v = VARS.get(h)
    if v:
        return "var(%s)" % v
    # path3d colours every segment of the flight path a step further along the
    # light-to-saturated ramp, which would be one <path> per segment. Snapping
    # the ramp to a coarser set of steps lets consecutive segments coalesce into
    # single polylines; at 12 levels the banding is not visible at print size.
    r, g, b = int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)
    q = lambda v: min(255, (v + 11) // 22 * 22)
    return "#%02x%02x%02x" % (q(r), q(g), q(b))


class Path(object):
    def __init__(self):
        self.d = []

    def moveTo(self, x, y):
        self.d.append("M%.1f %.1f" % (x, -y))

    def lineTo(self, x, y):
        self.d.append("L%.1f %.1f" % (x, -y))

    def close(self):
        self.d.append("Z")

    def roundRect(self, x, y, w, h, r):
        # only ever used for the clip rect, which this exporter handles itself
        self.d.append("M%.2f %.2f h%.2f v%.2f h%.2f Z" % (x, -y, w, -h, -w))


class SvgCanvas(object):
    """Just enough of the ReportLab canvas API for render_isometric's scenes.

    Coordinates pass through unchanged in x and are negated in y, so the
    PDF's y-up space becomes SVG's y-down space; the wrapping <g> shifts the
    result back into the viewBox. Text is emitted upright because of that
    negation rather than despite it."""

    def __init__(self, clip_id="c"):
        self.out = []
        self.clip_id = clip_id
        self.pending = None      # run of line() calls being coalesced
        self.fill = "#000000"
        self.stroke = "#000000"
        self.lw = 1.0
        self.dash = None
        self.cap = "round"
        self.join = "round"
        self.font = ("Helvetica", 10)

    # -- state ----------------------------------------------------------
    def setFillColor(self, col): self.fill = paint(col)
    def setStrokeColor(self, col): self.stroke = paint(col)
    def setLineWidth(self, w): self.lw = w
    def setLineCap(self, n): self.cap = {0: "butt", 1: "round", 2: "square"}.get(n, "round")
    def setLineJoin(self, n): self.join = {0: "miter", 1: "round", 2: "bevel"}.get(n, "round")
    def setFont(self, name, size): self.font = (name, size)
    def saveState(self): pass
    def restoreState(self): pass
    def clipPath(self, p, stroke=0, fill=0): pass

    def setDash(self, *a):
        if not a or a[0] is None:
            self.dash = None
        elif isinstance(a[0], (list, tuple)):
            self.dash = list(a[0])
        else:
            self.dash = list(a)

    def _strokeAttrs(self):
        s = ' stroke="%s" stroke-width="%.2f" stroke-linecap="%s" stroke-linejoin="%s"' % (
            self.stroke, self.lw, self.cap, self.join)
        if self.dash:
            s += ' stroke-dasharray="%s"' % ",".join("%g" % v for v in self.dash)
        return s

    # -- drawing --------------------------------------------------------
    def _flush(self):
        """Close out a coalesced run of line() calls. Scenes draw curves as a
        stream of one-segment lines, which would be one <path> each; a run that
        shares its style and joins end-to-end becomes a single polyline."""
        if not self.pending:
            return
        style, pts = self.pending
        self.pending = None
        d = "M%.1f %.1f" % pts[0] + "".join("L%.1f %.1f" % p for p in pts[1:])
        self.out.append('<path d="%s" fill="none"%s/>' % (d, style))

    def _emit(self, s):
        self._flush()
        self.out.append(s)

    def line(self, x1, y1, x2, y2):
        style = self._strokeAttrs()
        a, b = (round(x1, 1), round(-y1, 1)), (round(x2, 1), round(-y2, 1))
        if self.pending and self.pending[0] == style and self.pending[1][-1] == a:
            self.pending[1].append(b)
            return
        self._flush()
        self.pending = (style, [a, b])

    def circle(self, cx, cy, r, stroke=1, fill=0):
        a = '<circle cx="%.1f" cy="%.1f" r="%.2f" fill="%s"' % (
            cx, -cy, r, self.fill if fill else "none")
        a += (self._strokeAttrs() if stroke else ' stroke="none"')
        self._emit(a + "/>")

    def beginPath(self):
        return Path()

    def drawPath(self, p, stroke=1, fill=0):
        a = '<path d="%s" fill="%s"' % ("".join(p.d), self.fill if fill else "none")
        a += (self._strokeAttrs() if stroke else ' stroke="none"')
        self._emit(a + "/>")

    def rect(self, x, y, w, h, stroke=1, fill=0):
        a = '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"' % (
            x, -(y + h), w, h, self.fill if fill else "none")
        a += (self._strokeAttrs() if stroke else ' stroke="none"')
        self._emit(a + "/>")

    def roundRect(self, x, y, w, h, r, stroke=1, fill=0):
        a = '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"' % (
            x, -(y + h), w, h, r, self.fill if fill else "none")
        a += (self._strokeAttrs() if stroke else ' stroke="none"')
        self._emit(a + "/>")

    def _text(self, x, y, s, anchor):
        self._emit(
            '<text x="%.1f" y="%.1f" fill="%s" text-anchor="%s" font-size="%.1f" '
            'font-weight="%s" font-family="system-ui,Helvetica,Arial,sans-serif">%s</text>'
            % (x, -y, self.fill, anchor, self.font[1],
               "700" if "Bold" in self.font[0] else "400",
               s.replace("&", "&amp;").replace("<", "&lt;")))

    def drawString(self, x, y, s): self._text(x, y, s, "start")
    def drawCentredString(self, x, y, s): self._text(x, y, s, "middle")

    def stringWidth(self, s, font=None, size=None):
        # Helvetica averages ~0.52em across mixed case; the scenes only use this
        # for rough label placement, never for layout that has to be exact.
        return len(s) * (size or self.font[1]) * 0.52

    def svg(self):
        self._flush()
        # The draw calls emit y already negated, so the group only has to slide
        # the box's origin back to 0,0.
        # Scenes are drawn to the book's panel and rely on it to clip: the
        # ground grid runs past the left edge in most of them. The clip path is
        # per-SVG rather than shared so a single <svg> can be dropped anywhere.
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.1f %.1f" '
                'preserveAspectRatio="xMidYMid meet" role="img">'
                '<defs><clipPath id="%s"><rect x="0" y="0" width="%.1f" height="%.1f" rx="6"/>'
                '</clipPath></defs>'
                '<g clip-path="url(#%s)"><g transform="translate(0,%.1f)">%s</g></g></svg>'
                % (BOX_W, BOX_H, self.clip_id, BOX_W, BOX_H,
                   self.clip_id, BOX_H, "".join(self.out)))


def render(draw, slug):
    c = SvgCanvas("iso-" + slug)
    iso = ri.make_iso(ISO_OX, ISO_OY, ISO_SCALE)
    draw(c, iso, TH)
    return c.svg()


def main():
    master = json.load(open("tricktionary_master.json", encoding="utf-8"))
    names = {t["id"]: t["canonical_name"] for t in master["master_index"]}

    def slug(name):
        s = name.lower().replace("&", "and").replace("+", " plus ")
        return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

    # The site keys entries by a slug of the printed trick name; the renderer
    # keys scenes by dataset id. canonical_name is the bridge between them.
    here = os.path.dirname(os.path.abspath(__file__))
    site = json.load(open(os.path.join(here, "tricks.json"), encoding="utf-8"))
    # Tricks added on the site rather than read out of the book still get their
    # scene from the same place, so they are wanted here too.
    try:
        site += json.load(open(os.path.join(here, "extra-tricks.json"), encoding="utf-8"))
    except IOError:
        pass
    wanted = {slug(t["name"]): t["name"] for t in site}

    out, missing, unused = {}, [], []
    for t in ri.TRICKS:
        s = slug(names.get(t["id"], t["id"]))
        if s in wanted:
            out[s] = render(t["draw"], s)
        else:
            unused.append(t["id"])
    for s in wanted:
        if s not in out:
            missing.append(wanted[s])

    body = "const ISO = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    body += "if (typeof onIsoLoaded === 'function') onIsoLoaded();\n"
    dest = os.path.abspath(OUT)
    with io.open(dest, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* Generated by tools/render-iso-svg.py from the-tricktionary/render_isometric.py.\n"
                "   Do not hand-edit: re-run the tool instead. */\n")
        f.write(body)

    print("%d illustrations -> %s (%.0f KB)" % (len(out), dest, os.path.getsize(dest) / 1024))
    if missing:
        print("MISSING art for %d tricks: %s" % (len(missing), ", ".join(sorted(missing))))
    if unused:
        print("%d scenes had no matching site entry: %s" % (len(unused), ", ".join(sorted(unused))))


main()
