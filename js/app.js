/* The Tricktionary - app logic.
   Plain vanilla JS, no build step. Data comes from js/data.js (generated from
   the PDF by tools/build-data.py). Everything the user does is kept in
   localStorage and can be exported to a file from Settings. */

'use strict';

var DIFFS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Master'];
var DIFF_BLURB = {
  Beginner: 'First tricks, clean flips, rolls, orbits. Learn these before anything else.',
  Novice: 'Building blocks combined: powerloops, matty flips, split-S. Comfortable acro required.',
  Intermediate: 'Multi-input tricks and obstacle work: rewinds, taps, trippy spins.',
  Advanced: 'Fast, committed, low-margin lines and chained rotations.',
  Master: 'The hardest named tricks, precise, high-consequence, rarely landed clean.'
};

var KEY_PROGRESS = 'tt-progress';
var KEY_THEME = 'tt-theme';

/* The source book, shipped with the site so every entry can point back at the
   page it was compiled from. */
var PDF_HREF = 'assets/the-tricktionary-v1.pdf';

/* progress[slug] = 0..3 mastery stars. 0 (or absent) means not landed yet. */
var progress = load(KEY_PROGRESS, {});
var bySlug = {};
TRICKS.forEach(function (t) { bySlug[t.slug] = t; });

var filters = { q: '', diff: '', cat: '', prog: '' };

/* ── storage ──────────────────────────────────────────────────────────── */
function load(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function saveProgress() {
  save(KEY_PROGRESS, progress);
  renderProgCount();
}
function stars(slug) { return progress[slug] || 0; }
function setStars(slug, n) {
  if (n <= 0) { delete progress[slug]; } else { progress[slug] = n; }
  saveProgress();
}

/* ── small helpers ────────────────────────────────────────────────────── */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function toast(msg) {
  var el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
}

function diffChip(d) {
  var i = DIFFS.indexOf(d), pips = '';
  for (var n = 0; n < 5; n++) { pips += '<i class="' + (n <= i ? 'on' : '') + '"></i>'; }
  return '<span class="diff diff-' + d.toLowerCase() + '" title="' + esc(DIFF_BLURB[d] || '') +
         '">' + esc(d) + '<span class="pips">' + pips + '</span></span>';
}

/* ── isometric illustrations ──────────────────────────────────────────── */
/* js/iso.js is ~1.3 MB of SVG, so it is injected the first time an entry is
   opened rather than shipped with the page. A script tag rather than fetch(),
   so the site still works opened straight off the disk. */
var isoState = 'idle';   // idle | loading | ready

function onIsoLoaded() {
  isoState = 'ready';
  paintIso();
}

function loadIso() {
  if (isoState !== 'idle') return;
  isoState = 'loading';
  var s = document.createElement('script');
  s.src = 'js/iso.js?v=9';
  s.onerror = function () { isoState = 'failed'; paintIso(); };
  document.head.appendChild(s);
}

/* Fills in every illustration slot that has asked to be painted. Called when a
   slot is wanted and again when the art arrives, so a slot rendered before the
   file lands is never left empty. */
function paintIso() {
  $$('[data-iso][data-want]').forEach(function (el) {
    if (el.dataset.painted) return;
    var svg = (isoState === 'ready' && typeof ISO !== 'undefined') ? ISO[el.dataset.iso] : null;
    if (svg) {
      el.innerHTML = svg;
      el.classList.remove('loading');
      el.dataset.painted = '1';
    } else if (isoState === 'failed') {
      el.textContent = 'Illustration unavailable';
      el.classList.remove('loading');
      el.dataset.painted = '1';
    }
  });
}

function isoSlot(slug, cls, want) {
  return '<div class="' + cls + ' loading" data-iso="' + slug + '"' +
         (want ? ' data-want="1"' : '') + '></div>';
}

/* Card thumbnails paint as they scroll into view: 143 inline SVGs at once is a
   lot of DOM for a list nobody reads all of. */
var isoWatcher = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
  var hit = false;
  entries.forEach(function (e) {
    if (!e.isIntersecting) return;
    e.target.dataset.want = '1';
    isoWatcher.unobserve(e.target);
    hit = true;
  });
  if (hit) { loadIso(); paintIso(); }
}, { rootMargin: '300px' }) : null;

