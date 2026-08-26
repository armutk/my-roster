/**
 * payRules.js — Configurable pay rules for the My Roster pay engine.
 *
 * SOURCE OF TRUTH
 * ---------------
 * Nurses and Midwives (Victorian Public Sector) Single Interest Employers
 * Enterprise Agreement 2024-2028 (the "Agreement").
 * Approved by the Fair Work Commission 8 November 2024; operative 15 November 2024.
 * Nominal term 1 May 2024 - 30 April 2028.
 *
 * Every rate below was read from the Agreement text (clause numbers cited per rule).
 * NOTHING HERE IS INVENTED. Where a provision is genuinely ambiguous or a rate could
 * not be confirmed, the rule carries `verified: false` and the UI renders it as
 * "Needs verification" rather than silently applying an assumed number.
 *
 * HOW TO UPDATE WHEN RATES CHANGE
 * -------------------------------
 * Each rate is an effective-dated table. Add a new row with a later `effectiveFrom`
 * and the engine will pick it up automatically for shifts on/after that date.
 * Do not edit historical rows — they keep past calculations reproducible.
 */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Employee configuration
   * ------------------------------------------------------------------ */

  const EMPLOYEE = {
    position: 'Registered Nurse',
    classification: 'Registered Nurse Grade 2, Year 7',
    classificationCode: 'YP8',
    gradeCode: 'RN/M 7',
    employer: 'Mercy Hospitals Victoria Ltd / Mercy Health',
    workplace: 'Werribee Mercy Hospital',
    employmentType: 'part-time',
    contractedWeeklyHours: 32,
    // Clause 17.1: full-time is 38 hours/week. This is the figure overtime keys off,
    // NOT the part-time contracted average above.
    fullTimeWeeklyHours: 38,
    fullTimeFortnightHours: 76,
  };

  /* ------------------------------------------------------------------ *
   * Base rate — Appendix 2, Part 1 (Wages)
   *
   * Clause 18.3: "A part-time Employee will be paid an hourly rate equal to
   * 1/38th of the weekly salary for the Employee's classification."
   *
   * Appendix 2 publishes both the weekly salary and an "Indicative Hourly Rate".
   * For RN GRADE 2 YEAR 7 (YP8) the two differ by a fraction of a cent because the
   * published hourly figure is rounded:
   *     $1,968.20 / 38 = $51.794736...  -> published as $51.79
   * `hourlyRateMode` below controls which is used. Default 'published' matches the
   * rate stated on the employee's own paperwork and the Appendix 2 printed figure.
   * ------------------------------------------------------------------ */

  const hourlyRateMode = 'published'; // 'published' | 'exact'

  const baseRate = {
    label: 'Base hourly rate',
    source: 'Agreement Appendix 2, Part 1 — Wages (row: RN GRADE 2 YEAR 7, code YP8, grade RN/M 7)',
    agreementClause: 'Clause 18.3 (Part-time Employment); Appendix 2',
    calculationMethod:
      'Hourly rate = 1/38th of the weekly salary for the classification. Ordinary pay = paid hours x hourly rate.',
    verified: true,
    table: [
      { effectiveFrom: '2024-06-15', weeklySalary: 1815.60, publishedHourly: 47.78, note: 'On and from 15/06/2024 (3%)' },
      { effectiveFrom: '2024-07-01', weeklySalary: 1850.80, publishedHourly: 48.71, note: 'FFPPOA 1/07/2024 (1.94%)' },
      { effectiveFrom: '2025-05-12', weeklySalary: 1906.30, publishedHourly: 50.17, note: 'FFPPOOA 12/05/2025 (3%)' },
      { effectiveFrom: '2025-11-29', weeklySalary: 1910.90, publishedHourly: 50.29, note: 'On and from 29/11/2025 (1.19%)' },
      { effectiveFrom: '2026-05-11', weeklySalary: 1968.20, publishedHourly: 51.79, note: 'FFPPOOA 11/05/2026 (3%) — applies to the Sep/Oct 2026 roster' },
      { effectiveFrom: '2026-11-30', weeklySalary: 1972.80, publishedHourly: 51.92, note: 'On and from 30/11/2026 (1.06%)' },
      { effectiveFrom: '2027-05-10', weeklySalary: 2032.00, publishedHourly: 53.47, note: 'FFPPOOA 10/05/2027 (3%)' },
      { effectiveFrom: '2027-11-29', weeklySalary: 2263.40, publishedHourly: 59.56, note: 'On and from 29/11/2027 (9.43%)' },
    ],
  };

  /* ------------------------------------------------------------------ *
   * Shift definitions — Clause 34.1
   *
   * IMPORTANT: these are the Agreement's own qualifying tests. A shift attracts a
   * shift allowance because of when it STARTS/FINISHES, not because of what the
   * roster happens to label it.
   *
   * 34.1(a) Morning shift: "any shift that commences between 6:00 p.m. and 6:30 a.m."
   *         [Reproduced verbatim from the Agreement. The 6:00 p.m. bound reads as a
   *          drafting quirk — an early-start allowance would ordinarily read
   *          "6:00 a.m. and 6:30 a.m.". Flagged unverified. Either reading excludes a
   *          07:00 start, so the day shifts in this roster are unaffected.]
   * 34.1(b) Afternoon shift: "any shift that finishes between 6:00 p.m. and 8 a.m."
   * 34.1(c) Night shift: "any shift that finishes on the day after commencing duty or
   *         commences after midnight and before 5.00 a.m."
   * 34.1(d) Sunday night shift: commences Sunday and concludes Monday.
   *
   * 34.2: where a shift meets more than one definition, ONE allowance only is paid —
   *       the higher one where the rates differ.
   * ------------------------------------------------------------------ */

  const shiftDefinitions = {
    source: 'Agreement clause 34.1 (Shift Allowance — Definitions)',
    agreementClause: 'Clause 34.1',
    morning: {
      test: 'Commences between 18:00 and 06:30',
      commencesFrom: '18:00',
      commencesTo: '06:30',
      verified: false,
      verificationNote:
        'Clause 34.1(a) as printed reads "commences between 6:00 p.m. and 6:30 a.m.". Likely a drafting quirk for 6:00 a.m. Confirm with payroll before relying on a morning-shift allowance. No shift in the current roster qualifies under either reading.',
    },
    afternoon: {
      test: 'Finishes between 18:00 and 08:00',
      finishesFrom: '18:00',
      finishesTo: '08:00',
      verified: true,
    },
    night: {
      test: 'Finishes on the day after commencing duty, OR commences after 00:00 and before 05:00',
      verified: true,
    },
    sundayNight: {
      test: 'Commences Sunday and concludes Monday',
      verified: true,
    },
  };

  /* ------------------------------------------------------------------ *
   * Shift allowances — Clause 34.3 + Appendix 2, Part 2 (Allowances)
   *
   * CRITICAL: these are FLAT DOLLAR AMOUNTS "per rostered period of duty" —
   * they are NOT a percentage of the hourly rate, and they do NOT scale with
   * shift length. Confirmed independently: ANMF Victoria describes the afternoon
   * shift allowance as a per-shift amount (it rose from $31.50 to $32.50 per shift
   * from Dec 2022, which matches Appendix 2's "Current" column).
   *
   * Clause 34.3 opens "In addition to any other rates prescribed elsewhere in this
   * Agreement" — so the allowance stacks on top of weekend / public holiday rates.
   * ------------------------------------------------------------------ */

  const shiftAllowances = {
    source: 'Agreement clause 34.3; Appendix 2, Part 2 — Allowances (Shift Allowance)',
    agreementClause: 'Clause 34.3',
    calculationMethod:
      'Flat dollar amount per rostered period of duty, paid in addition to all other rates. Not pro-rated by shift length. Clause 34.2: only one shift allowance per shift — the higher where rates differ.',

    morning: {
      verified: false,
      verificationNote: 'Rate is published, but the clause 34.1(a) qualifying window is ambiguous — see shiftDefinitions.morning.',
      table: [
        { effectiveFrom: '2024-06-15', amount: 33.50 },
        { effectiveFrom: '2024-07-01', amount: 34.10 },
        { effectiveFrom: '2025-05-12', amount: 35.10 },
        { effectiveFrom: '2025-11-24', amount: 35.50 },
        { effectiveFrom: '2026-05-11', amount: 36.60 },
        { effectiveFrom: '2026-11-23', amount: 37.00 },
        { effectiveFrom: '2027-05-10', amount: 38.10 },
        { effectiveFrom: '2028-04-17', amount: 41.70 },
      ],
    },

    afternoon: {
      verified: true,
      table: [
        { effectiveFrom: '2024-06-15', amount: 33.50 },
        { effectiveFrom: '2024-07-01', amount: 34.10 },
        { effectiveFrom: '2025-05-12', amount: 35.10 },
        { effectiveFrom: '2025-11-24', amount: 35.50 },
        { effectiveFrom: '2026-05-11', amount: 36.60 }, // applies to the Sep/Oct 2026 roster
        { effectiveFrom: '2026-11-23', amount: 37.00 },
        { effectiveFrom: '2027-05-10', amount: 38.10 },
        { effectiveFrom: '2028-04-17', amount: 41.70 },
      ],
    },

    /**
     * Night shift, non-casual. Clause 34.3(c)(iii) (from 15 May 2025) sets these as
     * the casual night rate uplifted by 12.5% (Mon-Thu) or 25% (Fri/Sat). Appendix 2
     * publishes the resulting figures directly, which is what we use.
     */
    nightMonThu: {
      verified: true,
      agreementClause: 'Clause 34.3(c)(iii)(A)',
      table: [
        { effectiveFrom: '2024-06-15', amount: 92.60 },
        { effectiveFrom: '2024-07-01', amount: 94.40 },
        { effectiveFrom: '2025-05-12', amount: 109.40 },
        { effectiveFrom: '2025-11-24', amount: 110.70 },
        { effectiveFrom: '2026-05-11', amount: 114.00 },
        { effectiveFrom: '2026-11-23', amount: 115.20 },
        { effectiveFrom: '2027-05-10', amount: 118.70 },
        { effectiveFrom: '2028-04-17', amount: 129.90 },
      ],
    },

    nightFriSat: {
      verified: true,
      agreementClause: 'Clause 34.3(c)(iii)(B)',
      table: [
        { effectiveFrom: '2024-06-15', amount: 92.60 },
        { effectiveFrom: '2024-07-01', amount: 94.40 },
        { effectiveFrom: '2025-05-12', amount: 121.50 },
        { effectiveFrom: '2025-11-24', amount: 122.90 },
        { effectiveFrom: '2026-05-11', amount: 126.60 },
        { effectiveFrom: '2026-11-23', amount: 127.90 },
        { effectiveFrom: '2027-05-10', amount: 131.70 },
        { effectiveFrom: '2028-04-17', amount: 144.10 },
      ],
    },

    /**
     * Sunday night shift. Clause 34.3(c)(iii)(C) reads "the Sunday Night shift rate in
     * Appendix 2 plus 12.5%". It is not clear whether the published Appendix 2 Sunday
     * figure is already inclusive of that 12.5% or whether the uplift is applied on top.
     * The published figure is used, and the rule is flagged for verification.
     */
    nightSunday: {
      verified: false,
      agreementClause: 'Clause 34.3(c)(iii)(C)',
      verificationNote:
        'Clause 34.3(c)(iii)(C) says "the Sunday Night shift rate in Appendix 2 plus 12.5%". Unclear whether the published Appendix 2 Sunday figure already includes that uplift. Confirm with payroll before relying on this amount.',
      table: [
        { effectiveFrom: '2024-06-15', amount: 159.30 },
        { effectiveFrom: '2024-07-01', amount: 162.40 },
        { effectiveFrom: '2025-05-12', amount: 188.20 },
        { effectiveFrom: '2025-11-24', amount: 190.40 },
        { effectiveFrom: '2026-05-11', amount: 196.10 },
        { effectiveFrom: '2026-11-23', amount: 198.20 },
        { effectiveFrom: '2027-05-10', amount: 204.10 },
        { effectiveFrom: '2028-04-17', amount: 223.30 },
      ],
    },
  };

  /* ------------------------------------------------------------------ *
   * Weekend penalty — Clause 48.1
   *
   * "All ordinary hours of work between midnight on Friday and midnight on Sunday
   *  will be paid for at the rate of time and a half."
   *
   * NOTE: the Agreement sets ONE rate covering both Saturday and Sunday — there is no
   * separate, higher Sunday rate for ordinary hours in this Agreement. Both keys are
   * exposed below (the brief asked for them separately) but they carry the same
   * clause and the same 150% figure.
   *
   * The window "midnight Friday to midnight Sunday" is exactly the whole of Saturday
   * plus the whole of Sunday, so the engine can decide this per calendar day.
   * ------------------------------------------------------------------ */

  const weekendPenalty = {
    source: 'Agreement clause 48.1 (Special Rates for Saturdays and Sundays)',
    agreementClause: 'Clause 48.1',
    effectiveFrom: '2024-11-15',
    calculationMethod:
      'All ORDINARY hours falling between midnight Friday and midnight Sunday are paid at 150% of the base hourly rate. Displayed as base pay (100%) plus a weekend penalty component (50%).',
    verified: true,
    saturdayMultiplier: 1.5,
    sundayMultiplier: 1.5,
    note: 'Clause 48.1 applies a single time-and-a-half rate across both weekend days; it does not set a higher Sunday rate.',
  };

  /* ------------------------------------------------------------------ *
   * Public holiday penalty — Clause 56.5(a)
   *
   * 56.5(a)(i)  200% for time worked on a public holiday Monday to Friday
   * 56.5(a)(ii) 250% for time worked on a public holiday on a Saturday or Sunday,
   *             "which is inclusive of the rates in clause 48" — so the weekend
   *             penalty is NOT stacked on top of the public holiday rate.
   * ------------------------------------------------------------------ */

  const publicHolidayPenalty = {
    source: 'Agreement clause 56.5(a) (Penalty Payments in respect of public holidays)',
    agreementClause: 'Clause 56.5(a)',
    effectiveFrom: '2024-11-15',
    calculationMethod:
      'Time worked on a public holiday is paid at 200% (Mon-Fri) or 250% (Sat/Sun) of the base hourly rate, based on 1/38th of the weekly salary. The Sat/Sun rate is inclusive of clause 48, so the weekend penalty is not applied in addition.',
    verified: true,
    weekdayMultiplier: 2.0,
    weekendMultiplier: 2.5,
    supersedesWeekendPenalty: true,
  };

  /* ------------------------------------------------------------------ *
   * Public holidays applying to this workplace (Victoria — metropolitan Melbourne).
   *
   * Werribee Mercy Hospital is in metropolitan Melbourne, so the metropolitan
   * Victorian public holiday list applies.
   *
   * Only dates relevant to loaded roster periods need to be listed here.
   * ------------------------------------------------------------------ */

  const publicHolidays = {
    source: 'Business Victoria — Victorian public holidays (metropolitan Melbourne)',
    jurisdiction: 'Victoria (metropolitan)',
    calculationMethod: 'A shift segment falling on one of these dates is paid at the clause 56.5(a) public holiday rate.',
    dates: [
      {
        date: '2026-09-25',
        name: 'Friday before the AFL Grand Final',
        verified: true,
        note:
          'Confirmed as a Victorian public holiday for 2026. The exact date of this holiday depends on the AFL fixture and is gazetted each year — re-confirm if the fixture changes.',
      },
      {
        date: '2026-11-03',
        name: 'Melbourne Cup Day',
        verified: true,
        note: 'Metropolitan Melbourne. Outside the current roster period; listed for future roster loads.',
      },
    ],
  };

  /* ------------------------------------------------------------------ *
   * Overtime — Clause 49.2
   *
   * WHAT COUNTS AS OVERTIME (clause 49.2(a)) — work requested or directed by the
   * Employer that is performed:
   *   (i)   in addition to the FULL-TIME ordinary hours at clause 42.1 (38/week,
   *         76/fortnight, 152/four weeks, 190/five weeks of 10-hour night shifts);
   *   (ii)  in addition to clause 42.3 (not more than 48 ordinary hours in any week);
   *   (iii) in addition to the Employee's ROSTERED SHIFT LENGTH;
   *   (iv)  where a break of at least 8 hours has not been provided between
   *         successive shifts — for all work until an 8-hour break is provided; or
   *   (v)   as recall to duty, including recall on a public holiday.
   *
   * *** THE PART-TIME POINT ***
   * Exceeding the employee's own 32-hour part-time average is NOT in that list.
   * Clause 18.1-18.3 make a part-time employee one engaged for less than 38 hours
   * paid at 1/38th of the weekly salary, and clause 18.2 expressly allows the hours
   * worked to VARY from week to week by mutual agreement. Clause 46.4 treats extra
   * shifts picked up via the supplementary roster as "additional shifts worked by
   * agreement", with clause 46.7 confirming overtime "remains payable where it would
   * otherwise apply, such as double shifts and recall" — i.e. by the clause 49.2(a)
   * triggers, not by passing 32 hours.
   *
   * The engine therefore NEVER infers overtime from weekly hours above 32. Overtime is
   * only ever applied when explicitly recorded against a shift.
   * ------------------------------------------------------------------ */

  const overtime = {
    source: 'Agreement clause 49.2 (Overtime Penalty Rates); clause 42.1/42.3 (Hours of Work)',
    agreementClause: 'Clause 49.2(c)',
    effectiveFrom: '2024-11-15',
    calculationMethod:
      'Monday-Friday: 150% for the first two hours of overtime, 200% thereafter. Saturday/Sunday: 200% for all overtime hours. Public holidays: per clause 56. Clause 49.2(e): each day or shift stands alone.',
    verified: true,
    firstTwoHoursOvertimeMultiplier: 1.5,
    subsequentOvertimeMultiplier: 2.0,
    firstTierHours: 2,
    weekendOvertimeMultiplier: 2.0,
    eachShiftStandsAlone: true,

    triggers: {
      agreementClause: 'Clause 49.2(a)',
      list: [
        'Work in addition to full-time ordinary hours under clause 42.1 (38 per week / 76 per fortnight)',
        'Work in addition to clause 42.3 (more than 48 ordinary hours in any week)',
        'Work in addition to the employee’s rostered shift length',
        'Work performed where a break of at least 8 hours was not provided between successive shifts',
        'Recall to duty, including recall on a public holiday',
      ],
      notATrigger:
        'Working more than the employee’s 32-hour part-time contracted average is NOT, on its own, an overtime trigger. Clause 18.2 allows part-time hours to vary by mutual agreement, and clause 46.4 treats additional shifts as ordinary shifts worked by agreement.',
    },

    // Reference thresholds used for INFORMATIONAL flagging only — never to auto-apply
    // an overtime rate to rostered ordinary hours.
    referenceThresholds: {
      fullTimeWeeklyHours: 38,
      fullTimeFortnightHours: 76,
      maxOrdinaryHoursPerWeek: 48,
      minimumBreakBetweenShiftsHours: 8,
    },
  };

  /* ------------------------------------------------------------------ *
   * Other allowances — situational, cannot be derived from roster data alone.
   * These are applied only when explicitly flagged on a shift.
   * ------------------------------------------------------------------ */

  const otherAllowances = {
    source: 'Agreement Appendix 2, Part 2 — Allowances',
    changeOfRoster7Days: {
      label: 'Change of roster allowance (less than 7 days notice)',
      agreementClause: 'Clause 45 (Rosters); clause 46.9',
      calculationMethod: 'Flat amount per occasion where the employer changes the roster, or requests an additional shift other than via the supplementary roster.',
      verified: true,
      table: [
        { effectiveFrom: '2025-05-12', amount: 78.10 },
        { effectiveFrom: '2025-11-24', amount: 79.00 },
        { effectiveFrom: '2026-05-11', amount: 81.40 },
        { effectiveFrom: '2026-11-23', amount: 82.30 },
      ],
    },
    changeOfRoster14Days: {
      label: 'Change of roster allowance (less than 14 days notice)',
      agreementClause: 'Clause 45 (Rosters); clause 46.9',
      calculationMethod: 'Flat amount per occasion.',
      verified: true,
      table: [
        { effectiveFrom: '2025-05-12', amount: 39.00 },
        { effectiveFrom: '2025-11-24', amount: 39.50 },
        { effectiveFrom: '2026-05-11', amount: 40.70 },
        { effectiveFrom: '2026-11-23', amount: 41.10 },
      ],
    },
    changeOfWard: {
      label: 'Change of ward allowance',
      agreementClause: 'Appendix 2, Part 2',
      calculationMethod: 'Flat amount per occasion.',
      verified: true,
      table: [
        { effectiveFrom: '2025-05-12', amount: 39.00 },
        { effectiveFrom: '2025-11-24', amount: 39.50 },
        { effectiveFrom: '2026-05-11', amount: 40.70 },
        { effectiveFrom: '2026-11-23', amount: 41.10 },
      ],
    },
  };

  /* ------------------------------------------------------------------ *
   * Things this engine deliberately does NOT calculate.
   * Surfaced in the UI so the estimate is never mistaken for a payslip.
   * ------------------------------------------------------------------ */

  const exclusions = [
    'Superannuation contributions',
    'PAYG income tax withholding (all figures are GROSS, before tax)',
    'Salary packaging / novated lease deductions',
    'Higher duties (clause 35) — applies when relieving in a higher grade',
    'On-call and recall allowances (clauses 50, 51) unless recorded against a shift',
    'Qualification, in-charge and other role-specific allowances',
    'Annual leave loading, accruals and any leave payments',
  ];

  const AGREEMENT_META = {
    title: 'Nurses and Midwives (Victorian Public Sector) Single Interest Employers Enterprise Agreement 2024-2028',
    approved: '2024-11-08',
    operativeFrom: '2024-11-15',
    nominalExpiry: '2028-04-30',
    parties: 'Victorian Hospitals Industrial Association (VHIA) / ANMF / HSU',
  };

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  /** Pick the row from an effective-dated table applicable on `isoDate`. */
  function rateOn(table, isoDate) {
    let chosen = null;
    for (const row of table) {
      if (row.effectiveFrom <= isoDate) {
        if (!chosen || row.effectiveFrom > chosen.effectiveFrom) chosen = row;
      }
    }
    return chosen;
  }

  /** Base hourly rate applicable on a date, honouring hourlyRateMode. */
  function baseHourlyRateOn(isoDate) {
    const row = rateOn(baseRate.table, isoDate);
    if (!row) return null;
    const exact = row.weeklySalary / EMPLOYEE.fullTimeWeeklyHours;
    return {
      rate: hourlyRateMode === 'exact' ? exact : row.publishedHourly,
      publishedHourly: row.publishedHourly,
      exactHourly: exact,
      weeklySalary: row.weeklySalary,
      effectiveFrom: row.effectiveFrom,
      note: row.note,
    };
  }

  function isPublicHoliday(isoDate) {
    return publicHolidays.dates.find((h) => h.date === isoDate) || null;
  }

  global.PayRules = {
    AGREEMENT_META,
    EMPLOYEE,
    hourlyRateMode,
    baseRate,
    shiftDefinitions,
    shiftAllowances,
    weekendPenalty,
    publicHolidayPenalty,
    publicHolidays,
    overtime,
    otherAllowances,
    exclusions,
    rateOn,
    baseHourlyRateOn,
    isPublicHoliday,
  };
})(typeof window !== 'undefined' ? window : globalThis);
