# Design: Shared Selection Capture SDK

## Boundary

`SelectionCaptureService` becomes the only owner of accessibility selection lookup, copy-shortcut fallback, clipboard snapshot/restore, timeout, capability status, and low-sensitivity diagnostics. OmniPanel calls the service directly with its current enablement setting. Plugins call a typed event registered through the permission middleware.

## Contracts

Add transport types beside existing App/System contracts:

- `SelectionCaptureRequest`: optional SDK metadata only.
- `SelectionCaptureResult`: `text`, `supportLevel`, optional `issueCode`/`issueMessage`/`limitations`, and `capturedAt`.
- Support levels remain `supported | best_effort | unsupported`.
- Issue codes remain `disabled | empty | failed | unsupported`.

The plugin event requires verified plugin context and `clipboard.read`. Permission denial is a transport error; platform/selection outcomes are successful typed responses with an empty `text` and explicit issue metadata.

## Data Flow

1. Plugin imports `system.captureSelection()` or `captureSelectedText()` from `@talex-touch/utils/plugin/sdk`.
2. The SDK sends the typed App/System capture event.
3. The CoreApp handler verifies plugin identity and `clipboard.read` before invoking the service.
4. The service checks the current selection-capture capability.
5. macOS attempts AX selected text first. Otherwise the service snapshots all clipboard formats, sends the platform copy shortcut, polls once, reads text, and restores the snapshot in `finally`.
6. The SDK validates the host envelope and returns typed metadata; malformed results become an explicit failed result with no fabricated text.

OmniPanel follows steps 4-5 directly and continues projecting the result into its existing context capsule.

## Security and Privacy

- No selected text in logs, audit metadata, history, or persistent storage.
- Plugin permission checks occur before accessibility, shortcut, or clipboard work.
- Fallback clipboard mutation is always restored best-effort; restore failure is reported only as low-sensitivity diagnostics.
- No raw channel or unverified plugin caller is accepted.

## Compatibility

Existing OmniPanel settings still decide whether its own capture is enabled. The new plugin entry point does not change the platform support matrix or request OS permissions. Existing active-app and clipboard SDK behavior remains unchanged.

## Rollback

Remove the typed event/SDK method and switch OmniPanel back to its previous private capture implementation together. No schema, persisted state, or migration is introduced.
