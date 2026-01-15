# 260114 - 全仓扫描与问题清单（滚动/模糊/文档）

## 范围与结论

本次聚焦三件事：

1. **TxScroll/TouchScroll 回归：无法滚动**（含嵌套滚动吞事件）
2. **为页面逐步接入渐变模糊（TxGradualBlur）**
3. **梳理仓库内现有 TODO/PRD/Plan 文档，并输出问题清单**

结论：滚动问题主要来自两类根因——**滚动容器高度链路不成立** 与 **wheel handler 在不可滚动时仍吞掉 wheel**。这两点已修复并落地到 `packages/tuffex`（含 dist）与 core-app 相关容器。

---

## 文档现状（索引）

- 项目文档中心：`plan-prd/README.md`
- PRD 提炼待办：`plan-prd/TODO.md`
- UI/滚动专项待办（本次更新）：`todo.md`
- 额外计划文档（散落）：`plans/`
- 历史滚动复盘：`report.md`、`report-scroll-followup.md`

建议：`plan-prd/` 继续作为“唯一权威索引”，根目录 `todo.md` 保持“短周期工程 TODO（可执行）”，避免与 `plan-prd/TODO.md` 混杂。

---

## 已落地改动（高优先级修复）

### 1) TxScroll wheel 吞事件导致“看起来无法滚动”

- 修复点：当 BetterScroll 判定 **不可滚动** 时，不再抢占 wheel（不 `preventDefault`、不 `stopPropagation`），避免父级滚动无法接管。
- 源码：`packages/tuffex/packages/components/src/scroll/src/TxScroll.vue`
- 同步更新运行时产物：`packages/tuffex/dist/es/scroll/src/TxScroll.vue2.js`

### 2) 部分容器高度链路不成立（典型：flex + align-items:center）

- 修复点：`TTabs` 内容区改为 `align-items: stretch` + `min-height: 0`，并补齐容器 flex 约束，确保 TouchScroll 的 `height: 100%` 能“落地”。
- 文件：`apps/core-app/src/renderer/src/components/tabs/TTabs.vue`
- 同时增强 TouchScroll 自适应：为 `.touch-scroll` 增加 `align-self: stretch` / `min-width: 0`（更健壮）
- 文件：`apps/core-app/src/renderer/src/components/base/TouchScroll.vue`

---

## 渐变模糊接入现状（逐步推进）

已在两个“模板级容器”统一接入（顶/底），覆盖大多数页面：

- `apps/core-app/src/renderer/src/components/base/template/ViewTemplate.vue`
- `apps/core-app/src/renderer/src/components/tuff/template/TuffAsideTemplate.vue`

说明：
- 使用 `@talex-touch/tuffex` 的 `TxGradualBlur`（组件源码：`packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue`）
- `zIndex` 选择较低（20），避免压过页面 sticky header（如需覆盖可按页面单独提高）

---

## overflow/滚动一致性扫描（摘要）

`renderer` 仍存在大量 `overflow: auto/scroll`（来自 view、dialog、test、preview 等），其中一部分是合理的（例如对话框内容区、测试页），一部分建议统一到 `TouchScroll`：

- 仍有 `overflow-*` 的典型位置（抽样）：
  - `apps/core-app/src/renderer/src/views/base/LingPan.vue`
  - `apps/core-app/src/renderer/src/views/base/MarketDetail.vue`
  - `apps/core-app/src/renderer/src/views/base/settings/SettingPermission.vue`
  - `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceAgentsPage.vue`
  - `apps/core-app/src/renderer/src/components/plugin/tabs/PluginLogs.vue`

本次已迁移的 3 处（原 `todo.md` 标注的“未迁移”点）：
- `apps/core-app/src/renderer/src/components/flow/FlowSelector.vue`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceAuditPage.vue`
- `apps/core-app/src/renderer/src/components/base/dialog/TPopperDialog.vue`

建议后续迁移策略（KISS + 可维护）：
- **需要 sticky header / 原生链式滚动**：优先 `TouchScroll native`
- **需要统一滚动手感/滚动条**：使用 BetterScroll 模式，但尽量保持“单层滚动容器”，必要时显式打开 `scrollChaining`

---

## 代码层风险点（扫描结果）

### 1) `v-html` 使用（潜在 XSS）

- `apps/core-app/src/renderer/src/components/base/dialog/TPopperDialog.vue` 使用 `v-html="message"`
- 风险说明：如果 `message` 不是完全可信（插件/远端输入），需要在注入前做 DOMPurify 或白名单过滤。

### 2) `@talex-touch/tuffex` “源码 vs dist”心智负担

- workspace 依赖指向 `packages/tuffex`，但 core-app 实际运行使用 **dist**（符合 package exports）。
- 若直接改 `packages/tuffex/packages/components/src/*`，不更新 dist 时“看不到效果”。
- 建议（两选一）：
  - 开发态为 `@talex-touch/tuffex` 增加 renderer alias 指向源码入口（需同时处理样式入口）
  - 或明确流程：改组件 → 同步改 dist（或统一执行 build）

### 3) ESLint 全量运行耗时

- `pnpm -C apps/core-app lint` 在本机容器内可能超时；建议在日常改动中用“文件级 eslint”做快速回归。

---

## TODO/FIXME（代码内标注）

已发现多处显式 TODO（主要集中在 AI/搜索/插件市场等模块），建议与 `plan-prd/TODO.md` 对齐，避免“代码 TODO 永久漂浮”：

- `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts`
- `apps/core-app/src/main/service/agent-market.service.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`

---

## 下一步建议（可直接继续做）

1. **滚动策略定稿**：明确哪些容器必须 native（sticky header/链式滚动），哪些统一 BetterScroll（统一手感/滚动条）。
2. **继续迁移 overflow 点**：优先从用户高频页面开始（Market、Intelligence、Plugin Logs）。
3. **tuffex 开发流程固化**：要么补 alias，要么补“改动后自动构建 dist”的本地脚本/任务。
4. **`v-html` 输入面收敛**：明确 `message` 来源；若来自插件/远端，增加消毒或限制渲染能力。

