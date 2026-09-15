# Design: External native session adoption

## Contract

Add `LocalAiCliEvents.session.discover`:

```ts
{ projectId: string } -> { discovered: number; skipped: number; incomplete: boolean }
```

`LocalAiCliSdk.session.discover(projectId)` is host-only because the Local AI module applies `assertHostContext` before any filesystem work.

## Scanner

A main-only scanner owns provider archive formats and emits internal candidates:

```ts
{
  provider,
  nativeSessionId,
  projectRoot,
  title,
  expectedHeadId,
  createdAt,
  updatedAt
}
```

It scans fixed roots:

- Pi: `PI_CODING_AGENT_SESSION_DIR` or `${PI_CODING_AGENT_DIR || ~/.pi/agent}/sessions`.
- OMP: `${TUFF_OMP_AGENT_DIR || ~/.omp/agent}/sessions`; named OMP profiles outside that explicit root remain out of scope until Tuff exposes profile selection.
- Claude Code: `${CLAUDE_CONFIG_DIR || ~/.claude}/projects`.
- Codex: `${CODEX_HOME || ~/.codex}/sessions`.

Pi and OMP share version-3 JSONL session headers but retain distinct provider identities. Claude and Codex use UUID-bearing files plus bounded JSONL metadata decoding. Every accepted candidate must survive no-follow file identity checks and canonical cwd equality with the selected Project.

## Persistence

Add a discovery-specific store operation rather than widening renderer DTOs. Existing tuple rows keep id, title, origin, conflict state, and conversation binding. Rediscovering a missing row marks it available. New rows use bounded metadata and `origin='discovered'`.

## UI

The existing Project dropdown gains `Discover Local Sessions`. A successful run refreshes the Pinia mirror and shows a localized success/partial/empty toast. No scan occurs on app startup or ordinary sidebar refresh.
