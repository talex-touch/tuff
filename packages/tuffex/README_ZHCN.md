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

#### 每个样式表只包含单个组件的规则

`<component>/style.css` 只含该组件自身的规则。依赖其它组件的组件——`progress-bar`
用到 `tooltip`，`tooltip` 用到 `base-anchor`，再到 `base-surface`——需要把这些依赖的
样式表一并引入，否则对应部分会缺样式，而且不会有任何报错。

这些文件此前是自包含的：base-surface 的规则被复制进 26 个包、spinner 的进了 29 个，
总计 2.2 MiB 的样式表里 68% 是重复字节，一个用了五个组件的页面要为 base-surface
付五份成本。

装上构建插件，它会按依赖顺序替你算出完整集合：

```ts
// vite.config.ts
import { tuffexOnDemandStylePlugin } from '@talex-touch/tuffex/vite'

export default defineConfig({
  plugins: [tuffexOnDemandStylePlugin()],
})
```

装了之后只需引入组件本身，样式会自动跟上；共享样式无论被多少组件依赖都只加载一次。
一个由五个组件构成的页面，CSS 从 208 KiB 降到 90 KiB（gzip 后 14 KiB）。

不装插件时需要自行引入整个闭包，`dist/es/style-deps.json` 记录了每个组件的依赖。

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

当前源码导出模块总数：**182**。

全部模块按三大套件划分，每个套件都有独立的分类入口：

```ts
import { TxButton } from '@talex-touch/tuffex/base'
import { TxCommandPalette } from '@talex-touch/tuffex/pro'
import { TxPromptBar } from '@talex-touch/tuffex/ai'
```

### base 基础组件

通用、表单、布局、导航、数据展示、反馈与状态占位组件，从 `@talex-touch/tuffex/base` 引入。

- `通用 (10)`: `button`, `icon`, `icon-chip`, `icon-picker`, `avatar`, `tag`, `badge`, `status-badge`, `kbd`, `divider`
- `表单 (24)`: `form`, `input`, `textarea`, `number-input`, `search-input`, `tag-input`, `sensitive-input`, `scrub-field`, `select`, `flat-select`, `search-select`, `tree-select`, `cascader`, `picker`, `date-picker`, `radio`, `flat-radio`, `checkbox`, `switch`, `slider`, `segmented-slider`, `rating`, `file-uploader`, `image-uploader`
- `布局 (11)`: `container`, `flex`, `grid`, `grid-layout`, `stack`, `splitter`, `scroll`, `collapse`, `card`, `card-item`, `group-block`
- `导航 (10)`: `tabs`, `tab-bar`, `nav-bar`, `sidebar-nav`, `breadcrumb`, `steps`, `pagination`, `dropdown-menu`, `flat-dropdown`, `context-menu`
- `数据展示 (12)`: `data-table`, `descriptions`, `tree`, `sortable-list`, `timeline`, `transfer`, `stat-card`, `cell-link`, `dot-indicator`, `filter-chips`, `markdown-view`, `image-gallery`
- `反馈 (14)`: `dialog`, `modal`, `drawer`, `popover`, `tooltip`, `toast`, `toast-panel`, `alert`, `status-hint`, `progress`, `progress-bar`, `spinner`, `loading-overlay`, `selection-actions`
- `状态占位 (13)`: `empty`, `empty-state`, `no-data`, `no-selection`, `search-empty`, `error-state`, `offline-state`, `permission-state`, `guide-state`, `blank-slate`, `loading-state`, `skeleton`, `layout-skeleton`

### pro 进阶套件

高级交互、可视化、视觉效果与底层原语，从 `@talex-touch/tuffex/pro` 引入。

