#!/usr/bin/env node
/**
 * fetch_rosteron.js — Log in to RosterOn ESS headlessly and save the published
 * roster list as raw page text, ready for tools/import_rosteron.js.
 *
 * This is the automated form of the 19 Sep 2026 pull (AGENTS.md §11): Playwright
 * drives the Mobile site with the Bitwarden login whose URI is the MHAPROD Mobile
 * login page, then saves `document.body.innerText` of Roster/List.
 *
 * USAGE
 *   node tools/fetch_rosteron.js --out-dir /root/.local/state/my-roster-sync/raw
 *
 * OUTPUT
 *   <out-dir>/rosteron-<stamp>.txt   raw page text (all pages, in order)
 *   <out-dir>/rosteron-<stamp>-pN.html, -pN.png   evidence for debugging layout changes
 *   stdout: one JSON status line. Never contains credentials.
 *
 * EXIT CODES
 *   0 ok · 1 unexpected error · 2 login rejected · 3 Bitwarden/credential lookup failed
 *   4 MFA / captcha / extra verification step · 5 password expired / change required
 *   6 layout not recognised (login form, roster page, or shift rows) — nothing saved as good
 *
 * SECRETS
 *   Credentials are read from Bitwarden at runtime (/usr/local/bin/bw-session, the
 *   serialised VPS helper) and held only in process memory. They are never printed,
 *   logged, written to disk or passed on a command line. Every string this script
 *   prints is scrubbed of the username and password as a second line of defence.
 *
 * DEPENDENCIES
 *   None in the repo. Playwright is borrowed from the VPS install
 *   (PLAYWRIGHT_MODULE, default /usr/local/lib/hermes-agent/node_modules/playwright)
 *   and a cached Chromium under /root/.cache/ms-playwright (ROSTERON_CHROME overrides).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = 'https://mha.allocate-cloud.com.au/MHAPROD/Mobile';
const LOGIN_URL = `${BASE}/Account/Login`;
const ROSTER_URL = `${BASE}/Roster`;
const BW = process.env.BW_BIN || '/usr/local/bin/bw';
const BW_SESSION_HELPER = process.env.BW_SESSION_HELPER || '/usr/local/bin/bw-session';
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || '/usr/local/lib/hermes-agent/node_modules/playwright';
const MAX_PAGES = 12;

// Same patterns as tools/import_rosteron.js — if these stop matching, the layout changed.
const HEADER_RE = /^([A-Z][a-z]{2})\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(.+)$/;
const TIME_RE = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/;

const EXIT = { ok: 0, error: 1, login: 2, credentials: 3, mfa: 4, expired: 5, layout: 6 };

let SECRETS = [];
function scrub(s) {
  let out = String(s == null ? '' : s);
  for (const v of SECRETS) if (v && v.length >= 3) out = out.split(v).join('[redacted]');
  return out.replace(/\b\d{6,}\b/g, '[number]'); // employee numbers and the like
}
class Fail extends Error {
  constructor(code, stage, message) { super(message); this.code = code; this.stage = stage; }
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

/* ---------------------------- Bitwarden ---------------------------- */

function bwSession() {
  const r = spawnSync(BW_SESSION_HELPER, [], { encoding: 'utf8', timeout: 120000, env: { ...process.env, HOME: '/root' } });
  const m = /BW_SESSION=("?)([^\s"]+)\1/.exec(r.stdout || '');
  if (r.status !== 0 || !m) throw new Fail(EXIT.credentials, 'bitwarden', 'bw-session did not return an unlocked session');
  return m[2];
}

function bw(args, session) {
  const r = spawnSync(BW, args, {
    encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/root', BW_SESSION: session, BW_NOINTERACTION: 'true' },
  });
  if (r.status !== 0) throw new Fail(EXIT.credentials, 'bitwarden', `bw ${args[0]} failed (details suppressed)`);
  return r.stdout;
}

function normUri(u) { return String(u || '').trim().toLowerCase().replace(/\/+$/, ''); }

