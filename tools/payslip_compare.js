#!/usr/bin/env node
/**
 * payslip_compare.js — run the app's own pay engine over a pay period and print
 * the fortnight totals, so an app estimate can be lined up against a real payslip.
 *
 * Usage:
 *   node tools/payslip_compare.js 2026-08-24 2026-09-06
 *   node tools/payslip_compare.js 2026-08-24 2026-09-06 --detail
 *
 * Reads src/data/roster.json only. It does NOT know about shifts the roster feed
 * never carried (orientation days before the feed began, for example) — those are
 * exactly what a payslip comparison is meant to expose.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext(globalThis);
for (const f of ['payRules.js', 'payEngine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'), ctx, { filename: f });
}

const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/roster.json'), 'utf8'));

const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const detail = process.argv.includes('--detail');
if (!from || !to) {
  console.error('usage: node tools/payslip_compare.js YYYY-MM-DD YYYY-MM-DD [--detail]');
  process.exit(2);
}

const shifts = roster.shifts
  .filter((s) => s.date >= from && s.date <= to)
  .sort((a, b) => (a.date < b.date ? -1 : 1));

const sum = window_summary(shifts);
function window_summary(list) {
  return globalThis.PayEngine.summarise(list, roster.shiftTypes);
}

console.log(`Period ${from} to ${to} — ${sum.shiftCount} shifts, ${sum.rosteredHours} paid hours`);
console.log(`  ordinary pay        ${sum.ordinaryPay.toFixed(2)}`);
console.log(`  shift allowances    ${sum.shiftAllowances.toFixed(2)}`);
console.log(`  weekend penalties   ${sum.weekendPenalties.toFixed(2)}`);
console.log(`  public hol penalties${sum.publicHolidayPenalties.toFixed(2)}`);
console.log(`  other allowances    ${sum.otherAllowances.toFixed(2)}`);
console.log(`  ESTIMATED GROSS     ${sum.estimatedGross.toFixed(2)}`);
if (sum.needsVerification) console.log('  (needsVerification flag set)');

if (detail) {
  console.log('\nPer shift:');
  for (const r of sum.results) {
    console.log(
      `  ${r.date} ${r.shiftType || ''} ${r.start}-${r.end} ${r.paidHours}h` +
        `  ordinary=${r.ordinaryPay.toFixed(2)}` +
        `  allow=${((r.shiftAllowance && r.shiftAllowance.amount) || 0).toFixed(2)}` +
        `  wknd=${(r.weekendPenalty || 0).toFixed(2)}` +
        `  gross=${r.estimatedGross.toFixed(2)}`
    );
  }
}
