# App estimate vs real payslips

Does the roster app's estimated gross match what Mercy actually paid? Ran
`tools/payslip_compare.js` over `src/data/roster.json` for both pay periods.

## Period 24/08/2026 – 06/09/2026

| | App estimate | Payslip | Gap |
|---|---|---|---|
| Shifts | 6 | 8 (incl. 2 orientation days) | |
| Paid hours | 48 | 64 | |
| Ordinary/buddy pay | 2,485.92 | 2,486.16 | −0.24 |
| Orientation | — | 828.72 | −828.72 |
| Afternoon allowance | 109.80 | 109.80 | 0 |
| Laundry allowance | — (not modelled) | 4.80 | −4.80 |
| **Gross** | **2,595.72** | **3,429.48** | **−833.76** |

**The app understates this period by $833.76**, entirely from its own data gaps:
the 24 and 25/08 orientation days are absent from `roster.json`, the engine does
not model the laundry allowance, and the published 51.79 rate sits 0.0047 under
payroll's exact 51.7947. Nothing is wrong with the pay.

## Period 07/09/2026 – 20/09/2026

| | App estimate | Payslip | Gap |
|---|---|---|---|
| Shifts | 7 | 8 (incl. 08/09 orientation) | |
| Paid hours | 56 | 62.5 | |
| Ordinary pay | 2,900.24 | 2,822.81 (+414.36 orientation) | +77.69 over |
| Weekend penalties | 621.48 (3 shifts) | 414.36 (2 shifts) | +207.16 over |
| Afternoon allowance | 183.00 | 183.00 | 0 |
| Laundry allowance | — | 4.80 | −4.80 |
| **Gross** | **3,704.72** | **3,839.33** | **−134.61** |

The small net gap hides two large offsetting errors:

- **App is $284.59 too high** on what the roster says happened — 1.5 h of hours
  she did not work (+77.69) and a third weekend loading payroll never paid
  (+207.16), less the rate difference (−0.26).
- **App is $419.12 too low** on the pay it cannot see — the 08/09 orientation
  shift (−414.32) and laundry allowance (−4.80).

The $207.16 excess is the real payroll issue in this period, and it is the same
$207.18 the payslip query is about. The app found it by luck: its number happens
to be near the payslip total while being wrong in both directions.

## What would make it match

1. **Add the three orientation shifts** (24, 25/08 and 08/09) to the roster data —
   the single biggest gap, $1,243.04 across the two periods.
2. **Model the laundry allowance** (cl 34, $0.60 per shift, 8 units a fortnight).
3. **Switch `hourlyRateMode` to `'exact'`** — payroll uses 1/38th of 1,968.20,
   i.e. 51.7947, which is 4 cents per 8-hour shift above the published 51.79.
4. **Record actual worked hours** where they differ from the roster (the 1.5 h
   early finish), so the app stops overstating by worked-hours drift.

With those in place the app's 07/09–20/09 estimate becomes 3,839.33 − 207.18 =
3,632.15, and the $207.18 weekend shortfall shows up as a genuine variance
instead of cancelling out against data gaps.

Run it again with:
`node tools/payslip_compare.js 2026-08-24 2026-09-06 --detail`
