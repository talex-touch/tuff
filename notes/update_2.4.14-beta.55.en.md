# Tuff v2.4.14-beta.55 Release Notes

## Summary Notes

- Browser Open launches copied URLs, configurable web searches, and Weibo trending entries with one Enter.
- Directory queries prioritize the default terminal, installed terminals, and Finder actions in CoreBox.
- Recommendations and usage statistics record accepted executions and share ranking and exposure evidence.
- Image previews preserve transparency, with improvements to thumbnails, quick actions, and action-menu hover feedback.
- Native OCR runs in a separate process, and renderer platform identifiers use darwin, win32, and linux consistently.
- TuffEx adds StreamText, StreamElement, and content-driven CodeStream, with matching documentation examples.

## What's Changed

- Browser 1.1.0 recognizes copied URLs from CoreBox query inputs and creates direct entries for browsers available on the device.
- Web search includes Google, Bing, DuckDuckGo, and Baidu, with custom {query} templates, a default engine, and per-engine enablement.
- Keywords open Weibo trending or custom shortcuts directly; saved settings update immediately, while filenames and paths stay out of web search.
- SDK API marker 261001 covers initialization-time SDK calls, one-shot query preservation, and browser discovery fixes; previously supported markers remain available.
- Directory recommendations offer the default terminal, Ghostty, iTerm2, other installed terminals, and Finder ahead of ordinary file results, rechecking availability at execution.
- Plugin settings communication acknowledges only after the lifecycle handler settles and returns an error if processing fails.
- CoreBox execution records, usage statistics, and recommendation scores share the accepted-execution boundary, with a usage-event migration and privacy cleanup.
- Empty-state recommendations include default settings entries, with unified plugin sources, exposure records, and visible recommendation evidence.
- Thumbnail and file-icon caches preserve alpha, image previews add quick actions, and action menus use a travelling hover highlight.
- Application lists and details share row primitives, and FlatInput consumers migrate to TxInput.
- Native OCR executes in a terminable process instead of occupying the Electron main process.
- Initialization and body platform identifiers share one rule; window roles and architecture identifiers such as arm64 remain separate.
- TuffEx streaming text supports incremental rendering, pacing, and slots; StreamElement handles structured content, and CodeStream adds content-driven mode.
- TuffEx dialogs, pagination, pickers, image galleries, and split layouts improve detail interactions; non-actionable status badges remain passive.
- Documentation navigation uses one travelling highlight, galleries follow real specimens, streaming examples are added, and branding consistently uses Tuff.

- Axios is upgraded to 1.20.0, and brace-expansion stays on its existing major versions with patched recursion-exhaustion and ReDoS fixes.

## Breaking Changes

- Browser 1.1.0 requires sdkapi 261001. Upgrade to this release or a later compatible client first; beta.54 and earlier clients reject activation.
- TuffEx removes FlatInput exports and legacy entry points; external consumers must migrate to TxInput.
