# Design

The native watcher is the authoritative change signal when available. Scheduled background/visible polling remains registered as a fallback/watchdog but skips payload inspection while the watcher reports active. Explicit sources (`native-watch`, forced refresh, CoreBox baseline) still run the full capture pipeline.

Expose watcher activity from `ClipboardNativeWatcher`. Gate `runClipboardMonitor` before entering `ClipboardCapturePipeline`; this avoids even `availableFormats()` on unchanged scheduled polls. When native watcher startup fails or is disabled, existing polling behavior remains.

Keep current coalescing, cooldown, baseline, freshness, and persistence logic. Image encode work remains after a confirmed change; diagnostics continue to isolate OS clipboard read time from encoding and persistence.
