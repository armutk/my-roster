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

8 shifts, 64 paid hours. Three weekend shifts (12/09, 13/09, 19/09), 24 h.
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

- **Afternoon Shift Allowance: 5.00 units.** The roster has exactly five
  afternoon shifts finishing 21:30 (07, 13, 14, 16, 19 Sep). Flat $36.60 per
  shift is confirmed, and it is confirmed to apply to weekend afternoons.
- **Laundry allowance: 8.00 units** = 8 shifts, matching the 8 the roster shows.
- Weekend ordinary hours are paid as base + 50% loading, i.e. the cl 48.1
  single 150% weekend rate as modelled in `payEngine.js`.

## Discrepancies

1. **Weekend penalty paid on 2 shifts, not 3.** Penalty 50% at 16.00 units
   covers 16 h; the roster has 24 h of weekend work. Missing 8 h × 50% ×
   51.7947 = **$207.18**. The payslip's own counter (`W/Ends worked: 1`) agrees
   payroll only counted one weekend, which points at **Sat 19/09** as the shift
   that lost its weekend flag (12/09 + 13/09 form the one weekend counted).
2. **Ordinary hours 54.50, roster 56** for the seven non-orientation shifts.
   1.5 h × 51.7947 = **$77.69**.

Total gross shortfall **≈ $284.87** (plus ~$34 super at 12%).

Engine check: `payEngine` gross for the period at the published rate is
3,704.72 against the payslip's comparable 3,419.88, a 284.84 gap, which
decomposes to exactly the two items above.

## Action

Raise with Mercy payroll: (a) weekend penalty missing for Sat 19/09, (b) 1.5 h
missing from ordinary hours. Nothing here changes the roster data except the
missing 08/09 shift.
