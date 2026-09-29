# Tuff v2.4.14-beta.51 Release Notes

## Summary Notes

- Rebuilt CoreBox actions: streamlined command groups into "Basic" and "App settings" with an immediate height profile and no extra scrolling; added a direct Open Settings action.
- New action feedback primitive: introduced TxStatusHint featuring a subtle rising grainy tone wash, smooth word morphing, and re-trigger emphasis.
- AppDetail layout refinement: invocation controls and launch options now precede usage analytics for faster access.
- Indexing & search performance hardening: bounded indexing diagnostics IPC payloads, scaled scoped drain timeout budgets, and ordered state cleanup.
- Update and network resilience: reconciled stale update lifecycle attempts, refined SQL error classification, and bounded external network requests.

## What's Changed

- Regroup and tighten the CoreBox action panel: consolidate item command groups into a single ranked ladder and provide an Open Settings host action reachable via Mod+,.
- Ship the TxStatusHint component: provide smooth animated action feedback with tone wash and text morphing while preserving accessibility live-region contracts.
- Adjust AppDetail content hierarchy: position invocation controls and configurations above usage analytics charts.
- Optimize file indexing runtime: bound diagnostics IPC payloads by source, dynamically scale scoped drain timeout budgets, and enforce ordered cleanup for deferred tasks.
- Harden the update service: properly reconcile stale retry attempts and refine SQL error pattern detection to prevent repetitive failed loops.
- Bound auth network requests: introduce strict concurrency and timeout protections for credit and authorization queries.
- Build system cleanup: automatically discard leftover temporary directories when native-addon preservation encounters an error.
