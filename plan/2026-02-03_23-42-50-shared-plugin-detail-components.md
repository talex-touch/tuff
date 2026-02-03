---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 抽离 Nexus 插件详情相关组件到 utils/shared/components 并在 Nexus + Core-app 复用
complexity: complex
planning_method: builtin
created_at: 2026-02-03T23:42:58+08:00
---

# Plan: 插件详情共享组件抽离与复用

🎯 任务概述
目标是把 Nexus 中“插件详情”相关的业务 UI 抽到 `packages/utils/renderer/shared/components`，保留 Nexus 视觉风格，同时在 Nexus 与 Core-app 复用。共享组件需要支持完整详情块（标题/摘要/作者/标签/统计 + README + 版本列表），并以 Markdown 字符串渲染 README。

📋 执行计划
1. 盘点现状与映射关系：梳理 Nexus `pages/market.vue` 中详情区块的数据字段与结构，以及 Core-app `MarketDetail.vue` 的数据来源与 i18n Key，列出字段对照表与缺失字段。
2. 设计共享组件边界：确定一组可复用的“详情相关组件”，至少包含 `PluginDetailContent`（完整详情）、`PluginDetailReadme`、`PluginDetailVersions`；定义统一的 `SharedPluginDetail` 数据结构，字段可选并按缺失场景自动隐藏。
3. 建立 utils shared 目录与导出：在 `packages/utils/renderer/shared/components` 新增组件与类型文件；在 `packages/utils/renderer/shared/index.ts` 与 `packages/utils/renderer/index.ts` 导出；保持 root `packages/utils/index.ts` 不暴露 renderer-only 入口。
4. README 渲染方案落地：在共享组件内部引入 `marked` 渲染 Markdown（与 core-app 现有逻辑一致），新增 `marked` 到 `packages/utils/package.json` 并设置基础 options（breaks/gfm）。如需安全策略，在组件内注明风险并支持外部覆盖（例如 `renderMarkdown` prop）。
5. Nexus 侧替换：将 `apps/nexus/app/pages/market.vue` 中的详情正文替换为共享组件；保留现有 Modal 头部/关闭逻辑；必要时把 Nexus 的 Tag/StatusBadge 样式迁移为共享组件内部样式，避免依赖 Nexus 本地 UI 组件。
6. Core-app 侧接入：在 `apps/core-app/src/renderer/src/views/base/MarketDetail.vue` 或新的 Overlay 容器中使用共享组件；使用 core-app 的 i18n 文案与数据映射填充；对缺失字段（如 versions/installs）保持自动隐藏。
7. 构建链路适配：Nuxt 配置 `apps/nexus/nuxt.config.ts` 增加 `@talex-touch/utils` 到 transpile 列表；如 core-app Vite 构建需要，确认其可处理 workspace 内 `.vue` 源码（必要时补充 alias/optimizeDeps）。
8. 回归验证：Nexus 市场页打开详情、README 渲染、版本列表显示；Core-app 市场详情/Overlay 中共享组件展示与关闭交互；检查样式一致性与 i18n 文案正确。

⚠️ 风险与注意事项
- utils 包目前没有 `.vue` 组件，新增后需要确保 Nuxt/Vite 正确转译与打包。
- `marked` 渲染存在 XSS 风险，需确认 README 来源可信或后续引入 sanitization。
- Core-app 现有详情样式与 Nexus 风格可能不一致，需确认接受跨应用视觉统一。

📎 参考
- `apps/nexus/app/pages/market.vue`
- `apps/nexus/app/components/market/MarketItem.vue`
- `apps/core-app/src/renderer/src/views/base/MarketDetail.vue`
- `apps/core-app/src/renderer/src/composables/market/useMarketReadme.ts`
- `packages/utils/renderer/index.ts`
- `apps/nexus/nuxt.config.ts`

## 字段映射与缺口（SPDC-010）

### 详情字段映射（UI 使用）

