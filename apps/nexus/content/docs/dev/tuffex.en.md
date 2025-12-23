---
title: TuffEx
description: Modern Vue3 component library with beautiful animations
---

# TuffEx

TuffEx is a modern Vue3 component library focused on tactile experience and smooth animations. It's part of the Tuff ecosystem and provides beautiful, interactive UI components.

> **Migration in Progress** - TuffEx is migrating components from Tuff core app. Tech stack upgraded to Vue 3.5 / Vite 6 / TypeScript 5.8.


## Installation

```bash
# npm
npm install @talex-touch/tuffex

# yarn
yarn add @talex-touch/tuffex

# pnpm (recommended)
pnpm add @talex-touch/tuffex
```

## Quick Start

### Full Import

```typescript
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuffex'
import '@talex-touch/tuffex/dist/style.css'

const app = createApp(App)
app.use(TuffUI)
app.mount('#app')
```

### On-Demand Import (Recommended)

```typescript
import { createApp } from 'vue'
import { TuffButton, TuffSwitch, TuffFlatButton } from '@talex-touch/tuffex'
import '@talex-touch/tuffex/dist/style.css'

const app = createApp(App)
app.use(TuffButton)
app.use(TuffSwitch)
app.use(TuffFlatButton)
```

## Core Features

| Feature | Description |
|---------|-------------|
| 🎭 **Living Tactile Experience** | Elastic responses and damping effects for natural interactions |
| 🌊 **Silky Animation System** | 60fps smooth animations based on Bézier curves |
| 💎 **Modern Visual Language** | Glassmorphism aesthetics with frosted glass effects |
| ⚡ **Performance Optimized** | Vue3 Composition API + Tree Shaking, 50%+ smaller bundles |
| 🔗 **Tuff Ecosystem** | Seamlessly integrated with Tuff desktop application |

## Available Components

### Released

| Component | Description | Source |
|-----------|-------------|--------|
| `TuffButton` | Interactive button with tactile feedback | `button/` |
| `TuffFlatButton` | Flat button with hover effects and loading | `base/button/FlatButton` |
| `TuffSwitch` | Toggle switch with smooth animations | `base/switch/TSwitch` |
| `TuffInput` | Input with clearable and textarea support | `base/input/FlatInput` |
| `TuffCheckbox` | Checkbox with SVG tick animation | `base/checkbox/TCheckbox` |
| `TuffSelect` | Dropdown select with floating positioning | `base/select/TSelect` |
| `TuffSelectItem` | Select option item | `base/select/TSelectItem` |
| `TuffProgress` | Progress bar with indeterminate mode | `base/ProgressBar` |

### Planned

| Component | Description | Source |
|-----------|-------------|--------|
| `TuffModal` | Modal dialog with entrance animations | `base/dialog/` |
| `TuffScroll` | Custom scrollbar with native feel | `base/TouchScroll` |
| `TuffTabs` | Tab navigation with indicator animations | `tabs/` |
| `TuffMenu` | Menu component | `menu/` |

## Theming

TUFF UI supports custom theming through CSS variables:

```css
:root {
  /* Primary colors */
  --tx-color-primary: #409eff;
  --tx-color-primary-light-3: #79bbff;
  
  /* Text colors */
  --tx-text-color-primary: #303133;
  --tx-text-color-secondary: #909399;
  
  /* Border and radius */
  --tx-border-color: #dcdfe6;
  --tx-border-radius-base: 4px;
  
  /* Transitions */
  --tx-transition-duration: 0.3s;
}
```

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Vue | 3.5+ | Composition API |
| TypeScript | 5.8+ | Type safety |
| Vite | 6.0+ | Build tooling |
| Sass | 1.89+ | Style preprocessing |
| VueUse | 13.0+ | Composition utilities |

## Development

```bash
# In monorepo root
pnpm install

# In packages/tuffex directory
pnpm docs:dev    # Start docs server at :8000
pnpm build       # Build library
```

## Design Philosophy

1. **Tactile First** - Every component should feel responsive and alive
2. **Performance** - Animations must never compromise performance
3. **Accessibility** - WCAG 2.1 AA compliance for all components
4. **Composability** - Components work together seamlessly

## Related Links

- [GitHub Repository](https://github.com/AncientMC/talex-touch/tree/master/packages/tuffex)
- [NPM Package](https://www.npmjs.com/package/@talex-touch/tuffex)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
