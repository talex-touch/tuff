# Design

## Sinks

The custom logger emits the colored terminal line. Log4js categories write persistent general/error files only. Error objects are serialized once per destination.

## Expected-state policy

- ActiveApp `-1719`: transient cache/null result with throttled debug.
- Offline telemetry timeout/ERR_FAILED: shared remote-failure downgrade to INFO; scheduler and request share one abortable timeout.
- Development renderer `killed`: INFO before generic error handling.
- Missing wallpaper: cached/rate-limited INFO or debug.
- Unchanged clipboard file read: no INFO; changed capture may use debug.

## Plugin sessions

Plugin logger directories and metadata are created lazily on first buffered log flush. Constructing a transient plugin object creates no filesystem artifact.
