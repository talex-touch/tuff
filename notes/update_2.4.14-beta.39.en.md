# Tuff v2.4.14-beta.39 Release Notes

## Summary Notes

- Speech recognition gains a Nexus Qwen Audio path, with cloud-delivered voice provider packs, buffered transcription, and hardened recovery and result persistence after a failed attempt.
- Applications moved into Settings as a split browser: selecting an application shows its details beside the list instead of replacing the page.
- Added the TuffEx chart family, providing on-demand chart components on an ECharts host.
- File indexing now covers the macOS home directory and refreshes entries after a file changes.

## What's Changed

- Search and indexing: extracted the incremental traversal filter; fixed the macOS home directory being left unindexed and changed files not refreshing.
- Voice: isolated retry caller cancellation so one cancellation no longer affects other in-flight requests; corrected the Qwen ASR deadline and how the request body is read.
- Nexus: lowered AI pricing and priced translation independently; documentation pages can be fetched as raw Markdown through a `.md` suffix.
- Deployment safety: production Cloudflare Pages Secrets are validated rather than only Preview, and a weekly scheduled watch now reports a missing Secret or a plaintext binding.
- Interface: the MetaOverlay renderer stays warm across dismissals for faster reopening; fixed detached preview visibility and key routing.
