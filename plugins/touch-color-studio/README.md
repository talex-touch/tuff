# Touch Color Studio (`touch-color-studio`)

Design-grade Color Lab for Tuff CoreBox: instant color space conversion, exact WCAG 2.1 AA/AAA contrast checking with accessible pair suggestions, full Tailwind CSS v4 nearest-token matching and reverse lookup, harmony palettes, tint/shade ramps, and CSS gradients — all running 100% locally in the isolated Prelude runtime.

## Features / 核心功能

- **Multi-Space Color Converter / 多色彩空间互转**
  - Supports `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)`, `oklch(...)`, CSS named colors, and Tailwind v4 tokens (`blue-500`, `bg-emerald-400`, `rose-600/80`).
  - Converts accurately across **HEX**, **RGB / RGBA**, **HSL / HSLA**, **OKLCH** (Björn Ottosson exact OKLab matrices with sRGB gamut mapping), and CSS custom properties.
- **Exact WCAG 2.1 Contrast & Accessible Pairings / 精确对比度与无障碍配色**
  - Type `contrast #111 #fff`, `wcag #3b82f6 #ffffff`, `#2563eb vs #f8fafc`, or `blue-600 vs white`.
  - Computes exact W3C WCAG 2.1 relative luminance and contrast ratio (including alpha compositing over opaque backgrounds), evaluating **Normal AA (4.5:1)**, **Normal AAA (7.0:1)**, **Large AA (3.0:1)**, **Large AAA (4.5:1)**, and **UI AA (3.0:1)**.
  - When a pair fails AA or AAA, automatically searches OKLCH lightness space to suggest the closest hue-preserving **AA** and **AAA** accessible foreground alternatives.
- **Tailwind CSS v4 Palette Engine / Tailwind v4 色板匹配与反查**
  - Complete 22-family × 11-shade Tailwind v4 OKLCH palette (242 tokens + `white` / `black`).
  - Matches any color to its perceptually closest Tailwind v4 token using OKLab distance ($\Delta E_{OK}$).
  - Supports reverse lookup (`blue-500`, `emerald-400`) and full family ramp browsing (`tailwind indigo`, `tw rose`).
- **Palettes, Tints/Shades & CSS Gradients / 和谐色板、明暗阶梯与渐变**
  - Generates **Complementary**, **Triadic**, **Analogous**, **Split-Complementary**, 5-step **Tint/Shade Ramps**, CSS custom property blocks, and ready-to-paste `linear-gradient(...)` rules.

## Usage Examples / 使用示例

| Input | Result |
| --- | --- |
| `color #3b82f6` | HEX, RGB, HSL, OKLCH, nearest Tailwind v4 token, WCAG ink contrast, harmonies, tint/shade ramp, CSS gradients |
| `oklch(0.623 0.214 259.815)` | Gamut-mapped sRGB HEX/RGB/HSL + closest Tailwind v4 token (`blue-500`) |
| `contrast #111 #fff` | Exact `18.88:1` WCAG 2.1 contrast report (AA/AAA Normal & Large Pass) |
| `contrast #60a5fa #ffffff` | Exact ratio + closest OKLCH-adjusted AA (`>= 4.5:1`) & AAA (`>= 7.0:1`) color suggestions |
| `blue-500` | Reverse lookup Tailwind v4 `blue-500` in HEX, RGB, HSL, OKLCH + family siblings |
| `tailwind emerald` | Full Tailwind v4 `emerald-50` through `emerald-950` shade ramp |

## Permissions / 权限说明

- `clipboard.write` *(optional)*: Copies converted color values, Tailwind tokens, WCAG reports, or CSS gradients to the clipboard. All copy actions fail closed if permission is denied or unavailable.

## Verification

```bash
node -c index.js
node --test index.test.cjs
```
