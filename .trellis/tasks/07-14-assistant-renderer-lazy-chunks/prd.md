# Lazy-load Assistant Renderer Surfaces

## Goal

Keep FloatingBall, VoicePanel, and ScreenshotRegionSelector out of non-Assistant renderer startup chunks by loading each surface only for its startup window mode.

## Background

`AppEntrance.vue` is shared by MainApp, CoreBox, DivisionBox, MetaOverlay, OmniPanel, and all Assistant windows. It currently statically imports every Assistant SFC, so FloatingBall, VoicePanel, ScreenshotRegionSelector, and their transitive UI/runtime dependencies enter the shared renderer startup graph even when the active window mode cannot render them.

## Requirements

- Replace the three static Assistant SFC imports with `defineAsyncComponent(() => import(...))` using the repository's existing renderer pattern.
- Each Assistant component MUST load only when its matching `AssistantFloatingBall`, `AssistantVoicePanel`, or `AssistantRegionSelector` template branch renders.
- Preserve component names, template branches, branch precedence, startup mode logging, and all Assistant behavior.
- Do not change the loading strategy for CoreBox, DivisionBox, OmniPanel, MetaOverlay, or MainApp in this slice; CoreBox hotkey latency is explicitly out of scope.
- Do not add a global loading spinner, network fetch, preload bridge, duplicate component registry, or new dependency.
- Production renderer build output MUST contain separate lazy Assistant chunks rather than folding all three SFC implementations into the shared entry chunk.

## Acceptance Criteria

- [x] A focused contract test proves AppEntrance has no static Assistant SFC imports and declares the three exact dynamic component imports.
- [x] Existing Assistant startup/template contract assertions continue to pass.
- [x] CoreApp renderer production build succeeds and emits distinct FloatingBall, VoicePanel, and ScreenshotRegionSelector JavaScript chunks.
- [x] CoreApp web type-check and targeted lint pass.
- [x] TODO/CHANGES and the renderer quality contract record code/build completion without claiming startup timing or packaged current-version evidence.

## Out of Scope

- Lazy-loading CoreBox, OmniPanel, MetaOverlay, MainApp layout, or global runtime services.
- Changing Assistant window visibility timing or adding Suspense/loading UI.
- Claiming measured startup improvement, packaged asset-size reduction, or current-version visible evidence without separate benchmark artifacts.
