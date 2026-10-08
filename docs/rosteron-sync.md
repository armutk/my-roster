# RosterOn auto-sync

Status 8 Oct 2026: live. The tools were dry-run against RosterOn, the first `--apply`
published the 14–30 Dec shifts, and `my-roster-sync.timer` is installed (fortnightly).
The write path and its failure modes were also tested in a throwaway clone that
pushed to a local bare repo.

## Pieces

| Path | Role |
|---|---|
| `tools/fetch_rosteron.js` | Headless login (Playwright from `/usr/local/lib/hermes-agent/node_modules/playwright`, cached Chromium) with the Bitwarden login whose URI is `.../MHAPROD/Mobile/Account/Login`; credentials come from `/usr/local/bin/bw-session` + `bw list items` in memory only. Saves `Roster/List` page text. Exit 2 login rejected, 3 Bitwarden, 4 MFA/captcha, 5 password expired, 6 layout. |
| `tools/sync_rosteron.js` | Orchestrator. Default = dry run; `--apply` = real write path. See the header comment for options and exit codes. |
| `/root/.local/state/my-roster-sync/` (0700, outside the repo) | `raw/` exports + page HTML (pruned at 60 days), `summaries/`, `latest-summary.md`, `last-run.json`. |

Dry run: fetch, `import_rosteron.js --dry`, then rehearse the whole write path in a
scratch copy (import, fallback, `CACHE_NAME` bump) and check it: fallback equals
roster.json, `leave_check.js` passes, 09/09 payslip still $3,429.48, pinned shifts
kept, only the three expected files change, no ID-like values.

`--apply` additionally: refuses tracked edits, fetches and fast-forwards to
origin/main (refuses if ahead), copies the verified files in, commits
(`Sync RosterOn roster: N new, ...; through <date> (my-roster-vN)`), pushes with
the existing `gh` credential helper, and confirms `origin/main` equals the commit.
`--verify-live` then polls Pages for the new cache name.

Guards (stop, write nothing): unparsed rows, row-count mismatch, removals dated after
RosterOn's last listed day (truncated list). Needs-a-human (dry run reports it;
`--apply` exits 7 unless `--force`): more than 4 removals or 6 changes, last date
moving earlier, window not starting near today, times that match no shift type.

## Schedule (installed 8 Oct 2026)

Ahmed chose fortnightly. RosterOn's Mobile list looks like a rolling window of about
12 weeks rather than a fortnightly release: 19 Sep showed up to 10 Dec (+82 days),
and 8 Oct showed up to 30 Dec (+83 days). Each run therefore adds a few shifts at
the far end. systemd calendars cannot express "every other week", so the timer fires
every Sunday and `--min-interval-days 9` skips the run when the last completed check
(`no_change`/`applied`/`committed`) is under 9 days old. A failed or blocked run is
retried the next Sunday. A run started by hand also resets the fortnight.

`/etc/systemd/system/my-roster-sync.service`
```ini
[Unit]
Description=My Roster: sync from RosterOn ESS (apply + push when clean)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=HOME=/root
WorkingDirectory=/root/workspace/my-roster
ExecStart=/usr/local/bin/node tools/sync_rosteron.js --apply --verify-live --min-interval-days 9 --notify-cmd "/usr/local/bin/hermes send --to telegram --quiet --file -"
TimeoutStartSec=20min
Nice=10
```

`/etc/systemd/system/my-roster-sync.timer`
```ini
[Unit]
Description=My Roster: fortnightly RosterOn check (Sunday ~18:00 Melbourne)

[Timer]
OnCalendar=Sun *-*-* 18:00:00 Australia/Melbourne
RandomizedDelaySec=45min
Persistent=true

[Install]
WantedBy=timers.target
```

Useful commands: `systemctl list-timers my-roster-sync.timer`,
`journalctl -u my-roster-sync.service`, and `cat /root/.local/state/my-roster-sync/latest-summary.md`.
To pause it, run `systemctl disable --now my-roster-sync.timer`.

## Notifications

`--notify-cmd` gets the summary on stdin, with `SYNC_STATUS` set, for every outcome
except `no_change` and skipped weeks: `applied`, `needs_review`, `layout_changed`,
`login_failed`, `mfa_or_captcha`, `password_expired`, `push_failed`, and so on. It
goes through `hermes send --to telegram`. Hermes' Telegram home channel is Ahmed's
DM (checked 8 Oct 2026). `latest-summary.md` and `last-run.json` are always written.
