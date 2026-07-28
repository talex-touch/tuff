# R9.2 ContextHygiene P0/P1 Technical Design

## Architecture

```text
Entrypoint UI / official plugin
  -> typed Intelligence request with context intent
  -> CoreApp IntelligenceModule
  -> ContextHygieneService.prepareTurn()
  -> ContextPackageBuilder
       current input / recent turns / snapshot / memory / 2.5.3 retrieval
  -> host-owned prompt assembler
  -> provider invoke / stream
  -> finalize/compression/checkpoint
  -> metadata-only Audit + Memory Review
```

The host owns durable data, scope filtering, prompt assembly and redaction. Plugins receive safe summaries and citations only; they do not receive arbitrary MemoryItem content or cross-scope retrieval payloads.

## Boundaries

### SQLite

- Reuse existing context tables and migration `0023_intelligence_context_knowledge.sql`.
- CompressionSnapshot uses the existing table; no new table is expected.
- Memory workspace/project isolation likely requires a stable `scope_ref` or equivalent ownership column. This is a schema/data migration and must stop at an explicit confirmation gate before implementation.
- Existing rows without a safe scope reference must not be treated as matching workspace/project memory. Conservative migration options are disable, session-only fallback, or explicit user reassignment; no implicit global promotion.

### Typed Contracts

- Shared types remain owned by `packages/utils/types/intelligence.ts` and mirrored through `packages/tuff-intelligence`.
- Renderer and official plugins use domain SDKs; no raw channel names.
- Host-only Memory management should be separated from plugin-facing Intelligence facade. The plugin facade exposes only approved prepare/evaluate/invoke capabilities.

### Prompt Assembly

- Add a host-owned context execution contract rather than passing full ContextPackage content through plugin metadata.
- For chat, assemble a bounded system/context message from safe package items in priority order. Preserve current user input as the final user message.
- Attach package id, source ids, citation metadata and degraded reason to invoke/audit metadata without logging package content.
- Streaming and non-streaming paths must share the same assembler.

### Memory Isolation

- Query predicates must include enabled, normal privacy, no tombstone, TTL, scope and scope reference.
- session memory matches source/current session; global matches all allowed sessions; workspace/project require exact identity.
- Tombstone checks occur at query time and immediately before package commit/invoke to reduce delete-vs-prepare races.

### Compression

- Deterministic structured snapshot validation precedes persistence.
- Snapshot generation can initially consume explicit structured input or a host model call behind a feature flag; persistence accepts only normalized fields.
- Summary update uses compare-and-swap against session `updated_at` or an explicit expected version.
- On failure, keep turns and return degraded metadata; never silently replace session history.

## Compatibility

- Existing `contextPrepareTurn` and invoke methods remain available during migration.
- Official `touch-intelligence` migrates to the context-aware host path first.
- Third-party plugin facade removal/limiting must preserve unrelated Intelligence methods and return explicit permission/capability errors for restricted Memory operations.

## Rollout And Rollback

- Feature flags gate context execution, compression and non-CoreBox entrypoints independently.
- Context execution failure falls back to the current plain invoke path with safe degraded metadata.
- Compression can be disabled without deleting snapshots or turns.
- Memory scope migration requires a preflight report and backup/rollback SQL before execution.

## Evidence Boundary

- Unit/contract tests prove filters and payload contracts.
- Integration tests prove package assembly and entrypoint separation.
- Controlled local evidence proves UI and typed wiring; packaged Electron evidence is required before claiming user-visible closure.
