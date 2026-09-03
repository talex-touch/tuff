# Baseline (before) — captured 2026-09-02 00:27–00:29, nexus dev :3200, headless Chrome :9228

Harness: `../shoot.mjs` (`MODE=dark|light STAGE=before TUFFEX_CDP_URL=http://127.0.0.1:9228 node shoot.mjs`).
Screenshots: `dark/` and `light/` — gallery ProgressBar cell, each `.tuff-demo__window` on
`/zh/docs/dev/components/progress-bar` (demo-0..3) and `/zh/docs/dev/components/progress` (demo-0..1).
`/dashboard/storage` redirected to `/sign-in` (no session cookie minted for the baseline run), so the
downstream storage page has no "before" shot; the "after" pass mints a cookie.

## Gallery ProgressBar cell (`<TxProgressBar :percentage="62" />` + `indeterminate`)

| metric | dark | light |
|---|---|---|
| wrapper classes | `--mask-solid --bg-blur` | same |
| track size | 240 × 5 | same |
| `__track::after` border | 1px `rgba(135,135,136,.66)`-ish | 1px `color(srgb .93 .94 .955 / .66)` (invisible on white) |
| `__mask` | present, `color(srgb 1 1 1 / .14)` + `blur(16px) saturate(1.5)` | same |
| bar background | `rgb(64,158,255)` flat | same |
| bar box-shadow | `0 10px 24px` (clipped by `overflow:hidden`) | same |
| bar transition | `width 0.26s` | same |
| glow / head nodes | none | none |

## TxProgress instances (progress docs page)

`--mask-plain --bg-mask --text-outside`, height 6px, mask `rgb(29,30,31)` (dark) / `rgb(255,255,255)` (light):
the opaque mask hides the track fill entirely, which is why the wrapper drops `mask-background="mask"`.

Light-mode raw metric dump: `light-metrics.log`.
