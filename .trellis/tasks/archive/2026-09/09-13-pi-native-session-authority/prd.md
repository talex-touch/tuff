# Cut Pi runtime to native session authority

## Goal

For Home conversations routed to the local Pi provider, continue one provider-owned native Pi session instead of flattening and replaying the full Home transcript on every turn.

## Requirements

- Apply native continuation only to trusted Home conversation invocations carrying an opaque `conversationId` and nullable `projectId`. Non-Home Pi uses remain ephemeral and keep `--no-session`.
- Add a local-only nullable conversation binding to `local_ai_cli_sessions`, unique when present. The binding cannot use a foreign key because Pi reports its native id before the first Home snapshot creates the conversation row; local and sync conversation deletion therefore remove the pointer explicitly in the same transaction. It never enters conversation DTOs or sync snapshots.
- A fresh Home thread creates one UUID native id, uses `--session-id`, verifies Pi's emitted session id, then commits the local pointer. A mapped thread uses `--session` and verifies the same id before accepting output.
- Normal continuation sends only the newest user turn. A legacy or cross-device Home thread with visible history but no local pointer may seed that history once into a newly created local native session; later turns do not replay it.
- Project-owned Home threads use the canonical Project root as `cwd`. Home threads without a Project use the existing stable isolated Local AI workspace. Missing/moved roots fail closed.
- Home and OmniPanel share one tuple lease registry. A concurrent task or terminal for the same provider/root/native id fails `NATIVE_SESSION_BUSY` before spawn.
- Missing/conflict pointers fail closed and never silently create a replacement. Provider errors not proving native-session loss leave the pointer available.
- Tuff continues storing Home messages for rendering/encrypted sync, but native Pi history is the inference-context authority. Raw native id/path/head never reaches renderer, sync, logs, or ordinary export.

## Acceptance Criteria

- [x] First Home Pi turn uses `--session-id`; second and post-restart turns use `--session` with the same native id and only the newest user prompt.
- [x] A restored legacy/cross-device thread seeds visible history once and then becomes native-only.
- [x] Project and Home fallback cwd are stable and canonical; mismatched project ownership cannot resume.
- [x] Concurrent Home/OmniPanel continuation is rejected before a second child is spawned and all teardown paths release the lease.
- [x] Conversation deletion removes only the local pointer; provider transcript remains.
- [x] Existing attachment, tool-gateway, cancellation, retry/commit, usage, and model-selection behavior remains valid; focused provider/runtime and renderer suites pass.
