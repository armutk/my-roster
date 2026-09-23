# Payslip reconciliation — pay period 07/09/2026 to 20/09/2026

First real payslip checked against the roster (open item in AGENTS.md §9).
Sources: `tools/fixtures/rosteron-2026-08-26.txt`, `tools/fixtures/rosteron-2026-09-09.txt`,
`src/data/roster.json`, and the Mercy payslip `E005885_Payslip_2026-09-20.PDF`
(payment date 23/09/2026).

## Roster for the period (RosterOn)

| Date | Day | Shift | Times | Paid |
|---|---|---|---|---|
| 07/09 | Mon | afternoon | 13:00–21:30 | 8 |
| 08/09 | Tue | day (orientation) | 07:00–15:30 | 8 |
| 09/09 | Wed | day | 07:00–15:30 | 8 |
| 12/09 | Sat | day | 07:00–15:30 | 8 |
| 13/09 | Sun | afternoon | 13:00–21:30 | 8 |
| 14/09 | Mon | afternoon | 13:00–21:30 | 8 |
| 16/09 | Wed | afternoon | 13:00–21:30 | 8 |
| 19/09 | Sat | afternoon | 13:00–21:30 | 8 |

8 rostered shifts, 64 nominal hours. Three weekend shifts (12/09, 13/09, 19/09),
24 h nominal. She finished 1.5 h early on one shift, so 62.5 hours were worked.
The 08/09 shift is absent from `roster.json` (dropped on the 9 Sep import as
"absent from the supplied window") but is present in the 26 Aug RosterOn capture
and is paid on the payslip. `roster.json` needs it back.

## Payslip

| Line | Units | Rate | Amount |
|---|---|---|---|
| Ordinary Hours | 54.50 | 51.7947 | 2,822.81 |
| Orientation Shift (08/09) | 8.00 | 51.7947 | 414.36 |
| Penalty 50% | 16.00 | 51.7947 | 414.36 |
| Afternoon Shift Allowance | 5.00 | 36.6000 | 183.00 |
| Laundry Allowance – Unit/Shift | 8.00 | 0.6000 | 4.80 |
| **Total** | | | **3,839.33** |

`W/Ends worked: 1`. Base hourly on the payslip is **51.7947** = 1,968.20 / 38
(the *exact* mode in `payRules.js`), not the published 51.79.

## What matches

- **Ordinary hours 54.50 against 56 nominal.** 56 − 1.5 = 54.5. She finished
  1.5 h early on one shift (Ahmed, 23 Sep 2026). Ordinary hours follow actual
  worked time, so the payslip is correct here and the roster is the nominal
  figure. **Resolved — not a shortfall.**
- **Afternoon Shift Allowance: 5.00 units.** The roster has exactly five
  afternoon shifts finishing 21:30 (07, 13, 14, 16, 19 Sep). Flat $36.60 per
  shift is confirmed, and it is confirmed to apply to weekend afternoons. Still
  5 units, so the early finish did not push a shift out of the cl 34.1(b) window.
- **Laundry allowance: 8.00 units** = 8 shifts, matching the 8 the roster shows.
- Weekend ordinary hours are paid as base + 50% loading, i.e. the cl 48.1
  single 150% weekend rate as modelled in `payEngine.js`.

## Open discrepancy — weekend penalty (Sat 19/09)

Penalty 50% is paid on 16.00 units, supporting only 16 h of the 24 h of weekend
work the roster shows. `W/Ends worked: 1` says payroll counted one weekend, so
the flagged pair is 12/09 + 13/09 and **Sat 19/09 lost its weekend flag**
(inference: payslip penalty lines are period-anchored at 07/09, so they cannot
name individual shifts).

Amount at stake: 8 h × 50% × 51.7947 = **$207.18** gross. If the 1.5 h early
finish was on the 19/09 shift itself, the correct loading applies to 6.5 h =
**$168.33**. The 16.00 units are exactly two full 8 h shifts, which rules out
the short-shift being one of the flagged two.

Exactly one item to raise with Mercy payroll. Nothing here changes roster data
except restoring the missing 08/09 shift.
