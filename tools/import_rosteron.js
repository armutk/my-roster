/**
 * import_rosteron.js — Turn a copy of the RosterOn ESS roster page into roster.json.
 *
 * WHY THIS EXISTS
 * ---------------
 * The handwritten roster was wrong twice (three shifts missing, three under the
 * wrong shift type). RosterOn ESS is the authoritative source, so the roster should
 * always be rebuilt from it rather than transcribed by hand.
 *
 * USAGE
 *   1. Log in to https://mha.allocate-cloud.com.au/MHAPROD/Mobile/ and open Roster.
 *   2. Select all (Ctrl+A) and copy (Ctrl+C) the roster list.
 *   3. Save it to a file, then:
 *          node tools/import_rosteron.js path/to/copied.txt
 *      or pipe it:
 *          node tools/import_rosteron.js < copied.txt
 *
 * It prints a DIFF before writing, so a missing or changed shift is impossible to
 * miss. Pass --dry to preview without writing.
 *
 * MERGE BEHAVIOUR
 * RosterOn ESS only lists shifts from today forward. Existing shifts that fall
 * BEFORE the earliest imported date are kept, so re-importing later never wipes
 * out roster history.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'src/data/roster.json');

const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ------------------------------------------------------------------ */

function readInput() {
  const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (fileArg) return fs.readFileSync(fileArg, 'utf8');
  if (process.stdin.isTTY) {
    console.error('No input. Pass a file path or pipe the copied roster text in.');
    process.exit(1);
  }
  return fs.readFileSync(0, 'utf8');
}

/**
 * RosterOn ESS renders each shift as:
 *    Wed 26/08/2026 - WMH Neonatal Postnatal Support Program
 *    07:00 - 15:30
 *    Buddy Shift            <- shift code OR descriptive label
 *    Neonatal Postnatal Support Nurse
 */
function parse(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerRe = /^([A-Z][a-z]{2})\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(.+)$/;
  const timeRe = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/;

  const shifts = [];
  for (let i = 0; i < lines.length; i++) {
    const h = headerRe.exec(lines[i]);
    if (!h) continue;

    // Find the time line within the next few lines.
    let t = null, tIdx = -1;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const m = timeRe.exec(lines[j]);
      if (m) { t = m; tIdx = j; break; }
    }
    if (!t) {
      console.warn(`  ! No time found for "${lines[i]}" — skipped.`);
      continue;
    }

    const [, , dd, mm, yyyy, unit] = h;
    const date = `${yyyy}-${mm}-${dd}`;
    const start = `${t[1]}:${t[2]}`;
    const end = `${t[3]}:${t[4]}`;
    const label = lines[tIdx + 1] || '';

    shifts.push({ date, start, end, unit: unit.trim(), label: label.trim() });
  }
  return shifts;
}

/** Elapsed hours, handling a shift that runs past midnight. */
function elapsedHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function classify(shift, shiftTypes) {
  // Prefer an exact match against a configured shift type.
  for (const [key, def] of Object.entries(shiftTypes)) {
    if (def.start === shift.start && def.end === shift.end) {
      return { shiftType: key, paidHours: def.paidHours, exact: true };
    }
  }
  // Otherwise infer, and deduct the clause 44.1(a) unpaid meal break.
  const elapsed = elapsedHours(shift.start, shift.end);
  const [sh] = shift.start.split(':').map(Number);
  const [eh] = shift.end.split(':').map(Number);
  const crossesMidnight = eh * 60 < sh * 60;
  const shiftType = crossesMidnight || sh >= 21 || sh < 5 ? 'night' : eh >= 18 ? 'afternoon' : 'day';
  return { shiftType, paidHours: Math.round((elapsed - 0.5) * 100) / 100, exact: false };
}

/* ------------------------------------------------------------------ */

const dry = process.argv.includes('--dry');
const raw = readInput();
const parsed = parse(raw);

if (!parsed.length) {
  console.error('No shifts parsed. Check the copied text includes lines like "Wed 26/08/2026 - <unit>".');
  process.exit(1);
}

const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const shiftTypes = existing.shiftTypes;

