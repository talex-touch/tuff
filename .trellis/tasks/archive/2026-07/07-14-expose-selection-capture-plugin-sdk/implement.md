# Implementation Plan

1. Define typed App/System selection capture request/result contracts and event.
2. Extract OmniPanel's accessibility/copy/clipboard logic into a shared host service; switch OmniPanel to that service without changing its capsule metadata.
3. Register a verified-plugin, `clipboard.read`-protected transport handler before exposing the SDK entry point.
4. Add the plugin System SDK facade and strict host-result normalization.
5. Exercise the live service path with a controlled capture scenario, then add focused behavioral regressions and update active SDK/parity documentation.
6. Run scoped lint, Utils/CoreApp type-checks, focused tests, AI/docs verification where applicable, and diff checks.

Rollback point: steps 1-4 are one cutover unit; revert the handler/event/facade and shared-service call together. There is no data migration.
