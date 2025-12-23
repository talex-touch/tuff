# 安装

本指南介绍了在项目中安装和设置 TuffEx 的不同方式。

## 包管理器

### NPM
```bash
npm install @talex-touch/tuffex
```

### Yarn
```bash
yarn add @talex-touch/tuffex
```

### PNPM（推荐）
```bash
pnpm add @talex-touch/tuffex
```

## CDN

对于快速原型或简单项目，可以通过 CDN 使用 TuffEx：

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 引入 TuffEx CSS -->
  <link rel="stylesheet" href="https://unpkg.com/@talex-touch/tuffex/dist/style.css">
</head>
<body>
  <div id="app">
    <tx-button type="primary">你好 TuffEx！</tx-button>
  </div>

  <!-- 引入 Vue 3 -->
  <script src="https://unpkg.com/vue@next"></script>
  <!-- 引入 TuffEx -->
  <script src="https://unpkg.com/@talex-touch/tuffex"></script>
  
  <script>
    const { createApp } = Vue
    const { TxButton } = TuffUI
    
    createApp({
      components: {
        TxButton
      }
    }).mount('#app')
  </script>
</body>
</html>
```

## 框架集成

### Vite

在 Vite 项目中添加 TuffEx：

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: ['@talex-touch/tuffex']
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@talex-touch/tuffex/dist/theme.scss";`
      }
    }
  }
})
```

### Webpack

对于基于 Webpack 的项目：

```javascript
// webpack.config.js
module.exports = {
  // ... 其他配置
  resolve: {
    alias: {
      '@tuffex': '@talex-touch/tuffex'
    }
  }
}
```

### Nuxt 3

为 Nuxt 3 创建插件：

```typescript
// plugins/tuffex.client.ts
import TuffUI from '@talex-touch/tuffex'
import '@talex-touch/tuffex/dist/style.css'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(TuffUI)
})
```

## 引入样式

### 完整 CSS 引入
```typescript
// main.ts
import '@talex-touch/tuffex/dist/style.css'
```

### SCSS 引入（推荐）
```scss
// main.scss
@import '@talex-touch/tuffex/dist/theme.scss';
```

### 单独组件样式
```typescript
// 用于 CSS Tree Shaking
import '@talex-touch/tuffex/dist/components/button.css'
import '@talex-touch/tuffex/dist/components/tag.css'
```

## 环境要求

### Node.js
- **Node.js** >= 16.0.0
- **NPM** >= 7.0.0 或 **Yarn** >= 1.22.0 或 **PNPM** >= 6.0.0

### Vue.js
- **Vue** >= 3.3.0
- **TypeScript** >= 4.9.0（可选但推荐）

### 浏览器支持
- **Chrome** >= 87
- **Firefox** >= 78
- **Safari** >= 14
- **Edge** >= 88

## 验证安装

安装后，验证 TuffEx 是否正常工作：

```vue
<template>
  <div>
    <TxButton type="primary">
      TuffEx 运行正常！ ✨
    </TxButton>
  </div>
</template>

<script setup>
import { TxButton } from '@talex-touch/tuffex'
</script>
```

## 常见问题

### 问题排查

**模块未找到错误：**
```bash
# 清除 node_modules 并重新安装
rm -rf node_modules package-lock.json
npm install
```

**TypeScript 错误：**
```typescript
// 添加到 tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  }
}
```

**CSS 未加载：**
确保在主入口文件中引入了 CSS 文件：
```typescript
import '@talex-touch/tuffex/dist/style.css'
```

## 下一步

- 🚀 **[快速开始](/guide/getting-started)** - 开始使用 TuffEx
- 📚 **[组件](/components/)** - 探索可用组件
- 🎨 **[主题定制](/guide/theming)** - 自定义外观