function credentials() {
  const session = bwSession();
  try { bw(['sync'], session); } catch (_) { /* stale cache is still usable; lookup below decides */ }
  let item;
  if (process.env.ROSTERON_BW_ITEM_ID) {
    item = JSON.parse(bw(['get', 'item', process.env.ROSTERON_BW_ITEM_ID], session));
  } else {
    const items = JSON.parse(bw(['list', 'items', '--search', 'mha.allocate-cloud.com.au'], session));
    const hits = items.filter((it) => it.type === 1 && ((it.login || {}).uris || [])
      .some((u) => normUri(u.uri) === normUri(LOGIN_URL)));
    if (hits.length !== 1) {
      throw new Fail(EXIT.credentials, 'bitwarden', `expected exactly one login item with URI ${LOGIN_URL}, found ${hits.length}`);
    }
    item = hits[0];
  }
  const user = (item.login && item.login.username) || '';
  const pass = (item.login && item.login.password) || '';
  if (!user || !pass) throw new Fail(EXIT.credentials, 'bitwarden', 'login item is missing a username or password');
  if (item.login.totp) SECRETS.push(item.login.totp);
  SECRETS.push(user, pass);
  return { user, pass, hasTotp: Boolean(item.login.totp) };
}

/* ----------------------------- browser ----------------------------- */

function chromeCandidates() {
  const root = '/root/.cache/ms-playwright';
  const found = [];
  if (process.env.ROSTERON_CHROME) found.push(process.env.ROSTERON_CHROME);
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch (_) {}
  const byRev = (prefix) => dirs.filter((d) => d.startsWith(prefix)).sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  for (const d of byRev('chromium-')) found.push(path.join(root, d, 'chrome-linux64/chrome'));
  for (const d of byRev('chromium_headless_shell-')) found.push(path.join(root, d, 'chrome-headless-shell-linux64/chrome-headless-shell'));
  return found.filter((p) => fs.existsSync(p));
}

async function launch(chromium) {
  let last;
  for (const executablePath of chromeCandidates()) {
    try {
      return await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    } catch (e) { last = e; }
  }
  throw new Fail(EXIT.error, 'browser', `no usable Chromium found (${last ? String(last.message).split('\n')[0] : 'none cached'})`);
}

const MFA_RE = /captcha|recaptcha|hcaptcha|verification code|one[- ]time (pass)?code|two[- ]factor|2fa|multi[- ]factor|authenticator|security code|verify (it'?s|that it is) you|enter the code/i;
// Only phrases that mean "you must change it now". The signed-in menu always shows a
// "Change Password" link, so that wording alone is NOT a signal.
const EXPIRED_RE = /password (has )?expired|expired password|password must be changed|must change your password/i;

async function pageState(page) {
  const url = page.url();
  const text = await page.locator('body').innerText().catch(() => '');
  const captchaFrame = await page.locator('iframe[src*="captcha"], iframe[title*="captcha" i], .g-recaptcha, .h-captcha').count().catch(() => 0);
  return { url, text, captchaFrame };
}

function looksLikeLogin(url, text) {
  return /\/account\/login/i.test(url) || (/user ?name/i.test(text) && /password/i.test(text) && /log ?in/i.test(text));
}

/** Validate shift rows the same way the importer parses them. Returns {headers, problems}. */
function validateRows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headers = [];
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const h = HEADER_RE.exec(lines[i]);
    if (!h) continue;
    let t = null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) { t = TIME_RE.exec(lines[j]); if (t) break; }
    const date = `${h[4]}-${h[3]}-${h[2]}`;
    if (!t) problems.push(`no start-end time under ${h[1]} ${date}`);
    const d = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) problems.push(`invalid date ${date}`);
    else if (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] !== h[1]) problems.push(`weekday mismatch on ${date}`);
    headers.push(date);
  }
  // Any line that mentions a dd/mm/yyyy date but did not parse as a header is a layout drift signal.
  const strays = lines.filter((l) => /\b\d{2}\/\d{2}\/\d{4}\b/.test(l) && !HEADER_RE.test(l));
  if (strays.length) problems.push(`${strays.length} dated line(s) not in the expected "Ddd dd/mm/yyyy - Unit" form`);
  return { headers, problems };
}

