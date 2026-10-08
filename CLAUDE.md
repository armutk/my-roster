# CLAUDE.md

Read **[AGENTS.md](AGENTS.md)** — it is the canonical handover document for this
project and applies to every AI agent, not just Claude.

It covers the architecture, how the roster is updated, the enterprise-agreement
pay rules (several of which contradict the obvious assumption), how to verify
changes, mistakes already made, and the hard constraints.

Two things that matter most, repeated here so they are never missed:

1. **RosterOn login is allowed only via Bitwarden on the VPS** (Ahmed authorised it
   on 19 Sep 2026; AGENTS.md §2). `tools/fetch_rosteron.js` does it headlessly.
   Never print, log, commit or paste the username, password, employee number,
   cookies or `BW_SESSION`.
2. **RosterOn ESS is the source of truth for shifts.** Never transcribe a
   handwritten roster or a photo. Doing so previously produced 19 shifts when the
   real figure was 22.
