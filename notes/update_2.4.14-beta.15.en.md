# Tuff v2.4.14-beta.15 Release Notes

## Summary Notes

- **Hardened AI and tool-call boundaries:** completed Pi/CLI runtime orchestration, provider-config snapshots, tool registration, and confirmation paths. Streaming transports now preserve caller identity and error-cleanup semantics across main, renderer, and plugin SDKs.
- **Closed privacy, authorization, and observability gaps:** added retention for AI orchestration runs; tightened sensitive-text, permission-channel, audit-flush, Sentry, and privacy-lifecycle boundaries; made Nexus credits and telemetry batches idempotent.
- **Improved release and cross-platform reliability:** hardened macOS/Linux updater handoff, release artifacts, and download responses; expanded package CI/publish gates plus Nexus docs/icon checks; updated compatible native-audio dependencies.

## What's Changed

- **AI, automation, and SDK**

- Extended the AI Agent, CLI orchestrator, and Tool Gateway with typed tool calls, streaming responses, quota handling, and error projection. Failed or cancelled calls no longer leave listeners, request state, or stream resources behind.
- Carried tool confirmation, caller identity, and authorization constraints through the preload channel, main process, renderer, and plugin-facing APIs. System-action and file capabilities use the same authorization boundary.
- Added regression coverage for provider-config snapshots, Nexus/local/OpenAI/Anthropic providers, and the Pi CLI runtime, preventing configuration changes or non-callable bridges from being treated as usable.

- **Data, privacy, and security**

- Added migration `0041_ai_orchestrator_run_retention` and included orchestration-run data in retention, cleanup, and privacy-acceptance flows.
- Hardened privacy lifecycle management, audit-log backoff, sensitive-text processing, plugin installation, and network services. Transport SDK coverage now includes stream protocol, renderer storage, and plugin-event boundaries.
- Fixed a Nexus admin-risk endpoint path that could reveal internal configuration clues when emergency credentials were misconfigured. Deployed-preview HARs are redacted before persistence.
- Added service constraints and regression coverage for idempotent Credits consumption and telemetry batching, reducing duplicate debit and duplicate-count risk.

- **CoreApp, plugins, and interaction**

- Improved CoreBox recommendation rebuilding, file-index settings, clipboard AutoPaste, and plugin-install queuing; added coverage for system actions, window identity, and single-instance protections.
- Updated JSON Formatter, Clipboard History, Translation, and Intelligence plugin manifests, themes, input handling, and runtime interfaces while retaining the plugin-facing transport surface.
- Continued TuffEx accessibility and motion work for inputs, context menus, collapsed content, and reduced-motion behavior. Reduced-motion environments no longer retain infinite animation or unreachable collapsed controls.

- **Nexus, docs, and release engineering**

- Consolidated Nexus documentation routes, bilingual API content, and demo/icon gates. Release downloads now handle HEAD/download responses and validate version artifacts server-side.
- Expanded macOS/Linux updater-script regression tests and package-level CI/publish workflow validation to reduce platform-specific release drift.
- Retained verified `napi` and `symphonia` native-audio versions. The `napi-derive` and Anthropic major upgrades are intentionally excluded because they are incompatible with the current `napi` API and `@langchain/core` peer range, respectively.

- **Verification**

- Ran `pnpm quality:pr`: release-note validation, changed-file lint, targeted tests (122 tests), and CoreApp Node/Web type checking all passed.
- This remains a prerelease. Validate AI tool calls, plugin installation, updater handoff, and Nexus telemetry in a non-production profile before broad rollout.
