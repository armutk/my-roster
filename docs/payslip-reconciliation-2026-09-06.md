# Payslip reconciliation — pay period 24/08/2026 to 06/09/2026

Second real payslip checked against the roster, and the earliest one on file
(payment date 09/09/2026, first payslip of the Mercy engagement).
Sources: `tools/fixtures/rosteron-2026-08-26.txt`, `src/data/roster.json`
(sourceRetrieved 19 Sep 2026), payslip `E005885_Payslip_2026-09-06.PDF`.

## Roster for the period

| Date | Day | Shift | Times | Paid | Note |
|---|---|---|---|---|---|
| 24/08 | Mon | orientation | — | 8 | not in RosterOn feed |
| 25/08 | Tue | orientation | — | 8 | not in RosterOn feed |
| 26/08 | Wed | day | 07:00–15:30 | 8 | Buddy Shift |
| 27/08 | Thu | day | 07:00–15:30 | 8 | Buddy Shift |
| 28/08 | Fri | day | 07:00–15:30 | 8 | Buddy Shift |
| 02/09 | Wed | afternoon | 13:00–21:30 | 8 | Buddy Shift |
| 03/09 | Thu | afternoon | 13:00–21:30 | 8 | |
| 04/09 | Fri | afternoon | 13:00–21:30 | 8 | |

48 rostered hours in the RosterOn feed (6 shifts), plus the two orientation days
before the feed starts, 64 hours paid in total. No weekend shifts, so no weekend
loading is due. No Victorian public holiday falls in the period.

## Payslip

| Line | Units | Rate | Amount |
|---|---|---|---|
| Ordinary Hours | 16.00 | 51.7947 | 828.72 |
| Buddy Shift | 32.00 | 51.7947 | 1,657.44 |
| Orientation Shift | 16.00 | 51.7947 | 828.72 |
| Afternoon Shift Allowance | 3.00 | 36.6000 | 109.80 |
| Laundry Allowance – Unit/Shift | 8.00 | 0.6000 | 4.80 |
| **Total gross** | | | **3,429.48** |

PAYG 734.00 (21.4% effective, no salary packaging yet) · Net 2,695.48 to direct
credit 063622 11479929 · Employer super 410.96 · AL 6.15 h · SL 2.95 h ·
`W/Ends worked 0`, `SWOC taken 0`.

## Every line ties to the roster

- **Buddy Shift 32.00 units = the four shifts RosterOn flags as "Buddy Shift"**
  (26, 27, 28/08 and 02/09). No loading — buddy shifts are ordinary rate.
- **Ordinary Hours 16.00 = the two unflagged shifts** (03/09 and 04/09).
  32 + 16 = the 48 rostered hours exactly.
- **Orientation Shift 16.00 = the two orientation days** (24 and 25/08), the days
  before the RosterOn feed begins. Ahmed to confirm the two dates.
- **Afternoon Shift Allowance 3.00** = the three afternoon shifts (02, 03, 04/09).
  The allowance was paid on the buddy afternoon too, and at the same $36.60 flat
  rate later confirmed on the 23/09 payslip.
- **Laundry Allowance 8.00** = 8 shifts paid, orientation included.
- **Rate 51.7947** = 1,968.20 / 38 (cl 18.3 part-time hourly), same rate as every
  later payslip.
- **Per-shift rounding confirmed.** 8 h × 51.7947 = 414.3576; payroll rounds each
  shift to 414.36, so 4 buddy shifts print as 1,657.44 rather than 1,657.43. One
  cent in her favour, and it explains the same rounding on the 23/09 payslip.

## Independent cross-checks that passed

- **Super:** 410.96 = 12% of 3,424.68 superable earnings = gross 3,429.48 less the
  non-superable laundry allowance. The afternoon allowance **is** superable.
- **Net pay:** 3,429.48 − 734.00 = 2,695.48, matching the direct credit exactly.
- **YTD continuity into the 23/09 payslip:** gross 3,429.48 → 7,268.81,
  PAYG 734.00 → 1,386.00, super 410.96 → 871.10. All three differences equal the
  second payslip's own figures to the cent. The two payslips are one continuous
  record, so nothing is missing between them.
- **"Annual Salary: $86,186.38"** is the 32 h/week pro-rata figure
  (1,968.20 × 32/38 × 52 = 86,186.44, 6 cents apart), not a lower base. The
  hourly rate stays the full-time 1/38th, as cl 18.3 requires.
- **AL accrual matches 5 weeks a year:** 6.15 h on 64 h = 9.61%, i.e. 4 weeks
  (7.69%) plus the VIC additional week (1.92%). The 23/09 period accrues 6.01 h on
  62.5 h at the same rate.

## Verdict

**No discrepancies.** Every hour, allowance, super dollar and tax dollar on this
payslip reconciles. Nothing to raise with payroll.

## Notes

- `roster.json` has no entry for the 24 and 25/08 orientation days or the 08/09
  orientation shift. Three orientation shifts are unrepresented in app data.
- **SL accrual 2.95 h on 64 h = 4.61%**, i.e. the equivalent of 12 days a year on
  7.6-hour days. Later confirmed at the same rate (2.89 h on 62.5 h). If her
  personal-leave entitlement is 15 days a year (5.77%), the accrual is short
  1.16% of hours. Worth one question to payroll, quoting the personal leave
  clause of the current agreement.
