---
title: Tuffex Components
description: The component gallery for Tuffex (Ta Fu)
---

# Tuffex Components

> Tactile feel, translucent surfaces, and restrained motion. Welcome to Ta Fu.

## Preview
<TuffDemo title="Component Lineup" description="A quick scan of core building blocks.">
  <template #preview>
    <div class="tuff-demo-row">
      <TxButton size="sm">Action</TxButton>
      <TuffSwitch :model-value="true" />
      <TxStatusBadge text="Online" status="success" />
      <TxTag label="Focus" />
      <TxProgressBar :percentage="62" style="width: 140px;" />
    </div>
  </template>
</TuffDemo>

## Quick Access
- **[Button](./button.en.md)** — tactile buttons and flat variants.
- **[Icon](./icon.en.md)** — unified icon system and visual density.
- **[Input](./input.en.md)** — lightweight inputs and search states.
- **[Dialog](./dialog.en.md)** — confirmations and interaction loops.
- **[Switch](./switch.en.md)** — tactile toggles with state feedback.
- **[Avatar](./avatar.en.md)** — identity and sizing system.
- **[Tooltip](./tooltip.en.md)** — lightweight hints and hierarchy.
- **[Toast](./toast.en.md)** — quick feedback and transient states.
- **[Grid](./grid.en.md)** — structured layout and alignment.
- **[Progress](./progress.en.md)** — linear progress and status feedback.
- **[ProgressBar](./progress-bar.en.md)** — multi-state progress and loading.
- **[StatusBadge](./status-badge.en.md)** — status signals and system feedback.
- **[Tag](./tag.en.md)** — categories and labels.
- **[Skeleton](./skeleton.en.md)** — loading placeholders and structure hints.
- **[LayoutSkeleton](./layout-skeleton.en.md)** — layout-level skeleton placeholder.
- **[Drawer](./drawer.en.md)** — side panels and form surfaces.

## Component Map
| Category | Core Scope | Migration |
|----------|------------|-----------|
| Basic | Button / Icon / Avatar | In progress |
| Form | Input / Select / Switch | In progress |
| Feedback | Dialog / Toast / Tooltip / ProgressBar | Planned |
| Layout | Grid / Flex / LayoutSkeleton / Container | Planned |
| States | Empty / Skeleton / Loading | Planned |

## Doc Structure
Each component page follows a consistent layout:
1. **Overview** — intent and semantics  
2. **Usage** — base usage + interactive demo  
3. **Variants** — sizes, states, compositions  
4. **API** — props / slots / events  
5. **Design Notes** — motion and visual rules

## Design Pillars
- **Motion**: short, controlled, decisive movement.
- **Surface**: translucent layers and depth hierarchy.
- **Density**: keep breathing room under high information load.

<TuffPillars :items="[
  { title: 'Motion', summary: 'Short, controlled, decisive movement.', accent: '01' },
  { title: 'Surface', summary: 'Translucent layers and depth hierarchy.', accent: '02' },
  { title: 'Density', summary: 'Keep breathing room under high load.', accent: '03' },
]" />

## Demo Conventions
- Demos should be runnable and copyable, not just screenshots.
- Wrap interactive demos in `client-only` to avoid SSR hydration issues.
- Prefer tables for props/slots/events, with concise behavior notes.

## Migration Phases
- **Phase 1**: Button / Icon / Input (priority)  
- **Phase 2**: Dialog / Drawer / Toast (interaction loop)  
- **Phase 3**: Grid / Layout / Data (complete the system)

## Contributing
Component docs live in `apps/nexus/content/docs/dev/components/` and Nexus is the single source of truth.
