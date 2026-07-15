# Type Ollama Compatibility 404

## Goal

Use NetworkHttpStatusError status 404 rather than message substring matching so only true Ollama endpoint absence triggers compatibility fallback.

## Background

`LocalProvider.chat()` and `chatStream()` currently classify compatibility fallback by checking whether an arbitrary error message contains `404`. A JSON/parser/provider error such as `Unexpected token at position 404` can therefore switch backends even though the Ollama endpoint exists, hiding the real failure and potentially duplicating behavior.

## Requirements

- Use the shared `NetworkHttpStatusError` status field as the only 404 compatibility signal.
- Preserve the existing pre-output 404 fallback and post-delta commit boundary.
- Propagate non-HTTP errors and non-404 HTTP errors unchanged, regardless of their message text.
- Apply the same classification to non-stream and stream Ollama calls without changing SDK-wide provider selection.

## Acceptance Criteria

- [x] A typed HTTP 404 still delegates to the OpenAI-compatible local endpoint before any output.
- [x] A generic error whose message contains `404` propagates unchanged and never invokes compatibility fallback.
- [x] Post-delta typed 404 still propagates unchanged and never invokes compatibility fallback.
- [x] LocalProvider/model-discovery focused tests, targeted lint, and CoreApp node type-check pass.
- [x] README/2.5.5/TODO/CHANGES and the Intelligence quality contract describe typed 404 classification without claiming built-in runtime evidence.

## Out of Scope

- SDK-wide provider fallback, retry/cooldown policy, NetworkService error normalization, built-in GGUF runtime, model management, or packaged/device evidence.
