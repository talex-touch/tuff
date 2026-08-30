# TuffEx

<p align="center">
  <img src="https://img.shields.io/npm/v/@talex-touch/tuffex?style=flat-square&logo=npm&color=ff6b6b" alt="NPM Version">
  <img src="https://img.shields.io/badge/Vue-3.5+-4fc08d?style=flat-square&logo=vue.js" alt="Vue 3.5+">
  <img src="https://img.shields.io/badge/tree%20shaking-%E2%9C%93-success?style=flat-square" alt="Tree Shaking">
</p>

TuffEx 是 Tuff 生态中的 Vue 3 UI 源码包，重点在触感交互、动效和桌面风格 UI 组合能力。运行时 Demo 与公开文档统一由 Nexus 承载；本包只负责组件源码、构建、测试与包体审计。

## 安装

```bash
pnpm add @talex-touch/tuffex
```

## 使用方式

### 按需引入

新接入的应用和包优先使用子路径导入，默认避免业务 bundle 拉入包根入口和全量样式。

```ts
import { createApp } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import '@talex-touch/tuffex/base.css'
import '@talex-touch/tuffex/button/style.css'
import '@talex-touch/tuffex/card/style.css'
import '@talex-touch/tuffex/drawer/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxCard)
app.use(TxDrawer)
```

`@talex-touch/tuffex/base.css` 只包含共享 token 和全局 utility。旧的 `@talex-touch/tuffex/style.css` 仅作为全量样式兼容入口保留。

需要进一步控制样式体积时，也可以只引入对应组件样式：

```ts
import { TxButton } from '@talex-touch/tuffex/button'
import '@talex-touch/tuffex/base.css'
import '@talex-touch/tuffex/button/style.css'
```

### 兼容完整引入

```ts
import { createApp } from 'vue'
import TuffEx from '@talex-touch/tuffex'
import '@talex-touch/tuffex/style.css'

const app = createApp(App)
app.use(TuffEx)
```

根入口会继续保留以支持兼容和迁移窗口。新代码优先使用组件子路径。

### 工具函数

```ts
import { createToastManager, useVibrate } from '@talex-touch/tuffex/utils'
```

## 组件梳理

当前源码导出模块总数：**152**。

全部模块按三大套件划分，每个套件都有独立的分类入口：

```ts
import { TxButton } from '@talex-touch/tuffex/base'
import { TxCommandPalette } from '@talex-touch/tuffex/pro'
import { TxPromptBar } from '@talex-touch/tuffex/ai'
```

### base 基础组件

通用、表单、布局、导航、数据展示、反馈与状态占位组件，从 `@talex-touch/tuffex/base` 引入。

- `通用 (13)`: `button`, `flat-button`, `icon-button`, `copy-button`, `icon`, `os-icon`, `icon-chip`, `avatar`, `tag`, `badge`, `status-badge`, `kbd`, `divider`
- `表单 (24)`: `form`, `input`, `flat-input`, `textarea`, `number-input`, `search-input`, `tag-input`, `scrub-field`, `select`, `flat-select`, `search-select`, `tree-select`, `cascader`, `picker`, `date-picker`, `radio`, `flat-radio`, `checkbox`, `switch`, `slider`, `segmented-slider`, `rating`, `file-uploader`, `image-uploader`
- `布局 (11)`: `container`, `flex`, `grid`, `grid-layout`, `stack`, `splitter`, `scroll`, `collapse`, `card`, `card-item`, `group-block`
- `导航 (10)`: `tabs`, `tab-bar`, `nav-bar`, `sidebar-nav`, `breadcrumb`, `steps`, `pagination`, `dropdown-menu`, `flat-dropdown`, `context-menu`
- `数据展示 (11)`: `data-table`, `tree`, `sortable-list`, `timeline`, `transfer`, `stat-card`, `cell-link`, `dot-indicator`, `filter-chips`, `markdown-view`, `image-gallery`
- `反馈 (12)`: `dialog`, `modal`, `drawer`, `popover`, `tooltip`, `toast`, `alert`, `progress`, `progress-bar`, `spinner`, `loading-overlay`, `selection-actions`
- `状态占位 (13)`: `empty`, `empty-state`, `no-data`, `no-selection`, `search-empty`, `error-state`, `offline-state`, `permission-state`, `guide-state`, `blank-slate`, `loading-state`, `skeleton`, `layout-skeleton`

