# Tuff v2.4.14-beta.57 Release Notes

## Summary Notes

- The voice floating ball is gone; dictation opens only as the Fn/Ctrl pill.
- Embedded terminals share TxTerminal and native PTY sessions, including input, resize and exit cleanup.
- CoreBox recommendations combine accepted usage, time and the originating foreground app, with the first five items in the grid; apps reached through Cmd+Tab or the Dock now count as recently used.
- The first CoreBox summon after launch accepts typing again, and file-index scans and large image copies no longer hold the main thread for seconds.
- The Home composer uses permission, mode and model chips; local Agent, Skills and MCP settings have separate surfaces, with CLI detection fixed for macOS Dock launches.
- Nexus administration uses the shared Admin Kit and the home page and TuffEx docs are rewritten; TuffEx adds Motion capabilities and draws panels without arrows by default.

## What's Changed

- Remove the voice floating ball: Fn/Ctrl opens the bottom dictation pill directly, without a ball flashing first; the Assistant floating-entry group leaves the Intelligence settings and stored floating-ball settings are cleaned up on load.
- Turn dictation on at sign-in unless the user switched it off; report voice-service failures as service unavailable instead of a network error.
- Unify terminal rendering, native PTY sessions, size synchronization and resource cleanup when the owning window exits.
- Remove the local AI CLI button from the CoreBox header while preserving the underlying Agent capabilities.
- Fix the first CoreBox summon after launch, where the prewarmed hidden overlay took keyboard focus and typing did nothing; summons read the foreground app directly instead of waiting for AppleScript.
- Use one pinned-first recommendation sequence; files, apps and built-in destinations can all occupy the first five grid positions.
- Use genuine accepted history for yesterday-at-this-time, recurring time and originating-app recall; show independent reasons without invented habitual items.
- Preserve the original invocation source across asynchronous queries, cache hits and shortcut execution when the foreground app changes.
- Count apps brought to the foreground through Cmd+Tab or the Dock as recently used (macOS, no extra permission).
- Confirm full access within its permission row; separate mode selection from Agent management and retain search, recent models and capability settings.
- Correct focus and scroll restoration when popovers close, searches clear, Agent profiles save or model sources load late.
- Give MCP its own settings page, name discovered configuration after its Agent and supply a usable PATH for stdio servers.
- Detect local CLIs from macOS Dock launches; reuse existing PI-Desktop workspaces and complete retry and plugin-status notification lifecycles.
- Record physical keys when macOS Option rewrites characters and persist custom shortcuts.
- Add privacy-safe CoreBox focus diagnostics and error telemetry without changing the existing focus policy.
- Complete application-index startup health and restore idle indexing and maintenance scheduling contracts.
- Fix the file-index reconcile write failure; route path, extension and newly-added-file lookups through fitting indexes to remove the periodic stalls during scans; clear leftover content text again once content indexing is off and compact the index file when space allows.
- Reuse the pasteboard's PNG bytes when copying large images instead of re-encoding them on the main thread; stop native file watchers before quitting to avoid a crash on exit.
- Move the telemetry switch to General settings under one consent, sanitize error details further and stop sending search metrics to Sentry; privacy export now includes executed search records (source and time only) and the foreground-app table.
- Draw tooltips and popovers without arrows by default; crossing the gap from a trigger to its hover panel no longer closes the panel, a safe triangle guards the path and the expand bounce is capped.
- Unify Nexus users, activation codes, updates, assets, comments, providers, AI overview and call audits on the Admin Kit.
- Fix localized documentation links, directory pages, blank admin-page transitions and on-demand documentation delivery.
- Rebuild the Nexus home page around a faithful CoreBox; rewrite the TuffEx docs concisely with the missing APIs and a package-manager switch for install commands; batch server database reads and writes and roll telemetry up daily.
- TuffEx Motion provides buttons, card spreads, 3D carousels, loaders, text, physics, pointer, scroll, toggles and transitions.
- TuffEx adds TxMorph and springs that can be sought at any moment; switches, sliders, line charts, icon morphs, copy buttons and split buttons gain new motion.
- Place Mono charts in Data and composite metrics, forms and UI Kit controls in Pro, with bilingual APIs, navigation, Gallery and executable examples.

## Known Limitations

- The Ghostty renderer is not integrated; this release does not claim native Ghostty embedding.
- Physical foreground-source switching has been verified on macOS arm64; equivalent device scenarios have not been exercised on Windows or Linux.
