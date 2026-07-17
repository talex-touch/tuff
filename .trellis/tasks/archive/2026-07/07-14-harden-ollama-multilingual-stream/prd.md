# Harden Ollama Multilingual Stream

## Goal

Decode Ollama NDJSON with streaming UTF-8 semantics and preserve terminal usage when the final done frame has no trailing newline.

## Background

`LocalProvider.chatStream()` already consumes Ollama `/api/chat` NDJSON through the unified network service, but converts every `Buffer` chunk independently with `toString('utf8')`. A multibyte CJK/emoji code point split across transport chunks is therefore replaced/corrupted. The EOF path parses a final unterminated frame for text only and drops its `done` usage metadata before emitting a synthetic empty terminal chunk.

## Requirements

- Decode raw Buffer/Uint8Array stream chunks with one stateful UTF-8 decoder for the lifetime of the request; string test/adaptor chunks must remain supported.
- Preserve existing newline-delimited frame buffering when JSON lines and Unicode code points split at different chunk boundaries.
- Flush decoder state exactly once at EOF before parsing the final buffered line.
- When the final line has `done: true`, emit its final delta if present, then exactly one terminal chunk with Ollama prompt/completion/total usage; do not replace it with a zero-usage synthetic terminal.
- Keep the existing early `done` behavior, generic terminal chunk for streams that omit `done`, model/request options, direct proxy, retry/cooldown, timeout, and pre-output 404 OpenAI-compatible fallback.
- Do not log or persist streamed prompt/response content.

## Acceptance Criteria

- [x] A focused regression splits Chinese and emoji bytes inside UTF-8 code points and proves exact delta reconstruction with no replacement characters.
- [x] A focused regression splits NDJSON at unrelated byte/newline boundaries and proves ordered deltas remain intact.
- [x] A final `done: true` frame without trailing newline preserves its delta and terminal usage, emits one done chunk, and does not emit a synthetic duplicate.
- [x] Existing newline-terminated Ollama stream, non-stream chat, OCR, and 404 fallback tests remain green.
- [x] Targeted lint and CoreApp node type-check pass.
- [x] 2.5.5/TODO/CHANGES and the Intelligence quality contract describe Ollama compatibility as implemented code, while built-in GGUF management remains planned and no packaged/local-runtime evidence is claimed.

## Out of Scope

- Built-in llama.cpp/GGUF management, model download/delete/load UI, Ollama installation, provider routing changes, or new SDK endpoints.
- Changing provider-level post-delta fallback policy, usage estimation, schema, audit persistence, or production evidence capture.
