#!/usr/bin/env node
/* leave_check.js — verify the leave engine against the real payslip balances,
 * then print the live estimate. Run: node tools/leave_check.js
 *
 * Exits non-zero if an accrual rate fails to reproduce a printed payslip balance.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const load = (p) => eval(fs.readFileSync(path.join(root, p), 'utf8'));

load('src/js/payRules.js');
load('src/js/payEngine.js');
load('src/js/leaveRules.js');
load('src/js/leaveEngine.js');

const roster = JSON.parse(fs.readFileSync(path.join(root, 'src/data/roster.json'), 'utf8'));
const R = globalThis.LeaveRules;
const L = globalThis.LeaveEngine;

let failures = 0;

console.log('=== Accrual rates vs printed payslips ===');
console.log(
  `AL  ${(R.rates.annualLeave.hoursPerPaidHour * 100).toFixed(4)}% of paid hours  (verified: ${R.rates.annualLeave.verified})`
);
console.log(
  `SL  ${(R.rates.personalLeave.hoursPerPaidHour * 100).toFixed(4)}% of paid hours  (verified: ${R.rates.personalLeave.verified})`
);
console.log('');

for (const anchor of R.anchors) {
  const { checks } = R.checkAnchor(anchor);
  console.log(`Payslip paid ${anchor.paymentDate} (${anchor.period}), ${anchor.paidHoursInPeriod} paid hours`);
  for (const c of checks) {
    const mark = c.ok ? 'PASS' : 'FAIL';
    if (!c.ok) failures += 1;
    console.log(
      `  [${mark}] ${c.label}: engine ${c.expected} h vs payslip ${c.actual} h`
    );
  }
}
console.log('');

const today = process.argv[2] || L.computeLeave(roster.shifts, roster.shiftTypes).today;
const res = L.computeLeave(roster.shifts, roster.shiftTypes, { today });

const fmt = (n) => (n == null ? 'n/a' : `${n} h`);
const line = (label, bal) =>
  `${label}: balance ${fmt(bal.AL.balance)} (accrued since anchor ${fmt(bal.AL.accrued)} over ${bal.hours} h)`;

console.log(`=== Live estimate (today ${res.today}) ===`);
console.log(`Anchor: ${res.anchor.source}, balance as at ${res.anchor.asAt}`);
console.log(`Payslip printed:  AL ${res.anchor.balances.AL} h · SL ${res.anchor.balances.SL} h · LSL ${res.anchor.balances.LSL} h · ALW ${res.anchor.balances.ALW} h`);
console.log('');
console.log(line('Annual leave now', res.toToday));
console.log(
  `  = ${L.daysAt(res.toToday.AL.balance, 8)} days at 8 h · personal leave now ${fmt(res.toToday.SL.balance)} (${L.daysAt(res.toToday.SL.balance, 8)} days)`
);
console.log(line('Annual leave at end of roster', res.endOfRoster));
console.log(
  `  = ${L.daysAt(res.endOfRoster.AL.balance, 8)} days at 8 h · personal leave ${fmt(res.endOfRoster.SL.balance)} (${L.daysAt(res.endOfRoster.SL.balance, 8)} days)`
);
console.log('');
console.log(`Shifts since anchor: ${res.shiftsSinceAnchor} (${res.hours.sinceAnchor} h) · remaining: ${res.shiftsRemaining} (${res.hours.remaining} h) · last roster date ${res.lastRosterDate}`);
console.log('');

if (res.warnings.length) {
  console.log('=== Flags ===');
  for (const w of res.warnings) console.log(`- ${w}`);
  console.log('');
}

if (failures) {
  console.error(`FAILED: ${failures} accrual check(s) did not reproduce a payslip balance.`);
  process.exit(1);
}
console.log('All accrual checks reproduce the printed payslip balances.');
