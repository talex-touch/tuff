# Implementation Plan

1. Extend the plugin Intelligence host-only method set with all low-level agent session, orchestration, and tool methods.
2. Add a reusable host-only request registrar and use it for every low-level agent request handler.
3. Assert host ownership at the start of trace subscription before any runtime or timer side effect.
4. Add focused plugin facade, request-handler, and stream-handler regression tests; preserve host coverage.
5. Update plugin API docs, AI status/changelog, and frontend security guidance.
6. Run focused tests, package/CoreApp type-checks, targeted lint, AI docs verification, and diff check.

Rollback: revert the facade and handler registration changes together; the canonical host `IntelligenceSdk` contract is not changed.
