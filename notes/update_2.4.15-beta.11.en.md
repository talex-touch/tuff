# Tuff v2.4.15-beta.11 Release Notes

## Summary Notes

- File indexing and Smart Recommendation upgrade: native file indexing adopts a more compact in-memory layout with CJK heteronym pinyin matching, while Smart Recommendation integrates local semantic file recall and reduces background storage and clipboard maintenance overhead.
- Browser Workspace (Beta) enabled by default with Phase 2 polish: corrects the outdated "off by default" wording from earlier notes, refines tab strip drag regions, horizontal scrolling, and keyboard shortcuts, and discards long-idle tabs automatically.
- Native macOS active-app detection and runtime fixes: macOS frontmost-app detection moves from script polling to native system APIs, clipboard image handling avoids full main-thread PNG decoding, and managed temp icon downloads and post-sleep slow-IPC false alerts are fixed.
- Isolated native OCR helper and availability gating: local system OCR now runs in a persistent native helper with image scaling and timeout recovery, and the built-in system OCR option is surfaced only when the runtime supports native OCR.
- Unified dialogs and Home AI composer parity: desktop dialogs and tips now share the TuffEx refraction look and localized actions, while the Home AI conversation stream and composer match the upgraded UIKit and component library.
- Nexus updates, docs, locale sync, and Store refresh: the Updates page fetches fresh live releases on mount, docs restore full static generation, footer locale switching and post-deploy chunk recovery are hardened, and the Store UI is rebuilt.

## What's Changed

- Native file indexing adds a compact in-memory index and bulk directory scanning with improved fuzzy highlight matching and CJK heteronym pinyin support; Smart Recommendation adds local semantic file recall and lowers main-process overhead from background database and clipboard maintenance.
- Browser Workspace is now enabled by default (correcting the outdated "off by default" wording in the v2.4.15-beta.9 notes); the top tab strip adds an unobstructed drag region, mouse-wheel horizontal scrolling, middle-click close, safe insets for Windows and Linux window controls, and automatic discarding of long-inactive tabs.
- macOS frontmost-application detection now uses native system APIs instead of repeatedly spawning external scripts; clipboard handling avoids main-thread full PNG decodes, prevents false slow-operation warnings after system sleep, and allows managed app temp directories to cache icon assets cleanly.
- Local system OCR now executes inside a persistent native helper process with orientation-aware native image scaling, per-request timeout cancellation, and automatic recovery on crashes; when the environment does not support native OCR or disables it, the built-in system OCR provider is omitted from defaults and capability options.
- Legacy desktop modals, bottom sheets, popover dialogs, and tip popups are unified on TuffEx refraction styling with localized default confirm and close labels.
- The Home AI conversation stream, message rail, and prompt composer now match the upgraded TuffEx and AI UIKit capabilities, preserving decimal context-window formatting in run status and honoring explicit send-button state overrides.
- The Nexus Updates page now refreshes live release data on mount with localized copy; footer locale switching waits for route locale chunks to settle, and chunk load recovery after deployments is hardened.
- Nexus documentation restores full static generation without first-paint deferrals or unstyled flashes, and the Store listing and detail pages adopt a refreshed card and status badge layout with sanitized inline SVG icon rendering.
