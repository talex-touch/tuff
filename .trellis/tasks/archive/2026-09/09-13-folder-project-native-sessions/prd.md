# Folder projects and native CLI sessions

## Goal

Let Tuff treat one existing filesystem folder as one project, create/select it from the existing shell, run Local AI CLI work in that folder, and continue the original Pi, OMP, Claude Code, or Codex native session across tasks, terminals, panel close, and app restart without copying or replaying provider transcripts.

## Requirements

- One project is one canonical existing directory. `root_path` is immutable identity; display name is mutable. No multi-root, root rebind, project deletion, or conversation route changes.
- Existing `/home`, `/home/c/:id`, OmniPanel, legacy conversations, and cross-device Home conversations remain valid. Existing rows with no local project assignment render under synthetic Home.
- SQLite stores project metadata and local-only opaque native-session pointers. Provider transcripts remain authoritative and stay in provider storage.
- Renderer-visible Local AI contracts expose `sessionRef`, project id, provider, bounded title/state/origin/timestamps only. Native session ids, expected heads, transcript paths, prompt remainder, output, tool payloads, and provider errors stay main-only and never sync or enter ordinary exports.
- Project selection is host-only through the existing Electron shell. The renderer cannot submit arbitrary paths; plugins cannot enumerate project roots or invoke the picker.
- Every project-backed task and PTY uses the canonical project folder as `cwd`; quick invoke without a project retains the isolated Tuff workspace.
- A resumed request must match its pointer, pass live provider capability checks, and acquire one process-wide lease. Missing/conflict/busy/unsupported state fails closed without creating a fresh session.
- Pi continuation verifies authoritative session/head/file append linearity and detects sibling branches. OMP, Codex, and Claude validate exact native identity/cwd where their protocols expose it and rely on the Tuff process-wide lease.
- Resumed terminal commands retain all existing read-only/tool/context restrictions. Safety flags are never removed to make resume work.
- Archived projects retain conversations and pointers and can be restored. Explicit Forget removes only the Tuff pointer, never the provider transcript.
- This slice covers only Tuff-created OmniPanel sessions observed by Tuff. External filesystem discovery/adoption and the separate `pi-cli-runtime.ts` app-owned-history cutover are out of scope.

## Acceptance Criteria

- [x] Full migration chain creates canonical projects, nullable conversation ownership, and unique native pointers while preserving legacy conversations with `project_id NULL`.
- [x] Symlink-equivalent project paths restore one row; invalid paths and invalid Unicode-bounded names return stable errors.
- [x] Local conversation save/rename preserves project ownership and sync dirty state atomically; sync omits project ownership and preserves local assignment on remote apply.
- [x] Typed Project and Local AI SDKs expose only approved DTOs and host-only operations; raw native ids and transcript paths never reach renderer events.
- [x] Task and terminal continuation reject mismatch, missing/conflict state, unsupported resume, and a second lease holder before spawn; every teardown path releases once.
- [x] Pi single-child append updates the expected head; sibling append marks conflict and disables later continuation.
- [x] OMP uses `session/resume`, Codex uses `thread/resume`, and Claude SDK uses `resume` without transcript replay or unsafe fallback.
- [x] Sidebar renders Home, active pinned/recent projects, archived projects, conversations, and native sessions deterministically with accessible localized actions.
- [x] A project-created blank Home conversation persists its project id. OmniPanel reset/project switch/New Task cannot inherit stale session state.
- [x] Isolated Electron verification proves create/select, project cwd, two-turn native continuation, app restart persistence, busy rejection, conflict disabling, archive recovery, and narrow-layout usability without provider spend.
- [x] Privacy verification proves bounded first-line title only, no prompt/output/transcript copy in SQLite/sync/DTOs/logs, and Forget leaves provider transcript intact.
