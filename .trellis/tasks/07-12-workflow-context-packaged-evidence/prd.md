# Capture packaged Workflow context evidence

## Goal

Capture privacy-safe isolated packaged Electron evidence for Workflow owner/scope/new-session context execution and single controlled provider dispatch without conflating runtime smoke with provider production success.

## Requirements

- Launch the current macOS arm64 packaged CoreApp against a fresh isolated profile and a controlled local Ollama-compatible Provider.
- Execute the built-in `文本批处理` Workflow twice through the visible Workflow page.
- Verify each run creates a distinct Workflow-owned context session: its first `text.chat` model step uses `mode=new`, later model steps use `mode=continue` with the same session, all under `scope=session` and `entrypointId=workflow.use-model`.
- Verify exactly one controlled `/api/chat` request per run and a visible terminal completed result.
- Curated evidence must store only owner/scope/mode/count/role/token/boundary metadata; no prompt, response, turn, Memory, retrieval chunk, secret, or user path.
- Update the graded entrypoint evidence manifest and roadmap wording without upgrading OmniPanel or real-profile levels.

## Acceptance Criteria

- [x] Two visible packaged Workflow runs complete against the controlled Provider.
- [x] Database/context evidence shows two distinct Workflow sessions and two package logs with `mode=new`, session scope, Workflow entrypoint metadata, and no missing-continuation degradation.
- [x] Provider capture shows exactly two calls, each with metadata-only role/count projection and no content.
- [x] Focused multi-step regression proves first-step `new`, subsequent-step `continue`, same-session reuse within a run, and distinct sessions across runs.
- [x] Evidence manifest verifier and privacy scan pass; Workflow packaged context becomes passed while OmniPanel packaged and real-profile remain open.

## Notes

- This is isolated-controlled packaged evidence, not a production Provider or real-profile claim.
- Reuse the existing `tuff.context-entrypoint-evidence.v1` manifest and privacy boundary.
