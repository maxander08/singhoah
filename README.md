# Singhoah

Live: <https://maxander08.github.io/singhoah/> (GitHub Pages)

A millisecond clock in the visual language of [displaay.net](https://displaay.net) — the
Prague type foundry: warm paper `#f2f0e6`, hairline rules, pigeon-grey uppercase labels,
and their own typefaces. **Saans** (variable, with its `MONO` axis pinned so every glyph
advances exactly 0.6 em — the clock never jitters) renders the time, **Serrif** italic
accents the wordmark.

```
DATE                                          TIME
Tuesday, 25 August 2026                       05:51 UTC

05 : 51 : 35 : 916          ← HH:MM:SS:mmm, live

● Synced · timeapi.io   DEVICE DRIFT +32 MS — CORRECTED      LAST CHECK …   UTC+00:00  ▮▮▮
```

## Features

- **HH:MM:SS:mmm**, driven by `requestAnimationFrame` so milliseconds really move.
- **Date and time above the clock**, formatted with `Intl` (weekday, day, month, year ·
  HH:MM + zone abbreviation).
- **Real-clock sync**: three rounds of NTP-style samples against `timeapi.io`
  (`offset = server + rtt/2 − receive`), median of the fast ones, re-checked every
  5 minutes or on demand. If no millisecond-resolution API answers, a CORS CDN's
  `Date` header is used as a second-resolution fallback (truncation-compensated, and
  flagged as such in the status bar).
- **Every time zone, with flags** — a searchable picker listing all 400+
  IANA zones grouped by region, each with its country flag as an embedded SVG
  (IANA's public-domain `zone1970.tab` maps zones to countries; simplified
  `country-flag-icons` vectors — every zone has one: `zone.tab` and the
  tz `backward` links map legacy aliases to their countries, and UTC flies
  the UN flag). The big clock, the date line and the
  readouts all follow the selection, which is persisted in `localStorage`.
- **Ten languages** — a flag toggle for English, Traditional Chinese
  (中文繁體, TW flag), Hindi, Spanish, French, Arabic, Bengali, Russian,
  Portuguese and Urdu. Every label, status string and the date line follow
  the choice (via `Intl`); Arabic and Urdu flip the document to RTL while the
  `HH:MM:SS:mmm` clock itself stays left-to-right. Remembered like the rest.
- **Window formats, no new tabs** — the top-bar *Window* menu reflows the
  *current* window into a single clock, **side by side** or a **2×2 grid**, and
  the picker's ⧉ button drops that zone into the next empty pane (growing
  1→2→4 as needed). Multi mode swaps the header line for per-cell
  headers — flag + zone, full date, and HH:MM with the zone abbreviation —
  empty cells show "+ Add zone", clicking a
  caption re-picks that cell, and the format + zones persist in `localStorage`
  and the URL (`?layout=2|2x2&zones=…`). For a true second screen,
  `?tz=…&zen=1` still serves a chrome-less window by hand.
- **Analog face** — a toggle (button or `A`) swaps `HH:MM:SS:mmm` for a
  hairline dial with hour, minute, second *and* millisecond hands, all
  sweeping continuously off the same drift-corrected time; in multi-cell
  layouts every zone gets its own dial. The choice is remembered and applied
  pre-paint, like the theme.
- **Timers** — the *Timer* button starts a countdown (1/5/10/25/45/60 min
  presets or any minute value) that joins the window exactly like a zone
  pane: it counts down `HH:MM:SS:mmm` (analogue hands too), tap its caption
  to pause/resume, `×` to clear, finished timers glow yellow. Several timers
  can run side by side with clocks.
- **Stopwatch** — the *Stopwatch* button drops a counting-up
  `HH:MM:SS:mmm` pane into the window (analogue hands sweep too); caption tap
  pauses/resumes, `↺` resets, `×` clears; several stopwatches and timers can
  run alongside zone clocks in any layout.
- **World map** — the *Map* button opens a detailed, label-free SVG world
  (Natural Earth 50 m, public domain, 235 countries) in monochrome
  atlas style — dark-grey landmasses with white country borders and a
  15° graticule, no labels, no colors. Click a country to adopt its zone; countries with
  several zones open the picker pre-filtered to them; the current zone's
  country is outlined in yellow. Works by tap on phones.
- **IP locator** — the *IP* button shows your public IP with its country
  flag, the city/region/country and coordinates it geolocates to (ipapi.co
  with an ipwho.is fallback), and a one-tap *Use this time zone* action.
- **Wallet** — the *Wallet* button opens a small ledger: current balance,
  an expense/income entry form, spending grouped per day, and a reports
  dashboard (month spent/income, daily average, largest expense and a
  7-day spending chart). A currency dropdown lists every ISO-4217 currency
  plus BTC and ETH with flag, localized name and symbol; the amount field
  is a clean text input with the symbol as prefix (no spinner arrows) and
  the date uses a built-in localized calendar picker. Entries persist
  locally; every label is translated in all ten languages and the popup is
  touch-friendly on phones. The wordmark flies 生活 beside *Singhoah*.
  The MAC row states plainly that browsers do not expose MAC addresses to
  web pages.
- **Phone-friendly** — dropdowns open right below their button exactly as on
  desktop (nudged sideways only enough to stay inside the viewport), rows and
  buttons grow to touch size, the search field avoids iOS focus-zoom, and
  side-by-side layouts stack vertically so every pane stays legible.
- **Dark by default** — the colour scheme is true black (`#000000` paper,
  white ink, yellow `#fff200` accents); the toggle switches to the original
  paper-light scheme. The choice is remembered and applied pre-paint.
  Keyboard: `N` theme, `A` analog, `F` full screen, `R` re-sync.
- **Fits any viewport**: the string is exactly 7.2 em wide, so the font size is
  `min(boxWidth / 7.2, boxHeight / 0.84)` — recomputed on resize/rotate.
- Self-contained: the webfonts are embedded as data URIs, so the single folder works
  offline, in an iframe, anywhere.

## Run

```sh
python3 build.py                      # copies src/* here and regenerates fonts.css
python3 -m http.server 4173           # then open http://localhost:4173
```

The committed files in this folder are already built — just serve the folder.

## Test

```sh
npm test          # 29 unit tests for formatting, zones, flags, i18n, sync, layouts, hands, timers, stopwatch, map, wallet
npm run test:browser   # 114 checks in real Chromium, incl. touch-emulated phone (needs the server above)
```

The browser suite verifies the format, that the display equals the system clock,
that glyph slots are pixel-identical in width, night shift, NTP sync and that every
viewport from 360 px up fits without scrolling, and that the window
formats reflow the current window — never a new tab — with one
independently-running zone per cell.

## Layout

```
src/           editable sources (build.py copies them to the folder root)
  index.html   markup
  styles.css   palette + type, taken from displaay.net's own tokens
  app.js       pure logic (node-testable) + thin DOM layer
  flags.js     generated by build_flags.py: zone→country + flag data URIs
test/          app.test.mjs (node:test) · browser.smoke.mjs (Playwright)
fonts/         SaansVF.woff2 · SerrifVF.woff2, fetched from displaay.net
flags/         compact SVG flag cache used by build_flags.py
fonts.css      generated: the two faces as base64 data URIs
mapdata.js     generated by build_map.mjs: Natural Earth 50m country paths
```

Typefaces © Displaay, used here as a UI study of displaay.net.
