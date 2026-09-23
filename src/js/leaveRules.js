/* leaveRules.js — leave accrual rules, evidence-dated.
 *
 * Every rate here comes from a real Mercy payslip (employee E005885) or from the
 * enterprise agreement. Nothing is assumed. If a rate cannot be evidenced it is
 * marked verified:false and the UI shows "needs verification" instead of a number.
 *
 * Sibling to payRules.js and deliberately separate from it: pay rules and leave
 * rules change on their own schedules, and accruals are NOT pay.
 */
(function (global) {
  'use strict';

  const AGREEMENT = {
    title:
      'Nurses and Midwives (Victorian Public Sector) Single Interest Employers Enterprise Agreement 2024-2028',
    operativeFrom: '2024-11-15',
    nominalExpiry: '2028-04-30',
  };

  /* ------------------------------------------------------------------ *
   * Accrual rates — expressed as hours accrued per hour of paid work.
   * ------------------------------------------------------------------ */

  const rates = {
    annualLeave: {
      key: 'AL',
      label: 'Annual leave',
      hoursPerPaidHour: 5 / 52, // 9.6154% = 5 weeks a year
      verified: true,
      source:
        'Mercy payslips 09/09/2026 (AL 6.15 h on 64.0 h = 9.609%) and 23/09/2026 (AL 6.01 h on 62.5 h = 9.616%).',
      basis:
        '5 weeks a year: 4 weeks under the agreement plus the Victorian additional week. Accrues on paid hours.',
      clause: null,
    },
    personalLeave: {
      key: 'SL',
      label: 'Personal leave (sick)',
      hoursPerPaidHour: 12 / 260, // 4.6154% = the equivalent of 12 days a year
      verified: true,
      source:
        'Mercy payslips 09/09/2026 (SL 2.95 h on 64.0 h = 4.609%) and 23/09/2026 (SL 2.89 h on 62.5 h = 4.624%).',
      basis:
        'Accrues on paid hours at the rate payroll is actually applying. Both payslips fit 4.6154%.',
      clause: null,
      openQuestion:
        'Payroll is accruing the equivalent of 12 days a year. If the entitlement is 15 days a year the accrual is short by about 1.16% of hours. Quote the personal leave clause of the agreement when querying it.',
    },
    longServiceLeave: {
      key: 'LSL',
      label: 'Long service leave',
      hoursPerPaidHour: null,
      verified: false,
      source: 'Both payslips show an LSL balance of 0.00 h.',
      basis:
        'The payslip prints a balance but no accrual rule. Victorian LSL accrues on continuous service, not on hours, so it cannot be projected from the roster.',
      clause: null,
    },
    vicAdditionalWeek: {
      key: 'ALW',
      label: 'VIC additional week',
      hoursPerPaidHour: null,
      verified: false,
      source:
        'The 23/09/2026 payslip carries an "ALW Leave Accrued" line of 3.20 units and a VIC Additional 1wk balance of 3.20 h. The 09/09/2026 payslip has neither.',
      basis:
        'Reported as a balance only. 3.20 h does not reconcile to any simple share of the 126.5 paid hours on file (1/52 of them would be 2.43 h), so the accrual basis is unexplained and is not projected.',
      clause: null,
    },
  };

  /* ------------------------------------------------------------------ *
   * Anchors — the authoritative balances printed on the real payslips.
   * A live estimate is the latest anchor plus accrual on later shifts.
   * ------------------------------------------------------------------ */

  const anchors = [
    {
      asAt: '2026-09-06',
      paymentDate: '2026-09-09',
      period: '24/08/2026 to 06/09/2026',
      source: 'Payslip E005885, paid 09/09/2026',
      paidHoursInPeriod: 64.0,
      balances: { AL: 6.15, SL: 2.95, LSL: 0.0, ALW: null },
    },
    {
      asAt: '2026-09-20',
      paymentDate: '2026-09-23',
      period: '07/09/2026 to 20/09/2026',
      source: 'Payslip E005885, paid 23/09/2026',
      paidHoursInPeriod: 62.5,
      balances: { AL: 12.16, SL: 5.84, LSL: 0.0, ALW: 3.2 },
    },
  ];

  function latestAnchor() {
    return anchors[anchors.length - 1];
  }

  /** True when an anchor's printed balance ties back to accrual on paid hours. */
  function checkAnchor(anchor) {
    const al = anchor.balances.AL;
    const sl = anchor.balances.SL;
    const prev = anchors[anchors.indexOf(anchor) - 1];
    const result = { anchor, checks: [] };

    if (!prev) {
      // No earlier balance to carry in, so test the period's own accrual instead.
      const alPeriod = round2(anchor.paidHoursInPeriod * rates.annualLeave.hoursPerPaidHour);
      const slPeriod = round2(anchor.paidHoursInPeriod * rates.personalLeave.hoursPerPaidHour);
      result.checks.push({
        label: `AL accrued in ${anchor.period}`,
        expected: alPeriod,
        actual: al,
        ok: Math.abs(alPeriod - al) < 0.05,
      });
      result.checks.push({
        label: `SL accrued in ${anchor.period}`,
        expected: slPeriod,
        actual: sl,
        ok: Math.abs(slPeriod - sl) < 0.05,
      });
      return result;
    }

    const alCarry = round2(
      prev.balances.AL + anchor.paidHoursInPeriod * rates.annualLeave.hoursPerPaidHour
    );
    const slCarry = round2(
      prev.balances.SL + anchor.paidHoursInPeriod * rates.personalLeave.hoursPerPaidHour
    );
    result.checks.push({
      label: `AL carried from ${prev.period}`,
      expected: alCarry,
      actual: al,
      ok: Math.abs(alCarry - al) < 0.05,
    });
    result.checks.push({
      label: `SL carried from ${prev.period}`,
      expected: slCarry,
      actual: sl,
      ok: Math.abs(slCarry - sl) < 0.05,
    });
    return result;
  }

  /** App-only conventions, surfaced in the UI so a figure is never mistaken. */
  const notes = {
    unit: 'Mercy prints leave balances in HOURS, so hours are the primary figure here.',
    dayEquivalent:
      'A "day" below is 8.0 paid hours, the standard rostered shift, for orientation only. Mercy deducts leave in actual hours.',
    notPay:
      'Leave balances are not money. They are not part of the pay estimate and are not affected by penalties or allowances.',
    source: 'RosterOn shows shifts, never leave. Only a payslip carries a balance.',
    rounding:
      'Payroll rounds the accrual for each pay period, so a balance here can sit up to about 0.05 h from the payslip. The rate itself is exact.',
    toleranceHours: 0.05,
  };

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  global.LeaveRules = {
    AGREEMENT,
    rates,
    anchors,
    latestAnchor,
    checkAnchor,
    notes,
    round2,
  };
})(typeof window !== 'undefined' ? window : globalThis);
