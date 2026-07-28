# CoreBox AI 输入调度幂等与取消

## Goal

阻止 active widget 输入更新重复触发 provider request 与并发 context turn，建立 latest-request-wins 和单次提交证据。

## Requirements

### Activation Ownership

- Pushed widget render items may refresh visual/action state, but must not erase the original feature `interaction.sendMode`, `allowInput`, accepted input types, or activation identity.
- Widget host actions returning no activation transition must preserve the current provider activation; only an explicit non-empty activation response or exit may replace it.

### Single-Submit Semantics

- While a send-mode widget is active, input edits update the draft only and must not start regular search, `onFeatureTriggered`, provider invocation, or context turn creation.
- Enter/send executes the current draft once. Repeated renderer updates must not duplicate provider requests for the same submit.
- Existing latest-request-wins response commit remains fail-safe; stale responses must not replace the active widget answer.

### Compatibility

- Non-send-mode plugin features and webcontent input monitoring retain current behavior.
- No new raw IPC, provider-specific cancellation API, or plugin-only copy of CoreBox activation state.

## Acceptance Criteria

- [x] Pushed `touch-intelligence` widget state retains `interaction: { type: 'widget', sendMode: true }` and accepted input metadata in the active activation.
- [x] Context/model widget host actions preserve send mode when the main-process action returns `null`/`undefined` activation state.
- [x] Typing after a mode action emits no regular `core-box:query` and no AI provider request until explicit send.
- [x] One explicit send produces one provider request and one current user turn; continuation contains no duplicate current input.
- [x] Existing non-send-mode feature tests remain green.
- [x] Packaged Electron evidence records request count before edit, after edit, and after one explicit send without logging prompt/response content.

## Constraints

- Preserve typed CoreBox item/activation contracts and metadata-only evidence.
- Do not infer completion from unit tests alone; request-count behavior requires packaged verification.
