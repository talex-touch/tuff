# Tuff Intelligence Ask & QuickReview

The official Tuff Intelligence plugin provides two lightweight AI entries in CoreBox: conversational Ask and transient code review through the shared Tuff Intelligence capability layer.

## Capabilities

- Ask questions with `ai`, `@ai`, `/ai`, `智能`, or `问答`.
- Reuse recent Ask conversation context for follow-up questions.
- Run OCR on clipboard images before sending recognized text to `text.chat`.
- Review pasted or selected code with `review`, `quickreview`, `quick review`, `代码审查`, or `评审`.
- Route QuickReview through `code.review` with bug, best-practice, and security focus areas.
- Keep reviewed code and review output transient: QuickReview does not write conversation history, ContextHygiene memory, logs, or sync payloads.
- Copy generated answers or review output after `clipboard.write` permission approval.
- Bridge Ask requests into a stable Tuff Intelligence handoff session for later continuation.

QuickReview's first slice accepts text only. File and diff ingestion remain disabled until their filesystem permission and privacy contracts are defined.

## Permissions

- `intelligence.basic`: invoke Tuff Intelligence text chat, OCR, and code review capabilities.
- `clipboard.write`: copy AI answers or review output to the clipboard.

## Release Notes

### 1.0.2

- Added the consent-gated `quick-review` CoreBox feature and `touch-intelligence.quick-review` search provider.
- Added structured and degraded `code.review` rendering with provider, model, latency, trace, and capability metadata.
- Kept QuickReview inputs and outputs transient while preserving active-session retry and the existing permission-gated copy flow.
- Preserved attached source text exactly and discarded superseded pre-dispatch, cross-feature, and action completions before they could invoke providers or replace newer CoreBox state.

### 1.0.0

- Initial Nexus release package for the CoreBox AI Ask plugin.
- Supports text chat, clipboard image OCR, retry, copy answer, and handoff session metadata.
