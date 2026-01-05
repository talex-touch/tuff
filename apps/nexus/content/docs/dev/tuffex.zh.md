---
title: TuffEx
description: 具有精美动画效果的现代 Vue3 组件库
---

# TuffEx

TuffEx 是一个专注于触感体验和流畅动画的现代 Vue3 组件库。它是 Tuff 生态系统的一部分，提供美观、交互式的 UI 组件。

> **迁移中** - TuffEx 正在从 Tuff 核心应用迁移组件，技术栈已升级至 Vue 3.5 / Vite 6 / TypeScript 5.8。


## 安装

```bash
# npm
npm install @talex-touch/tuffex

# yarn
yarn add @talex-touch/tuffex

# pnpm（推荐）
pnpm add @talex-touch/tuffex
```

## 快速开始

### 完整导入

```typescript
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TuffUI)
app.mount('#app')
```

### 按需导入（推荐）

```typescript
import { createApp } from 'vue'
import { TuffButton, TuffSwitch, TuffFlatButton } from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TuffButton)
app.use(TuffSwitch)
app.use(TuffFlatButton)
```

## 核心特性

| 特性 | 描述 |
|------|------|
| 🎭 **生动触感体验** | 弹性响应和阻尼效果，让每次交互都自然且引人入胜 |
| 🌊 **丝滑动画系统** | 基于贝塞尔曲线的 60fps 流畅动画 |
| 💎 **现代视觉语言** | 玻璃拟态美学，毛玻璃效果和材质模拟 |
| ⚡ **性能优化** | Vue3 Composition API + Tree Shaking，包体积减少 50%+ |
| 🔗 **Tuff 生态集成** | 与 Tuff 桌面应用无缝集成 |

## 可用组件

### 已发布

| 组件 | 描述 | 来源 |
|------|------|------|
| `TuffButton` | 带触感反馈的交互按钮 | `button/` |
| `TuffFlatButton` | 扁平按钮，支持 loading 状态 | `base/button/FlatButton` |
| `TuffSwitch` | 流畅动画的开关组件 | `base/switch/TSwitch` |
| `TuffInput` | 输入框，支持 clearable 和 textarea | `base/input/FlatInput` |
| `TuffCheckbox` | 复选框，SVG 动画勾选效果 | `base/checkbox/TCheckbox` |
| `TuffSelect` | 下拉选择器，浮动定位 | `base/select/TSelect` |
| `TuffSelectItem` | 选择器选项 | `base/select/TSelectItem` |
| `TuffProgress` | 进度条，支持 indeterminate | `base/ProgressBar` |

### 计划中

| 组件 | 描述 | 来源 |
|------|------|------|
| `TuffModal` | 带入场动画的模态对话框 | `base/dialog/` |
| `TuffScroll` | 原生体验的自定义滚动条 | `base/TouchScroll` |
| `TuffTabs` | 带指示器动画的标签页 | `tabs/` |
| `TuffMenu` | 菜单组件 | `menu/` |

## 主题定制

TUFF UI 通过 CSS 变量支持自定义主题：

```css
:root {
  /* 主色调 */
  --tx-color-primary: #409eff;
  --tx-color-primary-light-3: #79bbff;
  
  /* 文本颜色 */
  --tx-text-color-primary: #303133;
  --tx-text-color-secondary: #909399;
  
  /* 边框和圆角 */
  --tx-border-color: #dcdfe6;
  --tx-border-radius-base: 4px;
  
  /* 过渡 */
  --tx-transition-duration: 0.3s;
}
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.5+ | Composition API |
| TypeScript | 5.8+ | 类型安全 |
| Vite | 6.0+ | 构建工具 |
| Sass | 1.89+ | 样式预处理 |
| VueUse | 13.0+ | 组合式工具 |

## 开发

```bash
# 在 monorepo 根目录
pnpm install

# 在 packages/tuffex 目录
pnpm docs:dev    # 启动文档服务器 :8000
pnpm build       # 构建库
```

## 设计理念

1. **触感优先** - 每个组件都应该感觉响应迅速且生动
2. **性能至上** - 动画绝不能影响性能
3. **无障碍访问** - 所有组件符合 WCAG 2.1 AA 标准
4. **可组合性** - 组件无缝协作

## 相关链接

- [GitHub 仓库](https://github.com/talex-touch/tuff/tree/master/packages/tuffex)
- [NPM 包](https://www.npmjs.com/package/@talex-touch/tuffex)

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
