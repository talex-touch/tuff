# Unplugin Export Plugin

`@talex-touch/unplugin-export-plugin` 是 Tuff 插件开发的构建工具插件，用于自动处理插件资源导出、manifest 生成和开发服务器集成。

## 安装

```bash
pnpm add -D @talex-touch/unplugin-export-plugin
```

## 快速开始

### Vite 配置

```ts
// vite.config.ts
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    TouchPluginExport()
  ],
  server: {
    port: 6001  // 开发服务器端口
  }
})
```

### Webpack 配置

```js
// webpack.config.js
const TouchPluginExport = require('@talex-touch/unplugin-export-plugin/webpack')

module.exports = {
  plugins: [
    TouchPluginExport()
  ]
}
```

### Rollup 配置

```js
// rollup.config.js
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/rollup'

export default {
  plugins: [
    TouchPluginExport()
  ]
}
```

---

## 功能特性

### 1. 自动 Manifest 处理

插件会自动读取项目根目录的 `manifest.json`，并在构建时：
- 验证必需字段
- 注入版本信息
- 生成生产环境 manifest

### 2. 资源导出

自动处理以下资源：
- **HTML 入口文件**：自动注入必要的脚本和样式
- **静态资源**：复制 `public/` 目录到输出
- **图标文件**：处理 manifest 中声明的图标

### 3. 开发模式支持

在开发模式下：
- 自动配置 HMR（热模块替换）
- 生成开发环境 manifest
- 与 Tuff 主程序无缝集成

---

## 配置选项

```ts
TouchPluginExport({
  // manifest.json 路径（相对于项目根目录）
  manifest: './manifest.json',
  
  // 输出目录
  outDir: 'dist',
  
  // 是否生成 source map
  sourcemap: false,
  
  // 自定义资源处理
  assets: {
    // 额外复制的文件/目录
    copy: ['./assets/**/*'],
    
    // 排除的文件
    exclude: ['**/*.test.ts']
  }
})
```

---

## 项目结构

推荐的插件项目结构：

```
my-plugin/
├── public/
│   └── icon.png           # 插件图标
├── src/
│   ├── main.ts            # 入口文件
│   ├── App.vue            # 主组件
│   └── components/        # 组件目录
├── index.html             # HTML 入口
├── manifest.json          # 插件清单
├── vite.config.ts         # Vite 配置
├── package.json
└── tsconfig.json
```

---

## Manifest 示例

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample Tuff plugin",
  "author": "Your Name",
  "icon": "public/icon.png",
  "main": "index.html",
  "features": [
    {
      "id": "search",
      "name": "搜索功能",
      "description": "快速搜索",
      "keywords": ["search", "find"],
      "icon": "ri:search-line"
    }
  ],
  "dev": {
    "enable": true,
    "port": 6001
  }
}
```

---

## 开发模式

### 启用开发模式

在 `manifest.json` 中配置：

```json
{
  "dev": {
    "enable": true,
    "port": 6001
  }
}
```

### 热重载

开发模式下，以下变更会触发热重载：
- Vue 组件变更
- CSS/SCSS 变更
- JavaScript/TypeScript 变更

`manifest.json` 变更会触发插件重新加载。

### 调试技巧

1. **打开 DevTools**：在插件窗口按 `Cmd+Option+I` (Mac) 或 `Ctrl+Shift+I` (Windows)
2. **查看日志**：主进程日志在终端输出
3. **断点调试**：使用 Chrome DevTools 设置断点

---

## 构建生产版本

```bash
pnpm build
```

构建产物：

```
dist/
├── assets/
│   ├── index-[hash].js
│   └── index-[hash].css
├── index.html
├── manifest.json
└── icon.png
```

---

## 与 SDK 集成

插件构建完成后，可以使用 `@talex-touch/utils` 提供的 SDK：

```ts
// src/main.ts
import { useBox, useClipboard, usePluginStorage } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const clipboard = useClipboard()
const storage = usePluginStorage()

// 插件逻辑...
```

---

## 常见问题

### Q: 构建后插件无法加载

1. 检查 `manifest.json` 的 `id` 字段是否符合格式 `com.xxx.xxx`
2. 确保 `main` 字段指向正确的入口文件
3. 查看主程序日志获取详细错误信息

### Q: 开发模式下样式不生效

确保在 `vite.config.ts` 中正确配置了 CSS 预处理器：

```ts
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        // SCSS 配置
      }
    }
  }
})
```

### Q: 资源路径错误

使用相对路径或 `@/` 别名：

```ts
// vite.config.ts
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
```

---

## 示例项目

查看官方示例插件：

- [touch-image](https://github.com/AkraTech/talex-touch/tree/main/plugins/touch-image) - 图片处理插件
- [touch-translation](https://github.com/AkraTech/talex-touch/tree/main/plugins/touch-translation) - 翻译插件
- [touch-music](https://github.com/AkraTech/talex-touch/tree/main/plugins/touch-music) - 音乐播放插件

---

## 更新日志

查看 [CHANGELOG.md](https://github.com/AkraTech/talex-touch/blob/main/packages/unplugin-export-plugin/CHANGELOG.md) 获取版本更新信息。
