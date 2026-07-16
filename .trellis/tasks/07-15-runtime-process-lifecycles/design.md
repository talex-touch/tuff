# Design

## Plugin host

Add explicit lifecycle state. `stop()` marks planned termination before killing the child and closes the control port. Exit handling ignores planned/stale children. Crash attempts increment across early restarts and reset only after a stable-ready window, not on spawn.

## Search stream

Use a generation token for each start attempt. Late promise resolution is cancelled when a newer generation, error, or disposal wins. Error clears only the matching controller and schedules one retry timer.

## Translation

Reuse the governed capability-status API immediately before provider invocation. Unavailable providers are filtered before widget state/request fan-out.

## Development process ownership

The dev wrapper exports its PID through `TUFF_DEV_PARENT_PID`. DevProcessManager watches that PID and initiates graceful shutdown if the wrapper disappears, covering forced wrapper death that cannot execute signal handlers. Normal signal forwarding remains.
