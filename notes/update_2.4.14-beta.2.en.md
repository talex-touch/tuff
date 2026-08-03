# Tuff v2.4.14-beta.2 Release Notes

## Summary Notes

- TuffEx adds a size-aware ResizeBox for building adaptive components and layouts.
- Nexus adds bilingual ResizeBox documentation and an interactive demo for validating its API and lifecycle behavior.
- Local Nexus development and GitHub release recovery are more reliable, with clearer recovery from publishing failures.

## What's Changed

- Added `TxResizeBox`, which smoothly adjusts its outer dimensions as content or container size changes and emits explicit resize start and end events.
- Added bilingual ResizeBox component documentation, a responsive interactive demo, navigation entries, and complete API guidance.
- Fixed local Nexus documentation requests returning 500 when Cloudflare runtime credentials were not loaded, while preserving strict validation in remote environments.
- The GitHub release workflow can now reuse provenance-validated cross-platform build artifacts to recover from publishing-stage failures without rebuilding.
