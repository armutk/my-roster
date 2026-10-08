#!/usr/bin/env node
/**
 * sync_rosteron.js — unattended RosterOn -> My Roster sync.
 *
 *   node tools/sync_rosteron.js            # DRY RUN (default): fetch, diff, rehearse, report
 *   node tools/sync_rosteron.js --apply    # real write path: import, fallback, cache bump, commit, push
 *
 * WHAT IT DOES
 *   1. Preflight the clone (on main, no tracked edits; --apply also fetches and
 *      fast-forwards to origin/main and refuses if the clone is ahead or diverged).
 *   2. tools/fetch_rosteron.js logs in to RosterOn ESS headlessly with the Bitwarden
 *      login and saves the raw page text under the private state dir (never the repo).
 *   3. tools/import_rosteron.js <raw> --dry against the clone — the human-readable diff.
 *   4. Rehearsal: the full write path runs in a scratch copy of the working tree
 *      (import -> sync_fallback -> CACHE_NAME bump) and is verified there:
 *      fallback == roster.json, leave_check passes, the 09/09 payslip still
 *      reproduces at $3,429.48, and only the three expected files change.
 *   5. Guards. Anything that smells like a layout change or partial data stops the
 *      run with a non-zero exit and nothing written: unparsed rows, row-count
 *      mismatch, a window that does not start near today, removals after the last
 *      imported date (truncated list), large removals/changes, inferred hours.
 *   6. No change -> one line, status "no_change", exit 0, no notification.
 *      Change  -> summary at <state>/latest-summary.md (+ archived copy), status
 *      "changes_pending"; with --apply the verified files are copied into the clone,
 *      committed and pushed, and the remote head is checked.
 *   7. --notify-cmd "<shell command>" (or ROSTER_SYNC_NOTIFY) gets the summary on
 *      stdin for any outcome except no_change. SYNC_STATUS is set in its env.
 *
 * OPTIONS
 *   --apply                real write path (default is dry run)
 *   --no-push              with --apply: commit locally, do not push
 *   --raw <file>           skip the RosterOn login and use a saved raw export
 *   --state-dir <dir>      default /root/.local/state/my-roster-sync (mode 700)
 *   --force                allow --apply past the "needs a human" guards (exit 7)
 *   --accept-review        allow --apply when imported times need inferred paid hours
 *   --notify-cmd <cmd>     notification hook (see 7)
 *   --verify-live          with --apply: poll the Pages site until the new cache is live
 *   --min-interval-days N  skip (exit 0, nothing logged to last-run.json) if the last
 *                          completed check (no_change / applied / committed) is younger
 *                          than N days. Lets a weekly timer run fortnightly while a
 *                          failed or blocked run is retried the following week.
 *
 * EXIT CODES
 *   0 ok (no change, changes reported, or applied) · 1 unexpected error
 *   2 login rejected · 3 Bitwarden lookup failed · 4 MFA/captcha · 5 password expired
 *   6 layout not recognised / partial data · 7 guard: needs a human look
 *   8 git preflight/commit/push failed · 9 another sync is running
 *
 * Never prints credentials; fetch output is already scrubbed. Raw exports stay in
 * the state dir (they can carry her name) and are pruned after 60 days.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const has = (f) => process.argv.includes(f);
const arg = (name, def) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; };

const APPLY = has('--apply');
const NO_PUSH = has('--no-push');
const FORCE = has('--force');
const ACCEPT_REVIEW = has('--accept-review');
const VERIFY_LIVE = has('--verify-live');
const RAW_ARG = arg('--raw');
const STATE = path.resolve(arg('--state-dir', '/root/.local/state/my-roster-sync'));
const NOTIFY = arg('--notify-cmd', process.env.ROSTER_SYNC_NOTIFY || '');
const MIN_INTERVAL_DAYS = Number(arg('--min-interval-days', '0')) || 0;
const DONE = ['no_change', 'applied', 'committed'];
const TZ = 'Australia/Melbourne';
const FILES = ['src/data/roster.json', 'src/js/app.js', 'service-worker.js'];
const PAYSLIP_CHECK = { from: '2026-08-24', to: '2026-09-06', gross: '3429.48' };
const LIMITS = { removals: 4, changes: 6 };

const EXIT = { ok: 0, error: 1, layout: 6, guard: 7, git: 8, locked: 9 };
class Stop extends Error { constructor(code, status, msg, extra) { super(msg); Object.assign(this, { code, status, extra }); } }

/* ------------------------------ helpers ------------------------------ */

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout || 120000, cwd: opts.cwd || ROOT, env: opts.env || process.env, input: opts.input });
  return { code: r.status === null ? 1 : r.status, out: r.stdout || '', err: (r.stderr || '') + (r.error ? String(r.error) : '') };
}
const git = (args, opts) => run('git', ['-C', (opts && opts.cwd) || ROOT, ...args], { ...opts, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
function mustGit(args, what) { const r = git(args); if (r.code) throw new Stop(EXIT.git, 'git_error', `${what} failed: ${(r.err || r.out).trim().split('\n').pop()}`); return r.out.trim(); }

const todayMel = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const nowMel = () => new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(new Date());
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const money = (n) => (typeof n === 'number' ? `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'n/a');
const hrs = (list) => Math.round(list.reduce((s, x) => s + (Number(x.workedHours ?? x.paidHours) || 0), 0) * 100) / 100;
const label = (s) => `${fmtDate(s.date).replace(/ \d{4}$/, '')}  ${s.shiftType.padEnd(9)} ${s.start}–${s.end}${s.note && !/^\d{4}-\d{4}/.test(s.note) ? `  (${s.note})` : ''}`;

function lock() {
  const dir = path.join(STATE, 'lock');
  try { fs.mkdirSync(dir); } catch (e) {
    let pid = 0; try { pid = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8')); } catch (_) {}
    let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch (_) {}
    if (alive) throw new Stop(EXIT.locked, 'locked', `another sync is running (pid ${pid})`);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  }
  fs.writeFileSync(path.join(dir, 'pid'), String(process.pid));
  return () => fs.rmSync(dir, { recursive: true, force: true });
}

function prune(dir, days) {
  const cutoff = Date.now() - days * 86400000;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const p = path.join(dir, f);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true }); } catch (_) {}
  }
}

function payTotals(rootDir, roster) {
  try {
    const ctx = vm.createContext({ console });
    for (const f of ['payRules.js', 'payEngine.js']) vm.runInContext(fs.readFileSync(path.join(rootDir, 'src/js', f), 'utf8'), ctx, { filename: f });
    const s = ctx.PayEngine.summarise(roster.shifts, roster.shiftTypes);
    return { gross: s.estimatedGross, hours: s.rosteredHours };
  } catch (e) { return { gross: null, error: String(e.message || e) }; }
}

/* ----------------------------- 1. preflight ----------------------------- */

function preflight() {
  const branch = mustGit(['rev-parse', '--abbrev-ref', 'HEAD'], 'branch check');
  if (branch !== 'main') throw new Stop(EXIT.git, 'git_error', `clone is on "${branch}", expected main`);
  const dirty = mustGit(['status', '--porcelain', '--untracked-files=no'], 'status');
  const info = { branch, dirty: dirty.split('\n').filter(Boolean) };
  if (APPLY) {
    if (info.dirty.length) throw new Stop(EXIT.git, 'git_error', `tracked files have local edits: ${info.dirty.join(', ')}`);
    mustGit(['fetch', '--quiet', 'origin', 'main'], 'git fetch');
    const [ahead, behind] = mustGit(['rev-list', '--left-right', '--count', 'HEAD...origin/main'], 'compare').split(/\s+/).map(Number);
    if (ahead) throw new Stop(EXIT.git, 'git_error', `clone is ${ahead} commit(s) ahead of origin/main — push or reset by hand first`);
    if (behind) mustGit(['merge', '--ff-only', '--quiet', 'origin/main'], 'fast-forward');
  }
  info.head = mustGit(['rev-parse', 'HEAD'], 'rev-parse');
  const remote = git(['ls-remote', 'origin', 'refs/heads/main'], { timeout: 30000 });
  info.remoteHead = remote.code ? null : remote.out.split(/\s/)[0];
  return info;
}

/* ------------------------------ 2. fetch ------------------------------ */

function fetchRaw(stamp) {
  if (RAW_ARG) {
    if (!fs.existsSync(RAW_ARG)) throw new Stop(EXIT.error, 'error', `--raw file not found: ${RAW_ARG}`);
    return { ok: true, out: path.resolve(RAW_ARG), replay: true };
  }
  const r = run(process.execPath, [path.join(__dirname, 'fetch_rosteron.js'), '--out-dir', path.join(STATE, 'raw'), '--stamp', stamp], { timeout: 300000 });
  const line = r.out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  let res; try { res = JSON.parse(line); } catch (_) { res = { ok: false, code: r.code || 1, stage: 'fetch', error: 'fetcher gave no status line' }; }
  if (!res.ok) {
    const status = { 2: 'login_failed', 3: 'credentials_error', 4: 'mfa_or_captcha', 5: 'password_expired', 6: 'layout_changed' }[res.code] || 'fetch_error';
    throw new Stop(res.code || 1, status, `RosterOn fetch failed at ${res.stage}: ${res.error}`);
  }
  return res;
}

/* --------------------------- 3. importer --dry --------------------------- */

function importerDry(rawFile) {
  const r = run(process.execPath, [path.join(__dirname, 'import_rosteron.js'), rawFile, '--dry']);
  const out = (r.out + (r.err ? `\n${r.err}` : '')).trim();
  if (r.code) throw new Stop(EXIT.layout, 'layout_changed', `importer --dry failed (exit ${r.code}): ${out.split('\n').pop()}`);
  if (/No time found/.test(r.err)) throw new Stop(EXIT.layout, 'layout_changed', 'importer skipped rows it could not parse — RosterOn layout changed?');
  const count = (h) => { const m = new RegExp(`^${h} \\((\\d+)\\)`, 'm').exec(r.out); return m ? Number(m[1]) : 0; };
  const parsed = /parsed (\d+) shifts \((\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\)/.exec(r.out);
  return { text: out, added: count('ADDED'), changed: count('CHANGED'), removed: count('REMOVED'), review: count('NEEDS REVIEW'),
    parsed: parsed ? { n: Number(parsed[1]), first: parsed[2], last: parsed[3] } : null };
}

/* ----------------------------- 4. rehearsal ----------------------------- */

function rehearse(rawFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-roster-sync-'));
  fs.chmodSync(dir, 0o700);
  fs.cpSync(ROOT, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(path.relative(ROOT, src) ? `/${path.relative(ROOT, src)}` : '') });
  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/roster.json'), 'utf8'));

  const imp = run(process.execPath, [path.join(dir, 'tools/import_rosteron.js'), rawFile], { cwd: dir });
  if (imp.code) throw new Stop(EXIT.layout, 'layout_changed', `rehearsal import failed: ${(imp.err || imp.out).trim().split('\n').pop()}`);
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'src/data/roster.json'), 'utf8'));

  // Structured diff straight from the data (not from importer text).
  const key = (s) => JSON.stringify([s.shiftType, s.start, s.end, s.paidHours]);
  const canon = (s) => JSON.stringify(Object.keys(s).filter((k) => k !== '_review').sort().map((k) => [k, s[k]]));
  const b = new Map(before.shifts.map((s) => [s.date, s]));
  const a = new Map(after.shifts.map((s) => [s.date, s]));
  const diff = { added: [], removed: [], changed: [], relabelled: [] };
  for (const d of [...new Set([...b.keys(), ...a.keys()])].sort()) {
    const x = b.get(d), y = a.get(d);
    if (!x) diff.added.push(y);
    else if (!y) diff.removed.push(x);
    else if (key(x) !== key(y)) diff.changed.push({ before: x, after: y });
    else if (canon(x) !== canon(y)) diff.relabelled.push({ before: x, after: y });
  }
  const unchanged = !diff.added.length && !diff.removed.length && !diff.changed.length && !diff.relabelled.length;

  const result = { dir, before, after, diff, unchanged, checks: [] };
  if (unchanged) return result;

  // Cache bump, exactly as a human release does it.
  const swPath = path.join(dir, 'service-worker.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  const m = /const CACHE_NAME = 'my-roster-v(\d+)';/.exec(sw);
  if (!m) throw new Stop(EXIT.layout, 'repo_layout_changed', 'CACHE_NAME line not found in service-worker.js');
  result.cacheFrom = `my-roster-v${m[1]}`;
  result.cacheTo = `my-roster-v${Number(m[1]) + 1}`;
  fs.writeFileSync(swPath, sw.replace(m[0], `const CACHE_NAME = '${result.cacheTo}';`));

  // Verify the rehearsed tree.
  const check = (name, ok, detail) => { result.checks.push({ name, ok, detail }); if (!ok) throw new Stop(EXIT.layout, 'verification_failed', `rehearsal check failed: ${name}${detail ? ` (${detail})` : ''}`); };
  const app = fs.readFileSync(path.join(dir, 'src/js/app.js'), 'utf8');
  const fb = /  const ROSTER_FALLBACK = ([\s\S]*?\n  });\n/.exec(app);
  let fbJson = null; try { fbJson = fb && JSON.parse(fb[1]); } catch (_) {}
  check('offline fallback in app.js equals roster.json', fbJson && JSON.stringify(fbJson) === JSON.stringify(after));
  check('app.js / payEngine.js / service-worker.js parse', ['src/js/app.js', 'src/js/payEngine.js', 'service-worker.js']
    .every((f) => run(process.execPath, ['--check', path.join(dir, f)]).code === 0));
  const leave = run(process.execPath, [path.join(dir, 'tools/leave_check.js')], { cwd: dir });
  check('tools/leave_check.js reproduces both payslips', leave.code === 0);
  const pay = run(process.execPath, [path.join(dir, 'tools/payslip_compare.js'), PAYSLIP_CHECK.from, PAYSLIP_CHECK.to], { cwd: dir });
  check(`09/09 payslip still reproduces at $${PAYSLIP_CHECK.gross}`, new RegExp(`ESTIMATED GROSS\\s+${PAYSLIP_CHECK.gross.replace('.', '\\.')}`).test(pay.out));
  const pinnedLost = before.shifts.filter((s) => s.pinned).filter((s) => !after.shifts.some((t) => t.date === s.date && t.pinned));
  check('pinned orientation shifts kept', pinnedLost.length === 0, pinnedLost.map((s) => s.date).join(', '));
  const changedFiles = FILES.filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8') !== fs.readFileSync(path.join(dir, f), 'utf8'));
  result.changedFiles = changedFiles;
  check('exactly roster.json, app.js and service-worker.js change', changedFiles.length === 3, changedFiles.join(', '));
  // Never let an identifier ride along in imported data (the employee number is also the login).
  const idLike = /\b[A-Za-z]?\d{6,}\b/;
  const leaked = reh_ids(before, after).filter((v) => idLike.test(v));
  check('no employee-number-like values in imported shifts', leaked.length === 0, `${leaked.length} value(s)`);
  result.payBefore = payTotals(ROOT, before);
  result.payAfter = payTotals(dir, after);
  return result;
}

function reh_ids(before, after) {
  const seen = new Set(before.shifts.map((x) => JSON.stringify(x)));
  return after.shifts.filter((x) => !seen.has(JSON.stringify(x))).flatMap((x) => Object.values(x).map(String));
}

/* ------------------------------ 5. guards ------------------------------ */

function guards(fetchRes, dry, reh) {
  const hard = [], soft = [], notes = [];
  const today = todayMel();
  const imported = reh.after.shifts.filter((s) => dry.parsed && s.date >= dry.parsed.first && !s.pinned);
  if (!dry.parsed) hard.push('importer output not recognised');
  else {
    if (fetchRes.rows && fetchRes.rows !== dry.parsed.n) hard.push(`fetcher saw ${fetchRes.rows} rows but the importer parsed ${dry.parsed.n}`);
    const lead = daysBetween(today, dry.parsed.first);
    if (!fetchRes.replay && (lead < -1 || lead > 21)) soft.push(`RosterOn window starts ${fmtDate(dry.parsed.first)}, ${lead} days from today — expected "today forward"`);
    const lateRemovals = reh.diff.removed.filter((s) => s.date > dry.parsed.last);
    if (lateRemovals.length) hard.push(`${lateRemovals.length} shift(s) after RosterOn's last listed date would be removed (${lateRemovals.map((s) => s.date).join(', ')}) — the list looks truncated`);
  }
  // Data diff and importer text must agree.
  if (dry.added !== reh.diff.added.length || dry.removed !== reh.diff.removed.length || dry.changed !== reh.diff.changed.length) {
    hard.push(`importer diff (+${dry.added} ~${dry.changed} -${dry.removed}) disagrees with the data diff (+${reh.diff.added.length} ~${reh.diff.changed.length} -${reh.diff.removed.length})`);
  }
  if (reh.diff.removed.length > LIMITS.removals) soft.push(`${reh.diff.removed.length} shifts removed (limit ${LIMITS.removals})`);
  if (reh.diff.changed.length > LIMITS.changes) soft.push(`${reh.diff.changed.length} shifts changed (limit ${LIMITS.changes})`);
  const oldLast = reh.before.shifts.reduce((m, s) => (s.date > m ? s.date : m), '');
  const newLast = reh.after.shifts.reduce((m, s) => (s.date > m ? s.date : m), '');
  if (newLast < oldLast) soft.push(`last rostered date moves earlier (${fmtDate(oldLast)} -> ${fmtDate(newLast)})`);
  const review = imported.filter((s) => !Object.values(reh.after.shiftTypes).some((t) => t.start === s.start && t.end === s.end));
  if (review.length && !ACCEPT_REVIEW) soft.push(`${review.length} shift(s) have times that match no shift type, so paid hours would be inferred: ${review.map((s) => `${s.date} ${s.start}-${s.end}`).join(', ')}`);
  // Pay-rule coverage: the importer cannot know about public holidays; flag, never guess.
  try {
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/payRules.js'), 'utf8'), ctx);
    const ph = ctx.PayRules.publicHolidays.dates.map((d) => d.date).sort();
    const lastPh = ph[ph.length - 1] || '';
    const beyond = reh.diff.added.filter((s) => s.date > lastPh);
    if (beyond.length) notes.push(`payRules.publicHolidays ends at ${fmtDate(lastPh)}; ${beyond.length} new shift(s) fall after it, so any public holiday among them is priced as an ordinary day until it is added (with a source) to payRules.js.`);
  } catch (_) { notes.push('could not read payRules.publicHolidays'); }
  return { hard, soft, notes, oldLast, newLast };
}

/* ------------------------------ summary ------------------------------ */

function summarise({ mode, pre, fetchRes, dry, reh, g, commit }) {
  const L = [];
  const d = reh.diff;
  L.push(`My Roster — RosterOn sync${mode ? ` ${mode}` : ''} — ${nowMel()}`);
  L.push('');
  L.push(`RosterOn: ${dry.parsed.n} shifts listed, ${fmtDate(dry.parsed.first)} to ${fmtDate(dry.parsed.last)}${fetchRes.pages ? ` (${fetchRes.pages.length} page${fetchRes.pages.length === 1 ? '' : 's'})` : ''}${fetchRes.replay ? ' [replayed raw file]' : ''}`);
  const live = pre.remoteHead ? (pre.remoteHead === pre.head ? 'clone = origin/main' : `clone ${pre.head.slice(0, 7)} ≠ origin/main ${pre.remoteHead.slice(0, 7)}`) : 'origin/main unknown';
  L.push(`App before: ${reh.before.shifts.length} shifts, last rostered ${fmtDate(g.oldLast)} (${live}${reh.cacheFrom ? `, cache ${reh.cacheFrom}` : ''})`);
  L.push('');
  const sect = (title, list, fn) => { if (list.length) { L.push(`${title} (${list.length}):`); list.forEach((x) => L.push(`  ${fn(x)}`)); L.push(''); } };
  sect(`NEW shifts, +${hrs(d.added)} h`, d.added, (s) => `+ ${label(s)}`);
  sect('CHANGED', d.changed, (c) => `~ ${fmtDate(c.after.date)}: ${c.before.shiftType} ${c.before.start}–${c.before.end} -> ${c.after.shiftType} ${c.after.start}–${c.after.end}`);
  sect('REMOVED (no longer in RosterOn)', d.removed, (s) => `- ${label(s)}`);
  sect('Label/note only', d.relabelled, (c) => `· ${fmtDate(c.after.date)}: "${c.before.note || ''}" -> "${c.after.note || ''}"`);
  if (!d.changed.length && !d.removed.length) L.push('No existing shifts changed or removed.');
  L.push(`Last rostered date: ${fmtDate(g.newLast)}${g.newLast !== g.oldLast ? ` (was ${fmtDate(g.oldLast)})` : ' (unchanged)'}`);
  L.push(`Totals: ${reh.before.shifts.length} -> ${reh.after.shifts.length} shifts, ${hrs(reh.before.shifts)} -> ${hrs(reh.after.shifts)} h, est. gross ${money(reh.payBefore && reh.payBefore.gross)} -> ${money(reh.payAfter && reh.payAfter.gross)}`);
  L.push('');
  if (reh.checks.length) { L.push('Rehearsal checks:'); reh.checks.forEach((c) => L.push(`  ${c.ok ? 'ok ' : 'FAIL'} ${c.name}`)); L.push(''); }
  if (g.hard.length) { L.push('STOPPED — looks like a layout change or partial data:'); g.hard.forEach((x) => L.push(`  ! ${x}`)); L.push(''); }
  if (g.soft.length) { L.push(`Needs a human look before --apply${FORCE ? ' (overridden by --force)' : ''}:`); g.soft.forEach((x) => L.push(`  ? ${x}`)); L.push(''); }
  if (g.notes.length) { L.push('Notes:'); g.notes.forEach((x) => L.push(`  * ${x}`)); L.push(''); }
  if (reh.cacheTo) L.push(`${commit ? 'Wrote' : 'Would write'}: ${FILES.join(', ')} (${reh.cacheFrom} -> ${reh.cacheTo})`);
  L.push(`Commit message: ${commitMessage(reh, g)}`);
  if (commit) L.push(`Commit: ${commit}`);
  L.push('');
  L.push('--- import_rosteron.js --dry ---');
  L.push(dry.text);
  return L.join('\n') + '\n';
}

function commitMessage(reh, g) {
  const d = reh.diff;
  const parts = [];
  if (d.added.length) parts.push(`${d.added.length} new`);
  if (d.changed.length) parts.push(`${d.changed.length} changed`);
  if (d.removed.length) parts.push(`${d.removed.length} removed`);
  if (d.relabelled.length && !parts.length) parts.push(`${d.relabelled.length} relabelled`);
  return `Sync RosterOn roster: ${parts.join(', ')}; through ${fmtDate(g.newLast).replace(/^\w+ /, '')}${reh.cacheTo ? ` (${reh.cacheTo})` : ''}`;
}

/* ------------------------------ 6. apply ------------------------------ */

function apply(reh, g, summaryText) {
  const msg = commitMessage(reh, g);
  const restore = () => git(['checkout', '--', ...FILES]);
  try {
    for (const f of FILES) fs.copyFileSync(path.join(reh.dir, f), path.join(ROOT, f));
    const changed = mustGit(['diff', '--name-only', 'HEAD'], 'diff').split('\n').filter(Boolean);
    if (changed.sort().join() !== [...FILES].sort().join()) throw new Stop(EXIT.git, 'git_error', `unexpected changed files: ${changed.join(', ')}`);
    mustGit(['add', '--', ...FILES], 'git add');
    const body = summaryText.split('--- import_rosteron.js')[0].trim();
    mustGit(['commit', '--quiet', '-m', msg, '-m', `Automated by tools/sync_rosteron.js from a live RosterOn ESS pull.\n\n${body}`], 'git commit');
  } catch (e) { restore(); throw e; }
  const commit = mustGit(['rev-parse', 'HEAD'], 'rev-parse');
  if (NO_PUSH) return { commit, pushed: false };
  const push = git(['push', '--quiet', 'origin', 'HEAD:main'], { timeout: 120000 });
  if (push.code) throw new Stop(EXIT.git, 'push_failed', `committed ${commit.slice(0, 7)} locally but push failed: ${(push.err || '').trim().split('\n').pop()} — the clone is now ahead of origin; push by hand`);
  const remote = git(['ls-remote', 'origin', 'refs/heads/main']).out.split(/\s/)[0];
  if (remote !== commit) throw new Stop(EXIT.git, 'push_unverified', `pushed, but origin/main is ${String(remote).slice(0, 7)}, not ${commit.slice(0, 7)}`);
  let live = null;
  if (VERIFY_LIVE) {
    for (let i = 0; i < 20 && !live; i++) {
      const r = run('curl', ['-fsS', `https://armutk.github.io/my-roster/service-worker.js?cb=${Date.now()}`], { timeout: 30000 });
      if (r.out.includes(`'${reh.cacheTo}'`)) live = true; else spawnSync('sleep', ['15']);
    }
    live = Boolean(live);
  }
  return { commit, pushed: true, live };
}

/* -------------------------------- main -------------------------------- */

function writeStatus(obj) {
  fs.writeFileSync(path.join(STATE, 'last-run.json'), JSON.stringify({ at: new Date().toISOString(), mode: APPLY ? 'apply' : 'dry-run', ...obj }, null, 2) + '\n', { mode: 0o600 });
}
function notify(status, text) {
  if (!NOTIFY || status === 'no_change') return;
  const r = spawnSync('/bin/sh', ['-c', NOTIFY], { input: text, encoding: 'utf8', timeout: 60000, env: { ...process.env, SYNC_STATUS: status } });
  if (r.status) console.error(`notify hook exited ${r.status}`);
}

function main() {
  fs.mkdirSync(path.join(STATE, 'summaries'), { recursive: true, mode: 0o700 });
  fs.chmodSync(STATE, 0o700);
  if (MIN_INTERVAL_DAYS) {
    let last = null; try { last = JSON.parse(fs.readFileSync(path.join(STATE, 'last-run.json'), 'utf8')); } catch (_) {}
    const age = last && last.at ? (Date.now() - Date.parse(last.at)) / 86400000 : Infinity;
    if (last && DONE.includes(last.status) && age < MIN_INTERVAL_DAYS) {
      console.log(`skip — last completed check ${age.toFixed(1)} days ago (${last.status}); interval is ${MIN_INTERVAL_DAYS} days`);
      return EXIT.ok;
    }
  }
  let reh = null;
  let unlock = () => {};
  try {
    unlock = lock();
    prune(path.join(STATE, 'raw'), 60);
    prune(path.join(STATE, 'summaries'), 365);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const pre = preflight();
    if (pre.dirty.length) console.error(`warning: tracked local edits (${pre.dirty.join(', ')}) — the diff is against the working tree, not origin/main`);
    const fetchRes = fetchRaw(stamp);
    const dry = importerDry(fetchRes.out);
    reh = rehearse(fetchRes.out);
    if (reh.unchanged) {
      writeStatus({ status: 'no_change', raw: fetchRes.out, rows: dry.parsed && dry.parsed.n, last: dry.parsed && dry.parsed.last });
      console.log(`no change — app already matches RosterOn (${dry.parsed.n} shifts listed, through ${fmtDate(dry.parsed.last)})`);
      return EXIT.ok;
    }
    const g = guards(fetchRes, dry, reh);
    let result = null;
    let status = g.hard.length ? 'layout_changed' : g.soft.length && !FORCE ? 'needs_review' : 'changes_pending';
    let text = summarise({ mode: APPLY ? '' : '(dry run)', pre, fetchRes, dry, reh, g });
    if (APPLY && status === 'changes_pending') {
      result = apply(reh, g, text);
      status = result.pushed ? 'applied' : 'committed';
      text = summarise({ mode: '(applied)', pre, fetchRes, dry, reh, g, commit: `${result.commit.slice(0, 7)}${result.pushed ? ' pushed to origin/main' : ' (not pushed: --no-push)'}${result.live === true ? ', live on Pages' : result.live === false ? ', Pages not updated yet' : ''}` });
    }
    const file = path.join(STATE, 'summaries', `summary-${stamp}.md`);
    fs.writeFileSync(file, text, { mode: 0o600 });
    fs.writeFileSync(path.join(STATE, 'latest-summary.md'), text, { mode: 0o600 });
    writeStatus({ status, raw: fetchRes.out, summary: file, added: reh.diff.added.length, changed: reh.diff.changed.length, removed: reh.diff.removed.length, last: g.newLast, commit: result && result.commit });
    process.stdout.write(text);
    notify(status, text);
    return status === 'layout_changed' ? EXIT.layout : status === 'needs_review' && APPLY ? EXIT.guard : EXIT.ok;
  } catch (e) {
    const status = e instanceof Stop ? e.status : 'error';
    const code = e instanceof Stop ? e.code : EXIT.error;
    const text = `My Roster — RosterOn sync FAILED (${status}) — ${nowMel()}\n\n${e.message}\n\nNothing was written to the app.${status === 'push_failed' ? ' (A local commit exists; see above.)' : ''}\n`;
    try { writeStatus({ status, error: e.message }); } catch (_) {}
    process.stderr.write(text);
    if (code !== EXIT.locked) notify(status, text);
    return code;
  } finally {
    if (reh && reh.dir) fs.rmSync(reh.dir, { recursive: true, force: true });
    unlock();
  }
}

process.exitCode = main();