function watchIso(root) {
  if (!isoWatcher) {
    /* No observer: paint the lot rather than show empty boxes */
    $$('[data-iso]', root).forEach(function (el) { el.dataset.want = '1'; });
    loadIso(); paintIso();
    return;
  }
  $$('[data-iso]:not([data-want])', root).forEach(function (el) { isoWatcher.observe(el); });
}
function starsHTML(slug, interactive) {
  var n = stars(slug), out = '';
  for (var i = 1; i <= 3; i++) {
    var on = i <= n ? ' on' : '';
    if (interactive) {
      /* Clicking the star you are already on clears back down to it minus one,
         so the same control both sets and unsets a level. */
      out += '<button class="' + on.trim() + '" data-star="' + i + '" data-slug="' + slug +
             '" title="' + ['Landed it', 'Clean form', 'Perfect form'][i - 1] + '">★</button>';
    } else {
      out += '<span class="' + on.trim() + '">★</span>';
    }
  }
  return '<span class="stars' + (interactive ? ' set' : '') + '">' + out + '</span>';
}

/* ── theme ────────────────────────────────────────────────────────────── */
function setTheme(mode) {
  document.documentElement.className = mode;
  save(KEY_THEME, mode);
  $('#btnThemeDark').classList.toggle('on', mode === 'dark');
  $('#btnThemeLight').classList.toggle('on', mode === 'light');
  $('#btnThemeDark').style.borderColor = mode === 'dark' ? 'var(--accent)' : '';
  $('#btnThemeLight').style.borderColor = mode === 'light' ? 'var(--accent)' : '';
}

