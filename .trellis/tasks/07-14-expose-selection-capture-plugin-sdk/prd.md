# Expose Selection Capture Plugin SDK

## Goal

Reuse OmniPanel's host-owned selection capture behind a typed, permission-gated plugin System SDK so AI plugins can summarize or transform the current OS selection without clipboard corruption.

## Requirements

- Move the existing OS selected-text capture behavior into one host-owned service reused by OmniPanel and plugin transport. Do not add a second copy/capture implementation.
- Expose a typed capture result containing selected text, support level, explicit issue code/message, platform limitations, and capture timestamp.
- Expose the operation from `@talex-touch/utils/plugin/sdk` as a typed System SDK method suitable for selection-to-AI workflows.
- Require a verified plugin identity and granted `clipboard.read` permission before any accessibility, shortcut, or clipboard operation. Permission failures must fail closed.
- Preserve the existing platform strategy: macOS accessibility selection first, then clipboard-preserving copy fallback; Windows/Linux remain best-effort according to the platform capability adapter.
- Preserve every clipboard format across fallback success, empty selection, timeout, and failure. Never log or persist selected text.
- Keep OmniPanel selection capture behavior and metadata compatible while switching it to the shared service.
- Correct active SDK and Raycast/uTools parity documentation so “current selection” examples use the real capture API and state its permission/platform limits.

## Acceptance Criteria

- [x] OmniPanel and the plugin transport call the same host-owned selection capture service.
- [x] A verified plugin with `clipboard.read` receives selected text plus typed support/recovery metadata; an unverified or denied plugin is rejected before host capture work.
- [x] macOS direct capture is preferred; fallback copy restores the exact clipboard snapshot on success, empty selection, timeout, and error.
- [x] Empty, disabled, and unsupported states return explicit non-success reasons rather than an ambiguous empty string.
- [x] Plugin SDK exports one documented selection capture entry point and rejects malformed host responses without fabricating selected text.
- [x] Existing OmniPanel behavior remains covered and focused CoreApp/Utils verification, type-check, lint, documentation verification, and diff checks pass.

## Out of Scope

- New OS accessibility permission request UX, image/file selection capture, background monitoring, selection history, or bypassing OmniPanel enablement settings.
- A new plugin permission category; selected-text capture reuses the existing medium-risk `clipboard.read` permission.
