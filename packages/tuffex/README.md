# TuffEx

<p align="center">
  <img src="https://img.shields.io/npm/v/@talex-touch/tuffex?style=flat-square&logo=npm&color=ff6b6b" alt="NPM Version">
  <img src="https://img.shields.io/badge/Vue-3.5+-4fc08d?style=flat-square&logo=vue.js" alt="Vue 3.5+">
  <img src="https://img.shields.io/badge/tree%20shaking-%E2%9C%93-success?style=flat-square" alt="Tree Shaking">
</p>

TuffEx is a Vue 3 component library in the Tuff ecosystem, focused on tactile interaction, animation, and desktop-style UI composition.

## Installation

```bash
pnpm add @talex-touch/tuffex
```

## Usage

### Full import

```ts
import { createApp } from 'vue'
import TuffEx from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TuffEx)
```

### On-demand import

```ts
import { createApp } from 'vue'
import { TxButton, TxCard, TxDrawer } from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxCard)
app.use(TxDrawer)
```

### Utilities

```ts
import { createToastManager, useVibrate } from '@talex-touch/tuffex/utils'
```

## Component Inventory

Current source-of-truth export modules: **102**.

- `Foundation & Navigation (19)`: `alert`, `avatar`, `badge`, `base-anchor`, `base-surface`, `breadcrumb`, `button`, `corner-overlay`, `icon`, `nav-bar`, `outline-border`, `status-badge`, `tab-bar`, `tabs`, `tag`, `tooltip`, `popover`, `dropdown-menu`, `context-menu`
- `Form & Input (22)`: `cascader`, `checkbox`, `code-editor`, `date-picker`, `flat-button`, `flat-input`, `flat-radio`, `flat-select`, `form`, `input`, `picker`, `radio`, `rating`, `search-input`, `search-select`, `segmented-slider`, `select`, `slider`, `switch`, `tag-input`, `tree-select`, `transfer`
- `Layout & Structure (12)`: `agents`, `auto-sizer`, `card-item`, `container`, `flex`, `grid`, `grid-layout`, `group-block`, `scroll`, `splitter`, `stack`, `virtual-list`
- `Data & State (21)`: `blank-slate`, `card`, `collapse`, `data-table`, `empty`, `empty-state`, `error-state`, `guide-state`, `layout-skeleton`, `loading-state`, `markdown-view`, `no-data`, `no-selection`, `offline-state`, `pagination`, `permission-state`, `search-empty`, `stat-card`, `steps`, `timeline`, `tree`
- `Feedback & Overlay (12)`: `command-palette`, `dialog`, `drawer`, `flip-overlay`, `floating`, `loading-overlay`, `modal`, `progress`, `progress-bar`, `skeleton`, `spinner`, `toast`
- `AI & Content (4)`: `chat`, `file-uploader`, `image-gallery`, `image-uploader`
- `Animation & Visual (12)`: `edge-fade-mask`, `fusion`, `glass-surface`, `glow-text`, `gradient-border`, `gradual-blur`, `keyframe-stroke-text`, `sortable-list`, `stagger`, `text-transformer`, `transition`, `tuff-logo-stroke`

Reference:

- Export entry: `packages/components/src/components.ts`
- Docs index: [docs/components/index.md](./docs/components/index.md)

## Export Convention

- Preferred public names use `Tx*` prefix, for example `TxButton`, `TxDialog`.
- Some modules also keep compatibility aliases (for example `Button` / `TxButton` in certain modules).
- Type exports are included and can be consumed directly from `@talex-touch/tuffex`.

## Documentation

- Online docs: [tuffex.tagzxia.com/docs/dev/tuffex](https://tuffex.tagzxia.com/docs/dev/tuffex)
- Local docs: `pnpm -C "packages/tuffex" run docs:dev`

## Development

```bash
pnpm install
pnpm -C "packages/tuffex" run lint
pnpm -C "packages/tuffex" run build
pnpm -C "packages/tuffex" run docs:build
```

## Integration with Tuff

TuffEx is the UI foundation of the [Tuff](https://tuff.tagzxia.com) desktop application. Components are shared between the core app and external plugin developers through this standalone library.

## Contributing

- [Report Issues](https://github.com/talex-touch/tuff/issues)
- [Feature Requests](https://github.com/talex-touch/tuff/discussions)
- [Submit PRs](https://github.com/talex-touch/tuff/pulls)

## License

[MIT License](LICENSE) &copy; 2025 TalexDreamSoul
