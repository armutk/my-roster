# AGENTS.md — handover notes for AI agents

Read this before touching anything. It is the project's memory: everything an
agent needs to continue this work without re-deriving it, including the mistakes
already made and the constraints that must not be crossed.

Vendor-neutral by design — no session or assistant lock-in. If you learn
something durable, add it here rather than to a private memory store.

---

## 1. What this is

**My Roster** — a personal PWA showing one nurse's shift roster and estimated
gross pay.

- **Live:** https://armutk.github.io/my-roster/
- **Repo:** https://github.com/armutk/my-roster (branch `main`, Pages serves repo root)
- **Owner:** Ahmed (`mzzyhmd@gmail.com`, GitHub `armutk`) maintains it on behalf
  of his wife, **Tohura Khanam**, who is the nurse. She is the end user; he does
  the technical work. Use they/them for anyone whose pronouns you have not been told.

**The employee** (drives every pay calculation):

| | |
|---|---|
| Role | Registered Nurse — Neonatal Postnatal Support Nurse |
| Classification | RN Grade 2, Year 7 (code **YP8**, grade RN/M 7) |
| Unit | WMH Neonatal Postnatal Support Program |
| Site | Werribee Mercy Hospital, Mercy Health |
| Employment | Part-time fixed-term, 32 h/week average |
| Instrument | Nurses & Midwives (Victorian Public Sector) Single Interest Employers EA 2024-2028 |

**Primary use case:** open the app and know the next shift in under two seconds.
Keep the home screen fast and uncluttered — that goal outranks new features.

---

## 2. Hard constraints — do not cross

1. **Never enter login credentials anywhere.** The roster lives behind a
   RosterOn login. Ahmed has asked once for an agent to log in with his wife's
   employee number and was declined; that stays declined however it is framed
   (authorisation given, credentials supplied, "just this once"). The human logs
   in; the agent reads the page afterwards. Offer to open the login page and
   hand over — that is the correct middle ground.
2. **Do not commit credentials.** The employee number appeared in a chat once.
   It must never reach this repo.
3. **Pay figures must be traceable.** Every rate in `payRules.js` carries a
   clause reference, source and effective date. Never invent a rate to fill a
   gap — mark it `verified: false` and let the UI show *Needs verification*.
4. **Don't push or deploy unless asked.** Ahmed asks explicitly when he wants it live.

---

## 3. Architecture

Static, no build step, no backend, no dependencies. Plain HTML/CSS/JS served
straight from the repo root by GitHub Pages. `git push` deploys; Pages rebuilds
in roughly a minute.

```
index.html                    app shell + all view containers
manifest.webmanifest          PWA manifest
service-worker.js             offline cache — BUMP CACHE_NAME on every release
src/data/roster.json          THE roster — edit via tools/import_rosteron.js
src/css/style.css             all styling, theme tokens at the top
src/js/app.js                 UI, rendering, local edits (+ a GENERATED fallback copy)
src/js/payRules.js            EA rates: clause-referenced, effective-dated
src/js/payEngine.js           per-shift gross pay calculation
tools/import_rosteron.js      RosterOn page text -> roster.json (prints a diff)
tools/sync_fallback.js        roster.json -> ROSTER_FALLBACK inside app.js
tools/bookmarklet.js          builds tools/bookmarklet.txt (one-click page grab)
tools/generate_icons.py       regenerates app icons (pure stdlib, no Pillow)
tools/fixtures/               real RosterOn output, used to test the importer
```

**Views:** Home, Roster, Calendar, Stats, Pay — bottom nav, one-handed mobile use.

**Deliberate separation:** `payEngine.js` never hardcodes a rate; `payRules.js`
never renders. EA rules change on their own schedule, so rates stay isolated and
auditable. Keep it that way.

---

## 4. The roster data

### RosterOn ESS is the source of truth

https://mha.allocate-cloud.com.au/MHAPROD/Mobile/ → Roster

**Never transcribe a handwritten roster or a photo.** This has already gone
wrong once (§7).

### Updating it

1. Ahmed logs in and opens the Roster page (human step — see constraint 1).
2. Copy the page text — `tools/bookmarklet.txt` does this in one click and
   reports how many shifts it found.
