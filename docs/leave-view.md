# Leave view — annual leave accrual (23 Sep 2026)

Answers "how much leave am I accruing?" in the app, without inventing a rate.

## The key finding

**RosterOn never shows leave. Only a payslip carries a balance.** So the view is
built the other way round from the Pay view: instead of calculating from the
roster alone, it anchors on the balance printed on the most recent payslip and
adds accrual on the shifts worked since that pay period.

Both payslips on file (`E005885`, paid 09/09/2026 and 23/09/2026) print a
`Leave Balances` block: AL, SL, LSL and VIC Additional 1wk, all in hours.

| Payslip paid | Period | Paid hours | AL balance | SL balance | LSL | ALW |
|---|---|---|---|---|---|---|
| 09/09/2026 | 24/08–06/09 | 64.0 | 6.15 h | 2.95 h | 0.00 h | — |
| 23/09/2026 | 07/09–20/09 | 62.5 | 12.16 h | 5.84 h | 0.00 h | 3.20 h |

## Accrual rates — derived from the payslips, not assumed

| Leave | Rate | Fits |
|---|---|---|
| Annual leave (AL) | **5/52 = 9.6154%** of paid hours | 6.15 h on 64.0 h (9.609%) and 6.01 h on 62.5 h (9.616%) |
| Personal leave (SL) | **12/260 = 4.6154%** of paid hours | 2.95 h on 64.0 h (4.609%) and 2.89 h on 62.5 h (4.624%) |

- Annual leave at 5/52 is 5 weeks a year: the agreement's 4 weeks plus the
  Victorian additional week. Accrual runs on **paid hours**, and it follows
  actual worked time — the 23/09 period accrued on 62.5 h, the early-finish
  figure, not the 64 h rostered.
- Personal leave at 12/260 is the equivalent of 12 days a year. **Open item:** if
  the entitlement is 15 days a year the accrual is short about 1.16% of hours.
  Needs the personal leave clause quoted before it goes to payroll.
- **Unverified and deliberately not projected:** LSL (accrues on continuous
  service, not hours) and the VIC additional week (3.20 h reported, but it does
  not reconcile to any simple share of the 126.5 paid hours on file — 1/52 of
  them would be 2.43 h, so the basis is unexplained).
- Payroll rounds each period's accrual, so a balance here can differ from a
  payslip by up to about 0.05 h. The SL carry is 5.83 h against the printed
  5.84 h for exactly that reason. The rate itself is exact.

## Live estimate

As at 23 Sep 2026, with the roster running to 10 Dec 2026:

| | Now | If every rostered shift to 10 Dec is worked |
|---|---|---|
| Annual leave | **14.47 h** (1.81 days at 8 h) | **48.70 h** (6.09 days) |
| Personal leave | 6.95 h | 23.38 h |

`Leave now` is the 23/09 payslip balance plus accrual on the 24 paid hours since
20/09. The projection adds the 43 remaining rostered shifts (356 paid hours).
Leave taken, or shifts not worked, reduce it.

## Verifying it

```bash
node tools/leave_check.js          # exits non-zero if a rate fails to reproduce a payslip
```

It prints PASS/FAIL for every anchor check, then the live estimate and the flags.
Both payslips reproduce. The UI check (`tools/ui_check.py --leave`) exercises the
Leave view with the other five and confirms no overflow at 375 px and 320 px.

## When a new payslip arrives

Add a new entry to `anchors` in `src/js/leaveRules.js` — never edit an existing
one, so past balances stay reproducible. Then re-run `tools/leave_check.js`.
