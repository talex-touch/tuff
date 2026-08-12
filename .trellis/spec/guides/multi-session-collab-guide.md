# Multi-Session Collaboration Guide

Checklist for working while other Claude/agent sessions write this repo
concurrently. Rules of evidence live in the workspace journals; this is the
pre-flight list.

## Before committing a shared file

- [ ] `git diff <file>` — are there hunks you didn't author (other session's
  uncommitted work)? If yes, do **not** `git add` the file wholesale.
- [ ] For line-additive files (lang JSONs, barrels): stage "HEAD + only my
  lines" via `git show HEAD:<path>` → re-apply your insertion → `git
  hash-object -w --stdin` → `git update-index --cacheinfo 100644,<blob>,<path>`.
  The working tree (and their lines) stays untouched.
- [ ] Never stash/checkout/restore to "clean up" — other sessions' work is in
  that tree. Verify against `git show HEAD:<path>` instead.

## Before driving a UI over CDP

- [ ] Prove the instance is yours: if you just launched it, check the wrapper
  log for `Port 5173 is already in use` — a healthy CDP port can belong to an
  instance the **user** is actively using (an earlier launch they adopted).
- [ ] If ownership is unclear, treat the window as the user's: read-only
  evaluation only; no navigation, no clicks, no state mutation.
- [ ] Restore anything you changed (`location.hash`, focus) the moment you
  discover the window isn't yours, and say so in the report.

## Before dispatching parallel implement agents

- [ ] Pin cross-agent contracts (transport event names, payload shapes) in a
  file **you** create first; both agents implement against it.
- [ ] Give each agent an explicit file-ownership boundary and list the other
  sessions' in-flight files as no-touch.
- [ ] Typecheck noise from other sessions' in-flight files is not yours to fix
  — scope your acceptance to "0 errors in my range", never repo-wide green.
