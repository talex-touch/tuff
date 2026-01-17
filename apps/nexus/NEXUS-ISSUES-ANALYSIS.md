# Nexus 问题分析与修复说明

本文针对近期反馈的 3 个问题，按现象 → 根因 → 修复方案 → 验证方式的顺序给出结论与落地改动点。

## 1) 偶发自动重定向到 `/`

### 现象
- 页面在某些情况下会“跳回”到根路径 `/`（看起来像被重定向到首页）。
- 同时可见服务端渲染报错：`Cannot read properties of undefined (reading 'matchMedia')`（见截图栈信息）。

### 根因
1. **SSR 期间误触发浏览器 API，导致 500**  
   `apps/nexus/app/composables/useTheme.ts` 将 `hasWindow/hasDocument`（函数）当作布尔值使用，导致判断恒为 truthy，从而在 SSR 环境仍执行 `window.matchMedia(...)`，触发运行时异常。

2. **语言前缀兼容逻辑对 `/en/`、`/zh/` 的处理会落到 `/`**  
   `apps/nexus/app/app.vue` 中存在“移除语言前缀”的 `watchEffect`：当访问旧的前缀路径（特别是只有前缀本身的 `/en/`、`/zh/`）时，`trimmed` 会变为 `/`，从而触发 `router.replace({ path: '/' })`，视觉上就是“自动重定向到首页”。

### 修复方案（已落地）
- `apps/nexus/app/composables/useTheme.ts`：统一按函数调用 `hasWindow()` / `hasDocument()`，避免 SSR 触发 `window.matchMedia`。
- `apps/nexus/app/app.vue`：对仅包含语言前缀的路径（`/en`、`/en/`、`/zh`、`/zh/`）增加短路返回，避免自动替换到 `/`；仍保留对 `/en/...`、`/zh/...` 这类旧链接的兼容重写。

### 验证方式
- 访问包含旧前缀的路径：
  - `/en/docs/...`、`/zh/docs/...` 应被重写到无前缀路径并正常展示。
  - `/en/`、`/zh/` 不应再被自动替换为 `/`（会进入 404/兜底页，便于发现错误链接来源）。
- 刷新任意页面，服务端不再出现 `matchMedia` 相关的 500。

## 2) Docs Markdown 表格样式“有点丑”

### 现象
- 表格宽度与视觉层级不理想（易出现“内容很窄但容器很宽”的观感）。

### 根因
- 当前 docs 渲染同时叠加了 `markdown-body`（GitHub 风格样式）与 `prose`（UnoCSS typography）。  
  其中 `apps/nexus/app/components/docs/github-markdown.css` 对 `table` 使用了 `display: block; width: max-content;`，在内容较少时会出现表格收缩、视觉不均衡。

### 修复方案（已落地）
- `apps/nexus/app/components/docs/github-markdown.css`：
  - `table` 增加 `min-width: 100%`，使其至少铺满正文宽度；同时保留 `width: max-content` 以兼容超宽表格的横向滚动。
  - `th` 增加 `background-color: var(--bgColor-muted)`，提升表头层级。

### 验证方式
- 打开 `apps/nexus/content/docs/guide/start.zh.md`（包含表格）对应页面，观察：
  - 表格至少铺满正文区域，且超宽时仍可横向滚动；
  - 表头底色更清晰。

## 3) 中文状态下右侧大纲（TOC）异常 + 跟随滚动不稳定

### 现象
- 中文文档中，右侧大纲高亮/定位不准确；
- 带 hash 打开页面（锚点跳转）时，大纲定位与滚动跟随容易失效。

### 根因
- `window.location.hash` 在 URL 中会对中文进行 percent-encoding（如 `#%E5%BF%AB%E9%80%9F...`）。  
  `apps/nexus/app/components/DocsOutline.vue` 原实现直接把 `location.hash` 去掉 `#` 后作为 `activeHash`，未做 `decodeURIComponent`，导致：
  - `activeHash` 与实际 heading `id`（toc 的 `id`）不一致；
  - marker 定位与高亮查询失败，从而表现为“中文 TOC 有问题”。

### 修复方案（已落地）
- `apps/nexus/app/components/DocsOutline.vue`：
  - 增加 `normalizeHash()`：对 `location.hash` 进行 `decodeURIComponent`（失败则回退到原值）。
  - `updateMarker()` 不再拼接 selector 直接 `querySelector(...)`，改为遍历 `a[data-id]` 匹配 `data-id`，避免编码/转义问题。
  - 路由切换后刷新内容时，重新应用当前 `window.location.hash`，保证深链锚点进入时状态一致。

### 验证方式
- 在中文文档页面复制带 hash 的链接（如 `.../docs/guide/start#1-安装与环境`），新标签页打开：
  - 右侧大纲应能正确高亮对应条目；
  - 向上/向下滚动时，高亮能稳定跟随。

## 备注：当前仓库的构建/类型检查状态

本次修复仅聚焦上述 3 个问题相关代码路径；目前 `apps/nexus` 的 `nuxt typecheck` 与 `nuxt build` 在仓库现状下仍存在多处与本次变更无关的失败点（例如 `UpdateFormDrawer.vue` 的编译错误）。建议单独开一个“质量门禁修复”任务集中处理，以避免与本次问题修复耦合。

## 附录：本地开发 Docs 加载失败（`no such table: _content_docs`）

### 现象
- 访问 docs 时左侧导航提示 “Navigation failed to load”，正文提示 “Document not found”；
- 终端/Network 中可见 `/_nuxt_content/docs/query` 报错：`no such table: _content_docs`。

### 根因
这是 Nuxt Content 本地 SQLite 缓存（`apps/nexus/.data/content/contents.sqlite`）出现不一致：`_content_info` 里已经记录了 `checksum_docs` 为 ready，但实际 `_content_docs` 表不存在，导致查询直接失败。

### 处理方式
- 清理本地缓存后重启 dev（仅影响本地，不涉及任何线上数据）：
  - `pnpm -C "apps/nexus" run content:reset`
  - 然后 `pnpm -C "apps/nexus" run dev`