- `高级交互 (7)`: `command-palette`, `search-panel`, `markdown-editor`, `code-editor`, `terminal`, `virtual-list`, `version-capsule`
- `动效复合控件 (3)`: `motion-control`, `motion-form`, `motion-metric`
- `可视化 (5)`: `charts`, `spark-chart`, `allocation-bar`, `diff-table`, `signal-meter`
- `视觉效果 (23)`: `glass-surface`, `gradient-border`, `outline-border`, `border-beam`, `prism-glow`, `corner-overlay`, `gradual-blur`, `edge-fade-mask`, `glow-text`, `keyframe-stroke-text`, `tuff-logo-stroke`, `text-morph`, `icon-morph`, `text-transformer`, `transition`, `stagger`, `fusion`, `fusion-surface`, `liquid`, `flip-overlay`, `image-generation`, `metal-fx`, `voice-beam`
- `Motion (11)`: `card-spread`, `carousel-3d`, `flip-book`, `motion`, `motion-button`, `motion-dock`, `motion-loader`, `motion-text`, `motion-toggle`, `motion-transition`, `physics-motion`
- `底层原语 (5)`: `base-surface`, `base-anchor`, `floating`, `auto-sizer`, `resize-box`

Nexus 为 Motion 提供独立文档章节，包含 Buttons、Card Spreads、3D Carousels、Loaders、Dither Charts，以及文字、物理、指针、滚动、开关和转场能力。安装仍使用 `pro` 或单组件子路径，不增加第四套安装器。`TxMonoChart` 与 `TxDitherChart` 沿用现有 `@talex-touch/tuffex/charts` SVG/d3 入口；Mono 文档位于 Data，Dither 位于 Motion。

内容、图表数据与业务状态均由调用方提供。变化文本复用 TextMorph，弹簧复用已有编译器与积分器。`/utils` 导出的 `useMotionActivity` 按可见性、页面活动、KeepAlive 与减少动态效果偏好控制播放；暂停时保留静态内容。

### ai AI 套件

面向 AI 原生界面的对话、智能体、推理与上下文组件，从 `@talex-touch/tuffex/ai` 引入。

- `对话 (8)`: `chat`, `prompt-bar`, `attachment-tray`, `mode-chip`, `message-actions`, `suggestion-chips`, `choice-card`, `conversation-stream`
- `智能体 (10)`: `agents`, `agent-screen`, `agent-trace`, `task-rows`, `tool-call-card`, `tool-chips`, `tool-confirmation`, `approval-card`, `working-indicator`, `bot-avatar`
- `推理与生成 (10)`: `ai-elements`, `chain-of-thought`, `reasoning-disclosure`, `thinking-orb`, `stream-element`, `stream-text`, `stream-markdown`, `code-stream`, `inline-citation`, `sources`
- `上下文与洞察 (5)`: `context-cards`, `context-indicator`, `insight-cards`, `recommendation-card`, `fine-tune-card`
- `流程编排 (1)`: `flowchart`

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
- 组件更新日志与引入版本索引：[CHANGELOG.md](./CHANGELOG.md)

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
pnpm -C "packages/tuffex" run audit:changelog
```

## 与 Tuff 的关系

TuffEx 是 [Tuff](https://tuff.tagzxia.com) 桌面应用的 UI 基础库。核心应用与外部插件开发者通过这个独立发布的库共享同一套组件。

## 参与贡献

- [提交 Issue](https://github.com/talex-touch/tuff/issues)
- [功能建议](https://github.com/talex-touch/tuff/discussions)
- [提交 PR](https://github.com/talex-touch/tuff/pulls)

## 许可证

[MIT License](LICENSE) &copy; 2025 TalexDreamSoul

Amicro 移植部分保留[上游 MIT 许可与版权](AMICRO-LICENSE)，固定来源提交为 `43c29ce9cdd16459e3eab4992381b8d35b38776a`，许可声明随包分发。不包含上游网站素材与外部字体。

上游 `DitherBook.tsx` 与 `SimpleCompExtracted.tsx` 明确声明文件级 Apache-2.0，衍生实现保留该许可和 Vue/TuffEx 修改说明，并随包提供[完整 Apache 许可](AMICRO-APACHE-LICENSE)。保留的 Lucide 0.546.0 图标数据携带[ISC 与 Feather 衍生部分的 MIT 声明](LUCIDE-LICENSE)，不引入 React/Lucide 运行时。包元数据明确记录这些组合义务，不把全部衍生代码重新标为 MIT。
