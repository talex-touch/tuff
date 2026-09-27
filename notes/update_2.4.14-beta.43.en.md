# Tuff v2.4.14-beta.43 Release Notes

## Summary Notes

- On-device speech models now work the moment they land: installing or removing a bundle recomputes the `audio.asr` route immediately, so `本地` no longer needs a restart or a hand-made channel binding — and no longer reports unavailable just because a cloud channel exists.
- Installing a model stopped reporting failure it did not have: the download now carries a deadline of its own size (engine runtime first, then 228 MB of weights), instead of a 60s channel default firing while main finished the work.
- Plugin package downloads work again: manual redirects run on `net.request` (Chromium's fetch cancels a manual hop outright) and the download deadline scales with the package, so a 14 MB package no longer dies at a fixed 30s.
- CoreBox and Home keep tightening: the default global shortcut is Option+Space, item transitions and the meta overlay were rebuilt, the composer gained its send-island motion and dictation integration, and the sidebar's actions say what they do before they delete.
- Local files and icons: folding the macOS `/private` alias fixes the plugin-icon 403, and an icon read that fails now reports the real reason instead of a `TypeError`.

## What's Changed

- Voice routing: `ensureLocalAsrRoute` now follows the model store — it re-runs after an install and after a removal, binds the on-device channel even when another route serves `audio.asr` (`云端` still resolves to the cloud channel only), releases the binding when the store is empty, and still honours the user closing the route on the channels page.
- Model installs: the request carries a 30 minute bound while progress polling stays the liveness signal, so the channel's 60s default can no longer report a finished install as a failure.
- Plugin download transport: the manual hop is acquired with `net.request({ redirect: 'manual' })`, so a 302 is no longer cancelled by Chromium; the response body is bridged into a `PassThrough` with backpressure for `pipeline` consumers, and response headers are lowercased to match the fetch path.
- Download deadline: `resolvePackageDownloadTimeout` floors at 30s, scales at a pessimistic 50 KiB/s and caps at ten minutes; npm passes `dist.unpackedSize`, TPEX passes the detail response's `packageSize`.
- Local file policy: the macOS `/private` prefix is folded on both sides of the comparison, so an installed plugin's own `assets` icon is no longer judged outside its root (tfile 403 / `NETWORK_FILE_FORBIDDEN`); traversal and sibling paths are still rejected.
- Renderer errors: an icon read that resolves a non-string payload now throws `Icon content request failed: …` with the payload's own reason instead of dying on `text.trim is not a function`.
- CoreBox: the default global shortcut is Option+Space with keybinding hints; item transitions, the pulse beam bar and rendering details were polished; the meta overlay was re-centred with backdrop blur and redesigned actions; a fast lane adds in-memory app search, refresh-storm protection and jump navigation.
- CoreBox tools: radix conversion and line tools in instant preview, Chinese and astronomical units in the lexicon, eight physics constants with symbol lookup, and text stats only tagging at the start or end of a query.
- Home and conversations: composer controls were redesigned with send-island motion and dictation integration; Home's AI opening line is off until the user turns it on; a blank conversation gets a greeting and suggestions; reasoning effort reaches the model that runs; pictures paste into the composer from anywhere on the page; capability prompts are no longer saved as capability ids.
- Sidebar: actions say what they do and deletes are confirmed; projects became folders with one current highlight.
- Indexing and search: bounded file-index memory, worker backpressure and consolidated icon storage.
- TuffEx: `TxChoiceCard` (a paged card of rich choices) and `TxFusionSurface` (a path-drawn surface that sprouts and splits), a jelly indicator engine plus visual detail work; `TxPrismGlow` no longer greys in light mode.
- Nexus and docs: edge blur layout, components gallery and docs specs; self-closing doc components close before MDC parses them; the Cloudflare AI Gateway decision is written down.
- Store and plugin tips: tips now pass the localized `common.confirm`, so a Chinese UI no longer shows an English “Sure”.
- Main process and tooling: system shell handlers, precore, tray and i18n, plus packaged acceptance gates; the branch and release policy is executable (`check branch-policy` and its CI gate, with beta containment judged only when a beta is cut); the pin checker resolves its entrypoint through realpath; radix pattern lookups are guarded against undefined.
- Task record: the channel error-reply contract is written down (an error reply is still resolved as data; R1 open), keeping the already-fixed macOS alias as evidence.
