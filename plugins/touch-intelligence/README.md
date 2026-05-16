# Tuff Intelligence Ask

Tuff Intelligence Ask provides a lightweight AI entry in CoreBox. It lets users ask questions, summarize copied content, and analyze clipboard images through the shared Tuff Intelligence capability layer.

## Capabilities

- Ask questions from CoreBox with `ai`, `@ai`, `/ai`, `智能`, or `问答`.
- Reuse recent conversation context for follow-up questions.
- Run OCR on clipboard images before sending the recognized text to `text.chat`.
- Copy generated answers back to the clipboard after permission approval.
- Bridge requests into a stable Tuff Intelligence handoff session for later continuation.

## Permissions

- `intelligence.basic`: invoke Tuff Intelligence text chat and OCR capabilities.
- `clipboard.write`: copy AI answers to the clipboard.

## Release Notes

### 1.0.0

- Initial Nexus release package for the CoreBox AI Ask plugin.
- Supports text chat, clipboard image OCR, retry, copy answer, and handoff session metadata.
