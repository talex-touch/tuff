# Tuff v2.4.14-beta.41 Release Notes

## Summary Notes

- Local MCP server: Tuff exposes its own tools to other agents on the machine (Codex, Claude Code, …) over MCP, with per-tool grants on a settings page and everything off by default.
- On-device speech recognition ships: a new sherpa-onnx engine joins the cloud channels as the fast, punctuation-native tier, and recognition no longer requires a network round trip.
- Spoken rewrites: select any text, say an instruction, and it is rewritten to that instruction instead of only inserting a dictation result at the caret.
- Local AI CLI paths are complete: model discovery, selection indicators and run paths for omp, Codex and Claude, with the family reported truthfully at startup.
- TuffEx closes the Beautiful UI gaps: Flowchart, ToastPanel, AgentScreen and a UI sound layer, StatusBadge rebuilt as a standard chip, plus TxSensitiveInput and TxModeChip.
- The search index now writes through one path: file persistence and FTS writes are fused, so results and disk state no longer diverge, and semantic search finally has a writer.

## What's Changed

- Local MCP: loopback only; tool grants are scoped to a session and revocable at any time; an unauthorized call fails closed rather than falling back to a built-in capability.
- Voice: the on-device engine and the cloud channels share one provider contract, so switching channels does not change the dictation entry point; the recognition language is narrowed to what a model actually declares instead of issuing requests in a language it does not support.
- Voice metrics: the provider round trip and the end-to-end duration are measured separately and averaged over their own samples; recognition metrics reach analytics.
- Voice settings: installed models collapse behind a single “more models” row; recognition details move into a panel and a flip dialog; the recognition records table is listed in the storage view.
- Local AI CLI: each of the three families shows its own model catalog and selection state; a binding that was never stored is not reported as saved; local CLI providers are held to their written contracts.
- App index: the read-only list becomes a management surface, alias writes are single-flight and verified to have persisted, and usage resolves under the identity the scan persisted.
- File preview: a previewed file opens with any application the OS offers, not just the default, and shows dimensions and app source; a failed default-application lookup is reported as a failure.
- Shortcuts: a global shortcut can be bound to any plugin feature.
- Performance: full scans stop over-pacing and bound icon extraction; the stat queries behind the diagnostics poll get an index; scan progress stops refetching source diagnostics every tick; the search index integrity check no longer freezes startup.
- Nexus docs: page-level templates, replayable gallery specimens and searchable filters on the updates page; Pages serves a real 404 and static redirects, and the edge cache window matches the zone Cache Rule.
- Interface: dark semantic fills tint toward the surface; drawer slot content is deferred until first open; markdown toolbar icons move to Carbon metadata; onboarding clicks pass through the window drag region.
