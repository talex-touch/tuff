# Design System

## Direction

A dark security-control-plane publication combining network topology, code evidence, and an independent audit voice. The page is a long-form technical artifact, not a dashboard and not a campaign landing page.

## Theme

Dark theme only. Depth comes from graphite surface lightness, precise borders, and spacing rather than blur or outer glow.

## Color Tokens

```css
--color-bg: #0B0D10;
--color-surface: #15181D;
--color-surface-strong: #2A313B;
--color-text: #E6E8EB;
--color-warning: #FF8A00;
--color-info: #4C8DFF;
--color-critical: #D64545;
--color-implemented: #2E7D5A;
```

Status mapping:

- Implemented: green, solid square/check treatment.
- Partial: orange, half-filled or interrupted-line treatment.
- Disabled: steel, paused/outlined treatment.
- Gap: red, broken-boundary treatment.
- Inference: blue, explicit `INFERENCE` label.

## Typography

- Display: `Avenir Next`, `Arial Narrow`, `Helvetica Neue`, Chinese system sans fallback.
- Body: `PingFang SC`, `Segoe UI`, `Microsoft YaHei`, `Noto Sans SC`, system sans.
- Evidence: `SFMono-Regular`, `Menlo`, `Consolas`, system monospace.
- Body minimum: 1rem. Long text measure: 68ch. Display headings use bounded `clamp()` values.

## Spacing

Use a 4px-derived scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Related evidence stays tight; narrative sections receive larger separation.

## Shapes

- Surfaces: 10px radius.
- Buttons and status chips: full pill only when compact interaction or status semantics require it.
- Borders: full 1px perimeter. No colored side stripes.

## Layout

- Maximum content width: 1440px.
- Hero: asymmetric 7/5 split, collapsing to one column below 900px.
- Evidence matrix: real table above 760px, labeled stacked rows below.
- Threat flow: horizontal sequence on desktop, vertical sequence on mobile.
- Navigation: one line on desktop, compact anchor menu on mobile.

## Motion

One 650ms route-trace entrance communicates request flow. Status filters and disclosures use 180-240ms state transitions. No continuous animation. Reduced motion renders the final state immediately.

## Imagery

The trust-boundary topology, status matrix, and route traces are semantic HTML/CSS visuals. The confirmed palette board is reference-only and is not shipped as page content. No stock photography or fake dashboard raster is required for this architecture publication.
