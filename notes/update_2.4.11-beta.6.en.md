# Tuff v2.4.11-beta.6 Release Notes

## Highlights

- Closed another set of UI and compatibility debt slices: added retained legacy alias hit telemetry, retired the old snippets placeholder plugins as hidden/deprecated, and split Nexus evidence sources into `live` / `d1` / `r2` / `local-only` / `memory` / `open`.
- Dialog messages now render as plain text by default, while trusted HTML must use the explicit `messageHtml` path to reduce accidental implicit `v-html` usage.
- Hardened Windows app indexing and Everything CLI discovery by validating shortcut targets, expanding registry environment variables, adding App Paths registry discovery, and probing Everything CLI candidates derived from registry `Path` entries.
- CoreBox now blocks `F1`-`F24` function keys to avoid F11 fullscreen toggles or function-key leakage through attached plugin UI; the custom placeholder also hides correctly during IME composition pre-edit input.
- Manual file index rebuild now sends a system notification after the rebuild completes successfully.
- Expanded TuffEx Drawer / Divider capabilities and Nexus examples, covering directions, sizing, slots, mask effects, mobile bottom-sheet behavior, and gradient dividers.

## Validation

- GitHub Actions `Build and Release` completed the full platform matrix and created the `v2.4.11-beta.6` GitHub prerelease.
- Nexus release sync published successfully, and `BETA` latest now points to `v2.4.11-beta.6`.
- Post-release remote gate checks confirmed Nexus release metadata, bilingual remote notes, download endpoints, and latest-channel resolution.

## Known Limitations

- This is a `2.4.11` beta test build and does not mean the stable release gate is fully green.
- Nexus remote assets still miss sha256 / signatureUrl and signature endpoints; Gate D records these as warnings, while Gate E still requires follow-up closure.
- Windows/macOS release-blocking real-device evidence, real TuffEx visual smoke screenshots, and a full release-cycle legacy alias hit=0 observation remain follow-up work.
