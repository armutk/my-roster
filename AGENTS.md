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

1. **RosterOn login is allowed via Bitwarden on the VPS.** Ahmed authorised
   this on 19 Sep 2026 (the old "agents never log in" rule was wrong and is
   retired). Use the Bitwarden login whose URI is the MHAPROD Mobile login
   page. Unlock through `vps-vault` / the existing VPS Bitwarden helper.
   Never print, commit, or paste the username, password, cookies, or
   `BW_SESSION`. Never put credentials in chat. After login, copy the Roster
   list and run the importer.
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

1. Log in to RosterOn ESS with the Bitwarden item (see constraint 1) and open
   the Roster page.
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

### Actual hours and orientation shifts

- **`workedHours` on a shift beats `paidHours`.** When she finishes early, set
  `"workedHours": 6.5` and leave `paidHours` as the rostered figure. The engine
  pays the recorded hours, returns `rosteredHours` + `workedHoursRecorded`, and
  raises an informational note instead of a cl 44.1(a) meal-break warning.
- **Orientation shifts are ordinary-rate day shifts** in the data, named in
  `note` and flagged `"pinned": true`. 24 and 25/08/2026 were never in the
  RosterOn feed (it starts 26/08) and their dates are inferred from the 09/09
  payslip; 08/09/2026 is in the 26 Aug fixture and is paid as "Orientation
  Shift" on the 23/09 payslip. A pinned shift is never removed by an import and
  is never overwritten by an imported row for the same date, because the 9 Sep
  feed dropped 08/09 and that is how the shift went missing.

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
  published as $51.79. `hourlyRateMode` in `payRules.js` is `'exact'`, because
  that is the rate Mercy payroll actually pays: both real payslips print 51.7947
  and round each 8 h shift to $414.36. `'published'` understates every shift by 4c.
- **Laundry allowance is per shift worked** — Appendix 2, Part 2, $0.60, not
  pro-rated, and it applies to orientation shifts too. Both real payslips show
  8.00 units for 8 paid shifts. It is `payRules.laundryAllowance`, applied
  automatically by `payEngine.js`; `laundryAllowance: false` on a shift
  suppresses it.
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
listed in `payRules.exclusions` and shown in the UI. Both payslips issued so far
have been reconciled against the roster (`docs/payslip-reconciliation-*.md`), and
the app's own estimate has been lined up against them
(`docs/app-vs-payslip.md`, `tools/payslip_compare.js`).

---

## 6. Verifying changes

There is no test framework. Verify by running things, and **show evidence rather
than asserting success**:

- **Pay logic:** `node` against `payRules.js` + `payEngine.js` (both attach to
  `globalThis`, so `eval(fs.readFileSync(...))` works). Hand-check known values,
  each including the $0.60 laundry allowance: weekday day $414.96 · weekday
  afternoon $451.56 · Saturday day $622.14 · Saturday/Sunday afternoon $658.74 ·
  public holiday afternoon $865.92.
  Current totals: **62 shifts / 508 h / $30,631.32** (through 10 Dec 2026).
- **Against a real payslip:** `node tools/payslip_compare.js <from> <to> --detail`
  runs the same engine over one period and prints the fortnight total. It must
  reproduce a payslip exactly when the roster data is complete:
  `2026-08-24 2026-09-06` → $3,429.48 (matches the 09/09/2026 payslip to the cent).
- **Importer:** `node tools/import_rosteron.js tools/fixtures/rosteron-2026-09-09-normalized.txt --dry`
  parses 23 shifts, retains six historical shifts, keeps three pinned shifts and
  reports no changes. `rosteron-2026-09-09.txt` preserves Ahmed's supplied text
  (month headings, ordinal dates, 12-hour times); the normalized fixture converts
  only that layout to the importer's day/date header and 24-hour times. Generic
  "Rostered" status is omitted; no status was supplied for 16 Oct.
  The old 26 Aug fixture still parses 22 shifts: its dry run changes 19 Sep PM to
  AM and removes the eight newly published October shifts. These are expected
  historical differences; never write that old fixture over the current roster.
- **UI:** serve locally (`python -m http.server 8093`) and drive the DOM with
  `python3 tools/ui_check.py` (keep the server running in another shell). Browser
  Use is unavailable on this VPS, so the script drives the cached Playwright
  headless shell over CDP: it clicks all five views, flags `NaN`/`undefined`
  text, prints the console errors, and with `--pay` prints the Pay view's money
  lines. Check no horizontal overflow at 375 px and both themes too.
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

- [ ] **Reconcile against a real payslip** — first payslip check done for
      07/09–20/09/2026, see `docs/payslip-reconciliation-2026-09-20.md`. The
      $36.60 flat afternoon allowance is **confirmed** (5/5 shifts, including
      weekend afternoons) and payroll's base hourly is the exact 1/38th figure
      (51.7947), not the published 51.79. The 1.5 h ordinary-hours gap is
      **explained, not a shortfall**: she finished 1.5 h early on one shift, so
      actual worked hours were 62.5 against 64 nominal. One shortfall stands:
      weekend penalty paid on 2 of 3 weekend shifts, **Sat 19/09** uncoded,
      −$207.18 (or $168.33 if the early finish was that same shift). Query draft:
      `docs/payroll-query-email.md`, unsent. Which shift lost the 1.5 h is still
      unknown — record it with `workedHours` on that shift once known. Public
      holiday at 200% still unchecked.
