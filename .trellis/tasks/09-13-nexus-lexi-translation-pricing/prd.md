# Nexus translation pricing for Lexi

## Goal

Make Nexus translation usage affordable for Lexi without changing chat pricing or overwriting operator-managed prices.

## Requirements

- Ship `text.translate` at 100 credits per 1,000 reported tokens.
- Hold twice the estimated translation charge before dispatch so typical translation output does not require systematic under-reservation.
- Keep every other capability price unchanged.
- Reconcile rows that still carry the previous shipped seed stamp, while preserving rows stamped by an administrator update.
- Keep `upstreamCostUsdPerUnit` unset until route-specific trusted provider cost is available; do not invent a blended cost.
- Preserve the existing public/Admin pricing API shapes.

## Acceptance Criteria

- [x] A fresh price list returns `text.translate` with `creditsPerUnit = 100`, `reserveMultiplier = 2`, and `unit = 1k_tokens`.
- [x] A previously seeded, never-edited `text.translate` row moves to the new default.
- [x] An operator-edited `text.translate` row keeps its configured price and reserve multiplier.
- [x] `text.chat` and unrelated capability defaults remain unchanged.
- [x] Focused pricing-store and pricing-route tests pass (`109/109`); Nexus typecheck also passes.

## Notes

- This task is the reversible token-priced first step. Source-character pricing and per-capability monthly allowances are separate follow-up work.
