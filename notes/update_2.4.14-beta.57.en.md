# Tuff v2.4.14-beta.57 Release Notes

## Summary Notes

- Embedded terminals share TxTerminal and native PTY sessions, including input, resize and exit cleanup.
- CoreBox recommendations combine accepted usage, time and the originating foreground app; the first five items use the grid and the rest remain in the list.
- The Home composer uses permission, mode and model chips, with keyboard focus and asynchronous popover loading corrected.
- Local Agent, Skills and MCP settings have separate management surfaces, with CLI detection fixed for macOS Dock launches.
- Nexus administration uses the shared Admin Kit; TuffEx adds Motion capabilities and places Mono charts and composite controls in Data and Pro.

## What's Changed

- Unify terminal rendering, native PTY sessions, size synchronization and resource cleanup when the owning window exits.
- Remove the local AI CLI button from the CoreBox header while preserving the underlying Agent capabilities.
- Use one pinned-first recommendation sequence; files, apps and built-in destinations can all occupy the first five grid positions.
- Use genuine accepted history for yesterday-at-this-time, recurring time and originating-app recall; show independent reasons without invented habitual items.
- Preserve the original invocation source across asynchronous queries, cache hits and shortcut execution when the foreground app changes.
- Confirm full access within its permission row; separate mode selection from Agent management and retain search, recent models and capability settings.
- Correct focus and scroll restoration when popovers close, searches clear, Agent profiles save or model sources load late.
- Give MCP its own settings page, name discovered configuration after its Agent and supply a usable PATH for stdio servers.
- Detect local CLIs from macOS Dock launches; reuse existing PI-Desktop workspaces and complete retry and plugin-status notification lifecycles.
- Record physical keys when macOS Option rewrites characters and persist custom shortcuts.
- Add privacy-safe CoreBox focus diagnostics and error telemetry without changing the existing focus policy.
- Complete application-index startup health and restore idle indexing and maintenance scheduling contracts.
- Unify Nexus users, activation codes, updates, assets, comments, providers, AI overview and call audits on the Admin Kit.
- Fix localized documentation links, directory pages, blank admin-page transitions and on-demand documentation delivery.
- TuffEx Motion provides buttons, card spreads, 3D carousels, loaders, text, physics, pointer, scroll, toggles and transitions.
- Place Mono charts in Data and composite metrics, forms and UI Kit controls in Pro, with bilingual APIs, navigation, Gallery and executable examples.

## Known Limitations

- The Ghostty renderer is not integrated; this release does not claim native Ghostty embedding.
- Physical foreground-source switching has been verified on macOS arm64; equivalent device scenarios have not been exercised on Windows or Linux.
