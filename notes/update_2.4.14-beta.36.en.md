# Tuff v2.4.14-beta.36 Release Notes

## Summary Notes

- Voice input gains an optional noise-suppression preference, with call and dictation input settings unified in one place.
- The voice tidy-up pass now runs only when a transcript meets a length gate, counts units with ICU segmentation, and logs content-free telemetry.
- Download, storage and other advanced settings sit behind Developer Mode; the Nexus endpoint editor moved into a dialog and signed-in AI capabilities settle against credits.
- A TuffEx component wave: stacked Toast, visible SortableList drag with a keyboard path, Tree selection without a v-model, TabBar indicators, unified shadows and a neutral grey BUI dark theme.

## What's Changed

- The voice tidy-up pass fires only once a transcript crosses a length gate, so short utterances are no longer rewritten for nothing; the gate counts ICU segmentation units instead of misreading letter runs, and the pass records a reachable deadline and content-free telemetry.
- Voice capture is band-limited with an estimated silence threshold, DashScope `server_vad` defaults to a threshold that actually triggers, polish is gated on chat availability, and an optional noise-suppression preference was added.
- Voice settings and the insights page were reworked: input settings are unified, device notices no longer interrupt the flow, the insights header is a heading plus two buttons, the log and settings moved into paginated drawers, share/settings/delete sit behind a menu, and the status alert says only what it has to.
- The Globe key action can be turned off from the app in one click and now points at the system preference instead of promising interception; Fn forwarding carries a cleared flag rather than dropping it.
- Settings: the download and storage pages are gated behind Developer Mode and direct links to them bounce back to a safe place; the Nexus endpoint editor moved into a dialog.
- Search index reads moved off the main thread; CoreBox renders ready results without transition gates; system actions stop probing manifests for ordinary directories; cancellation propagates through compatible model calls.
- Credentials and billing: the signed-in provider bills every capability from the credit pricing table, Core App keeps the Nexus route, credential and credit state coherent, and Nexus base URLs the client cannot honour are refused.
- UI: Toast is a stack that fans out on hover and resumes each countdown where it paused; SortableList reorders live while dragging with a grip and a keyboard path; Tree selects without a v-model; Transfer takes a `minHeight`; TabBar gains size/variant with a sliding indicator; Alert gains a status glyph and a close; shadows share one light source and the BUI dark ramp is neutral grey.
