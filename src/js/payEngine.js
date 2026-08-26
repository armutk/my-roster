/**
 * payEngine.js — Shift-by-shift gross pay calculation.
 *
 * Deliberately separate from the roster display engine: EA rules are intricate and
 * change on their own schedule, so all rates/clauses live in payRules.js and this
 * file only applies them.
 *
 * METHOD
 * ------
 * A shift is split into SEGMENTS at midnight boundaries, and each segment is rated
 * independently. This matters because:
 *   - a night shift crosses midnight into a different day-of-week;
 *   - clause 56.6 pays public holiday rates only for "that part of a shift that falls
 *     on the public holiday" (midnight to end of shift, or start of shift to midnight);
 *   - clause 48.1's weekend window is "midnight Friday to midnight Sunday", which is
 *     exactly the whole of Saturday plus the whole of Sunday.
 *
 * Precedence per segment (clause 56.5(a)(ii) is inclusive of clause 48, so they never stack):
 *   public holiday  >  weekend  >  ordinary
 *
 * Shift allowances (clause 34) are flat per-shift amounts and are added ON TOP of
 * whatever the segments rate to, per clause 34.3 ("In addition to any other rates").
 *
 * Overtime is NEVER inferred from weekly hours. It is applied only when explicitly
 * recorded on a shift as `overtimeHours`. See payRules.overtime.triggers.
 */

