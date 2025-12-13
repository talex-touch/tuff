# TUFF UI

<p align="center">
  <img src="https://img.shields.io/npm/v/@talex-touch/tuff-ui?style=flat-square&logo=npm&color=ff6b6b" alt="NPM Version">
  <img src="https://img.shields.io/badge/status-beta-orange?style=flat-square" alt="Beta Status">
  <img src="https://img.shields.io/badge/Vue-3.5-4fc08d?style=flat-square&logo=vue.js" alt="Vue 3.5">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/github/license/talex-touch/tuff-ui?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/bundle%20size-<50kb-brightgreen?style=flat-square" alt="Bundle Size">
  <img src="https://img.shields.io/badge/tree%20shaking-✓-success?style=flat-square" alt="Tree Shaking">
</p>

<p align="center">
  <strong>🎭 TUFF UI · Beautiful Animations · Living Component Library</strong>
</p>

<p align="center">
  A modern Vue3 component library focused on <strong>tactile experience</strong> and <strong>smooth animations</strong><br/>
  Part of the <a href="https://tuff.tagzxia.com">Tuff</a> ecosystem - bringing life to every interaction
</p>

<p align="center">
  <a href="#-getting-started">Getting Started</a> ·
  <a href="#-components">Components</a> ·
  <a href="#-design-philosophy">Design Philosophy</a> ·
  <a href="#%EF%B8%8F-tech-stack">Tech Stack</a> ·
  <a href="#-documentation">Documentation</a>
</p>

<p align="center">
  <strong>English</strong> | <a href="README_ZHCN.md">简体中文</a>
</p>

---

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| **🎭 Living Tactile Experience** | Life-like touch feedback with elastic responses and damping effects |
| **🌊 Silky Animation System** | 60fps smooth animations based on Bézier curves and physics |
| **💎 Modern Visual Language** | Glassmorphism aesthetics with frosted glass and material effects |
| **⚡ Performance Optimized** | Vue3 Composition API with Tree Shaking, 50%+ smaller bundles |
| **🎨 Enterprise Design System** | Complete Design Tokens with WCAG 2.1 AA accessibility |
| **📱 Cross-Platform Ready** | Responsive design, PWA and SSR friendly |
| **🔗 Tuff Ecosystem** | Seamlessly integrated with the Tuff desktop application |

## 🚀 Getting Started

### 📦 Installation

Choose your preferred package manager:

```bash
# npm
npm install @talex-touch/tuff-ui

# yarn
yarn add @talex-touch/tuff-ui

# pnpm (recommended)
pnpm add @talex-touch/tuff-ui
```

### 🔧 Full Import

```typescript
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuff-ui'
import '@talex-touch/tuff-ui/dist/style.css'

const app = createApp(App)
app.use(TuffUI)
app.mount('#app')
```

### 🎯 On-Demand Import (Recommended)

```typescript
import { createApp } from 'vue'
import { TxButton, TxAvatar } from '@talex-touch/tuff-ui'
import '@talex-touch/tuff-ui/dist/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxAvatar)
```

### 🎨 Custom Theme (Coming Soon)

```typescript
import { createApp } from 'vue'
import TouchXUI from '@talex-touch/touchx-ui'
import '@talex-touch/touchx-ui/dist/style.css'

const app = createApp(App)

// Custom theme configuration
app.use(TouchXUI, {
  theme: {
    primaryColor: '#6366f1',
    borderRadius: '12px',
    animationDuration: '0.3s'
  }
})
```

### 💡 Quick Experience

```vue
<template>
  <div class="demo">
    <!-- Tactile Button -->
    <TxButton type="primary" @click="handleClick">
      Feel the Touch
    </TxButton>

    <!-- Flowing Avatar -->
    <TxAvatar
      src="https://example.com/avatar.jpg"
      size="large"
      glow
    />

    <!-- Glass Card -->
    <TxCard glass blur>
      <h3>TouchX UI</h3>
      <p>Bringing life to every interaction</p>
    </TxCard>
  </div>
</template>

<script setup>
const handleClick = () => {
  console.log('Can you feel it? This is TouchX!')
}
</script>
```

## 🎯 Design Philosophy

TouchX UI embodies an **interaction philosophy** - interfaces should feel alive and respond with warmth.

