# SinghoClock

Live: <https://maxander08.github.io/singhoah/> (GitHub Pages) — plus the app family:
wallet <…/wallet.html>, launchpad <…/launch.html>.

A millisecond clock wearing the *design scheme* of Mini Metro's signage —
recreated as a scheme only, nothing metro-themed: flat warm paper, bold geometric
sans (**Saans**, variable, `MONO` axis pinned so every glyph advances exactly
0.6 em — the clock never jitters), sharp corners, no shadows or gradients, one
solid transit-blue chip for anything hovered/selected, circles reserved for
"station" dots. Every dropdown opens directly below its button, left edge to
left edge, clamped to the viewport on phones.

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
- **One standardized chrome across all five apps**: the same topbar (language
  picker, night shift, Launchpad, cross-app links, SMate, account chip), the
  same borderless Mini-Metro buttons, anchored dropdowns and hidden
  scrollbars on Clock, Wallet, Launchpad, Settings and Scribe.
- **Real-clock sync**: three rounds of NTP-style samples against `timeapi.io`
  (`offset = server + rtt/2 − receive`), median of the fast ones, re-checked every
  5 minutes or on demand. If no millisecond-resolution API answers, a CORS CDN's
  `Date` header is used as a second-resolution fallback (truncation-compensated, and
  flagged as such in the status bar). Small corrections (≤ 2 s) are *slewed*
  in over a fraction of a second instead of jumping, so the millisecond digits
  never visibly skip; the tab also re-syncs the moment it becomes visible again
  after being backgrounded or the device slept.
- **Always-synced, hands-free**: a light one-round check runs every 60 s (full
  3-round calibration at boot, on demand, on wake, and every 15 min), and the
  successful samples are fitted to a device drift *rate* that continuously
  compensates between checks — the display stays pinned to true time instead of
  wandering until the next sync. Failed checks retry themselves with back-off
  (10 s → 60 s), so there is never a need to press Re-sync.
- **Every time zone, with flags** — a searchable picker listing all 400+
  IANA zones grouped by region, each with its country flag as an embedded SVG
  (IANA's public-domain `zone1970.tab` maps zones to countries; simplified
  `country-flag-icons` vectors — every zone has one: `zone.tab` and the
  tz `backward` links map legacy aliases to their countries, and UTC flies
  the UN flag). The big clock, the date line and the
  readouts all follow the selection, which is persisted in `localStorage`.
- **Twenty-five languages** — a flag toggle for English, Traditional Chinese
  (中文繁體, TW flag), Hindi, Spanish, French, Arabic, Bengali, Russian,
  Portuguese, Urdu, Italian, Indonesian, Korean, Japanese, Malay, German,
  Polish, Danish, Norwegian, Swedish, Finnish, Serbian (Latin), Dutch,
  Belgian Dutch and Greek. Every label, status string and the date line
  follow the choice; the menu scrolls on phones with no visible bar. Every label, status string and the date line follow
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
- **World map** — the *Map* button opens a detailed SVG world
  (Natural Earth 10 m, public domain, 235 countries) in monochrome
  atlas style — dark-grey landmasses with white country borders and a
  15° graticule. Borders stay smooth all the way in: the geometry carries
  ten times the vertices of the previous data set and is quantised to a
  tenth of a pixel, so zooming no longer shows stair-steps. Click a country
  to adopt its zone; countries with several zones open the picker
  pre-filtered to them; the current zone's country is outlined in yellow.
  Zoom up to 16× with the `+`/`−` buttons, the mouse wheel (1.6× per
  notch), a double-click (anchored at the cursor) or a two-finger pinch on
  phones; drag or one-finger swipe to pan at double gain; hover any country
  for a tooltip with its name (in the UI language) and local time; close
  with the `×` button or `Esc`.
  The geometry loads on first map open rather than at page load, so the
  clock itself stays quick to start on phones.
  **Settlements** are labelled the way a street map labels them: dots for
  cities, towns and villages only, with the name in the app's language and
  the local script underneath (`Taipei` over `臺北市`, `Tokyo` over `東京都`),
  plain ink with no background or halo. Which ones appear follows the zoom —
  capitals and megacities at world view, more as you close in — and labels
  never overlap: bigger places claim their space first and every other
  settlement appears as soon as you zoom in far enough to make room.
  Labels hold a constant size on screen. Labels render everywhere the map
  is drawn — on portrait phones the visible bands above and below the
  viewBox get their cities too. Names clip at the viewport edge
  street-map style, so every pointer always carries its name — no stray
  unlabeled dots.
