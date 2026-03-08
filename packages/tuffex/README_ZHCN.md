# TuffEx

<p align="center">
  <img src="https://img.shields.io/npm/v/@talex-touch/tuffex?style=flat-square&logo=npm&color=ff6b6b" alt="NPM Version">
  <img src="https://img.shields.io/badge/Vue-3.5+-4fc08d?style=flat-square&logo=vue.js" alt="Vue 3.5+">
  <img src="https://img.shields.io/badge/tree%20shaking-%E2%9C%93-success?style=flat-square" alt="Tree Shaking">
</p>

TuffEx 是 Tuff 生态中的 Vue 3 组件库，重点在触感交互、动效和桌面风格 UI 组合能力。

## 安装

```bash
pnpm add @talex-touch/tuffex
```

## 使用方式

### 完整引入

```ts
import { createApp } from 'vue'
import TuffEx from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TuffEx)
```

### 按需引入

```ts
import { createApp } from 'vue'
import { TxButton, TxCard, TxDrawer } from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxCard)
app.use(TxDrawer)
```

### 工具函数

```ts
import { createToastManager, useVibrate } from '@talex-touch/tuffex/utils'
```

## 组件梳理

当前源码导出模块总数：**102**。

- `基础与导航 (19)`: `alert`, `avatar`, `badge`, `base-anchor`, `base-surface`, `breadcrumb`, `button`, `corner-overlay`, `icon`, `nav-bar`, `outline-border`, `status-badge`, `tab-bar`, `tabs`, `tag`, `tooltip`, `popover`, `dropdown-menu`, `context-menu`
- `表单与输入 (22)`: `cascader`, `checkbox`, `code-editor`, `date-picker`, `flat-button`, `flat-input`, `flat-radio`, `flat-select`, `form`, `input`, `picker`, `radio`, `rating`, `search-input`, `search-select`, `segmented-slider`, `select`, `slider`, `switch`, `tag-input`, `tree-select`, `transfer`
- `布局与结构 (12)`: `agents`, `auto-sizer`, `card-item`, `container`, `flex`, `grid`, `grid-layout`, `group-block`, `scroll`, `splitter`, `stack`, `virtual-list`
- `数据与状态 (21)`: `blank-slate`, `card`, `collapse`, `data-table`, `empty`, `empty-state`, `error-state`, `guide-state`, `layout-skeleton`, `loading-state`, `markdown-view`, `no-data`, `no-selection`, `offline-state`, `pagination`, `permission-state`, `search-empty`, `stat-card`, `steps`, `timeline`, `tree`
- `反馈与浮层 (12)`: `command-palette`, `dialog`, `drawer`, `flip-overlay`, `floating`, `loading-overlay`, `modal`, `progress`, `progress-bar`, `skeleton`, `spinner`, `toast`
- `AI 与内容 (4)`: `chat`, `file-uploader`, `image-gallery`, `image-uploader`
- `动效与视觉 (12)`: `edge-fade-mask`, `fusion`, `glass-surface`, `glow-text`, `gradient-border`, `gradual-blur`, `keyframe-stroke-text`, `sortable-list`, `stagger`, `text-transformer`, `transition`, `tuff-logo-stroke`

参考来源：

- 导出入口：`packages/components/src/components.ts`
- 文档索引：[docs/components/index.md](./docs/components/index.md)

## 导出约定

- 推荐使用 `Tx*` 命名导出，例如 `TxButton`、`TxDialog`。
- 部分模块保留兼容别名（例如同一模块同时导出 `Button` / `TxButton`）。
- 类型定义可直接从 `@talex-touch/tuffex` 导入。

## 文档

- 在线文档：[tuffex.tagzxia.com/docs/dev/tuffex](https://tuffex.tagzxia.com/docs/dev/tuffex)
- 本地文档：`pnpm -C "packages/tuffex" run docs:dev`

## 开发

```bash
pnpm install
pnpm -C "packages/tuffex" run lint
pnpm -C "packages/tuffex" run build
pnpm -C "packages/tuffex" run docs:build
```
