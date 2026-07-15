# Tuff Intelligence Ask

Tuff Intelligence Ask provides a lightweight AI entry in CoreBox. It lets users ask questions, summarize copied content, and analyze clipboard images through the shared Tuff Intelligence capability layer.

## Capabilities

- Ask questions from CoreBox with `ai`, `@ai`, `/ai`, `智能`, or `问答`.
- Reuse recent conversation context for follow-up questions.
- Run OCR on clipboard images before sending the recognized text to `text.chat`.
- Copy generated answers or replace the active application's selected text after permission approval.
- Bridge requests into a stable Tuff Intelligence handoff session for later continuation.
- Run stateless built-in AI Commands from CoreBox: `rewrite` / `改写`, `summarize` / `summary` / `总结` / `摘要`, and `explain` / `解释`.
- Prefer explicit command suffix text, then consume attached CoreBox text/HTML clipboard input when the suffix is empty.
- Apply versioned first-class prompt templates while leaving provider selection, quota, audit, fallback, copy, and retry to the host runtime.
- Render token streams into the existing CoreBox widget in place, cancel superseded streams, and ignore stale callbacks so provider work and visible answers follow the latest query.
- Let users stop the exact active OCR/chat request from the widget. Matching stream controllers are cancelled once, stale request ids cannot affect newer work, late events are ignored, and any partial answer remains visible for copy or replacement without being committed as completed history.
- Preserve canonical `IntelligenceErrorCode` values end to end, including distinct quota exhaustion versus quota-verification outages, so CoreBox can show the correct localized reason and recovery action instead of parsing provider strings.
- Keep failures actionable inside the widget with a visible Retry control that reuses the current prompt, context mode, and provider/model selection. Provider authentication, availability, and network failures expose host-owned `检查 AI 渠道` navigation to `/intelligence/channels`; `PERMISSION_DENIED` instead exposes `检查插件权限` and deep-links to `/plugin/touch-intelligence?tab=Permissions`.
- Preserve optional canonical failure `reason` and `recovery` fields through normalization, widget state, item metadata, and Retry payloads. Each field is bounded to 240 characters and rendered as escaped text under `原因` / `建议`; missing fields do not create placeholder rows.
- Present the current terminal failure once in the actionable notice rather than duplicating it as an assistant message. Earlier and distinct conversation history remains visible, and an error-only widget does not fall back to empty-conversation copy.

## Custom AI Commands

Open `AI 命令管理` from CoreBox with `ai commands`, `AI命令`, `AI 命令`, or `命令管理`. The embedded editor creates, updates, deletes, imports, exports, reloads, and opens the local `ai-commands.json` registry.

```json
{
  "version": 1,
  "commands": [
    {
      "id": "formal-polish",
      "name": "正式润色",
      "description": "把当前文本改成正式、简洁的表达",
      "aliases": ["formal", "正式润色"],
      "promptTemplate": "Rewrite the input for {{audience}} in a formal, concise tone. Return only the rewritten text.",
      "promptVariables": { "audience": "customers" },
      "version": "1.0.0",
      "enabled": true
    }
  ]
}
```

- At most 20 enabled entries are registered. IDs are lowercase ASCII slugs; each command supports 1–8 unique aliases.
- The editor validates ids, aliases, versions, template length, variables JSON, and duplicate custom aliases before sending host actions; the plugin runtime remains authoritative.
- The live System Prompt preview follows the host's simple Mustache behavior, including nested keys and empty output for missing variables; rendered values remain text inside the widget.
- Four host-owned starter presets—grammar correction, professional tone, friendly tone, and code review—can fill an unsaved draft. Reusing a preset allocates deterministic `-2`, `-3`, … id and alias suffixes instead of overwriting an installed command.
- Built-in and earlier custom aliases are reserved. Invalid, disabled, duplicate, oversized, or over-limit entries are skipped deterministically.
- Every custom command is text/HTML-only and stateless. Explicit suffix text wins; otherwise the attached CoreBox text/HTML clipboard input is used.
- Invalid top-level configuration or a feature identity collision preserves the currently active registry. A successful reload replaces dynamic features by id.
- Prompt template content stays in local plugin storage and provider input. Runtime metadata contains only command id/version plus the existing audit-safe prompt hash contract.

## Permissions

- `intelligence.basic`: invoke Tuff Intelligence text chat and OCR capabilities.
- `clipboard.write`: copy AI answers or route selected-text replacement through the governed host copy-and-paste action. On macOS, replacement also requires Talex Touch automation access to the target application.

## Release Notes

### 1.2.0

- Adds a bounded local `ai-commands.json` registry, dynamic CoreBox feature registration, and an embedded editor for create/update/delete/import/export/open/reload actions.
- Valid custom commands reuse the ask widget and host-owned provider/model, quota, audit, fallback, copy, and retry paths while remaining stateless.
- Editor saves and registry reloads are atomic: malformed configuration, invalid actions, storage failures, and feature collisions preserve the previously active command set.
- Missing registries initialize to a canonical empty document, variable-size checks are VM-safe, and every explicit AI command uses prefix matching so command suffix text reaches the intended feature instead of the default AI Ask.
- Answer previews expose explicit copy and replace-selection actions. Replacement uses the plugin Clipboard SDK, restores the target application through the host, and keeps permission or macOS automation failures visible for recovery.
- The command editor renders a deterministic System Prompt preview from the current template and variables JSON, flags missing variables, and explains the exact empty-value runtime behavior.
- The editor offers four curated starter presets that only populate editable drafts; duplicate preset use receives conflict-free ids and aliases before normal validation and save.

### 1.1.0

- Adds text-only Rewrite, Summarize, and Explain CoreBox features that reuse the existing widget.
- Commands execute statelessly with typed `promptTemplate` / `promptVariables`; they do not read or write AI Ask conversation history.
- Empty command suffixes consume attached CoreBox text/HTML input; explicit suffixes take precedence, and default AI Ask never substitutes clipboard text implicitly.

### 1.0.0

- Initial Nexus release package for the CoreBox AI Ask plugin.
- Supports text chat, clipboard image OCR, retry, copy answer, and handoff session metadata.