- [x] **Reconcile the 24/08–06/09/2026 payslip** — done, see
      `docs/payslip-reconciliation-2026-09-06.md`. **No discrepancies**: all four
      pay lines tie to the roster (32 buddy + 16 ordinary + 2 orientation days),
      the 3 afternoon allowances, 8 laundry units, 12% super on superable-only
      earnings and net pay all reconcile, and YTD figures carry into the 23/09
      payslip to the cent. Open question only: SL accrual runs at 4.61% of hours
      (12 days/yr equivalent) against a possible 15-day entitlement — needs the
      personal leave clause quoted before it goes to payroll.
- [ ] **Push the app-vs-payslip fixes** — rate mode `exact`, laundry allowance,
      three pinned orientation shifts, `workedHours` support, contract card shows
      $51.7947. Verified end to end on 23 Sep: the engine reproduces the 09/09
      payslip at $3,429.48 to the cent, the 07/09–20/09 estimate is $4,124.22
      against $3,839.33 paid (the $284.89 gap is the one uncoded 19/09 weekend
      penalty), `tools/ui_check.py` reports all five views clean, and both
      fixtures re-import without losing 08/09. Cache is `my-roster-v7`; the Pages
      deploy waits on Ahmed's go-ahead.
- [ ] **Confirm the 24 and 25/08/2026 orientation dates** with payroll — inferred
      from the 09/09 payslip, not present in RosterOn.
- [ ] **Sunday night allowance** and **morning shift window** need confirming
      with payroll (§5).
- [ ] **Password change** — Mercy issues the employee number as both username and
      password; Ahmed was advised to have it changed. Status unknown.
- [ ] **Roster beyond 10 Dec 2026** — re-import when published.
- [ ] Multi-user support (her roster + his) was in the original brief as future
      work. Not started; would need a data-model change.

---

*Keep this file honest. If you discover something that contradicts it, fix the
file in the same commit as the code.*

## 10. Roster refresh — 9 Sep 2026

Ahmed supplied 23 shifts from 7 Sep through 16 Oct. All overlapping times
matched; 8 Sep was absent from the supplied window and removed. Added 5, 6,
10, 11, 12, 13, 15 and 16 Oct; retained six shifts before 7 Sep. Updated the
roster unit metadata to the supplied `WMH - D2 Postnatal Unit`. Source text
and normalized importer input are in `tools/fixtures/`. Released with cache
`my-roster-v5`.

## 11. Roster refresh — 19 Sep 2026

Logged into RosterOn ESS from the VPS using Bitwarden (item URI
`https://mha.allocate-cloud.com.au/MHAPROD/Mobile/Account/Login`). Pulled the
live Mobile Roster list: 46 shifts from 21 Sep through 10 Dec 2026. Importer
retained 13 earlier shifts already on file. Added 32 shifts, including the
first night block (21:00–07:30, 10 paid hours). RosterOn no longer listed
24 Sep or 25 Sep (the AFL Grand Final Friday public holiday), so those two
were removed. Night shift type times were filled in (`21:00`–`07:30`) so
paid hours match instead of being inferred. Unit metadata now follows
RosterOn: `WMH Neonatal Postnatal Support Program`. Live capture:
`tools/fixtures/rosteron-2026-09-19.txt`. Working clone:
`/root/workspace/my-roster`. Released with cache `my-roster-v6`.
Current totals: **59 shifts / 484 h / $29,349.12** estimated gross.

## 12. App-versus-payslip fixes — 23 Sep 2026

Both real payslips (09/09 and 23/09) were compared against the engine, and the
estimate was wrong for three reasons. Fixed:

- `hourlyRateMode` moved from `published` to `exact` — Mercy pays the 1/38th
  figure $51.7947, and $51.79 understates every 8-hour shift by about 4 cents.
- The $0.60 laundry allowance per worked shift is now modelled (it appears on
  both payslips), including orientation shifts.
- The three orientation days are in the data for the first time: 24 and 25/08
  (inferred from the 09/09 payslip) and 08/09. They carry `"pinned": true`,
  which the importer honours, because the 9 Sep refresh dropped 08/09.
- `workedHours` on a shift now beats `paidHours`, so a recorded early finish is
  paid as worked while the rostered figure stays visible for reference.

Result: 24/08–06/09 reproduces the payslip at **$3,429.48 to the cent**. For
07/09–20/09 the estimate is **$4,124.22** against **$3,839.33** paid; the whole
$284.89 gap is the 19/09 Saturday weekend penalty Mercy left uncoded, which the
app cannot fix and is now a payroll query (draft at
`docs/payroll-query-email.md`, still unsent). Totals are now **62 shifts /
508 h / $30,631.32**. New tools: `tools/payslip_compare.js` and
`tools/ui_check.py` (CDP-driven UI check, since Browser Use is unavailable
here). Comparison detail: `docs/app-vs-payslip.md`. Not yet pushed — the Pages
release waits on Ahmed.
