# Commit Ollama Stream After Delta

## Goal

Allow Ollama-to-OpenAI compatibility fallback only before the first emitted delta so partial local output cannot be duplicated by a second backend.

## Background

The SDK-level provider loop already treats the first visible delta as the fallback commit point. `LocalProvider.chatStream()` has an additional backend compatibility fallback inside one provider: any caught error whose message contains `404` currently delegates to the OpenAI-compatible stream, even after Ollama content has already been yielded. That can concatenate or duplicate two backend answers and hide the terminal failure from callers.

## Requirements

- Track whether the current Ollama attempt has emitted a non-empty delta to its caller.
- A 404 before any visible delta may continue using the existing OpenAI-compatible local backend fallback.
- After the first emitted delta, every error—including a 404-like error—must propagate unchanged; never invoke the compatibility backend.
- Do not buffer the whole answer, retract emitted text, synthesize success, or transform the original error.
- Preserve NDJSON/UTF-8 handling, terminal usage, request options, direct proxy, cooldown/retry policy, non-stream chat fallback, and the outer SDK provider fallback contract.

## Acceptance Criteria

- [x] A pre-output 404 regression proves the OpenAI-compatible stream fallback still runs and returns its chunks.
- [x] A post-delta 404 regression observes the Ollama delta, then receives the original error and proves the compatibility stream was never called.
- [x] No terminal success chunk or second-backend delta appears after the committed attempt fails.
- [x] Existing LocalProvider chat/stream/OCR/model-discovery tests, targeted lint, and CoreApp node type-check pass.
- [x] README/2.5.5/TODO/CHANGES and the Intelligence quality contract document the provider-internal commit point without claiming packaged Ollama evidence.

## Out of Scope

- Changing the SDK-wide provider selection loop, retries/cooldown, HTTP error normalization, non-stream behavior, or other providers.
- Built-in GGUF runtime, model management, SDK/schema changes, audit persistence, or production evidence capture.