### pro 进阶套件

高级交互、可视化、视觉效果与底层原语，从 `@talex-touch/tuffex/pro` 引入。

- `高级交互 (6)`: `command-palette`, `search-panel`, `markdown-editor`, `code-editor`, `virtual-list`, `version-capsule`
- `可视化 (4)`: `spark-chart`, `allocation-bar`, `diff-table`, `signal-meter`
- `视觉效果 (16)`: `glass-surface`, `gradient-border`, `outline-border`, `border-beam`, `corner-overlay`, `gradual-blur`, `edge-fade-mask`, `glow-text`, `keyframe-stroke-text`, `tuff-logo-stroke`, `text-transformer`, `transition`, `stagger`, `fusion`, `liquid`, `flip-overlay`
- `底层原语 (5)`: `base-surface`, `base-anchor`, `floating`, `auto-sizer`, `resize-box`

### ai AI 套件

面向 AI 原生界面的对话、智能体、推理与上下文组件，从 `@talex-touch/tuffex/ai` 引入。

- `对话 (6)`: `chat`, `prompt-bar`, `attachment-tray`, `message-actions`, `suggestion-chips`, `conversation-stream`
- `智能体 (8)`: `agents`, `agent-trace`, `task-rows`, `tool-call-card`, `tool-chips`, `tool-confirmation`, `approval-card`, `working-indicator`
- `推理与生成 (8)`: `ai-elements`, `chain-of-thought`, `reasoning-disclosure`, `thinking-orb`, `stream-markdown`, `code-stream`, `inline-citation`, `sources`
- `上下文与洞察 (5)`: `context-cards`, `context-indicator`, `insight-cards`, `recommendation-card`, `fine-tune-card`

参考来源：

- 导出入口：`packages/components/src/components.ts`
- 套件入口：`packages/components/src/{base,pro,ai}/index.ts`
- 套件分类表：`apps/nexus/scripts/recategorize-component-docs.py`
- 公开文档：`apps/nexus/content/docs/dev/tools/tuffex.zh.mdc`

## 导出约定

- 推荐使用 `Tx*` 命名导出，例如 `TxButton`、`TxDialog`。
- 部分模块保留兼容别名（例如同一模块同时导出 `Button` / `TxButton`）。
- 类型定义可直接从 `@talex-touch/tuffex` 导入。

## 文档

- 在线文档：[tuffex.tagzxia.com/docs/dev/tuffex](https://tuffex.tagzxia.com/docs/dev/tuffex)
- 本地文档预览：`pnpm -C "apps/nexus" run dev`

## 开发

```bash
pnpm install
pnpm -C "packages/tuffex" run lint
pnpm -C "packages/tuffex" run typecheck
pnpm -C "packages/tuffex" run test
pnpm -C "packages/tuffex" run build
pnpm -C "packages/tuffex" run audit:size
pnpm -C "packages/tuffex" run audit:exports
pnpm -C "packages/tuffex" run audit:types
```

## 与 Tuff 的关系

TuffEx 是 [Tuff](https://tuff.tagzxia.com) 桌面应用的 UI 基础库。核心应用与外部插件开发者通过这个独立发布的库共享同一套组件。

## 参与贡献

- [提交 Issue](https://github.com/talex-touch/tuff/issues)
- [功能建议](https://github.com/talex-touch/tuff/discussions)
- [提交 PR](https://github.com/talex-touch/tuff/pulls)

## 许可证

[MIT License](LICENSE) &copy; 2025 TalexDreamSoul