| Shared 字段（建议） | Nexus（MarketplacePluginDetail / 详情 API） | Core-app（MarketPlugin） | 备注 / 缺口 |
| --- | --- | --- | --- |
| name | `name` | `name` | 共同字段 |
| summary | `summary` | `description` | 语义一致但命名不同 |
| authorName | `author.name` | `author` | Core-app 为纯字符串 |
| category | `category` + `resolveCategoryLabel` | `category` | Core-app 详情页暂未展示 |
| official | `isOfficial` | `official` + `providerTrustLevel` | Core-app 有可信等级样式 |
| badges | `badges[]` | `tags[]`(未使用) | Core-app 详情缺展示 |
| installs | `installs` | 缺失 | Core-app 详情缺展示 |
| latestVersion | `latestVersion.version` | `version` | 语义一致 |
| latestUpdatedAt | `latestVersion.createdAt` | `timestamp` | 时间来源不同 |
| readmeMarkdown | `readmeMarkdown` | 缺失 | Core-app 使用 `readmeUrl` 拉取 |
| readmeUrl | 缺失 | `readmeUrl` | Nexus 直接下发 Markdown |
| versions[] | `versions[]`（version/channel/createdAt/packageSize/changelog/packageUrl/signature） | 缺失 | Core-app 详情缺版本列表 |
| pluginId | `id` | `id` | Core-app 详情侧边栏展示 |
| provider | 缺失 | `providerId/providerName/providerType` | Nexus 详情缺来源字段 |
| icon | `iconUrl` | `icon` / `iconUrl` | Core-app 使用 MarketIcon |
| rating | `ratingSummary` + reviews API | `useMarketRating` | 两端来源与字段不同 |
| reviews | `reviews[]` | 缺失 | Core-app 详情无评论列表 |

### i18n Key 对照（详情相关）

- Nexus（`apps/nexus/app/pages/market.vue`）
  - `market.detail.*`：title/loading/error/author/readme/noReadme/versions/download/noVersions
  - `market.detail.reviews.*`：title/count/tag/helper/writeTitle/ratingLabel/titlePlaceholder/contentPlaceholder/submitHint/submit/loading/empty/anonymous/status.*
  - `market.badges.official`
  - `dashboard.sections.plugins.stats.installs`
- Core-app（`apps/core-app/src/renderer/src/views/base/MarketDetail.vue` + `useMarketReadme.ts`）
  - `market.detailDialog.*`：information/author/version/updateTime/provider/pluginId/readmeError
  - `market.rating.*`：title/loading/loginRequired/loginRequiredTitle/invalid/httpError/submitFailedTitle
  - 非 i18n 文案：`Loading README...`、`No README`、`Official Plugin`（title）

### 缺口汇总（用于后续共享数据模型）

- Core-app 详情缺少：`installs`、`badges/tags`、`versions[]`、`readmeMarkdown`（仅 `readmeUrl`）。
- Nexus 详情缺少：`providerId/providerName/providerType`、`providerTrustLevel`、`timestamp`（Core-app meta 需要）。
- README 数据形态不一致：Nexus 直传 Markdown，Core-app 需从 URL 拉取并渲染。
- 评分/评论来源差异大：Nexus 有 reviews + rating summary；Core-app 仅评分（无评论列表）。

## 共享组件边界与数据模型（SPDC-020）

### 组件边界（最小可复用）

- `SharedPluginDetailContent`：详情内容容器，组合 header/readme/versions/meta 等区块。
- `SharedPluginDetailHeader`：标题/摘要/作者/标签/统计等顶部信息。
- `SharedPluginDetailReadme`：README 渲染区块（空态提示、可覆盖渲染入口）。
- `SharedPluginDetailVersions`：版本列表区块（含下载/签名/变更摘要）。
- `SharedPluginDetailMetaList`：右侧元信息列表（provider/id/version/更新时间等）。

### 数据模型（字段可选即隐藏）

- 详情模型：`packages/utils/renderer/shared/plugin-detail.ts` 定义 `SharedPluginDetail`。
- 约束规则：
  - 任何字段 `undefined`/空数组时，组件对应区块默认隐藏。
  - README 以 `readme.markdown` 优先，其次 `readme.url`。
  - 版本列表仅在 `versions.length > 0` 时展示。
