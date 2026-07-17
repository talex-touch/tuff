# Restore high-signal runtime logging

## Goal

Emit one useful record per logical event and prevent expected/transient runtime states from flooding warnings and errors.

## Requirements

- Custom logger owns terminal output; log4js persists files without echoing back to stdout/stderr.
- macOS no-frontmost-app `-1719` is transient and rate-limited.
- Offline telemetry timeout/`net::ERR_FAILED` is deferred INFO with cancellation-aware aligned timeouts.
- Expected development renderer `killed` exits are classified before error logging.
- Wallpaper-unavailable diagnostics are cached/rate-limited.
- Unchanged clipboard file detection is not INFO.
- Plugin log sessions are created only when a real session writes lifecycle data.
- Retain actionable production errors and persistent error files.

## Acceptance Criteria

- [x] One logger call produces one terminal line and one intended persistent general/error record.
- [x] Repeated transient active-app, wallpaper, and offline telemetry states do not flood WARN/ERROR.
- [x] Expected development renderer termination produces no ERROR.
- [x] Unchanged clipboard polling produces no INFO file-read line.
- [x] Plugin startup creates no empty duplicate session directory.