(function (global) {
  'use strict';

  const R = global.PayRules;
  const MS_HOUR = 3600000;

  /* ------------------------------------------------------------------ *
   * Date/time helpers
   * ------------------------------------------------------------------ */

  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function combine(iso, time) {
    const [y, m, d] = iso.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  function isoOf(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function startOfNextDay(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + 1);
    return d;
  }

  function minutesOfDay(time) {
    const [hh, mm] = time.split(':').map(Number);
    return hh * 60 + mm;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /* ------------------------------------------------------------------ *
   * Resolve a shift's actual start/end datetimes
   * ------------------------------------------------------------------ */

  function resolveWindow(shift, typeDefaults) {
    const start = shift.start || (typeDefaults && typeDefaults.start) || null;
    const end = shift.end || (typeDefaults && typeDefaults.end) || null;
    if (!start || !end) return null;

    const startDt = combine(shift.date, start);
    let endDt = combine(shift.date, end);
    if (endDt <= startDt) endDt = new Date(endDt.getTime() + 24 * MS_HOUR); // crosses midnight
    return { startDt, endDt, startTime: start, endTime: end };
  }

  /* ------------------------------------------------------------------ *
   * Clause 34.1 shift-allowance classification.
   * Applies the Agreement's own qualifying tests to the actual times worked —
   * not to whatever the roster labels the shift.
   * ------------------------------------------------------------------ */

  function classifyForAllowance(win) {
    if (!win) return { category: null, reason: 'No start/finish times recorded' };

    const startMin = win.startDt.getHours() * 60 + win.startDt.getMinutes();
    const endMin = win.endDt.getHours() * 60 + win.endDt.getMinutes();
    const crossesMidnight = isoOf(win.endDt) !== isoOf(win.startDt);

    // 34.1(c) Night shift: finishes on the day after commencing, OR commences after
    // midnight and before 05:00.
    const isNight = crossesMidnight || (startMin > 0 && startMin < 5 * 60);
    if (isNight) {
      const startDow = win.startDt.getDay(); // 0 Sun .. 6 Sat
      // 34.1(d) Sunday night shift: commences Sunday, concludes Monday.
      if (startDow === 0) {
        return { category: 'nightSunday', reason: 'Commences Sunday and concludes Monday (cl 34.1(d))' };
      }
      if (startDow === 5 || startDow === 6) {
        return { category: 'nightFriSat', reason: 'Night shift commencing Friday or Saturday (cl 34.3(c)(iii)(B))' };
      }
      return { category: 'nightMonThu', reason: 'Night shift commencing Monday-Thursday (cl 34.3(c)(iii)(A))' };
    }

    // 34.1(b) Afternoon shift: finishes between 18:00 and 08:00.
    const finishesInAfternoonWindow = endMin >= 18 * 60 || endMin <= 8 * 60;
    if (finishesInAfternoonWindow) {
      return { category: 'afternoon', reason: 'Finishes between 6:00 PM and 8:00 AM (cl 34.1(b))' };
    }

    // 34.1(a) Morning shift — see payRules.shiftDefinitions.morning for the caveat.
    const md = R.shiftDefinitions.morning;
    const from = minutesOfDay(md.commencesFrom);
    const to = minutesOfDay(md.commencesTo);
    const inMorningWindow = from > to ? startMin >= from || startMin <= to : startMin >= from && startMin <= to;
    if (inMorningWindow) {
      return { category: 'morning', reason: 'Commences within the clause 34.1(a) morning window' };
    }

    return { category: null, reason: 'Does not meet any clause 34.1 shift definition — no shift allowance' };
  }

  function allowanceFor(category, isoDate) {
    if (!category) return null;
    const rule = R.shiftAllowances[category];
    if (!rule) return null;
    const row = R.rateOn(rule.table, isoDate);
    if (!row) {
      return { category, amount: null, verified: false, verificationNote: 'No published rate effective on this date.' };
    }
    return {
      category,
      amount: row.amount,
      verified: rule.verified !== false,
      verificationNote: rule.verificationNote || null,
      agreementClause: rule.agreementClause || R.shiftAllowances.agreementClause,
    };
  }

  const ALLOWANCE_LABELS = {
    morning: 'Morning shift allowance',
    afternoon: 'Afternoon shift allowance',
    nightMonThu: 'Night shift allowance (Mon-Thu)',
    nightFriSat: 'Night shift allowance (Fri/Sat)',
    nightSunday: 'Sunday night shift allowance',
  };

  /* ------------------------------------------------------------------ *
   * Segment a shift at midnight boundaries and rate each part.
   * ------------------------------------------------------------------ */

  function buildSegments(win, baseHourly) {
    const segments = [];
    let cursor = new Date(win.startDt);

    while (cursor < win.endDt) {
      const nextMidnight = startOfNextDay(cursor);
      const segEnd = nextMidnight < win.endDt ? nextMidnight : win.endDt;
      const iso = isoOf(cursor);
      const hours = (segEnd - cursor) / MS_HOUR;
      const dow = cursor.getDay();
      const isWeekendDay = dow === 0 || dow === 6;
      const ph = R.isPublicHoliday(iso);

      let multiplier, basis, clause;
      if (ph) {
        multiplier = isWeekendDay
          ? R.publicHolidayPenalty.weekendMultiplier
          : R.publicHolidayPenalty.weekdayMultiplier;
        basis = `Public holiday (${ph.name})${isWeekendDay ? ' falling on a weekend' : ''}`;
        clause = R.publicHolidayPenalty.agreementClause;
      } else if (isWeekendDay) {
        multiplier = dow === 6
          ? R.weekendPenalty.saturdayMultiplier
          : R.weekendPenalty.sundayMultiplier;
        basis = dow === 6 ? 'Saturday ordinary hours' : 'Sunday ordinary hours';
        clause = R.weekendPenalty.agreementClause;
      } else {
        multiplier = 1.0;
        basis = 'Ordinary hours (Mon-Fri)';
        clause = 'Clause 18.3';
      }

      segments.push({
        date: iso,
        hours: round2(hours),
        multiplier,
        basis,
        clause,
        isPublicHoliday: !!ph,
        publicHolidayName: ph ? ph.name : null,
        isWeekend: isWeekendDay,
        ordinaryPay: round2(hours * baseHourly),
        penaltyPay: round2(hours * baseHourly * (multiplier - 1)),
        totalPay: round2(hours * baseHourly * multiplier),
      });

      cursor = segEnd;
    }

    return segments;
  }

  /* ------------------------------------------------------------------ *
   * Overtime — only from explicitly recorded hours (clause 49.2(c)).
   * ------------------------------------------------------------------ */

  function calculateOvertime(shift, baseHourly, win) {
    const hours = Number(shift.overtimeHours) || 0;
    if (hours <= 0) return null;

    const ot = R.overtime;
    // Clause 49.2(e): each shift stands alone; rate by the day the overtime sits in.
    const refDate = win ? win.endDt : parseLocalDate(shift.date);
    const dow = refDate.getDay();
    const iso = isoOf(refDate);
    const ph = R.isPublicHoliday(iso);
    const isWeekend = dow === 0 || dow === 6;

    const tiers = [];
    let total = 0;

    if (ph) {
      // Clause 49.2(c)(iii) defers to clause 56 for public holidays; clause 56.5(a)
      // covers work "including overtime work" on a public holiday.
      const mult = isWeekend
        ? R.publicHolidayPenalty.weekendMultiplier
        : R.publicHolidayPenalty.weekdayMultiplier;
      total = hours * baseHourly * mult;
      tiers.push({ hours: round2(hours), multiplier: mult, amount: round2(total), label: `Public holiday overtime (${mult * 100}%)` });
    } else if (isWeekend) {
      const mult = ot.weekendOvertimeMultiplier;
      total = hours * baseHourly * mult;
      tiers.push({ hours: round2(hours), multiplier: mult, amount: round2(total), label: `Weekend overtime (${mult * 100}%)` });
    } else {
      const firstTier = Math.min(hours, ot.firstTierHours);
      const restTier = Math.max(0, hours - ot.firstTierHours);
      if (firstTier > 0) {
        const amt = firstTier * baseHourly * ot.firstTwoHoursOvertimeMultiplier;
        total += amt;
        tiers.push({ hours: round2(firstTier), multiplier: ot.firstTwoHoursOvertimeMultiplier, amount: round2(amt), label: 'Overtime, first 2 hours (150%)' });
      }
      if (restTier > 0) {
        const amt = restTier * baseHourly * ot.subsequentOvertimeMultiplier;
        total += amt;
        tiers.push({ hours: round2(restTier), multiplier: ot.subsequentOvertimeMultiplier, amount: round2(amt), label: 'Overtime, subsequent hours (200%)' });
      }
    }

    return {
      hours: round2(hours),
      tiers,
      total: round2(total),
      agreementClause: ot.agreementClause,
      reason: shift.overtimeReason || null,
    };
  }

  /* ------------------------------------------------------------------ *
   * Main: calculate one shift
   * ------------------------------------------------------------------ */

  function calculateShift(shift, shiftTypes) {
    const typeDefaults = shiftTypes ? shiftTypes[shift.shiftType] : null;
    const win = resolveWindow(shift, typeDefaults);
    const rateInfo = R.baseHourlyRateOn(shift.date);
    const warnings = [];

    if (!rateInfo) {
      return {
        date: shift.date,
        error: 'No base rate effective on this date',
        needsVerification: true,
        estimatedGross: null,
      };
    }

    const baseHourly = rateInfo.rate;
    const paidHours = Number(shift.paidHours) || (typeDefaults ? typeDefaults.paidHours : 0);
    const notes = [];

    // --- Segments -------------------------------------------------------
    let segments = [];
    let mealBreakHours = 0;
    if (win) {
      segments = buildSegments(win, baseHourly);
      // Paid hours normally differ from elapsed time by the unpaid meal break
      // (clause 44.1(a): not less than 30 and not more than 60 minutes). Scale the
      // segment pay so the total reflects PAID hours while preserving the rate mix.
      const elapsed = round2(segments.reduce((s, seg) => s + seg.hours, 0));
      const diff = round2(elapsed - paidHours);
      if (elapsed > 0 && Math.abs(diff) > 0.01) {
        const factor = paidHours / elapsed;
        segments = segments.map((seg) => ({
          ...seg,
          hours: round2(seg.hours * factor),
          ordinaryPay: round2(seg.ordinaryPay * factor),
          penaltyPay: round2(seg.penaltyPay * factor),
          totalPay: round2(seg.totalPay * factor),
          scaled: true,
        }));

        if (diff >= 0.5 && diff <= 1.0) {
          // Normal, expected: an unpaid meal break within the clause 44.1(a) range.
          mealBreakHours = diff;
          notes.push(
            `${Math.round(diff * 60)} min unpaid meal break (cl 44.1(a)): ${elapsed}h on site, ${paidHours}h paid.`
          );
        } else if (diff > 0) {
          warnings.push(
            `${elapsed}h elapsed vs ${paidHours}h paid — a ${Math.round(diff * 60)} min gap is outside the 30-60 min unpaid meal break at cl 44.1(a). Check the shift times.`
          );
        } else {
          warnings.push(
            `Paid hours (${paidHours}h) exceed elapsed time (${elapsed}h). Check the shift times.`
          );
        }
      }
    } else {
      // No times recorded — rate the whole shift as ordinary on its calendar date.
      const d = parseLocalDate(shift.date);
      const dow = d.getDay();
      const isWeekendDay = dow === 0 || dow === 6;
      const ph = R.isPublicHoliday(shift.date);
      const multiplier = ph
        ? (isWeekendDay ? R.publicHolidayPenalty.weekendMultiplier : R.publicHolidayPenalty.weekdayMultiplier)
        : (isWeekendDay ? R.weekendPenalty.saturdayMultiplier : 1.0);
      segments = [{
        date: shift.date,
        hours: paidHours,
        multiplier,
        basis: ph ? `Public holiday (${ph.name})` : isWeekendDay ? 'Weekend ordinary hours' : 'Ordinary hours (Mon-Fri)',
        clause: ph ? R.publicHolidayPenalty.agreementClause : isWeekendDay ? R.weekendPenalty.agreementClause : 'Clause 18.3',
        isPublicHoliday: !!ph,
        publicHolidayName: ph ? ph.name : null,
        isWeekend: isWeekendDay,
        ordinaryPay: round2(paidHours * baseHourly),
        penaltyPay: round2(paidHours * baseHourly * (multiplier - 1)),
        totalPay: round2(paidHours * baseHourly * multiplier),
      }];
      warnings.push('No start/finish times recorded — rated as a single block on the shift date.');
    }

    const ordinaryPay = round2(segments.reduce((s, seg) => s + seg.ordinaryPay, 0));
    const weekendPenalty = round2(
      segments.filter((s) => s.isWeekend && !s.isPublicHoliday).reduce((s, seg) => s + seg.penaltyPay, 0)
    );
    const publicHolidayPenalty = round2(
      segments.filter((s) => s.isPublicHoliday).reduce((s, seg) => s + seg.penaltyPay, 0)
    );

    // --- Shift allowance (clause 34) ------------------------------------
    const classification = classifyForAllowance(win);
    const allowance = allowanceFor(classification.category, shift.date);
    let shiftAllowanceAmount = 0;
    if (allowance && allowance.amount != null) {
      shiftAllowanceAmount = allowance.amount;
      if (!allowance.verified && allowance.verificationNote) warnings.push(allowance.verificationNote);
    }

    // --- Other allowances (explicit only) --------------------------------
    const otherAllowanceItems = [];
    if (Array.isArray(shift.allowances)) {
      for (const key of shift.allowances) {
        const def = R.otherAllowances[key];
        if (!def) {
          warnings.push(`Unknown allowance "${key}" — not included.`);
          continue;
        }
        const row = R.rateOn(def.table, shift.date);
        if (row) {
          otherAllowanceItems.push({ key, label: def.label, amount: row.amount, agreementClause: def.agreementClause });
        }
      }
    }
    const otherAllowanceTotal = round2(otherAllowanceItems.reduce((s, a) => s + a.amount, 0));

    // --- Missed meal break (clause 44.1(c)) -------------------------------
    // "An Employee unable to take a meal break will be paid for the meal break as
    // time worked at their ordinary rate plus 50%." Applied only when flagged.
    let missedMealBreak = null;
    if (shift.mealBreakNotTaken) {
      const breakHours = mealBreakHours || 0.5; // default to the cl 44.1(a) minimum
      const amount = round2(breakHours * baseHourly * 1.5);
      missedMealBreak = {
        label: 'Meal break not taken',
        hours: breakHours,
        multiplier: 1.5,
        amount,
        agreementClause: 'Clause 44.1(c)',
        calculationMethod: 'Paid as time worked at the ordinary rate plus 50%.',
      };
    }
    const missedMealBreakTotal = missedMealBreak ? missedMealBreak.amount : 0;

    // --- Overtime (explicit only) ----------------------------------------
    const overtimeResult = calculateOvertime(shift, baseHourly, win);
    const overtimeTotal = overtimeResult ? overtimeResult.total : 0;

    const estimatedGross = round2(
      ordinaryPay + weekendPenalty + publicHolidayPenalty + shiftAllowanceAmount +
      otherAllowanceTotal + missedMealBreakTotal + overtimeTotal
    );

    const needsVerification =
      (allowance && allowance.verified === false && allowance.amount != null) ||
      segments.some((s) => s.isPublicHoliday && !(R.isPublicHoliday(s.date) || {}).verified);

    return {
      date: shift.date,
      dayOfWeek: parseLocalDate(shift.date).toLocaleDateString('en-AU', { weekday: 'long' }),
      shiftType: shift.shiftType,
      start: win ? win.startTime : null,
      end: win ? win.endTime : null,
      paidHours,
      baseHourlyRate: baseHourly,
      baseRateInfo: rateInfo,

      segments,
      ordinaryPay,

      shiftAllowance: allowance
        ? {
            label: ALLOWANCE_LABELS[allowance.category] || 'Shift allowance',
            category: allowance.category,
            amount: allowance.amount,
            verified: allowance.verified,
            verificationNote: allowance.verificationNote,
            reason: classification.reason,
            agreementClause: allowance.agreementClause,
          }
        : { label: 'Shift allowance', category: null, amount: 0, verified: true, reason: classification.reason },

      weekendPenalty,
      publicHolidayPenalty,
      publicHolidayName: (segments.find((s) => s.isPublicHoliday) || {}).publicHolidayName || null,
      otherAllowances: otherAllowanceItems,
      otherAllowanceTotal,
      missedMealBreak,
      missedMealBreakTotal,
      overtime: overtimeResult,
      overtimeTotal,

      estimatedGross,
      needsVerification,
      warnings,
      notes,
    };
  }

  /* ------------------------------------------------------------------ *
   * Aggregate a set of shifts (week / fortnight / whole roster)
   * ------------------------------------------------------------------ */

  function summarise(shifts, shiftTypes) {
    const results = shifts.map((s) => calculateShift(s, shiftTypes));
    const sum = (fn) => round2(results.reduce((acc, r) => acc + (fn(r) || 0), 0));

    return {
      shiftCount: results.length,
      rosteredHours: round2(results.reduce((acc, r) => acc + (r.paidHours || 0), 0)),
      ordinaryPay: sum((r) => r.ordinaryPay),
      shiftAllowances: sum((r) => (r.shiftAllowance ? r.shiftAllowance.amount : 0)),
      weekendPenalties: sum((r) => r.weekendPenalty),
      publicHolidayPenalties: sum((r) => r.publicHolidayPenalty),
      otherAllowances: sum((r) => r.otherAllowanceTotal),
      missedMealBreaks: sum((r) => r.missedMealBreakTotal),
      overtime: sum((r) => r.overtimeTotal),
      estimatedGross: sum((r) => r.estimatedGross),
      needsVerification: results.some((r) => r.needsVerification),
      results,
    };
  }

  /**
   * Informational only — flags clause 49.2(a) situations worth checking.
   * NEVER used to reclassify rostered ordinary hours as overtime.
   */
  function assessOvertimeIndicators(weekShifts, weekHours) {
    const t = R.overtime.referenceThresholds;
    const flags = [];
    if (weekHours > t.maxOrdinaryHoursPerWeek) {
      flags.push({
        level: 'check',
        text: `${weekHours}h exceeds the ${t.maxOrdinaryHoursPerWeek}h maximum ordinary hours in a week (cl 42.3) — hours beyond this are overtime.`,
      });
    } else if (weekHours > t.fullTimeWeeklyHours) {
      flags.push({
        level: 'check',
        text: `${weekHours}h exceeds full-time ordinary hours of ${t.fullTimeWeeklyHours}h (cl 42.1) — may attract overtime under cl 49.2(a)(i).`,
      });
    }
    return flags;
  }

  global.PayEngine = {
    calculateShift,
    summarise,
    assessOvertimeIndicators,
    round2,
  };
})(typeof window !== 'undefined' ? window : globalThis);
