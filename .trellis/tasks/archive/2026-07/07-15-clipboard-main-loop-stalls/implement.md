# Implementation plan

1. Expose reliable active/inactive state from the native watcher.
2. Skip scheduled background/visible monitor runs while the native watcher is active; never skip native, forced, or baseline runs.
3. Preserve polling fallback when watcher loading fails.
4. Exercise startup-before-watcher, active watcher, watcher-disabled, native event, baseline, and explicit refresh paths.
5. Run the existing clipboard stress scenario and inspect phase/event-loop evidence.
