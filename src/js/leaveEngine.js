/* leaveEngine.js — estimate a leave balance from a payslip anchor + the roster.
 *
 * The rule: a balance only ever comes from a payslip. This engine takes the most
 * recent printed balance and adds accrual on the shifts worked since that pay
 * period, at the rates evidenced in leaveRules.js. It never invents a rate and it
 * never treats leave as pay.
 *
 * Browsers: attaches to window. Node: attaches to globalThis (see
 * tools/leave_check.js), and needs payEngine.js loaded first for paid hours.
 */
(function (global) {
  'use strict';

  const R = global.LeaveRules;

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function isoOf(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Paid hours for a shift, honouring a recorded actual finish (workedHours)
   * exactly as the pay engine does. Falls back to the roster figure if the pay
   * engine is not loaded.
   */
  function paidHoursOf(shift, shiftTypes) {
    if (global.PayEngine) {
      try {
        const r = global.PayEngine.calculateShift(shift, shiftTypes);
        if (r && typeof r.paidHours === 'number') return r.paidHours;
      } catch (err) {
        /* fall through to the roster figure */
      }
    }
    if (shift.workedHours != null && Number.isFinite(Number(shift.workedHours))) {
      return Number(shift.workedHours);
    }
    return Number(shift.paidHours) || 0;
  }

  /** Total paid hours across a set of shifts. */
  function totalPaidHours(shifts, shiftTypes) {
    return round2((shifts || []).reduce((acc, s) => acc + paidHoursOf(s, shiftTypes), 0));
  }

  /**
   * Balances carried forward from the latest anchor over `extraHours` of paid work.
   * A null accrual rate yields a null balance — the UI shows "needs verification".
   */
  function balancesAfter(anchor, extraHours) {
    const alRate = R.rates.annualLeave.hoursPerPaidHour;
    const slRate = R.rates.personalLeave.hoursPerPaidHour;
    const alAccrued = alRate == null ? null : round2(extraHours * alRate);
    const slAccrued = slRate == null ? null : round2(extraHours * slRate);

    return {
      hours: round2(extraHours),
      AL: {
        accrued: alAccrued,
        balance: alAccrued == null ? null : round2(anchor.balances.AL + alAccrued),
      },
      SL: {
        accrued: slAccrued,
        balance: slAccrued == null ? null : round2(anchor.balances.SL + slAccrued),
      },
      LSL: { accrued: null, balance: anchor.balances.LSL },
      ALW: { accrued: null, balance: anchor.balances.ALW },
    };
  }

  /**
   * The whole picture.
   *
   * computeLeave(shifts, shiftTypes, { today }) ->
   *   { anchor, today, toToday, endOfRoster, lastRosterDate, hours: {...}, warnings: [] }
   */
  function computeLeave(shifts, shiftTypes, options) {
    const opts = options || {};
    const todayIso = opts.today || isoOf(new Date());
    const anchor = R.latestAnchor();
    const sorted = (shifts || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    const afterAnchor = sorted.filter((s) => s.date > anchor.asAt);
    const toToday = afterAnchor.filter((s) => s.date <= todayIso);
    const remaining = afterAnchor.filter((s) => s.date > todayIso);

    const hoursSinceAnchor = totalPaidHours(afterAnchor, shiftTypes);
    const hoursToToday = totalPaidHours(toToday, shiftTypes);
    const hoursRemaining = totalPaidHours(remaining, shiftTypes);
    const lastRosterDate = sorted.length ? sorted[sorted.length - 1].date : anchor.asAt;

    const warnings = [];
    const checks = R.checkAnchor(anchor);
    for (const c of checks.checks) {
      if (!c.ok) {
        warnings.push(
          `Accrual rate does not reproduce the payslip: ${c.label} — expected ${c.expected} h, payslip shows ${c.actual} h.`
        );
      }
    }
    if (R.rates.personalLeave.openQuestion) warnings.push(R.rates.personalLeave.openQuestion);
    if (!R.rates.vicAdditionalWeek.verified) {
      warnings.push(
        `VIC additional week is shown as the balance payroll reported (${anchor.balances.ALW} h) and is not projected — its accrual basis is unexplained.`
      );
    }
    if (!R.rates.longServiceLeave.verified) {
      warnings.push(
        'Long service leave accrues on continuous service rather than hours, so it is reported, never projected.'
      );
    }

    return {
      anchor,
      today: todayIso,
      lastRosterDate,
      shiftsSinceAnchor: afterAnchor.length,
      shiftsRemaining: remaining.length,
      hours: {
        sinceAnchor: hoursSinceAnchor,
        toToday: hoursToToday,
        remaining: hoursRemaining,
      },
      toToday: balancesAfter(anchor, hoursToToday),
      endOfRoster: balancesAfter(anchor, hoursSinceAnchor),
      rates: R.rates,
      notes: R.notes,
      checks: checks.checks,
      warnings,
    };
  }

  /** Hours -> whole/half "days" at a given shift length, for orientation only. */
  function daysAt(hours, dayLength) {
    if (hours == null) return null;
    const len = Number(dayLength) || 8;
    return round2(hours / len);
  }

  global.LeaveEngine = {
    computeLeave,
    totalPaidHours,
    paidHoursOf,
    balancesAfter,
    daysAt,
    round2,
  };
})(typeof window !== 'undefined' ? window : globalThis);
