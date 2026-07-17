# Implementation plan

1. Add plugin-host planned-stop/stale-child guards and stable restart accounting; call stop from PluginModule destroy.
2. Add generation-safe CoreBox stream start/error/dispose handling.
3. Re-check translation capability directly before invocation and filter unavailable provider state.
4. Pass dev wrapper PID and add an unref'd parent-liveness watcher to DevProcessManager.
5. Exercise planned stop, crash loop, stream race, unavailable translation, SIGTERM, and simulated parent disappearance.
