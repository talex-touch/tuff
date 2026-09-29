# Tuff v2.4.14-beta.49 Release Notes

## Summary Notes

- The update page is rebuilt: update checks run as silent progress, and this machine keeps the install history.
- Indexing and search got lighter: batch paths no longer carry whole rows, and watch events are no longer routed while the indexing runtime shuts down.
- The database side is steadier: a newer libsql client, and a busy write reconnects before it retries.
- Voice input: a packaged build that lost its capture component now says so, and the release pipeline can no longer drop that component.
- Startup and permission costs went down: startup module telemetry attributes long tasks, and the permission snapshot is written in one batch.

## What's Changed

- Rebuild the update page around silent progress and local history, adding the status, history and progress surfaces.
- Close enrichment admission before the file index waits on a producer, keep cancelled runs quiet, and bound worker teardown.
- Return persisted counts from the search-index batch persistence path instead of row payloads.
- Skip watch event routing while the indexing runtime shuts down, and migrate scan progress atomically by source scope.
- Upgrade the libsql client and reconnect clients before retrying a busy write.
- Name the missing capture component when a build lost it, instead of failing with an opaque assertion.
- Build and verify the Rust native addons before packaging, and fail packaging when a required addon is missing rather than shipping a broken build.
- Keep the Cargo-built addons across the Electron native module rebuild during packaging.
- Write the permission snapshot in one batch, and add startup module telemetry with long task attribution.
- Gate global shortcut registration behind an environment switch, and scope the AI context hygiene transactions to the client.
- Register opener:app:resolve early in the main process and retry that call from the renderer.
