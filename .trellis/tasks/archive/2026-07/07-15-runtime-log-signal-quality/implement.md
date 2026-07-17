# Implementation plan

1. Remove stdout/stderr appenders from persistent log categories while retaining file routing.
2. Add shared transient classifiers/rate limits for ActiveApp, telemetry, renderer exits, and wallpaper.
3. Downgrade clipboard file-read logging.
4. Make PluginLoggerManager filesystem creation lazy.
5. Exercise one info/error log, repeated transient events, expected renderer kill, unchanged file clipboard polling, and transient plugin construction.
6. Inspect fresh terminal, D log, E log, plugin log directories, and crash directories.