const imported = parsed.map((s) => {
  const c = classify(s, shiftTypes);
  const d = new Date(Number(s.date.slice(0, 4)), Number(s.date.slice(5, 7)) - 1, Number(s.date.slice(8, 10)));
  const out = {
    date: s.date,
    day: DOW_LONG[d.getDay()],
    shiftType: c.shiftType,
    start: s.start,
    end: s.end,
    paidHours: c.paidHours,
  };
  // Keep a descriptive label (e.g. "Buddy Shift"); drop the raw shift codes.
  if (s.label && !/^\d{4}-\d{4}/.test(s.label)) out.note = s.label;
  if (!c.exact) out._review = `Times ${s.start}-${s.end} don't match a configured shift type; paid hours inferred.`;
  return out;
});

// Merge: keep existing shifts earlier than the import window.
const earliest = imported.reduce((a, s) => (s.date < a ? s.date : a), imported[0].date);
const retained = (existing.shifts || []).filter((s) => s.date < earliest);
const merged = [...retained, ...imported].sort((a, b) => a.date.localeCompare(b.date));

/* ---------------------------- diff ---------------------------- */

const before = new Map((existing.shifts || []).map((s) => [s.date, s]));
const after = new Map(merged.map((s) => [s.date, s]));
const allDates = [...new Set([...before.keys(), ...after.keys()])].sort();

const added = [], changed = [], removed = [];
for (const d of allDates) {
  const b = before.get(d), a = after.get(d);
  if (!b && a) added.push(`  + ${d} ${a.day.slice(0,3)} ${a.shiftType.padEnd(9)} ${a.start}-${a.end}`);
  else if (b && !a) removed.push(`  - ${d} ${b.day.slice(0,3)} ${b.shiftType.padEnd(9)} ${b.start}-${b.end}`);
  else if (b && a && (b.shiftType !== a.shiftType || b.start !== a.start || b.end !== a.end || b.paidHours !== a.paidHours)) {
    changed.push(`  ~ ${d} ${a.day.slice(0,3)}  ${b.shiftType} ${b.start}-${b.end}  ->  ${a.shiftType} ${a.start}-${a.end}`);
  }
}

const hrs = (list) => list.reduce((s, x) => s + x.paidHours, 0);
console.log(`\nRosterOn import — parsed ${imported.length} shifts (${imported[0].date} to ${imported[imported.length-1].date})`);
if (retained.length) console.log(`Retained ${retained.length} earlier shift(s) already on file.`);
console.log(`\n  Before: ${(existing.shifts||[]).length} shifts / ${hrs(existing.shifts||[])} h`);
console.log(`  After:  ${merged.length} shifts / ${hrs(merged)} h`);

if (added.length)   console.log(`\nADDED (${added.length}):\n${added.join('\n')}`);
if (changed.length) console.log(`\nCHANGED (${changed.length}):\n${changed.join('\n')}`);
if (removed.length) console.log(`\nREMOVED (${removed.length}):\n${removed.join('\n')}`);
if (!added.length && !changed.length && !removed.length) console.log('\nNo changes — roster already matches RosterOn.');

const review = merged.filter((s) => s._review);
if (review.length) {
  console.log(`\nNEEDS REVIEW (${review.length}):`);
  review.forEach((s) => console.log(`  ? ${s.date} — ${s._review}`));
}

if (dry) { console.log('\n--dry: nothing written.'); process.exit(0); }

/* ---------------------------- write ---------------------------- */

merged.forEach((s) => delete s._review);
existing.shifts = merged;
existing.meta = existing.meta || {};
existing.meta.source = 'RosterOn ESS (Mercy Health) — https://mha.allocate-cloud.com.au/MHAPROD/Mobile/';
existing.meta.sourceRetrieved = new Date().toISOString().slice(0, 10);
if (imported[0].unit) existing.meta.unit = existing.meta.unit || parsed[0].unit;

fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2) + '\n');
console.log(`\nWrote ${path.relative(root, jsonPath)}`);

execFileSync(process.execPath, [path.join(__dirname, 'sync_fallback.js')], { stdio: 'inherit' });
console.log('Done. Commit and push to deploy.');
