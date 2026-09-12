# Tuff v2.4.14-beta.37 Release Notes

## Summary Notes

- Voice dictation cleanup is now tiered by transcript length, skipping low-value AI calls for short utterances while preserving full cleanup for longer text.
- Added content-free polish telemetry so skip, fallback, and completion outcomes can be measured without storing transcript text.
- Consolidated the release line and fixed length counting for space-free scripts and combining characters.

## What's Changed

- Added short-transcript gating and a natural-language scope cap while retaining raw-transcript fallback on timeout.
- Switched non-CJK counting to ICU `Intl.Segmenter`, avoiding incorrect counts for space-free languages and accented combining sequences.
- Recorded privacy-safe polish decisions, latency, and outcomes, alongside the latest mainline convergence and release-flow fixes.
