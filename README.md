# The Tricktionary

A visual field guide to FPV freestyle tricks, on the web. 143 tricks compiled
from the FPV community, each with a how-to, step-by-step control inputs,
three mastery levels, prerequisites, common mistakes, variations, related
tricks, and its sources.

Live at **https://thetricktionary.github.io/**

Fuller documentation is in the
[wiki](https://github.com/thetricktionary/thetricktionary.github.io/wiki):
how to use the site, how progress and backups work, the architecture, the data
pipeline, deploying, and troubleshooting.

## What's in it

- **Tricks** &mdash; all 143 entries, carrying everything a book page does: the
  isometric flight-path illustration, the how-to, three mastery levels, the
  step-by-step strip with a Mode 2 twin-stick glyph per step, prerequisites and
  where to practice, common mistakes, variations, related tricks, the
  originator where one is known, and clickable sources. Filtered by difficulty,
  motion-family category and your own progress, with a search that reaches into
  the how-to, prerequisites and common mistakes as well as the names. Cards
  carry the drawing as a thumbnail, painted in as they scroll into view.
- **Progression** &mdash; the book's suggested learning order, five tiers with
  variations nested under their base trick, each with a checkbox and a per-tier
  progress bar.
- **Basics** &mdash; how to read an entry, the Mode 2 stick conventions with
  drawn examples, and the difficulty scale.
- **Glossary** &mdash; 28 terms, filterable.
- **Safety** &mdash; rules, airspace, line of sight, and where to fly.
- **Settings** &mdash; light/dark theme, export/import of your progress, and the
  full source attribution.

Dark mode is the default. Everything you tick is stored in your browser and
never leaves it unless you export it.

## Progress model

Each trick carries a mastery level from 0 to 3, matching the book's three star
levels: one star for landing it at all, two for clean form, three for perfect
form. The Progression checkbox is the same value seen from the side: ticked
means at least one star. Export writes `{slug: 0-3}` to a JSON file; import
merges it in, keeping whichever side has the higher level, so restoring an old
backup can never take progress away.

### Progress survives deploys

localStorage is scoped to the origin, not to any file or `?v=` query, and the
site has no service worker, so shipping new code does not touch what is stored.
A user keeps their stars across every update. Three guards back that up:

- `tools/build-data.py` **refuses to build** if a trick's slug disappears
  between builds without a `SLUG_ALIASES` entry, since stars are keyed by slug
  and a silent rename would orphan them. Aliases are applied on load and are
  permanent.
- Progress that cannot be parsed is copied to `tt-progress-rescued` before
  anything else is written, so a bad read can never destroy a good backup.
- A failed write is detected by reading back, and reported in Settings, rather
  than the app looking like it saved when it did not.

What is still outside the site's control: moving to a custom domain changes the
origin and storage does not follow, Safari drops script-written storage after
about a week without a visit, and clearing site data wipes it. Export is the
answer to all three.

## Run it

No build step. Open `index.html`, or serve the folder:

```bash
python -m http.server 8000
```

- `assets/the-tricktionary-v1.pdf` &mdash; the source book, 158 pages, 1.7&nbsp;MB
- `index.html` &mdash; the whole app shell and every tab's static markup
- `css/style.css` &mdash; both themes, the desktop rail and the phone bottom bar
- `js/data.js` &mdash; **generated**, do not hand-edit (see below)
- `js/iso.js` &mdash; **generated**, the 143 isometric illustrations as SVG
- `js/app.js` &mdash; all the logic

`js/iso.js` is ~1.3&nbsp;MB, so it is not loaded with the page: a script tag is
injected the first time an illustration is needed, and the drawings paint in
when it lands.

## The illustrations

The isometric flight paths are not redrawn for the web. The sibling
`the-tricktionary` project already draws all 143 scenes in Python onto a
ReportLab canvas; `tools/render-iso-svg.py` stands up an object with the same
canvas API that emits SVG instead of PDF operators, and replays those same draw
functions through it. The geometry is the book's, to the point.

Palette roles (grid, ink, drop-lines, ground shadow, the three shaded faces of
an obstacle) are written out as `var(--iso-*)` so one SVG serves light and dark.
The orange flight-path ramp stays literal: it reads on either background, and
it is the one thing that must not shift.

```bash
pip install reportlab
python tools/render-iso-svg.py    # writes js/iso.js
```

`SRC_DIR` at the top of that tool points at the sibling project. A clean run
reports `143 illustrations`; a `MISSING art` line means a trick page has no
scene and would render an empty panel.

## Regenerating the data

`js/data.js` is extracted from `the-tricktionary-v1.pdf` rather than typed in.
The book's page geometry is identical on every trick page, so the tools locate
each field by its (x, y, font size) rather than scraping a flat text dump.

```bash
pip install pdfplumber
cd tools
python extract-tricks.py tricks.json   # the 143 trick pages
python extract-front.py                # glossary, progression, sources
python extract-inputs.py               # stick vectors, originators, source URLs
python build-data.py                   # writes ../js/data.js
```

`extract-inputs.py` reads the sibling project rather than the PDF, because the
per-step stick inputs are geometry the printed page cannot give back as text.
It pairs the vectors to steps by position and refuses to pair any trick whose
printed step count disagrees with the authored one, so a `SKIPPED stick inputs`
line means real misalignment to fix rather than a page to ignore. A clean run
reports `143 tricks enriched: 143 with stick inputs`.

`extract-tricks.py` prints a warning line for any page whose mastery levels,
steps, difficulty, how-to or sources came out empty. A clean run reports
`143 tricks, 0 with warnings`; treat anything else as a parser regression, not
as a bad page.

The `SRC` constant at the top of each extractor points at the PDF; edit it if
the file lives somewhere else.

## The book itself

`assets/the-tricktionary-v1.pdf` ships with the site. Every entry's footer
links back to the page it was compiled from, using a `#page=` fragment, and
Settings offers the whole thing. The fragment takes the **physical** page
(`pdfPage` in the data) while the label shows the **printed folio** (`page`);
the two differ by the front matter, so Barrel Roll reads "p.7" and opens
physical page 9. Regenerating the data keeps both in step; do not hand-edit
either.

## Attribution

Every trick is compiled from the FPV community's own tutorials and trick lists,
credited per entry and listed in full under Settings. This site is not
affiliated with, endorsed by, or sponsored by any of those sources. Keep the
per-entry source lines and the Settings attribution section intact and accurate.

Created by [dangeratio](https://github.com/dangeratio).

## Licence

The **code** is released under the [MIT License](LICENSE): `index.html`,
`css/`, `js/app.js`, and everything under `tools/`. Take it, fork it, build on
it.

The **trick content** is a different question, and MIT does not speak for it.
The 143 entries, the isometric illustrations, and the bundled PDF are compiled
from the community tutorials and trick lists credited per entry and listed
under Settings; those sources set their own terms, and this project holds no
rights it can grant over them. If you reuse the content rather than the code,
credit the originating sources as this site does, and check their terms
yourself.

