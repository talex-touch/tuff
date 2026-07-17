# Fix runtime process lifecycles

## Goal

Make plugin-host, stream, translation, and development process lifecycles terminate and recover deterministically.

## Requirements

- Planned plugin-host stop never restarts; crash loops exhaust a real restart budget.
- CoreBox index-commit stream maintains at most one controller and one retry timer across start/error/dispose races.
- Translation checks governed capability availability immediately before invocation.
- Development command termination owns and stops the Electron child process tree.
- Preserve plugin isolation and typed transport boundaries.

## Acceptance Criteria

- [x] Plugin module destroy stops the host and no replacement process appears.
- [x] Repeated early host exits stop after the configured maximum.
- [x] Stream failure retries once per interval and disposal prevents late controller installation.
- [x] Unavailable translation does not call `invoke('text.translate')`.
- [x] Development stop leaves no child Electron process from that run.
