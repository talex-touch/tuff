# Design: Host-Only Agent Session Runtime

## Boundary

The canonical typed `IntelligenceSdk` remains unchanged for CoreApp renderer callers. The plugin export becomes an `Omit` facade that removes the low-level session, orchestration, and tool methods while retaining the high-level `agent.run()` and `workflow.execute()` capability wrappers.

CoreApp transport handlers remain registered for host renderer use. Every low-level agent request handler performs the existing host-ownership assertion before validation or runtime access. The trace subscription stream performs the same assertion before replay, subscription, keepalive creation, or disconnect pause behavior.

## Contracts

- Plugin facade: hidden properties return `undefined`, are absent from `in`/`ownKeys`, and are excluded from the exported TypeScript type.
- Raw plugin transport: returns/streams `INTELLIGENCE_HOST_ONLY_CAPABILITY`; no runtime method is invoked.
- Host renderer: full typed SDK and existing session runtime behavior remain available.
- High-level plugin capability wrappers: unchanged and still governed by the normal invocation/agent permission path.

## Tradeoff

Adding plugin ownership to persisted sessions would enable a scoped lifecycle API, but the runtime has no ownership field today. Hiding the low-level surface is the fail-closed, migration-free boundary and avoids pretending that permission alone provides cross-plugin isolation.