/* ── tabs ─────────────────────────────────────────────────────────────── */
function showTab(name) {
  $$('.tabpage').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
  $$('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
  closeMore();
  window.scrollTo(0, 0);
}

function closeMore() {
  $('#moreSheet').classList.remove('open');
  $('.tabs [data-tab="settings"]').classList.remove('sheet-open');
}

/* ── routing ──────────────────────────────────────────────────────────── */
/* #trick/<slug> opens an entry; #<tab> opens a tab. Deep links to a trick are
   what makes the cross-links between entries shareable. */
function route() {
  var h = (location.hash || '').replace(/^#/, '');
  if (h.indexOf('trick/') === 0) {
    var t = bySlug[h.slice(6)];
    if (t) { showTab('tricks'); openTrick(t); return; }
  }
  closeTrick();
  if (h === 'attribution') { showTab('settings'); $('#attribution').scrollIntoView(); return; }
  showTab(['tricks', 'progression', 'basics', 'glossary', 'safety', 'settings'].indexOf(h) >= 0 ? h : 'tricks');
}

/* ── tricks list ──────────────────────────────────────────────────────── */
function matches(t) {
  if (filters.diff && t.difficulty !== filters.diff) return false;
  if (filters.cat && t.category !== filters.cat) return false;
  var n = stars(t.slug);
  if (filters.prog === 'todo' && n > 0) return false;
  if (filters.prog === 'started' && (n < 1 || n > 2)) return false;
  if (filters.prog === 'mastered' && n < 3) return false;
  if (filters.q) {
    var hay = [t.name, t.category, t.difficulty, t.howto, t.practice]
      .concat(t.steps, t.prereqs, t.mistakes,
              t.variations.map(function (v) { return v.name + ' ' + v.note; }),
              t.related.map(function (v) { return v.name + ' ' + v.note; }))
      .join(' ').toLowerCase();
    if (hay.indexOf(filters.q) < 0) return false;
  }
  return true;
}

function renderChips() {
  function chip(label, value, key, count, tier) {
    var cls = 'chip' + (filters[key] === value ? ' on' : '') +
              (tier ? ' tier tier-' + tier.toLowerCase() : '');
    return '<button class="' + cls + '" data-key="' + key + '" data-value="' + esc(value) + '"' +
           (tier ? ' style="--tier:var(--tier-' + tier.toLowerCase() + ')"' : '') + '>' +
           esc(label) + (count == null ? '' : '<span class="n">' + count + '</span>') + '</button>';
  }
  var cats = {};
  TRICKS.forEach(function (t) { cats[t.category] = (cats[t.category] || 0) + 1; });

  $('#diffChips').innerHTML = chip('All', '', 'diff', TRICKS.length) +
    DIFFS.map(function (d) {
      return chip(d, d, 'diff',
                  TRICKS.filter(function (t) { return t.difficulty === d; }).length, d);
    }).join('');

  $('#catChips').innerHTML = chip('All', '', 'cat', null) +
    Object.keys(cats).sort().map(function (c) { return chip(c, c, 'cat', cats[c]); }).join('');

  $('#progChips').innerHTML = chip('Any', '', 'prog', null) +
    chip('Not started', 'todo', 'prog', null) +
    chip('In progress', 'started', 'prog', null) +
    chip('Mastered', 'mastered', 'prog', null);
}

/* ── "missing a trick?" tile ──────────────────────────────────────────── */
var ISSUE_NEW = 'https://github.com/thetricktionary/thetricktionary.github.io/issues/new';

/* A new-issue link with everything filled in but the URL. The category list is
   read off the data so it cannot drift from the categories the site filters by. */
function submitIssueURL() {
  var cats = {};
  TRICKS.forEach(function (t) { cats[t.category] = 1; });
  var body = [
    'Thanks for adding to the guide. Fill in what you know; anything you leave blank is fine.',
    '',
    '**Trick name:** ',
    '',
    '**Link to a tutorial or clip:** <!-- paste the URL here -->',
    '',
    '**Difficulty:** ' + DIFFS.join(' / ') + '  <!-- delete the ones that do not apply -->',
    '',
    '**Category:** ' + Object.keys(cats).sort().join(' / ') + '  <!-- delete the rest -->',
    '',
    '**How it goes:** ',
    '',
    '**Who came up with it, if known:** ',
    '',
    '---',
    'Submitted from the Tricktionary site.'
  ].join('\n');
  return ISSUE_NEW + '?title=' + encodeURIComponent('New trick: ') +
         '&body=' + encodeURIComponent(body);
}

/* Sits at the end of the grid in a trick card's shape, and stays there when
   the filters match nothing: an empty slot in the book, waiting to be filled.
   The skeleton blocks stand in for a real entry's illustration, name, chips
   and how-to, so it reads as a trick that has not been written yet. */
function submitTile() {
  return '<a class="trick-card submit-tile" href="' + esc(submitIssueURL()) + '"' +
    ' target="_blank" rel="noopener" aria-label="Missing a trick? Submit it on GitHub">' +
    '<span class="sk sk-thumb" aria-hidden="true"><span class="sk-plus">+</span></span>' +
    '<span class="sk sk-name" aria-hidden="true"></span>' +
    '<span class="tc-meta" aria-hidden="true">' +
      '<span class="sk sk-chip"></span><span class="sk sk-chip short"></span></span>' +
    '<span class="sk-lines" aria-hidden="true">' +
      '<span class="sk sk-line"></span><span class="sk sk-line"></span>' +
      '<span class="sk sk-line short"></span></span>' +
    '<span class="submit-cta"><b>Missing a trick?</b>' +
      '<span class="submit-where">' +
        /* GitHub's mark, so it is obvious where the link goes before it is
           clicked. Single path, filled with currentColor. */
        '<svg class="gh" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>' +
        'Submit it on GitHub' +
        '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>' +
      '</span>' +
    '</span>' +
  '</a>';
}

function renderList() {
  var hits = TRICKS.filter(matches);
  $('#resultCount').textContent = hits.length === TRICKS.length
    ? TRICKS.length + ' tricks'
    : hits.length + ' of ' + TRICKS.length + ' tricks';
  var cards = hits.map(function (t) {
    return '<button class="trick-card" data-slug="' + t.slug + '">' +
      isoSlot(t.slug, 'iso-thumb', false) +
      '<span class="tc-name">' + esc(t.name) + '</span>' +
      '<span class="tc-meta">' + diffChip(t.difficulty) +
        '<span class="cat">' + esc(t.category) + '</span>' +
        '<span class="tc-stars">' + starsHTML(t.slug, false) + '</span></span>' +
      '<span class="tc-blurb">' + esc(t.howto) + '</span></button>';
  }).join('');
  /* The submit tile is outside the map, so it is still there when the filters
     match nothing: there is always somewhere to add what is missing. */
  $('#trickCards').innerHTML =
    (hits.length ? '' : '<div class="empty">No trick matches that. Try a looser search, or Reset.</div>') +
    cards + submitTile();
  renderChips();
  watchIso($('#trickCards'));
}

/* ── trick detail ─────────────────────────────────────────────────────── */
function refList(rows) {
  if (!rows.length) return '<div class="hint">None listed.</div>';
  return '<ul class="reflist">' + rows.map(function (r) {
    var name = r.slug
      ? '<button class="rname" data-goto="' + r.slug + '">' + esc(r.name) + '</button>'
      : '<span class="rname">' + esc(r.name) + '</span>';
    return '<li>' + name + (r.note ? ' <span class="rnote">' + esc(r.note) + '</span>' : '') + '</li>';
  }).join('') + '</ul>';
}

function openTrick(t) {
  var n = stars(t.slug);
  var html =
    '<button class="back-link" id="btnBack">&larr; All tricks</button>' +
    '<div class="detail-head">' +
      '<h2>' + esc(t.name) + '</h2>' +
      '<div class="tc-meta">' + diffChip(t.difficulty) +
        '<span class="cat">' + esc(t.category) + '</span>' +
        (t.originator ? '<span class="originator">by ' + esc(t.originator) + '</span>' : '') +
        starsHTML(t.slug, true) +
      '</div>' +
    '</div>' +
    '<div class="detail-grid">' +
      '<section class="panel span-all"><div class="hero">' +
        '<div>' + isoSlot(t.slug, 'iso-panel', true) + '</div>' +
        '<div><h3 class="mod-h">How to</h3><p class="howto">' + esc(t.howto) + '</p></div>' +
      '</div></section>' +

      '<section class="panel span-all">' +
        '<h3 class="mod-h">Step by step control inputs' +
          '<small>Mode 2. Arrow: stick moving. Dot at the end: held. Empty centre: centered.</small></h3>' +
        '<ol class="steps' + (t.inputs ? ' with-sticks' : '') + '">' +
          t.steps.map(function (s, i) {
            var inp = t.inputs && t.inputs[i];
            return '<li>' +
              (inp ? '<div class="step-sticks" title="' + esc(stickWords(inp)) + '">' +
                       stickSVG(inp, stickWords(inp)) +
                       '<span class="stick-words">' + esc(stickWords(inp)) + '</span></div>'
                   : '') +
              '<div class="step-text">' + esc(s) + '</div></li>';
          }).join('') + '</ol></section>' +

      '<section class="panel"><h3 class="mod-h">Mastery levels <small>tap a star to record where you are</small></h3>' +
        '<ul class="mastery">' + t.mastery.map(function (m, i) {
          return '<li class="' + (i < n ? 'reached' : '') + '">' +
            '<span class="lvl">' + '★'.repeat(i + 1) + '</span>' + esc(m) + '</li>';
        }).join('') + '</ul></section>' +

      '<section class="panel"><h3 class="mod-h">Prerequisites &amp; where to practice</h3>' +
        '<ul class="ticks">' + t.prereqs.map(function (p) {
          return '<li>' + esc(p) + '</li>';
        }).join('') + '</ul>' +
        (t.practice ? '<p class="hint" style="margin:.7rem 0 0">' + esc(t.practice) + '</p>' : '') +
      '</section>' +

      '<section class="panel"><h3 class="mod-h">Common mistakes</h3>' +
        '<ul class="crosses">' + t.mistakes.map(function (m) {
          return '<li>' + esc(m) + '</li>';
        }).join('') + '</ul></section>' +

      '<section class="panel"><h3 class="mod-h">Variations</h3>' + refList(t.variations) + '</section>' +
      '<section class="panel"><h3 class="mod-h">Related tricks</h3>' + refList(t.related) + '</section>' +
    '</div>' +
    /* The book links each source label in its footer; so does this. Labels
       without a URL in the dataset still print, as they do on the page. */
    '<div class="sources-line"><b>Sources:</b> ' + t.sources.map(function (label) {
      var hit = (t.links || []).filter(function (l) { return l.label === label; })[0];
      return hit
        ? '<a href="' + esc(hit.url) + '" target="_blank" rel="noopener">' + esc(label) + '</a>'
        : esc(label);
    }).join(' &middot; ') +
      ' <span class="sep">&nbsp;|&nbsp;</span> ' +
      /* #page= takes the physical page, which is what pdfPage counts; the
         printed folio is what the reader sees, so show that. Viewers that
         ignore the fragment just open the book at the front. */
      '<a href="' + PDF_HREF + '#page=' + t.pdfPage + '" target="_blank" rel="noopener">' +
        'The Tricktionary v1.0, p.' + t.page + '</a></div>';

  $('#trickDetail').innerHTML = html;
  $('#trickDetail').hidden = false;
  $('#trickList').hidden = true;
  loadIso(); paintIso();
  window.scrollTo(0, 0);
}

function closeTrick() {
  $('#trickDetail').hidden = true;
  $('#trickList').hidden = false;
}

/* ── progression ──────────────────────────────────────────────────────── */
function renderProgCount() {
  var done = TRICKS.filter(function (t) { return stars(t.slug) > 0; }).length;
  $('#progCount').textContent = done ? done + '/' + TRICKS.length : '';
  if ($('#tab-progression').classList.contains('active')) renderProgression();
  if ($('#tab-tricks').classList.contains('active')) {
    /* keep the list's star read-outs and the progress filter honest */
    if (!$('#trickDetail').hidden) return;
    renderList();
  }
}

function renderProgression() {
  var done = TRICKS.filter(function (t) { return stars(t.slug) > 0; }).length;
  var mastered = TRICKS.filter(function (t) { return stars(t.slug) === 3; }).length;
  var pct = Math.round(done / TRICKS.length * 100);

  $('#progSummary').innerHTML =
    '<div class="prog-overall">' +
      '<span class="big">' + pct + '%</span>' +
      '<span class="bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="hint">' + done + ' of ' + TRICKS.length + ' landed &middot; ' +
        mastered + ' mastered</span>' +
    '</div>';

  $('#progTiers').innerHTML = PROGRESSION.map(function (tier) {
    var landed = tier.items.filter(function (i) { return stars(i.slug) > 0; }).length;
    var p = Math.round(landed / tier.items.length * 100);
    return '<section class="panel" style="--tier:var(--tier-' + tier.tier.toLowerCase() + ')">' +
      '<div class="tier-head"><h3>' + diffChip(tier.tier) + '</h3>' +
        '<span class="bar tier"><i style="width:' + p + '%"></i></span>' +
        '<span class="count">' + landed + '/' + tier.items.length + '</span></div>' +
      '<ul class="prog-list">' + tier.items.map(function (i) {
        var n = stars(i.slug);
        return '<li><div class="prog-row' + (i.variation ? ' indent' : '') + (n ? ' done' : '') + '">' +
          '<input type="checkbox" data-check="' + i.slug + '"' + (n ? ' checked' : '') +
            ' aria-label="' + esc(i.name) + '">' +
          '<button class="pname" data-goto="' + i.slug + '">' + esc(i.name) + '</button>' +
          starsHTML(i.slug, false) +
        '</div></li>';
      }).join('') + '</ul></section>';
  }).join('');
}

/* ── basics ───────────────────────────────────────────────────────────── */
/* ── twin-stick input glyphs ──────────────────────────────────────────── */
/* A port of stick_glyph.py from the book's renderer, to its proportions: a
   square gate, a circular travel limit at 0.86r, a short crosshair, and the
   input drawn at 0.82r from centre. An arrow means the stick is moving; a
   filled dot means it is held there; an empty centre with a small grey dot
   means centered. Mode 2 throughout: left is throttle/yaw, right is
   pitch/roll. Kept parametric rather than exported as art because the whole
   glyph is a function of (dx, dy, held). */
var STICK_R = 11, STICK_GAP = 10;
var STICK_W = STICK_R * 4 + STICK_GAP, STICK_H = STICK_R * 2;

function stickOne(cx, cy, vecs, held) {
  var r = STICK_R;
  var out =
    '<rect class="stick-gate" x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (2 * r) +
      '" height="' + (2 * r) + '" rx="3"/>' +
    '<circle class="stick-limit" cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.86).toFixed(2) + '"/>' +
    '<path class="stick-cross" d="M' + (cx - r * 0.5) + ' ' + cy + 'H' + (cx + r * 0.5) +
      'M' + cx + ' ' + (cy - r * 0.5) + 'V' + (cy + r * 0.5) + '"/>';

  if (!vecs || !vecs.length) {
    return out + '<circle class="stick-centre" cx="' + cx + '" cy="' + cy + '" r="1.6"/>';
  }
  vecs.forEach(function (v) {
    /* the data is y-up like the book; SVG is y-down, so dy is negated here */
    var ex = cx + v[0] * r * 0.82, ey = cy - v[1] * r * 0.82;
    out += '<path class="stick-in" d="M' + cx + ' ' + cy + 'L' + ex.toFixed(2) + ' ' + ey.toFixed(2) + '"/>';
    if (held) {
      out += '<circle class="stick-hold" cx="' + ex.toFixed(2) + '" cy="' + ey.toFixed(2) + '" r="2.6"/>';
    } else {
      var ang = Math.atan2(ey - cy, ex - cx), s = 4.4;
      var a1 = ang + Math.PI * 150 / 180, a2 = ang - Math.PI * 150 / 180;
      var tx = ex + s * 0.5 * Math.cos(ang), ty = ey + s * 0.5 * Math.sin(ang);
      out += '<path class="stick-head" d="M' + tx.toFixed(2) + ' ' + ty.toFixed(2) +
             'L' + (tx + s * Math.cos(a1)).toFixed(2) + ' ' + (ty + s * Math.sin(a1)).toFixed(2) +
             'L' + (tx + s * Math.cos(a2)).toFixed(2) + ' ' + (ty + s * Math.sin(a2)).toFixed(2) + 'Z"/>';
    }
  });
  return out;
}

/* `inp` is {L, R, Lh, Rh} as stored in data.js; L/R are a list of vectors or
   null for centered. */
function stickSVG(inp, title) {
  var cy = STICK_R, lx = STICK_R, rx = lx + 2 * STICK_R + STICK_GAP;
  return '<svg class="sticks" viewBox="0 0 ' + STICK_W + ' ' + STICK_H + '" role="img" aria-label="' +
    esc(title || 'Stick inputs') + '"><title>' + esc(title || 'Stick inputs') + '</title>' +
    stickOne(lx, cy, inp && inp.L, inp && inp.Lh) +
    stickOne(rx, cy, inp && inp.R, inp && inp.Rh) + '</svg>';
}

/* Plain-language read-out of a glyph, so the inputs are not image-only */
var AXES = {
  L: [['yaw left', 'yaw right'], ['throttle down', 'throttle up']],
  R: [['roll left', 'roll right'], ['pitch down', 'pitch up']]
};
function stickWords(inp) {
  var said = [];
  ['L', 'R'].forEach(function (side) {
    var vecs = inp && inp[side];
    if (!vecs || !vecs.length) return;
    vecs.forEach(function (v) {
      var parts = [];
      if (v[0]) parts.push(AXES[side][0][v[0] > 0 ? 1 : 0]);
      if (v[1]) parts.push(AXES[side][1][v[1] > 0 ? 1 : 0]);
      if (parts.length) said.push(parts.join(' + ') + (inp[side + 'h'] ? ', held' : ''));
    });
  });
  return said.length ? said.join(' · ') : 'Sticks centered';
}

function renderBasics() {
  /* The four examples the book prints on its Controls & conventions page */
  var examples = [
    [{ L: [[0, 1]], Lh: true, R: null }, 'Throttle up, held'],
    [{ L: null, R: [[0, -1]] }, 'Full pitch down'],
    [{ L: null, R: [[-1, 0]] }, 'Roll left'],
    [{ L: [[1, 0]], R: [[0, 1]] }, 'Yaw right, pitch up']
  ];
  $('#stickExamples').innerHTML = examples.map(function (e) {
    return '<div class="stick-ex">' + stickSVG(e[0], e[1]) +
           '<div class="cap">' + esc(e[1]) + '</div></div>';
  }).join('');

  $('#diffScale').innerHTML = DIFFS.map(function (d) {
    var n = TRICKS.filter(function (t) { return t.difficulty === d; }).length;
    return '<div class="scale-row">' + diffChip(d) +
      '<p>' + esc(DIFF_BLURB[d]) + '</p>' +
      '<span class="n">' + n + ' tricks</span></div>';
  }).join('') + '<p class="hint" style="margin:.8rem 0 0">' + TRICKS.length + ' tricks in all.</p>';
}

/* ── glossary ─────────────────────────────────────────────────────────── */
function renderGlossary(q) {
  q = (q || '').toLowerCase();
  var hits = GLOSSARY.filter(function (g) {
    return !q || (g.term + ' ' + g.def).toLowerCase().indexOf(q) >= 0;
  });
  $('#glossaryList').innerHTML = hits.length ? hits.map(function (g) {
    return '<div><b>' + esc(g.term) + '</b><p>' + esc(g.def) + '</p></div>';
  }).join('') : '<div class="empty">No term matches that.</div>';
}

/* ── settings ─────────────────────────────────────────────────────────── */
function renderSources() {
  $('#sourceList').innerHTML = SOURCES.map(function (s) {
    return '<div class="source-row"><div>' + esc(s.title) + '</div>' +
      '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a></div>';
  }).join('');
}

function exportProgress() {
  var payload = {
    app: 'thetricktionary',
    version: 1,
    exported: new Date().toISOString(),
    theme: document.documentElement.className,
    progress: progress
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tricktionary-progress.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  $('#ioStatus').textContent = 'Exported ' + Object.keys(progress).length + ' tricks.';
}

function importProgress(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var data;
    try { data = JSON.parse(reader.result); } catch (e) {
      $('#ioStatus').textContent = 'That file is not valid JSON.'; return;
    }
    if (!data || typeof data.progress !== 'object' || data.progress === null) {
      $('#ioStatus').textContent = 'That file has no Tricktionary progress in it.'; return;
    }
    /* Merge rather than replace, keeping whichever side has the higher star
       level, so importing an old backup can never take progress away. */
    var added = 0;
    Object.keys(data.progress).forEach(function (slug) {
      if (!bySlug[slug]) return;
      var n = Math.max(0, Math.min(3, parseInt(data.progress[slug], 10) || 0));
      if (n > (progress[slug] || 0)) { progress[slug] = n; added++; }
    });
    saveProgress();
    if (data.theme === 'light' || data.theme === 'dark') setTheme(data.theme);
    renderList(); renderProgression();
    $('#ioStatus').textContent = added
      ? 'Imported: ' + added + ' tricks updated.'
      : 'Nothing to add; this file matched what is already here.';
    toast('Progress imported');
  };
  reader.readAsText(file);
}

/* ── wiring ───────────────────────────────────────────────────────────── */
function init() {
  setTheme(load(KEY_THEME, null) === 'light' ? 'light' : 'dark');
  renderChips(); renderList(); renderProgression(); renderBasics();
  renderGlossary(''); renderSources(); renderProgCount();

  /* nav */
  $$('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.dataset.tab;
      /* On a phone the last slot is More, which opens a sheet instead */
      if (name === 'settings' && window.matchMedia('(max-width: 700px)').matches) {
        var sheet = $('#moreSheet');
        sheet.classList.toggle('open');
        b.classList.toggle('sheet-open', sheet.classList.contains('open'));
        return;
      }
      location.hash = name;
      if ((location.hash || '').replace(/^#/, '') === name) route();
    });
  });
  $$('.more-tile').forEach(function (b) {
    b.addEventListener('click', function () { location.hash = b.dataset.more; });
  });

  /* filters */
  $('#trickSearch').addEventListener('input', function (e) {
    filters.q = e.target.value.trim().toLowerCase();
    renderList();
  });
  $('.filters').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    filters[chip.dataset.key] = chip.dataset.value;
    renderList();
  });
  $('#btnClearFilters').addEventListener('click', function () {
    filters = { q: '', diff: '', cat: '', prog: '' };
    $('#trickSearch').value = '';
    renderList();
  });
  $('#btnRandomTrick').addEventListener('click', function () {
    var hits = TRICKS.filter(matches);
    if (!hits.length) { toast('Nothing matches that filter'); return; }
    location.hash = 'trick/' + hits[Math.floor(Math.random() * hits.length)].slug;
  });

  /* the whole content area handles card clicks, star clicks, cross-links and
     progression checkboxes, so nothing needs rebinding after a re-render */
  $('.content').addEventListener('click', function (e) {
    var star = e.target.closest('[data-star]');
    if (star) {
      var cur = stars(star.dataset.slug), lvl = +star.dataset.star;
      setStars(star.dataset.slug, cur === lvl ? lvl - 1 : lvl);
      var t = bySlug[star.dataset.slug];
      if (t && !$('#trickDetail').hidden) openTrick(t);
      renderProgression();
      return;
    }
    var goto = e.target.closest('[data-goto]');
    if (goto) { location.hash = 'trick/' + goto.dataset.goto; return; }

    var card = e.target.closest('.trick-card');
    if (card) { location.hash = 'trick/' + card.dataset.slug; return; }

    if (e.target.id === 'btnBack') { location.hash = 'tricks'; }
  });

  $('.content').addEventListener('change', function (e) {
    var box = e.target.closest('[data-check]');
    if (!box) return;
    /* Ticking records a landing (one star); unticking clears the trick out
       entirely, stars and all. */
    setStars(box.dataset.check, box.checked ? Math.max(1, stars(box.dataset.check)) : 0);
    renderProgression();
  });

  $('#glossarySearch').addEventListener('input', function (e) { renderGlossary(e.target.value); });

  /* settings */
  $('#btnThemeDark').addEventListener('click', function () { setTheme('dark'); });
  $('#btnThemeLight').addEventListener('click', function () { setTheme('light'); });
  $('#btnExport').addEventListener('click', exportProgress);
  $('#btnImport').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (e) {
    if (e.target.files[0]) importProgress(e.target.files[0]);
    e.target.value = '';
  });
  $('#btnResetProgress').addEventListener('click', function () {
    if (!confirm('Clear every mastery star? This cannot be undone.')) return;
    progress = {};
    saveProgress();
    renderList(); renderProgression();
    $('#ioStatus').textContent = 'Progress cleared.';
    toast('Progress cleared');
  });

  window.addEventListener('hashchange', route);
  route();
}

document.addEventListener('DOMContentLoaded', init);
