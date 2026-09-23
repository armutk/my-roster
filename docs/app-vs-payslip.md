# App estimate vs real payslips

Does the roster app's estimated gross match what Mercy actually paid? Reproduce
either period with:

```
node tools/payslip_compare.js 2026-08-24 2026-09-06 --detail
node tools/payslip_compare.js 2026-09-07 2026-09-20 --detail
```

## 24/08–06/09/2026 — now exact

| | Before the fix | Now | Payslip |
|---|---|---|---|
| Shifts | 6 | 8 | 8 (2 orientation days) |
| Paid hours | 48 | 64 | 64 |
| Ordinary / buddy | 2,485.92 | 3,314.88 | 3,314.88 |
| Orientation | — | (in the above) | (in the above) |
| Afternoon allowance | 109.80 | 109.80 | 109.80 |
| Laundry allowance | — | 4.80 | 4.80 |
| **Gross** | **2,595.72** | **3,429.48** | **3,429.48** |

The app was $833.76 light, all of it its own data gaps: $828.72 of orientation
pay that was never in `roster.json`, $4.80 of laundry the engine did not model,
and $0.24 from the rounded published rate. Nothing was wrong with the pay.

## 07/09–20/09/2026 — now shows the real variance

| | Before the fix | Now | Payslip |
|---|---|---|---|
| Shifts | 7 | 8 | 8 (incl. 08/09 orientation) |
| Paid hours | 56 | 64 | 62.5 |
| Ordinary pay | 2,900.24 | 3,314.88 | 3,237.17 |
| Weekend penalties | 621.48 (3 shifts) | 621.54 (3 shifts) | 414.36 (2 shifts) |
| Afternoon allowance | 183.00 | 183.00 | 183.00 |
| Laundry allowance | — | 4.80 | 4.80 |
| **Gross** | **3,704.72** | **4,124.22** | **3,839.33** |

The app now sits $284.89 **above** the payslip, and that gap is exactly the two
known items, with nothing hidden:

- **$207.18** — the weekend loading the roster shows on Sat 19/09 and the payslip
  never paid. This is the genuine payroll query.
- **$77.69** — the 1.5 h she did not work. The roster is nominal until that shift
  carries `workedHours: 6.5`, which needs the date (see Open).

Before the fix those two overstatements were masked by $419.12 of missing income,
so the app looked roughly right while being wrong in both directions. A headline
number that cancels out is worse than a number that is plainly off.

## Fixed on 23/09/2026

| # | Fault | Fix |
|---|---|---|
| 1 | Three orientation shifts missing from `roster.json` — 24, 25/08 and 08/09 | Added as ordinary-rate day shifts, named in `note` |
| 2 | Laundry allowance not modelled (Appendix 2, Part 2 — $0.60 per shift) | `payRules.laundryAllowance`, applied per shift by `payEngine.js` |
| 3 | `hourlyRateMode` was `'published'` (51.79) | Now `'exact'` (51.7947 = 1,968.20 / 38), which is what payroll pays |
| 4 | No way to record hours actually worked | `workedHours` on a shift now beats `paidHours` |

Committed locally with cache `my-roster-v7`. The GitHub Pages push is the deploy
step and has not been made.

## Open

- **Which shift lost the 1.5 h** is still unknown. Add `"workedHours": 6.5` to it
  and the 07/09–20/09 estimate falls to $4,046.53, leaving a clean $207.18
  variance. If the short shift was 19/09 itself, the loading claim is $168.33
  rather than $207.18.
- **The 24 and 25/08 orientation dates are inferred** from the 09/09 payslip
  (16.00 orientation units) — they are not in RosterOn. Confirm with payroll.
- The app's contract card now shows the exact rate ($51.7947) with the published
  rounded figure ($51.79) beside it.
