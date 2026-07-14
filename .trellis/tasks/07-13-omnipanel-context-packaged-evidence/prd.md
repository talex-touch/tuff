# Capture packaged OmniPanel context evidence

## Goal

Capture privacy-safe isolated packaged Electron evidence that a visible OmniPanel built-in AI action reaches the host-owned ContextHygiene path with `owner=omni-panel`, `mode=new`, `scope=light`, one controlled Provider dispatch, and a visible terminal result.

## Requirements

- Launch the current macOS arm64 packaged CoreApp against a fresh isolated profile and a controlled local Ollama-compatible Provider.
- Open OmniPanel through its supported host path, inject a non-sensitive controlled desktop context capsule, and execute one built-in AI action from the visible panel.
- Verify the action creates an OmniPanel-owned context session/package log with `mode=new`, `scope=light`, `entrypointId=omni-panel.ai-action`, and no cross-entrypoint history.
- Verify exactly one controlled `/api/chat` request and a visible terminal success result.
- Curated evidence stores only owner/scope/mode/count/role/token/boundary/capsule-source metadata; no prompt, response, turn, Memory, retrieval chunk, secret, or user path.
- Update the graded entrypoint evidence manifest and current roadmap wording without upgrading real-profile evidence.

## Acceptance Criteria

- [x] One visible packaged OmniPanel AI action completes against the controlled Provider.
- [x] Database/context evidence shows one `owner=omni-panel`, `mode=new`, `scope=light` session/package log with the canonical entrypoint and no inherited history.
- [x] Provider capture shows exactly one call with metadata-only role/count projection and no content.
- [x] Existing focused OmniPanel context tests and the evidence manifest verifier pass.
- [x] Privacy scan passes; OmniPanel packaged context becomes passed while real-profile remains open.

## Notes

- This is isolated-controlled packaged evidence, not a production Provider or real-profile claim.
- Reuse the existing `tuff.context-entrypoint-evidence.v1` manifest and privacy boundary.
