# Installation

This guide covers different ways to install and set up TouchX UI in your project.

## Package Managers

### NPM
```bash
npm install @talex-touch/touchx-ui
```

### Yarn
```bash
yarn add @talex-touch/touchx-ui
```

### PNPM (Recommended)
```bash
pnpm add @talex-touch/touchx-ui
```

## CDN

For quick prototyping or simple projects, you can use TouchX UI via CDN:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Import TouchX UI CSS -->
  <link rel="stylesheet" href="https://unpkg.com/@talex-touch/touchx-ui/dist/style.css">
</head>
<body>
  <div id="app">
    <tx-button type="primary">Hello TouchX UI!</tx-button>
  </div>

  <!-- Import Vue 3 -->
  <script src="https://unpkg.com/vue@next"></script>
  <!-- Import TouchX UI -->
  <script src="https://unpkg.com/@talex-touch/touchx-ui"></script>
  
  <script>
    const { createApp } = Vue
    const { TxButton } = TouchXUI
    
    createApp({
      components: {
        TxButton
      }
    }).mount('#app')
  </script>
</body>
</html>
```

## Framework Integration

### Vite

Add TouchX UI to your Vite project:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: ['@talex-touch/touchx-ui']
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@talex-touch/touchx-ui/dist/theme.scss";`
      }
    }
  }
})
```

### Webpack

For Webpack-based projects:

```javascript
// webpack.config.js
module.exports = {
  // ... other config
  resolve: {
    alias: {
      '@touchx-ui': '@talex-touch/touchx-ui'
    }
  }
}
```

### Nuxt 3

Create a plugin for Nuxt 3:

```typescript
// plugins/touchx-ui.client.ts
import TouchXUI from '@talex-touch/touchx-ui'
import '@talex-touch/touchx-ui/dist/style.css'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(TouchXUI)
})
```

## Import Styles

### Full CSS Import
```typescript
// main.ts
import '@talex-touch/touchx-ui/dist/style.css'
```

### SCSS Import (Recommended)
```scss
// main.scss
@import '@talex-touch/touchx-ui/dist/theme.scss';
```

### Individual Component Styles
```typescript
// For tree shaking CSS
import '@talex-touch/touchx-ui/dist/components/button.css'
import '@talex-touch/touchx-ui/dist/components/avatar.css'
```

## Environment Requirements

### Node.js
- **Node.js** >= 16.0.0
- **NPM** >= 7.0.0 or **Yarn** >= 1.22.0 or **PNPM** >= 6.0.0

### Vue.js
- **Vue** >= 3.3.0
- **TypeScript** >= 4.9.0 (optional but recommended)

### Browser Support
- **Chrome** >= 87
- **Firefox** >= 78
- **Safari** >= 14
- **Edge** >= 88

## Verification

After installation, verify TouchX UI is working:

```vue
<template>
  <div>
    <TxButton type="primary">
      TouchX UI is working! ✨
    </TxButton>
  </div>
</template>

<script setup>
import { TxButton } from '@talex-touch/touchx-ui'
</script>
```

## Troubleshooting

### Common Issues

**Module not found error:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**TypeScript errors:**
```typescript
// Add to your tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  }
}
```

**CSS not loading:**
Make sure you've imported the CSS file in your main entry file:
```typescript
import '@talex-touch/touchx-ui/dist/style.css'
```

## Next Steps

- 🚀 **[Quick Start](/guide/getting-started)** - Start using TouchX UI
- 📚 **[Components](/components/)** - Explore available components
- 🎨 **[Theming](/guide/theming)** - Customize the appearance
