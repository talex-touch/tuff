# Tuff v2.4.14-beta.17 Release Notes

## Summary Notes

- **Added TuffEx Charts:** line and stacked timeseries, bubble maps, choropleth maps, Sankey diagrams, and composable SVG chart primitives are now available without ECharts.
- **Reorganized Nexus component docs:** documentation now follows Concepts, Basics, Pro, AI, and Data suites, with collapsible component families and an interactive specimen grid.
- **Improved docs loading and navigation:** page transitions use a layout-matched skeleton, suite tabs and groups are clearer, and narrow sidebars no longer scroll sideways.
- **Refined TuffEx interactions:** avatar status clipping is fixed, avatar groups gain hover expansion and overflow popovers, and Anchor, Checkbox, Icon, Input, and Select feedback is more consistent.

## What's New

- TuffEx Charts includes theme palettes, legends, axes, grids, and composable line, area, bar, scatter, and arc series.
- Timeseries charts support thresholds, incomplete segments, drag-selected time ranges, series visibility, and highlighting; maps support zooming, continuous shading, and original-row events.
- Nexus adds six bilingual Charts documentation groups and fifteen live demos covering the overview, colors, timeseries, maps, Sankey, and custom charts.

## What's Changed

- The component hub is organized into Basics, Pro, AI, and Data, while Concepts provides entry points for components, foundations, and utilities.
- Multiple pages for one component are grouped into expandable sidebar families, and the family containing the current page opens automatically.
- The docs loading state preserves breadcrumb, title, summary, metadata, and prose structure to reduce layout movement during navigation.
- Avatar status indicators are inset correctly for each shape; AvatarGroup can lift or spread members on hover and expose overflow members in a popover.
- Anchor waits for its first floating-position pass before expanding, preventing flip-related jumps; icons and transitions across common form controls are also corrected.
- TuffEx now exposes direct Basics, Pro, and AI suite entry points while keeping the root exports compatible.

## Breaking Changes

- TuffEx no longer exposes the `flat-button`, `icon-button`, `copy-button`, or `os-icon` deep import paths. Use `@talex-touch/tuffex/button`, `@talex-touch/tuffex/icon`, or the root entry instead.
- `TuffFlatButton` has been removed. Use the `flat` variant of `TxButton` instead.
