# Tuff v2.4.14-beta.38 Release Notes

## Summary Notes

- Nexus development now uses the built TuffEx dist by default, keeping the docs development graph small while preserving an explicit source mode for TuffEx editing.
- Added on-demand style-closure injection so dist-backed components load their dependency styles without eagerly loading the full stylesheet set.
- Fixed icon cascade specificity and repeated Cloudflare response-header parsing, with matching regression guards.

## What's Changed

- Added regression coverage for TuffEx mode selection, component style injection, icon CSS specificity, repeated Link-header merging, and Nexus build budgets.