- **IP locator** — the *IP* button shows your public IP with its country
  flag, the city/region/country and coordinates it geolocates to (ipapi.co
  with an ipwho.is fallback), and a one-tap *Use this time zone* action.
- **SinghoWallet** (`wallet.html`) — the wallet as its own app: current
  balance, an expense/income entry form, spending grouped per day, and a
  reports dashboard (month spent/income, daily average, largest expense and
  a 7-day spending chart). The currency defaults to USD. A currency dropdown
  lists every ISO-4217 currency
  plus BTC and ETH with flag, localized name and symbol; the amount field is
  a clean text input with the symbol as prefix and a real *Amount* label (no
  spinner arrows), and the date uses a built-in localized calendar picker.
  Entries persist locally; every label is translated in all twenty-five languages
  and the app is touch-friendly on phones.
- **SinghoLaunch** (`launch.html`) — the launchpad: a small live
  HH:MM:SS:mmm clock widget with a hairline analog dial above it and a
  searchable time-zone picker (persisted per browser), cards for the
  SinghoClock clock and SinghoWallet, translated in all twenty-five languages;
  the clock's top bar links to it via *Launchpad*. A first-ever visit to
  the site lands here instead of the clock. The wordmarks fly 生活 beside
  *SinghoClock* and 錢包 beside *SinghoWallet*.
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
npm run test:browser   # 160 checks in real Chromium, incl. touch-emulated phone (needs the server above)
```

The browser suite verifies the format, that the display equals the system clock,
that glyph slots are pixel-identical in width, night shift, NTP sync and that every
viewport from 360 px up fits without scrolling, and that the window
formats reflow the current window — never a new tab — with one
independently-running zone per cell.

## SinghoScribe — live lecture transcription

A fifth app (`scribe.html`): press **Start**, speak,
and the editable document fills up in real time (interim text shown faint until
finalized), Google-Doc style — editable page, renameable title, silent autosave, word **and character** count with a listening-time
timer, copy / download / clear, autosaved to `singhoah:scribe` (and synced with
the account when signed in). The toolbar adds **undo / redo**, **find &
replace** (Ctrl+F / Ctrl+H, highlighted matches with next/previous, replace one
or all), optional **timestamps** on each dictated paragraph, **import** of
.txt/.md files and **print** (a print stylesheet yields a clean paper copy).
All of it follows the UI language in all twenty-five languages. The **spoken
language** (recognizer) follows the app's UI language automatically — every
one of the twenty-five is offered, plus extras like German, simplified Chinese and
UK English — and can still be overridden by hand; the **transcript
language** is independently selectable. When they differ, each finalized
sentence is translated (MyMemory, free) before being appended. Recognized
speech is vocabulary-corrected, so saying "SinghoScribe", "SinghoWallet" or
"SMate" lands in the document spelled right instead of "sing ho script".
Uses the browser's Web Speech API (Chrome/Edge/Safari; a clear notice
appears where unsupported). On phones the layout adapts: 16px page text
(so iOS never zoom-jumps on focus), a thumb-sized mic, and a condensed bar.

## SinghoMetro — tap-tap fare calculator

A fifth app (`metro.html`): an interactive SVG map of the **Taipei Metro**
(all current lines including the Xinbeitou, Xiaobitan, Xinzhuang and Luzhou
branches) and the **Taoyuan Airport MRT**, drawn as coloured lines that
follow the real recorded track alignments (curves and all, from
OpenStreetMap route relations) with every station as a dot labelled with
its English name and the Chinese name below it — the same family look as
the world map: pan, wheel/pinch zoom, fit-to-screen.

Under the coloured lines a muted OpenStreetMap basemap gives real geography:
rivers, lakes, the coast and the road network — major roads always, and the
full street grid once you zoom in (© OpenStreetMap contributors, ODbL).

Tap one station, then another: the route is computed (fewest transfers,
shortest distance), the route lights up on the map and the bottom bar shows
the fare. Taipei Metro fares use the officially published distance bands
applied to the route distance; Airport MRT fares use the officially
published station-to-station table. The bar also shows the station count,
transfer count and an approximate travel time. **Swap** flips the pair,
**Clear** resets, and the two system tabs switch maps (each remembers its
own pan/zoom). The **Card** button scans an IC card where the device truly
can (Android with NFC, via the Web NFC API): the card is recognized
on-device and you may note its balance in a field stored only in that
browser's localStorage. Browsers cannot read the protected balance from
the card itself, and the panel says exactly that where NFC is missing.
The whole chrome — tabs, buttons, hints — is translated
into all twenty-five languages, and the standard topbar (language, night
shift, Launchpad, Clock, Settings, account chip, SMate) is on the page.

## SinghoSettings — the settings page

A fourth app (`settings.html`) gathers every
preference in one place, in all twenty-five languages: language, appearance (night shift),
clock city, wallet currency (the search understands aliases — type **NTD** and the
Taiwan dollar appears), the account note, and a *Reset local data* action that clears
preferences and per-account snapshots while keeping wallet transactions. Gear buttons
in the clock / wallet / launchpad headers and a launchpad card link to it.

## SMate — the chat assistant

Every page carries a small **SMate** button in the topbar, next to the
account chip, that opens a chat panel. Type commands in any of the fifteen
languages and SMate drives the app through its real controls, fully offline:
set timers (`timer 5`, `計時器 5`), pause/resume/reset them, add a stopwatch,
restart or delete timers and stopwatches (`restart timer`, `delete
stopwatch`), remove a single pane (`remove Taipei`), fly the map to a city
(`map Taipei`), change the home time
zone (`zone Taipei`), switch window layout (`single` / `side` / `2x2` /
`4x4`, including spoken shapes like `2 by 2` or `4 by 4`), flip
analog/digital, night shift, re-sync, full screen, map, IP locator, print,
change the language, navigate between the apps (`open wallet`), and in
SinghoWallet add entries (`add 250 income`), switch Days/Reports or change
the currency. In SinghoScribe it drives the toolbar — `undo`, `redo`,
`copy`, `download`, `print`, `timestamps`, `clear` — and in SinghoSettings
it flips the `theme`.
Commands compose: one sentence can do several things at once —
`set time zones to Jakarta, Taipei, and Singapore in a 2 by 2 window` —
and city names work in any of the twenty-five languages (`雅加達、台北、新加坡`).
`clear all` (or the **Clear all** row in the clock's Window menu) resets the
window to a single home clock; from any other page SMate hops home and
clears there.
The mic button answers in the app's current language where the browser
supports speech recognition, and it knows the Singho vocabulary: the way
speech engines mishear the brand names ("sing ho wallet", "s mate") is
mapped back to **SinghoClock**, **SinghoWallet**, **SinghoScribe**,
**SinghoSettings** and **SMate**, so `open SinghoWallet` works whether it
was typed or spoken. The header line shows online / typing… /
listening / unavailable like a chat app.

**A chat you can talk to.** The conversation persists across pages and
reloads; `Ctrl/⌘+K` summons SMate from anywhere and `Esc` closes it. The
speaker chip reads replies aloud in the app's language (it switches on
automatically when you speak first). Beyond commands, SMate answers
*“what time is it in Tokyo?”* for any city (offline, via `Intl`), sets
reminders (*“remind me in 10”* — the tab title flashes ⏰ when due), does
quick math (`25 * 4`), and offers tappable suggestion chips when idle.
The trash chip in the panel header — or the words `clear chat` — wipes the
conversation and starts fresh. All of it works in the fifteen languages, with
or without the AI chip.

**On-device AI, on by default.** The `AI` chip in the panel header is
armed from the first visit: the deterministic interpreter always gets first
crack at your words, and whatever it misses goes to a small open model
(Qwen2.5-0.5B / SmolLM2-360M) loaded through WebLLM/WebGPU — free,
serverless, private: weights download once (~200-300 MB), cache in
IndexedDB, and inference never leaves the machine. The first fuzzy message
wakes the model instead of failing; the model then either replies
`CMD: …` (executed through the same interpreter, so loose phrasings like
*"the room is too bright"* or *"how much have I spent this week?"* become
real actions or precise answers), or answers directly in your language.
Money questions are grounded: the live balance and the latest ledger rows
are attached to the prompt, so the model sums real numbers, not guesses.
The grammar it may emit covers every action in the app — clocks, timers,
wallet, Scribe, maps, themes, reports, `map <City>`, `remind`, `clear
chat` and more, composable in one sentence. Clicking the chip turns the AI
off for good (or back on). No WebGPU? SMate says so in your language and
the offline brain keeps working — nothing is downloaded, nothing hangs:
every AI call is capped and falls back silently. The interpreter matches
against the app's own translated vocabulary in all twenty-five languages, so a
Spanish command works while the UI is in Urdu.

## Optional Google sign-in (portal)

Clock / wallet / launchpad each carry a small **optional** sign-in portal in the header
(`src/auth.js` + `src/firebase-config.js`). Signed in, you get a profile chip, and your
preferences **and the whole wallet ledger** sync per account across devices and
browsers — live, in both directions (the poller pushes local changes and pulls
newer remote ones every 2.5 s; wallet entries repaint without a reload). The
Firestore database must allow each signed-in user to read/write only
`users/<uid>`: paste `firestore.rules` (shipped in this repo) into
Firebase console → Databases & Storage → Firestore → Rules → Publish (or open `console.firebase.google.com/project/singhoah1/firestore/rules` directly). With the database in
locked mode the portal degrades silently to per-account local snapshots.
Everything stays public without it — no sign-in wall.

This repo ships configured for the live `maxander08.github.io` deployment
(Firebase project `singhoah1`, free Spark tier). For your own fork, point it at your own
project:

1. Go to <https://console.firebase.google.com> → *Add project* (any name, e.g. `singhoah`).
2. In the project: *Build → Authentication → Get started → Sign-in method* → enable
   **Google**.
3. *Project settings → General*: register a **Web app** (`</>` icon) — no hosting needed.
4. Copy the `firebaseConfig` object it shows and paste it into
   **`src/firebase-config.js`** (replace the placeholder values), then `python3 build.py`.
5. *Authentication → Settings → Authorized domains*: add the domain you serve the site
   from (Pages adds `*.github.io` automatically).

### Cloud sync of wallet + preferences (Firestore, still no server)

When signed in, the wallet ledger and the preferences (language, theme, clock city,
launchpad zone) are stored per account in Cloud Firestore (`users/<uid>`): downloaded
on sign-in, written back on every change (last write wins). If Firestore is not
reachable, the portal falls back to per-account snapshots in that browser. To enable:

1. Open <https://console.firebase.google.com/project/singhoah1/firestore> →
   **Create database** → pick a region → **Start in production mode**.
2. In the **Rules** tab, publish exactly this (each user may only touch their own doc):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

Nothing else changes: the portal detects a real config and activates on its own, and
the Firebase SDK is only downloaded when someone actually clicks Sign in. Put the
`PASTE_`/`YOUR_` placeholders back and it goes fully dormant again.

## Layout

```
src/           editable sources (build.py copies them to the folder root)
  index.html   markup
  styles.css   palette + type: Mini-Metro-style scheme (flat, sharp, blue chips)
  app.js       pure logic (node-testable) + thin DOM layer
  flags.js     generated by build_flags.py: zone→country + flag data URIs
test/          app.test.mjs (node:test) · browser.smoke.mjs (Playwright)
               sync.e2e.mjs + fbstore.mjs: two stubbed-Firebase "devices"
               prove push/adopt/no-clobber/live-pull (node test/sync.e2e.mjs)
               i18n.audit.mjs: every language × every page, flags any
               untranslated UI chrome (node test/i18n.audit.mjs)
fonts/         SaansVF.woff2 · SerrifVF.woff2, fetched from displaay.net
flags/         compact SVG flag cache used by build_flags.py
fonts.css      generated: the two faces as base64 data URIs
mapdata.js     generated by build_map.mjs: Natural Earth 10m country paths + settlements
```

Typefaces © Displaay, used here as a UI study of displaay.net.
