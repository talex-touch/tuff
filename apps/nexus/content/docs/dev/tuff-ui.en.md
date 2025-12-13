---
title: TUFF UI
description: Modern Vue3 component library with beautiful animations
---

# TUFF UI

TUFF UI is a modern Vue3 component library focused on tactile experience and smooth animations. It's part of the Tuff ecosystem and provides beautiful, interactive UI components.

## Installation

```bash
# npm
npm install @talex-touch/tuff-ui

# yarn
yarn add @talex-touch/tuff-ui

# pnpm (recommended)
pnpm add @talex-touch/tuff-ui
```

## Quick Start

### Full Import

```typescript
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuff-ui'
import '@talex-touch/tuff-ui/dist/style.css'

const app = createApp(App)
app.use(TuffUI)
app.mount('#app')
```

### On-Demand Import (Recommended)

```typescript
import { createApp } from 'vue'
import { TxButton, TxAvatar } from '@talex-touch/tuff-ui'
import '@talex-touch/tuff-ui/dist/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxAvatar)
```

## Core Features

### 🎭 Living Tactile Experience

Life-like touch feedback through precision physics engine. Elastic responses and damping effects make every interaction feel natural and engaging.

### 🌊 Silky Animation System

60fps smooth animations based on Bézier curves and physics. Intelligent easing adapts to interaction intensity for seamless visual continuity.

### 💎 Modern Visual Language

Glassmorphism aesthetics with frosted glass effects, dynamic lighting, and material simulations that bring real texture to digital interfaces.

### ⚡ Performance Optimized

Vue3 Composition API with Tree Shaking support, reducing bundle size by 50%+. Virtualized rendering and intelligent caching ensure stability.

## Available Components

| Component | Description |
|-----------|-------------|
| `TxButton` | Interactive button with tactile feedback |
| `TxAvatar` | User avatar with animations |
| `TxCard` | Content card with glassmorphism effects |
| `TxInput` | Text input with smooth focus transitions |
| `TxModal` | Modal dialog with entrance animations |
| `TxTooltip` | Tooltip with smart positioning |

## Theming

TUFF UI supports custom theming through CSS variables:

```css
:root {
  --tx-primary: #3b82f6;
  --tx-primary-hover: #2563eb;
  --tx-border-radius: 8px;
  --tx-transition-duration: 200ms;
}
```

## Development

```bash
# Start docs development server
pnpm tuff-ui:dev

# Build library
pnpm tuff-ui:build

# Build documentation
pnpm tuff-ui:docs
```

## Design Philosophy

TUFF UI follows these core principles:

1. **Tactile First** - Every component should feel responsive and alive
2. **Performance** - Animations must never compromise performance
3. **Accessibility** - WCAG 2.1 AA compliance for all components
4. **Composability** - Components work together seamlessly

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
