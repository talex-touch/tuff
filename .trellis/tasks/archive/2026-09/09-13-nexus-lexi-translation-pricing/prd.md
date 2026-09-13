# Nexus translation pricing for Lexi

## Goal

Make Nexus translation usage affordable for Lexi without changing chat pricing or overwriting operator-managed prices.

## Requirements

- Ship `text.translate` at 10 credits per 1,000 reported tokens and keep its double reservation before dispatch.
- Ship deliberately affordable image defaults: `vision.ocr` at 10 credits per image, `image.translate` at 20, and `image.translate.e2e` at 30.
- Keep chat, audio, and every unrelated capability price unchanged.
- Reconcile rows that still carry any previous shipped seed stamp, including the first 2026-09-13 pricing seed, while preserving rows stamped by an administrator update.
- Keep `upstreamCostUsdPerUnit` unset until route-specific trusted provider cost is available; do not invent a blended cost.
- Preserve the existing public/Admin pricing API shapes, but do not fetch or render the detailed capability price table in CoreApp's credits summary.
- Keep balance/quota and the concise billing explanation visible; demote routine Nexus request start/completion telemetry from INFO to DEBUG.

## Acceptance Criteria

- [x] A fresh price list returns `text.translate` at 10 credits per 1K tokens with a double reservation, and image defaults at 10/20/30 credits.
- [x] Rows carrying the first 2026-09-13 seed stamp move to the cheaper defaults; operator-edited rows keep their configured values.
- [x] `text.chat`, audio, and unrelated capability defaults remain unchanged.
- [x] CoreApp shows balance/quota without fetching or rendering a detailed capability price table.
- [x] Routine Nexus request start/completion records use DEBUG rather than INFO.
- [x] Focused Nexus pricing, CoreApp credits-summary, lint, build, and both package typecheck checks pass.

## Notes

- This task keeps token and image pricing reversible through persisted rules. Source-character pricing and per-capability monthly allowances remain separate follow-up work.
