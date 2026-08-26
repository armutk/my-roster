# My Roster

A static, installable PWA showing a nurse's shift roster and estimated gross pay.
Live at **https://armutk.github.io/my-roster/**

No build step, no backend. Vanilla HTML/CSS/JS deployed straight to GitHub Pages.

---

## Updating the roster

**RosterOn ESS is the source of truth.** Do not transcribe handwritten rosters —
a handwritten copy was once missing three shifts entirely and had three others
under the wrong shift type (19 shifts / 152 h on paper vs 22 / 176 h in RosterOn).

### The workflow

1. **Log in to RosterOn** at https://mha.allocate-cloud.com.au/MHAPROD/Mobile/
   and open the **Roster** page.
   *This step needs a human — the roster is behind an account login.*

2. **Copy the page** — Ctrl+A then Ctrl+C — and save it to a text file.

3. **Import it:**

   ```bash
   node tools/import_rosteron.js roster.txt --dry
   ```

   This prints a diff — added / changed / removed shifts, before-and-after hours,
   and anything needing review. **Read the diff.** It is the safety net that
   catches a missed or mis-typed shift.

4. Drop `--dry` to write it:

   ```bash
   node tools/import_rosteron.js roster.txt
   ```

   This rewrites `src/data/roster.json` and regenerates the embedded offline copy
   in `src/js/app.js`.

5. **Deploy:**

   ```bash
   git add -A && git commit -m "update roster" && git push
   ```

   GitHub Pages rebuilds in about a minute. Installed phone apps pick it up on
   next open with a connection.

### Doing it with Claude

Leave the RosterOn roster page open in Chrome and ask Claude to update the
roster. It reads the page directly, runs the importer, checks the diff and
deploys. Claude will not enter the login credentials — that part is always
yours.

### Notes on the importer

- **Merging:** RosterOn ESS only lists shifts from today forward. Shifts already
  on file that predate the import window are kept, so re-importing never wipes
  history.
- **Paid hours:** if the times exactly match a configured shift type, its
  `paidHours` is used. Otherwise the 30-minute unpaid meal break (cl 44.1(a)) is
  deducted from elapsed time and the shift is flagged for review.
- **Bump `CACHE_NAME`** in `service-worker.js` when shipping code changes, so
  installed apps don't serve a stale shell.

---

## Layout

```
index.html              app shell
manifest.webmanifest    PWA manifest
service-worker.js       offline cache (bump CACHE_NAME on release)
src/data/roster.json    the roster — edit via the importer
src/css/style.css
src/js/app.js           UI and rendering (contains a GENERATED fallback copy)
src/js/payRules.js      EA rates, clause-referenced and effective-dated
src/js/payEngine.js     per-shift gross pay calculation
tools/import_rosteron.js  RosterOn page  -> roster.json
tools/sync_fallback.js    roster.json    -> fallback in app.js
tools/generate_icons.py   app icons
```

Never hand-edit the `ROSTER_FALLBACK` block in `app.js` — run
`node tools/sync_fallback.js` instead. The two copies drifting apart is what
hid the original roster error.

---

## Pay estimates

Calculated from the **Nurses and Midwives (Victorian Public Sector) Single
Interest Employers Enterprise Agreement 2024-2028**. Every rate in
`src/js/payRules.js` carries its clause reference, source and effective date,
and rates that could not be verified are shown as *Needs verification* rather
than assumed.

Figures are **gross estimates before tax and superannuation**, intended for
planning. They exclude super, PAYG, higher duties, on-call and role allowances.
Check a shift or two against a real payslip before relying on the totals.

When wages change, add a new row to the relevant effective-dated table in
`payRules.js` — don't edit historical rows, so past calculations stay
reproducible.
