# Raster icons drawn from the same mark as favicon.svg and the .brand-logo in
# index.html: a quad seen from above, X frame with four motors.
#
# Rasters exist because an SVG favicon is not enough on its own. Safari ignores
# `rel="icon" type="image/svg+xml"` outright, and a bare /favicon.ico request
# from a crawler or an older browser would 404. The vector stays the primary
# icon; these are the fallbacks.
#
# The mark is redrawn here rather than converted, so no SVG rasteriser is
# needed. Geometry is in the SVG's 40x40 space and scaled per size; keep the
# three copies (favicon.svg, .brand-logo, this) in step.
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "assets")

ORANGE = (249, 115, 22, 255)          # --accent in dark mode, the book's path colour
SS = 8                                # supersample factor, for clean edges at 16px

# in the 40x40 viewBox of favicon.svg
ARM_W, MOTOR_R, MOTOR_W = 3.6, 5.0, 3.0
CORNERS = [(9, 9), (31, 9), (9, 31), (31, 31)]


def draw(size):
    """The mark at `size` px, drawn large and downsampled.

    Below 48px the motor rings are simplified to solid discs. A 3-unit ring on
    a 40-unit mark is about one device pixel at 16px, so it silts up into a
    blob whatever you do; drawing a disc on purpose keeps the same silhouette
    and stays crisp instead of muddy. The arms thin slightly to leave a gap
    between disc and arm end."""
    small = size < 48
    n = size * SS
    k = n / 40.0                       # viewBox units -> supersampled px
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    arm = max(1, round((3.2 if small else ARM_W) * k))
    # the two arms, drawn with round joints so they read at 16px
    for (x0, y0), (x1, y1) in (((9, 31), (31, 9)), ((9, 9), (31, 31))):
        d.line([x0 * k, y0 * k, x1 * k, y1 * k], fill=ORANGE, width=arm)
    for cx, cy in CORNERS:
        d.ellipse([cx * k - arm / 2, cy * k - arm / 2,
                   cx * k + arm / 2, cy * k + arm / 2], fill=ORANGE)

    ring = max(1, round(MOTOR_W * k))
    for cx, cy in CORNERS:
        r = (4.4 if small else MOTOR_R) * k
        box = [cx * k - r, cy * k - r, cx * k + r, cy * k + r]
        if small:
            d.ellipse(box, fill=ORANGE)
        else:
            d.ellipse(box, outline=ORANGE, width=ring)

    return img.resize((size, size), Image.LANCZOS)


def main():
    if not os.path.isdir(ASSETS):
        os.makedirs(ASSETS)

    # PNGs the head links directly
    for size, name in ((32, "icon-32.png"), (192, "icon-192.png"),
                       (512, "icon-512.png"), (180, "apple-touch-icon.png")):
        p = os.path.join(ASSETS, name)
        img = draw(size)
        if name == "apple-touch-icon.png":
            # iOS squares off and drops transparency anyway, so give it the
            # page's own near-black rather than letting it composite on white
            bg = Image.new("RGBA", img.size, (19, 18, 17, 255))
            bg.alpha_composite(img)
            img = bg
        img.save(p)
        print("  %-22s %d x %d" % (name, size, size))

    # favicon.ico at the root, for bare /favicon.ico requests and older
    # browsers. Each frame is drawn at its own size rather than downscaled from
    # one, so the small frames get the simplified mark rather than a squashed
    # copy of the detailed one.
    ico = os.path.join(ROOT, "favicon.ico")
    frames = [draw(s) for s in (16, 32, 48, 64)]
    frames[0].save(ico, format="ICO", append_images=frames[1:],
                   sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("  %-22s 16/32/48/64" % "favicon.ico")


print("icons from the quad mark:")
main()