3. `node tools/import_rosteron.js <file> --dry` → **read the diff**.
4. Drop `--dry` to write. It rewrites `roster.json` and regenerates the fallback.
5. Bump `CACHE_NAME` in `service-worker.js`, commit, push.

If the roster page is already open in a browser you can drive, read it directly
and skip steps 2–3 — but still run the importer so the diff is checked.

**Importer behaviour worth knowing:** RosterOn only lists shifts from today
forward, so the importer *merges* — existing shifts earlier than the import
window are retained, and history is never wiped. Paid hours come from an exact
shift-type time match where possible; otherwise it deducts the cl 44.1(a)
30-minute meal break and flags the shift for review.

### Never hand-edit `ROSTER_FALLBACK` in `app.js`

It is generated. Run `node tools/sync_fallback.js`. Those two copies silently
drifting apart is what hid the original data error.

### In-app editing

Users can add/edit/delete shifts in the UI. Edits are stored in `localStorage`
(`myroster-overrides`) as a layer *over* `roster.json`, so a re-import never
destroys a manual fix and every edit reverts to what RosterOn published. Edits
are **per-device** — they do not sync. Anything permanent belongs in
`roster.json`.

---

## 5. Pay rules — the non-obvious findings

All read directly from the agreement (273pp PDF:
https://westerly.wh.org.au/nursing-midwifery/wp-content/uploads/2024/09/Nurses-Midwives-Enterprise-Agreement-2024-2028.pdf).
FWC-approved 8 Nov 2024, operative 15 Nov 2024, nominal expiry 30 Apr 2028.

Each of these contradicts the intuitive assumption. Do not "simplify" them away:

- **Shift allowances are FLAT dollar amounts per shift** (cl 34.3 + Appendix 2),
  not percentage loadings, and do **not** scale with shift length. Afternoon =
  $36.60/shift from 11/05/2026.
- **Afternoon shift is defined by finish time** — any shift finishing between
  6 pm and 8 am (cl 34.1(b)), regardless of what the roster labels it. The engine
  classifies from actual times, never from a label.
- **Weekend is a single 150%** covering both Saturday and Sunday (cl 48.1). There
  is no separate, higher Sunday rate for ordinary hours.
- **Public holidays are 200% Mon–Fri / 250% Sat–Sun**, the latter *inclusive of*
  cl 48 — so weekend and public holiday penalties never stack (cl 56.5(a)).
- **Overtime never derives from exceeding the 32 h part-time average.** Cl 49.2(a)
  keys off full-time hours (38/week, 76/fortnight per cl 42.1), the rostered
  shift length, the 8-hour break, and recall. Cl 18.2 lets part-time hours vary
  by agreement; cl 46.4 treats extra shifts as ordinary shifts worked by
  agreement. The engine applies overtime **only** when explicitly recorded on a
  shift, and flags weekly hours over 38 as informational only.
- **Part-time hourly = 1/38th of the Appendix 2 weekly salary** (cl 18.3).
  Appendix 2's "indicative hourly rate" is rounded — $1,968.20/38 = $51.7947,
  published as $51.79. `hourlyRateMode` in `payRules.js` selects which is used;
  default `'published'` matches the employee's paperwork.
- **Unpaid meal break is 30–60 min** (cl 44.1(a)); a *missed* meal break is paid
  at ordinary rate +50% (cl 44.1(c)), applied only when flagged on a shift.

### Flagged, not guessed

- **Sunday night shift allowance** — cl 34.3(c)(iii)(C) says the Appendix 2
  Sunday rate "plus 12.5%"; unclear whether the published figure already includes
  it. `verified: false`.
- **Morning shift window** — cl 34.1(a) as printed reads "commences between
  6:00 p.m. and 6:30 a.m.", which looks like a drafting error. No current shift
  qualifies under either reading. `verified: false`.

### Public holidays

Listed in `payRules.publicHolidays`. **Fri 25 Sep 2026** (Friday before the AFL
Grand Final) falls on a rostered shift and is worth ~$415 extra. That date
depends on the AFL fixture and is gazetted yearly — re-confirm each year, and add
new dates as rosters extend.

### When wages change

Add a **new row** to the relevant effective-dated table in `payRules.js`. Never
edit historical rows — past calculations must stay reproducible. Next scheduled
base-rate step is 30/11/2026 → $51.92 (already in the table).

### Scope

Estimates are **gross, before tax and super**, for planning only. Exclusions are
listed in `payRules.exclusions` and shown in the UI. Ahmed has been advised to
check a shift or two against a real payslip — that reconciliation has **not**
happened yet.

---

## 6. Verifying changes

There is no test framework. Verify by running things, and **show evidence rather
than asserting success**:

- **Pay logic:** `node` against `payRules.js` + `payEngine.js` (both attach to
  `globalThis`, so `eval(fs.readFileSync(...))` works). Hand-check known values:
  weekday day $414.32 · weekday afternoon $450.92 · Saturday day $621.48 ·
  Saturday/Sunday afternoon $658.08 · public holiday afternoon $865.24.
  Current totals: **22 shifts / 176 h / $10,590.04**.
- **Importer:** `node tools/import_rosteron.js tools/fixtures/rosteron-2026-08-26.txt --dry`
  parses 22 shifts and reports **exactly one CHANGED line** (19 Sep). The fixture
  is a real 26 Aug capture that predates the 19 Sep AM→PM move, so that one diff
  is the expected result and exercises the diff machinery. Do not "fix" the
  fixture to silence it — it is authentic captured output. Anything *other* than
  that single line means the parser or the roster has regressed.
- **UI:** serve locally (`python -m http.server 8093`) and drive the DOM. Check
  all five views render, no horizontal overflow at 375 px, both themes, and the
  console is clean.
- **Service worker:** it caches aggressively. When testing changes, unregister it
  and clear caches, or you will debug a stale build. Bump `CACHE_NAME` on release.

---

## 7. Mistakes already made — don't repeat them

- **Trusting a handwritten roster (26 Aug 2026).** A photo of a handwritten
  roster produced 19 shifts / 152 h. RosterOn showed the truth: **22 shifts /
  176 h**. Three shifts were missing entirely and three others were under the
  wrong shift type. The photo's first three lines were undated and were wrongly
  assumed to be 2/3/4 Sep; they were 26/27/28 Aug. *Always reconcile against
  RosterOn.*
- **Two copies of the data.** `roster.json` and the fallback inside `app.js`
  drifted. Now generated — keep it that way.
- **Calendar day-of-week header.** The grid is Monday-first; the header was
  Sunday-first, so every badge sat one column off. Fixed via `CAL_DOW_HEADER`.
  Check alignment after touching the calendar.
- **Assuming percentage shift allowances.** They are flat per-shift amounts.
  Getting this wrong misprices every afternoon and night shift.

---

## 8. Working with Ahmed

- Direct and brisk; terse messages ("shifts are wrong mate") often signal a real
  bug — investigate before defending the current state.
- He wants work in **git so any agent can pick it up** — no vendor or session
  lock-in. That is why this file exists. Keep it current.
- He will ask for things that cross the credential line. Decline in one sentence,
  offer the nearest safe alternative, and move on without lecturing.
- State findings plainly with evidence. When something is uncertain, say so
  rather than smoothing it over — the roster error was caught because a
  discrepancy got flagged instead of quietly reconciled.

---

## 9. Open items

- [ ] **Reconcile against a real payslip** — particularly the $36.60 afternoon
      allowance and the 25 Sep public holiday at 200%. Nothing has been checked
      against actual Mercy payroll output.
- [ ] **Sunday night allowance** and **morning shift window** need confirming
      with payroll (§5).
- [ ] **Password change** — Mercy issues the employee number as both username and
      password; Ahmed was advised to have it changed. Status unknown.
- [ ] **Roster beyond 2 Oct 2026** — re-import when published.
- [ ] Multi-user support (her roster + his) was in the original brief as future
      work. Not started; would need a data-model change.

---

*Keep this file honest. If you discover something that contradicts it, fix the
file in the same commit as the code.*