**Touch First** - Every interaction has soul through warm, textured feedback systems.
**Vitality** - Components breathe, express emotions, and anticipate user intentions.
**Flow Aesthetics** - Functional animations guide users while maintaining visual continuity.
**Material Experience** - Digital interfaces deserve real material sensations and textures.

## 🎨 Components

> 🚧 **Beta Version** - Currently in beta testing, more components coming soon!

### Available Components

| Component | Description | Status |
|-----------|-------------|--------|
| **TxButton** | Tactile buttons with elastic feedback and ripple effects | ✅ Stable |
| **TxFlatButton** | Flat buttons with hover effects and loading states | ✅ Stable |
| **TxSwitch** | Toggle switches with smooth animations | ✅ Stable |

### Planned Components

| Component | Description | Status |
|-----------|-------------|--------|
| **TxSelect** | Dropdown select with floating positioning | 🚧 In Progress |
| **TxInput** | Input fields with smooth focus transitions | 🚧 In Progress |
| **TxModal** | Modal dialogs with entrance animations | 📋 Planned |
| **TxCard** | Glass-morphism cards with shadow systems | 📋 Planned |
| **TxScroll** | Custom scrollbar with native feel | 📋 Planned |
| **TxTabs** | Tab navigation with indicator animations | 📋 Planned |
| **TxMenu** | Menu components with route integration | 📋 Planned |
| **TxBadge** | Status badges with pulse effects | 📋 Planned |

*🚀 Components are being migrated from the Tuff core application...*

## 🏗️ Tech Stack

Built with modern frontend technologies aligned with the Tuff core application:

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vue** | 3.5+ | Composition API with `<script setup>` |
| **TypeScript** | 5.8+ | Complete type safety |
| **Vite** | 6.0+ | Lightning-fast development |
| **VitePress** | 1.5+ | Documentation site |
| **Sass** | 1.89+ | Advanced styling |
| **VueUse** | 13.0+ | Composition utilities |

**Design System:**
- CSS Variables for dynamic theming
- Tree Shaking for optimized bundle size
- SCSS Mixins for consistent styling

## 📖 Documentation

- **[Tuff Documentation](https://tuff.tagzxia.com/docs/dev/tuff-ui)** - Official TUFF UI docs in Tuff ecosystem
- **[Component Docs](http://localhost:8000)** - Local VitePress documentation (run `pnpm docs:dev`)

## 🛠️ Development

```bash
# In monorepo root
pnpm install

# In packages/tuff-ui directory
pnpm docs:dev          # Start documentation server at :8000
pnpm comp:play         # Start component playground
pnpm build             # Build library with Gulp
pnpm build:vite        # Build library with Vite
```

## 🔗 Integration with Tuff

TUFF UI is designed to work seamlessly with the Tuff desktop application. Components are gradually being migrated from the core renderer to this standalone library for:

1. **Code Reuse** - Share UI components across projects
2. **Plugin Development** - Enable plugin developers to use consistent UI
3. **Community** - Allow external projects to adopt Tuff's design language

## 🤝 Contributing

We welcome all contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

- 🐛 [Report Issues](https://github.com/talex-touch/touchx-ui/issues)
- 💡 [Feature Requests](https://github.com/talex-touch/touchx-ui/discussions)
- 🔧 [Submit PRs](https://github.com/talex-touch/touchx-ui/pulls)

## � License

[MIT License](LICENSE) © 2025 TalexDreamSoul

---

<p align="center">
  <img src="playground/vue-vite-playground/public/touchx-logo-transparent.png" width="120" height="120" alt="TouchX UI Logo">
</p>

<p align="center">
  <strong>🎭 Bringing life to every touch</strong><br/>
  <em>TouchX UI - Touchable Beautiful Animations</em>
</p>

<p align="center">
  <a href="https://touchx-ui.talex.cn">📖 Documentation</a> ·
  <a href="https://github.com/talex-touch/touchx-ui">⭐ GitHub</a> ·
  <a href="https://www.npmjs.com/package/@talex-touch/touchx-ui">📦 NPM</a> ·
  <a href="https://github.com/talex-touch/touchx-ui/discussions">💬 Discussions</a>
</p>