/* ------------------------------- main ------------------------------ */

async function main() {
  const outDir = arg('--out-dir');
  if (!outDir) throw new Fail(EXIT.error, 'args', 'pass --out-dir <private directory outside the repo>');
  const repoRoot = path.resolve(__dirname, '..');
  if (path.resolve(outDir).startsWith(repoRoot + path.sep)) throw new Fail(EXIT.error, 'args', '--out-dir must be outside the repository');
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outDir, 0o700);
  const stamp = arg('--stamp', new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'));
  const base = path.join(outDir, `rosteron-${stamp}`);

  let chromium;
  try { ({ chromium } = require(PLAYWRIGHT_MODULE)); } catch (e) {
    throw new Fail(EXIT.error, 'browser', `Playwright not found at ${PLAYWRIGHT_MODULE}`);
  }

  const creds = credentials();
  const browser = await launch(chromium);
  const evidence = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    // HTML for every page (small, explains a layout change); screenshots only when a step fails.
    const snap = async (tag, shot = !/^p\d+$/.test(tag)) => {
      const p = `${base}-${tag}`;
      fs.writeFileSync(`${p}.html`, await page.content(), { mode: 0o600 });
      if (shot) await page.screenshot({ path: `${p}.png`, fullPage: true }).then(() => fs.chmodSync(`${p}.png`, 0o600)).catch(() => {});
      evidence.push(`${p}.html`);
    };

    // 1. Login form
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    let st = await pageState(page);
    if (st.captchaFrame || MFA_RE.test(st.text)) { await snap('login'); throw new Fail(EXIT.mfa, 'login-form', 'captcha or verification challenge on the login page'); }
    const userBox = page.getByLabel(/user ?name/i).first();
    const passBox = page.getByLabel(/password/i).first();
    if (!(await userBox.count()) || !(await passBox.count())) { await snap('login'); throw new Fail(EXIT.layout, 'login-form', 'login form not recognised (no "User name"/"Password" fields)'); }

    // 2. Submit
    await userBox.fill(creds.user);
    await passBox.fill(creds.pass);
    const button = page.getByRole('button', { name: /log ?in/i }).first();
    if (!(await button.count())) { await snap('login'); throw new Fail(EXIT.layout, 'login-form', 'login button not found'); }
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => null),
      button.click(),
    ]);
    await page.waitForTimeout(1500);
    // Wipe the typed values from the DOM in case we stay on the form and snapshot it.
    await page.evaluate(() => document.querySelectorAll('input[type=password],input').forEach((i) => { i.value = ''; })).catch(() => {});

    st = await pageState(page);
    const pwInputs = await page.locator('input[type=password]').count().catch(() => 0);
    if (/passwordexpired|changepassword/i.test(st.url) || (EXPIRED_RE.test(st.text) && pwInputs)) { await snap('after-login'); throw new Fail(EXIT.expired, 'login', 'RosterOn says the password has expired or must be changed'); }
    if (st.captchaFrame || MFA_RE.test(st.text)) { await snap('after-login'); throw new Fail(EXIT.mfa, 'login', 'RosterOn asked for MFA / captcha / an extra verification step'); }
    if (looksLikeLogin(st.url, st.text)) {
      await snap('after-login');
      const msg = await page.locator('.validation-summary-errors, .field-validation-error, .error, [role=alert]').allInnerTexts().catch(() => []);
      throw new Fail(EXIT.login, 'login', `login rejected${msg.length ? `: ${msg.join(' ').trim().slice(0, 200)}` : ''}`);
    }

    // 3. Roster list (same route the 19 Sep pull took: home -> "Roster" link -> Roster/List?pageNo=1)
    const rosterLink = page.getByRole('link', { name: /^\s*roster\s*$/i }).first();
    if (await rosterLink.count()) {
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => null), rosterLink.click()]);
    } else {
      await page.goto(ROSTER_URL, { waitUntil: 'networkidle', timeout: 60000 });
    }
    await page.waitForTimeout(1500);
    st = await pageState(page);
    if (looksLikeLogin(st.url, st.text)) { await snap('roster'); throw new Fail(EXIT.login, 'roster', 'session dropped back to the login page'); }
    if (!/\/roster/i.test(st.url) || !/^\s*Roster\s*$/m.test(st.text)) { await snap('roster'); throw new Fail(EXIT.layout, 'roster', `roster page not recognised (landed on ${new URL(st.url).pathname})`); }

    // 4. Collect every page. RosterOn's list URL carries pageNo; follow it until no new rows.
    const pages = [];
    const seen = new Set();
    let pageNo = 1;
    let current = st;
    const firstUrl = new URL(st.url);
    while (true) {
      await snap(`p${pageNo}`);
      const { headers, problems } = validateRows(current.text);
      if (problems.length) throw new Fail(EXIT.layout, 'parse', `page ${pageNo}: ${problems.slice(0, 3).join('; ')}`);
      const fresh = headers.filter((d) => !seen.has(d));
      if (pageNo > 1 && !fresh.length) break; // repeat of an earlier page, or empty
      headers.forEach((d) => seen.add(d));
      pages.push({ pageNo, url: firstUrl.pathname, text: current.text, rows: headers.length });
      // Is there a next page? Prefer an explicit link; otherwise probe pageNo+1 once.
      const hrefs = await page.locator('a[href*="pageNo="]').evaluateAll((as) => as.map((a) => a.getAttribute('href'))).catch(() => []);
      const linked = hrefs.map((h) => Number((/pageNo=(\d+)/i.exec(h || '') || [])[1])).filter((n) => n > pageNo);
      const nextNo = pageNo + 1;
      if (nextNo > MAX_PAGES) throw new Fail(EXIT.layout, 'paging', `more than ${MAX_PAGES} roster pages — refusing to guess`);
      const probe = new URL(firstUrl);
      if (!probe.searchParams.has('pageNo')) break; // single-page layout
      if (!linked.length && pageNo > 1) break;
      probe.searchParams.set('pageNo', String(nextNo));
      await page.goto(probe.toString(), { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(800);
      current = await pageState(page);
      if (looksLikeLogin(current.url, current.text)) throw new Fail(EXIT.login, 'paging', 'session dropped while paging');
      pageNo = nextNo;
    }

    const text = pages.map((p) => p.text).join('\n');
    const { headers } = validateRows(text);
    if (!headers.length) throw new Fail(EXIT.layout, 'parse', 'roster page has no shift rows — refusing to treat that as "no shifts"');
    const sorted = [...headers].sort();
    const dupes = headers.length - new Set(headers).size;

    // Best-effort sign out so the session does not linger.
    const logout = page.getByRole('link', { name: /log ?(out|off)|sign ?out/i }).first();
    if (await logout.count().catch(() => 0)) await logout.click().catch(() => {});

    fs.writeFileSync(`${base}.txt`, text, { mode: 0o600 });
    const result = {
      ok: true, out: `${base}.txt`, pages: pages.map((p) => ({ pageNo: p.pageNo, rows: p.rows })),
      rows: headers.length, duplicateDates: dupes, first: sorted[0], last: sorted[sorted.length - 1],
      bitwardenTotp: creds.hasTotp, evidence,
    };
    console.log(scrub(JSON.stringify(result)));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  const code = err instanceof Fail ? err.code : EXIT.error;
  const stage = err instanceof Fail ? err.stage : 'unexpected';
  console.log(scrub(JSON.stringify({ ok: false, code, stage, error: String(err && err.message ? err.message : err).split('\n')[0].slice(0, 400) })));
  process.exit(code);
});
