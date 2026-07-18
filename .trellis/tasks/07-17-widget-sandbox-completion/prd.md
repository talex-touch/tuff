# Widget Sandbox Completion

## Goal

Complete the renderer widget host-API containment boundary so plugin widgets cannot directly mutate host clipboard, navigation, messaging, worker, or dynamic-execution surfaces.

## Requirements

- Intercept `navigator.clipboard`, `history`, `location`, DOM navigation, and document clipboard commands without invoking host browser APIs.
- Route widget `postMessage` through a widget-local message target; never dispatch onto the host window.
- Fail closed for `Worker`, `SharedWorker`, service workers, and direct network constructors that bypass plugin permissions.
- Apply a bounded per-widget call budget to security-sensitive browser operations.
- Retain bounded, payload-free audit entries for allowed, denied, and quota-exhausted operations.
- Govern the retained `new Function` boundary with source preflight and explicit injected globals; report its same-realm limitation truthfully in evidence.
- Remove generic mathjs evaluation from calculator/preview evaluators in favor of a deterministic allowlisted parser.

## Acceptance Criteria

- [ ] Direct clipboard, host history/location, host `postMessage`, worker, and DOM navigation attempts do not reach the host capability.
- [ ] Widget-local history and messaging retain useful in-widget semantics without crossing widget boundaries.
- [ ] Sensitive calls fail closed after quota exhaustion and produce bounded audit evidence without recording payloads.
- [ ] Dynamic `eval`, `Function`, dynamic import, constructor-chain escape markers, and WebAssembly compilation are rejected before widget evaluation.
- [ ] Sandbox evidence names every injected global, browser policy, quota policy, audit policy, and same-realm limitation.
- [ ] Main calculation and PreviewSDK advanced expressions accept only allowlisted arithmetic/functions/constants and execute without generic mathjs evaluation.
- [ ] Focused widget and expression verification covers allowed paths, denied paths, isolation, quota, audit retention, and cleanup.

## Constraints

- Existing widget runtimes (`vue`, `webcomponent`, `arrow`) and renderer registration remain compatible.
- The runtime is same-realm host-API containment, not process/realm isolation; evidence and diagnostics must not claim otherwise.
- Security-sensitive failures are fail-closed and do not silently fall back to host globals.
- Audit entries contain identifiers and decisions only, never clipboard/message payload content.
