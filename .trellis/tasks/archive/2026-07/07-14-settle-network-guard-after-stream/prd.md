# Settle Network Guard After Stream

## Goal

Defer NetworkService stream cooldown success until body completion and record mid-stream failures without unsafe replay.

## Background

`NetworkService.requestStream()` currently runs only fetch/open through `executeWithPolicies()`. The guard records success as soon as a response body object is returned, before callers consume it. A later socket/body failure therefore cannot contribute to cooldown and can also erase earlier failures when `autoResetOnSuccess` is enabled.

## Requirements

- Keep fetch/open retries and HTTP status handling unchanged.
- Defer stream request success until the response body emits normal completion.
- Record a body `error` as one guard failure without replaying a stream that may already have emitted visible bytes.
- Settle each stream at most once even if multiple terminal events occur.
- Do not count intentional consumer cancellation/early close as success or provider failure; leave prior guard state intact.
- Preserve ordinary buffered request behavior.

## Acceptance Criteria

- [x] Opening a stream does not reset an existing guard failure before body completion.
- [x] A mid-stream body error increments the existing failure state and can activate cooldown; the same error still reaches the consumer.
- [x] Fully consuming a stream records success and resets failures according to the configured policy.
- [x] Early consumer cancellation neither clears prior failures nor adds a new failure.
- [x] Focused NetworkService and LocalProvider tests, targeted lint, CoreApp node type-check, AI docs verification, and diff check pass.
- [x] Network/AI docs and quality guidance describe response-lifecycle settlement without claiming retries after visible output.

## Out of Scope

- Retrying/replaying body-consumption failures, classifying provider parser errors as network failures, changing cooldown defaults, SDK surface changes, or built-in local runtime work.
