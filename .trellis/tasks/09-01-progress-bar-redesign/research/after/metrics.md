# After — captured 2026-09-02 08:48–08:52 (live nexus dev :3200, headless Chrome :9228) + SSR render 08:18

Harnesses (this directory's parent): `shoot-after.mjs` (live pages, both themes, mints the dashboard
session cookie), `shoot-navshell.mjs` (the NavigationShell demo keeps its bar behind the second tab),
`ssr-render.mjs` (server-independent: built dist CSS + `renderToString`, 22 cases, animations frozen).
Raw numbers: `dark/metrics.json`, `light/metrics.json`, `ssr-metrics.json`.

## Gallery ProgressBar cell — before → after (identical in both themes unless noted)

| metric | before | after |
|---|---|---|
| wrapper classes | `--mask-solid --bg-blur` | `--mask-plain` only |
| `__mask` node | present (blur 16px + saturate) | absent |
| `__track::after` | 1px rim | `content: none`, 0px |
| track background | transparent (mask painted it) | `color-mix(text-primary 10%)` → dark `color(srgb .898 .918 .953 / .1)`, light `color(srgb .188 .192 .2 / .1)` |
| bar background | flat `rgb(64,158,255)` | `linear-gradient(90deg, color(srgb .25 .62 1 / .58), rgb(64,158,255))` |
| bar box-shadow | `0 10px 24px …` (clipped) | none |
| bar transition | `width 0.26s ease` | `width 0.48s cubic-bezier(0.23, 1, 0.32, 1)` |
| glow | — | `__glow.is-visible`, centre x == fill tip x (485.8 == 485.8) |

## Indeterminate variants (stateful demo's loading bar, 250 ms apart)

All five: `moved=true` (computed `transform` changed), `layoutStable=true` (`left`/`width` unchanged),
animation names `tx-progress-loading/classic/bounce/elastic/split`. Screenshots `indeterminate-*.png`.
Reduced motion (SSR, emulated): `animation: none`, `transform: none`, width 100 %, bg 35 % tint.

## Upload demo (`ProgressBarUploadDemo`, `textPlacement="top"`)

Mid-flight: head `上传中 79% • 1.8 MB / 2.3 MB`, `aria-label="上传 report.pdf"` (detail not in the
name), glow centre == tip (582.9 == 582.9), glow opacity 1. Label colour = fill colour, detail =
`--tx-text-color-secondary`. Shots `progress-bar-upload-midflight.png`, `progress-bar-demo-1.png`.

## TxProgress wrapper (progress docs page)

`--mask-plain --text-outside`, no mask node, no rim, gradient fill, glow on tip; 100 % row glow hidden.
Before: opaque `--bg-mask` layer (`rgb(29,30,31)` dark / `rgb(255,255,255)` light).

## Downstream (nexus)

| surface | result |
|---|---|
| `/dashboard/storage` (2 bars, gradient `color`, 8px) | gradient used verbatim, no glow (gradient colour), flat track; both themes |
| `ComponentsFeedbackTaskCenterDemo` (spinner page) | 3 bars 8px, plain, glow on tip |
| `ComponentsNavigationShellDemo` (tabs page, tab 2) | 10px success, plain, glow |
| `ComponentsReleasePolicyDemo` (tag-input page) | 8px shimmer + 8px `mask-variant="dashed"` (rim renders via `content:''`) |
| `ComponentsWorkflowPanelDemo` (components index) | 10px success, plain |
| `ComponentsOperationsStatusDemo` (progress-bar page demo-3) | dashed shimmer / wave / sparkle rows |

## Pre-existing, not touched

- `ProgressBarSegmentsDemo` (tooltip-wrapped) measures 0 px wide before AND after: `TxTooltip`'s
  reference box is `width: fit-content`, and the bar's `width: 100%` collapses inside it. The SSR
  case `tooltip-wrapped 40%` reproduces it.
- Hover-glow box-shadow and sparkle indicator are still clipped by the track (comments in source).

> 2026-09-02 curation: full-page captures over 400 KB (four downstream Components*Demo pages in both themes, `progress-bar-demo-3`, `progress-bar-demo-2` before-shots, the SSR sheets and `ssr.html`) were dropped from the repo copy; their findings are the rows above, and `shoot-after.mjs` / `ssr-render.mjs` regenerate them against :3200.
