# Design: Folder projects and native CLI sessions

## Fixed product decisions

- One project maps to one canonical existing directory. `projects.root_path` is identity; only `name`, pin/archive state, and timestamps mutate.
- Existing Home routes and OmniPanel are reused. No route/query based project identity.
- Provider transcript is authoritative. Tuff stores only metadata and a local opaque pointer.
- Renderer sees `sessionRef`, never provider-native ids, heads, or transcript paths.
- Tuff-created sessions only. Discovery/adoption remains separate.

## Persistence

Migration adds:

- `projects(id, root_path, name, pinned, archived, created_at, updated_at, last_opened_at)` with unique canonical root and archive/pin/recent index.
- Nullable `conversations.project_id` referencing projects with `ON DELETE SET NULL`; existing rows stay Home.
- `local_ai_cli_sessions(id, project_id, provider, project_root, native_session_id, title, state, origin, expected_head_id, created_at, updated_at, last_seen_at)` with unique `(provider, project_root, native_session_id)` and project/recent index.

Drizzle mirrors the migration. Stores write only through `scheduleDbWrite`. Project creation applies `realpath` and directory validation before scheduling the upsert. Pointer title is the first nonblank prompt line, trimmed to 120 Unicode code points. State/origin are constrained in TypeScript.

## Typed boundaries

`ProjectRecord` exposes canonical root only to the trusted host renderer through a host-only Project SDK. `ProjectEvents` owns list, directory selection, rename, pin/archive and notifications.

Conversations add required `projectId: string | null` locally. Cloud sync projects `ConversationWithMessages` through `ConversationSyncSnapshot = Omit<..., 'projectId'>`; collection omits it, remote apply preserves an existing local owner and assigns new remote threads to Home.

Local AI requests replace renderer `nativeSessionId`/`workspaceRef` with opaque `projectId?`/`sessionRef?`. Summary/list/forget/change contracts expose only bounded metadata. Runtime normalization accepts only Tuff opaque ids matching `/^[A-Za-z0-9-]{1,128}$/`.

Provider capability is split into `taskResume` and `terminalResume`; carrying a pointer through an unsupported surface is a hard error.

OmniPanel context adds `project-local-ai` plus opaque `{ projectId?, sessionRef?, provider? }` and uses existing readiness-aware delivery.

## Main-process ownership

`ProjectModule` initializes after Database and applies the same trusted-host guard as Conversation. Native directory selection is parented to the requesting host window and accepts exactly one directory. No renderer path enters project creation.

`resolveLocalAiCliExecution()` chooses and verifies canonical cwd:

1. `sessionRef`: pointer is authoritative; requested provider/project must match; state must be available.
2. `projectId`: load project root.
3. neither: isolated LocalAiCli workspace.

Before every spawn, realpath must still equal the stored canonical root and be a directory. Missing/moved folders return `WORKSPACE_INVALID` without rebinding.

`NativeSessionLeaseRegistry` keys exact provider/root/native-id tuples. Resumed work acquires before spawn. Fresh work acquires immediately when native id arrives and before pointer publication. Release is idempotent and owned through every task/PTY teardown path.

## Ordered protocol lifecycle

Each task process owns one FIFO Promise chain for stdout protocol lines. A native id line acquires the lease, commits/upserts the pointer, touches project/session timestamps, then emits the opaque session chunk. Completion/close awaits the chain. The first protocol/DB error settles once, kills the child, drains queued work, and releases before stream end.

Provider continuation never replays Home messages:

- Pi RPC: resumed spawn adds `--session <nativeId>`. Before prompt, `get_state` + `get_entries` validate session id and capture authoritative head/session file/size in memory. After completion, appended file bytes (max 1 MiB) and new entries must form exactly one new user child and its assistant continuation; sibling, truncation, replacement, invalid JSONL, or mismatch marks conflict.
- OMP ACP: `initialize`, then `session/resume`, exact id check, then `session/prompt`.
- Codex app-server: `initialize`, then `thread/resume` with cwd/policy/sandbox/`excludeTurns:true`, exact id/cwd check, then `turn/start`.
- Claude SDK: pass `{ resume: nativeId, cwd }`; every emitted session id must match.

Only Pi promises cross-process sibling detection. Other providers guarantee in-process serialization and exact handshake identity only.

Terminal resume composes provider-native selectors with the same safety flags as fresh terminals. Rejection is `PROVIDER_RESUME_UNSUPPORTED`, never a flag-dropping fallback.

## Renderer state and UI

`useProjectStore` mirrors SQLite projects and Local AI summaries, owns subscriptions, and carries a one-shot pending project for a blank `/home` conversation.

Sidebar projection produces Home first, active projects pinned then recent, and one collapsed archived section. Missing project references fall back to Home. Conversation and native-session render keys are namespaced. Project/session actions reuse TuffEx menu/input controls and localized labels.

Home owns `projectId: Ref<string|null>` from pending selection or loaded conversation and passes it through every save/title update. Expanded sidebar state never implies ownership.

LocalAiCliPanel draft carries project/pointer/provider. A pointer locks provider and repeats continuation. New Task clears pointer/output/phase/prompt but retains project and unlocks provider. Reset, project switch, and full close clear the entire tuple. Terminal creation carries the same opaque context.

## Privacy and lifecycle

Sensitive inventory records pointer metadata as local-only database data. Native identity/head/transcript/prompt/output stay main-only and never sync/export/log. Forget deletes only the pointer. Project archive is metadata-only and never cascades/detaches rows.

## Compatibility and rollback

Schema changes are additive and preserve legacy null ownership. UI groups null/missing ownership into Home. A code rollback leaves unused additive tables/column and does not destroy provider transcripts. Provider handshake failures keep pointer state unless the provider explicitly reports missing/invalid identity; Pi divergence marks conflict.
