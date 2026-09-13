# Discover and adopt external native sessions

## Goal

Let a user explicitly discover provider-owned sessions created outside Tuff for one existing Tuff Project, then continue them through the existing Local AI session row without importing their transcript.

## Requirements

- Add a host-only typed `session.discover` operation accepting exactly one opaque `projectId` and returning bounded counts plus an `incomplete` flag.
- Expose discovery as a Project dropdown action. It is explicit, per-project, and unavailable for archived projects.
- Scan the default/provider-configured session stores for Pi, OMP, Claude Code, and Codex. Traversal, files, bytes, and returned candidates are bounded; symlinks and escaped roots are rejected.
- Parse only metadata required for native id, canonical cwd, bounded first-line title, expected Pi head when available, and timestamps. Never retain or return transcript paths, prompt remainder, output, tool payloads, native errors, or full records.
- Adopt only candidates whose canonical existing directory exactly equals the selected Project root. Discovery never creates a Project and never accepts a renderer path.
- Upsert by `(provider, project_root, native_session_id)`, preserve the opaque row id and Tuff origin/title on existing rows, write `origin='discovered'` only for new discoveries, and never clear a conflict automatically.
- A second scan is idempotent. Missing/unreadable provider roots degrade independently and set `incomplete` only when a present root cannot be completely inspected.

## Acceptance Criteria
- [x] Pi, OMP, Claude, and Codex fixtures in one canonical project become resumable `origin='discovered'` rows; covered by `native-session-discovery.test.ts` and `session-store.test.ts`.
- [x] Foreign cwd, missing cwd, malformed/oversized files, symlinks, duplicate native ids, and traversal budget exhaustion cannot create unsafe pointers; covered by `native-session-discovery.test.ts`.
- [x] Renderer responses contain no native id, file path, expected head, prompt remainder, output, or transcript content; covered by transport/privacy checks.
- [x] Project action reports discovered/skipped/incomplete state and refreshes the existing sidebar rows without restart; covered by Local AI transport/store and renderer tests.
- [x] Continuation uses the original provider-native id; Forget removes only the pointer; covered by the Pi Home integration and session-store tests.
