---
title: TUFF UI
description: 具有精美动画效果的现代 Vue3 组件库
---

# TUFF UI

TUFF UI 是一个专注于触感体验和流畅动画的现代 Vue3 组件库。它是 Tuff 生态系统的一部分，提供美观、交互式的 UI 组件。

## 安装

```bash
# npm
npm install @talex-touch/tuff-ui

# yarn
yarn add @talex-touch/tuff-ui

# pnpm（推荐）
pnpm add @talex-touch/tuff-ui
```

## 快速开始

### 完整导入

```typescript
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuff-ui'
import '@talex-touch/tuff-ui/dist/style.css'

const app = createApp(App)
app.use(TuffUI)
app.mount('#app')
```

### 按需导入（推荐）

```typescript
import { createApp } from 'vue'
import { TxButton, TxAvatar } from '@talex-touch/tuff-ui'
import '@talex-touch/tuff-ui/dist/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxAvatar)
```

## 核心特性

### 🎭 生动的触感体验

通过精密物理引擎实现逼真的触摸反馈。弹性响应和阻尼效果让每次交互都自然且引人入胜。

### 🌊 丝滑动画系统

基于贝塞尔曲线和物理引擎的 60fps 流畅动画。智能缓动根据交互强度自适应，实现无缝视觉连续性。

### 💎 现代视觉语言

玻璃拟态美学，包含毛玻璃效果、动态光照和材质模拟，为数字界面带来真实质感。

### ⚡ 性能优化

采用 Vue3 Composition API 并支持 Tree Shaking，包体积减少 50% 以上。虚拟化渲染和智能缓存确保稳定性。

## 可用组件

| 组件 | 描述 |
|------|------|
| `TxButton` | 带触感反馈的交互按钮 |
| `TxAvatar` | 带动画效果的用户头像 |
| `TxCard` | 玻璃拟态效果的内容卡片 |
| `TxInput` | 平滑聚焦过渡的文本输入框 |
| `TxModal` | 带入场动画的模态对话框 |
| `TxTooltip` | 智能定位的工具提示 |

## 主题定制

TUFF UI 通过 CSS 变量支持自定义主题：

```css
:root {
  --tx-primary: #3b82f6;
  --tx-primary-hover: #2563eb;
  --tx-border-radius: 8px;
  --tx-transition-duration: 200ms;
}
```

## 开发

```bash
# 启动文档开发服务器
pnpm tuff-ui:dev

# 构建库
pnpm tuff-ui:build

# 构建文档
pnpm tuff-ui:docs
```

## 设计理念

TUFF UI 遵循以下核心原则：

1. **触感优先** - 每个组件都应该感觉响应迅速且生动
2. **性能至上** - 动画绝不能影响性能
3. **无障碍访问** - 所有组件符合 WCAG 2.1 AA 标准
4. **可组合性** - 组件无缝协作

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
