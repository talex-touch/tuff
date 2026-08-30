# TuffEx

<p align="center">
  <img src="https://img.shields.io/npm/v/@talex-touch/tuffex?style=flat-square&logo=npm&color=ff6b6b" alt="NPM Version">
  <img src="https://img.shields.io/badge/Vue-3.5+-4fc08d?style=flat-square&logo=vue.js" alt="Vue 3.5+">
  <img src="https://img.shields.io/badge/tree%20shaking-%E2%9C%93-success?style=flat-square" alt="Tree Shaking">
</p>

TuffEx is the Vue 3 UI source package in the Tuff ecosystem, focused on tactile interaction, animation, and desktop-style UI composition. Runtime demos and public documentation are hosted by Nexus; this package only owns component source, builds, tests, and package audits.

## Installation

```bash
pnpm add @talex-touch/tuffex
```

## Usage

### On-demand import

Use subpath imports for new app and package integrations. This keeps the package root and full stylesheet out of business bundles by default.

```ts
import { createApp } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import '@talex-touch/tuffex/base.css'
import '@talex-touch/tuffex/button/style.css'
import '@talex-touch/tuffex/card/style.css'
import '@talex-touch/tuffex/drawer/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxCard)
app.use(TxDrawer)
```

`@talex-touch/tuffex/base.css` contains shared tokens and global utilities. Keep `@talex-touch/tuffex/style.css` only for legacy full-style imports.

For stricter style budgets, import only the matching component stylesheet:

```ts
import { TxButton } from '@talex-touch/tuffex/button'
import '@talex-touch/tuffex/base.css'
import '@talex-touch/tuffex/button/style.css'
```

### Legacy full import

```ts
import { createApp } from 'vue'
import TuffEx from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TuffEx)
```

The root entry is retained for compatibility and migration windows. Prefer component subpaths for new code.

### Utilities

```ts
import { createToastManager, useVibrate } from '@talex-touch/tuffex/utils'
```

## Component Inventory

Current source-of-truth export modules: **152**.

Every module ships in exactly one of three suites, each exposed as its own category entry:

```ts
import { TxButton } from '@talex-touch/tuffex/base'
import { TxCommandPalette } from '@talex-touch/tuffex/pro'
import { TxPromptBar } from '@talex-touch/tuffex/ai'
```

### base — Basics

General, form, layout, navigation, data, feedback and status components. Import from `@talex-touch/tuffex/base`.

- `General (13)`: `button`, `flat-button`, `icon-button`, `copy-button`, `icon`, `os-icon`, `icon-chip`, `avatar`, `tag`, `badge`, `status-badge`, `kbd`, `divider`
- `Form (24)`: `form`, `input`, `flat-input`, `textarea`, `number-input`, `search-input`, `tag-input`, `scrub-field`, `select`, `flat-select`, `search-select`, `tree-select`, `cascader`, `picker`, `date-picker`, `radio`, `flat-radio`, `checkbox`, `switch`, `slider`, `segmented-slider`, `rating`, `file-uploader`, `image-uploader`
- `Layout (11)`: `container`, `flex`, `grid`, `grid-layout`, `stack`, `splitter`, `scroll`, `collapse`, `card`, `card-item`, `group-block`
- `Navigation (10)`: `tabs`, `tab-bar`, `nav-bar`, `sidebar-nav`, `breadcrumb`, `steps`, `pagination`, `dropdown-menu`, `flat-dropdown`, `context-menu`
- `Data Display (11)`: `data-table`, `tree`, `sortable-list`, `timeline`, `transfer`, `stat-card`, `cell-link`, `dot-indicator`, `filter-chips`, `markdown-view`, `image-gallery`
- `Feedback (12)`: `dialog`, `modal`, `drawer`, `popover`, `tooltip`, `toast`, `alert`, `progress`, `progress-bar`, `spinner`, `loading-overlay`, `selection-actions`
- `Status & Empty (13)`: `empty`, `empty-state`, `no-data`, `no-selection`, `search-empty`, `error-state`, `offline-state`, `permission-state`, `guide-state`, `blank-slate`, `loading-state`, `skeleton`, `layout-skeleton`

### pro — Advanced

Advanced interaction, visualization, effects and low-level primitives. Import from `@talex-touch/tuffex/pro`.

- `Interaction (6)`: `command-palette`, `search-panel`, `markdown-editor`, `code-editor`, `virtual-list`, `version-capsule`
- `Visualization (4)`: `spark-chart`, `allocation-bar`, `diff-table`, `signal-meter`
- `Effects (16)`: `glass-surface`, `gradient-border`, `outline-border`, `border-beam`, `corner-overlay`, `gradual-blur`, `edge-fade-mask`, `glow-text`, `keyframe-stroke-text`, `tuff-logo-stroke`, `text-transformer`, `transition`, `stagger`, `fusion`, `liquid`, `flip-overlay`
- `Primitives (5)`: `base-surface`, `base-anchor`, `floating`, `auto-sizer`, `resize-box`

### ai — AI

Chat, agent, reasoning and context components for AI-native interfaces. Import from `@talex-touch/tuffex/ai`.

- `Chat (6)`: `chat`, `prompt-bar`, `attachment-tray`, `message-actions`, `suggestion-chips`, `conversation-stream`
- `Agents (8)`: `agents`, `agent-trace`, `task-rows`, `tool-call-card`, `tool-chips`, `tool-confirmation`, `approval-card`, `working-indicator`
- `Reasoning (8)`: `ai-elements`, `chain-of-thought`, `reasoning-disclosure`, `thinking-orb`, `stream-markdown`, `code-stream`, `inline-citation`, `sources`
- `Context & Insight (5)`: `context-cards`, `context-indicator`, `insight-cards`, `recommendation-card`, `fine-tune-card`

Reference:

- Export entry: `packages/components/src/components.ts`
- Suite entries: `packages/components/src/{base,pro,ai}/index.ts`
- Suite taxonomy: `apps/nexus/scripts/recategorize-component-docs.py`
- Public docs: `apps/nexus/content/docs/dev/tools/tuffex.en.mdc`

## Export Convention

- Preferred public names use `Tx*` prefix, for example `TxButton`, `TxDialog`.
- Some modules also keep compatibility aliases (for example `Button` / `TxButton` in certain modules).
- Type exports are included and can be consumed directly from `@talex-touch/tuffex`.

## Documentation

- Online docs: [tuffex.tagzxia.com/docs/dev/tuffex](https://tuffex.tagzxia.com/docs/dev/tuffex)
- Local docs preview: `pnpm -C "apps/nexus" run dev`

## Development

```bash
pnpm install
pnpm -C "packages/tuffex" run lint
pnpm -C "packages/tuffex" run typecheck
pnpm -C "packages/tuffex" run test
pnpm -C "packages/tuffex" run build
pnpm -C "packages/tuffex" run audit:size
pnpm -C "packages/tuffex" run audit:exports
pnpm -C "packages/tuffex" run audit:types
```

## Integration with Tuff

TuffEx is the UI foundation of the [Tuff](https://tuff.tagzxia.com) desktop application. Components are shared between the core app and external plugin developers through this standalone library.

## Contributing

- [Report Issues](https://github.com/talex-touch/tuff/issues)
- [Feature Requests](https://github.com/talex-touch/tuff/discussions)
- [Submit PRs](https://github.com/talex-touch/tuff/pulls)

## License

[MIT License](LICENSE) &copy; 2025 TalexDreamSoul
