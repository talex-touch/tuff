# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-06-04）

> 范围：`apps/core-app`、`apps/nexus`、`packages/tuffex`、`packages/intelligence-uikit`、`packages/utils`、`packages/tuff-business`、`plugins/*` 与 `docs/plan-prd` 当前 live tree / dirty worktree。
> 关系：承接 2026-06-03 增量审计，重点复核 UI/SDK 大切片、TuffEx 按需文档、HTML trusted boundary、占位/假实现、验证环境与下一步执行顺序。

## 总结

- **P0 结论**：本轮继续未发现新的生产路径 fixed fake-success、mock payment URL、伪成功空 payload 或可消费占位响应。`touch-intelligence` 的 `placeholder` item 是空输入态提示，不是成功结果；测试 mock、playground mock、输入框 placeholder、deprecated hidden legacy snippets 仍不计入生产假实现。
- **UI 适配度**：产品方向仍适合“高密度、可扫描、低装饰、键盘友好”的专业桌面指令中心。`ui-ux-pro-max` 给出的产品展示/极简视觉建议可作为文档站营销面参考，但 CoreApp / dashboard 不宜转成大 hero 或低密度卡片风，当前更应该收口组件一致性、状态语义、真实截图与构建证据。
- **本轮已同步的小修正**：Nexus TuffEx public docs 的推荐示例已从旧 full `@talex-touch/tuffex/style.css` 改为 `base.css` + 组件子路径 + 局部 `style.css`；`style.css` 只保留在 full import 迁移期兼容示例与 README legacy 说明中。Nexus release notes `notesHtml` 也已改为复用共享 `sanitizeMarkdownHtml()` 后再进入 `v-html`。2026-06-05 继续补齐 Nexus demo / PreviewSDK / TuffEx audit 脚本的严格类型边界。
- **兼容性判断**：`master` 与 `origin/master` 仍无 ahead 差异（`origin/master...HEAD` 为 `0 0`）。审计开始时 worktree 仍有 304 个 tracked 改动文件、24 个 untracked 文件，风险来自 UI/SDK dirty 切片混杂，而不是分支领先远端。
- **验证结果更新（2026-06-05）**：已通过临时 ad-hoc signed Node `22.16.0` 副本 + pnpm `10.32.1` 跑通 TuffEx `build` / `audit:exports` / `audit:size` / `audit:types`、Nexus `typecheck` / `build` 与 PreviewSDK focused test。该方式不修改仓库依赖产物，只把 `/tmp/talex-touch-node22-adhoc` 放到 `PATH` 前置，绕开 macOS 对 signed Node runtime 与 ad-hoc native binding Team ID 不一致的加载限制。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.7 / 10 | Markdown sanitizer、preload DOM 构建、UI preference facade、首批语义控件方向正确；短板仍是 dialog/highlight/AI answer 的 HTML boundary、Widget runtime sandbox evidence 与 renderer 大面积消费侧迁移验证。 |
| Nexus 文档与生态站 | 8.4 / 10 | Dashboard/docs/store/auth 迁向 TuffEx 的方向稳定，本轮已修正 TuffEx 推荐导入文档，并通过 Node 22 + pnpm 10 下的 Nexus typecheck/build；仍需 CDP visual smoke 截图证据证明移动/桌面主题下的实际视觉无回归。 |
| TuffEx 组件体系 | 8.5 / 10 | `base.css`、组件子路径、局部 `style.css`、on-demand style plugin、组件 helper 拆分和 audit 脚本边界清晰；Node 22 + pnpm 10 下的 build、exports、size、types evidence 已补齐。 |
| `intelligence-uikit` | 7.4 / 10 | 子路径样式消费方向正确，playground mock 属于展示/开发态；仍需 package typecheck 与消费侧样式截图证据。 |
| 官方/示例插件 UI | 6.7 / 10 | 旧 snippets 已 hidden/deprecated/replacedBy，不再是用户可见能力；`touch-image` / `touch-music` 的模板观感、局部 localStorage 与旧 full-style import 仍适合作为 P2 polish。 |
| 架构健壮性 | 8.0 / 10 | SDK/Runtime 主线没有新增 Search/File 脏叠加，执行顺序仍合理；主要风险是 dirty 范围过大、标准验证环境不可用、HTML trusted boundary 与平台真机 evidence 未闭环。 |

## 本轮代码证据

### 1. 当前风险仍是 dirty worktree 切片混杂

证据：

- `git rev-list --count --left-right origin/master...HEAD` 返回 `0 0`。
- 审计开始时 `git status --porcelain=v1` 统计为 304 个 tracked 改动、24 个 untracked 文件。
- dirty 范围仍集中在 `packages/tuffex`、CoreApp renderer、Nexus app/content、`intelligence-uikit`、`packages/utils` 与 plan-prd 文档。

判断：

- 不应该继续叠 FileProvider 写入边界或新的 Search source 功能。
- 下一步仍应按 TuffEx、Nexus、CoreApp renderer、`intelligence-uikit` 四批收口，逐批补验证。

### 2. Nexus TuffEx public docs 推荐用法已修正

证据：

- `apps/nexus/content/docs/dev/tools/tuffex.en.mdc`
- `apps/nexus/content/docs/dev/tools/tuffex.zh.mdc`
- `apps/nexus/content/docs/dev/components/foundations.en.mdc`
- `apps/nexus/content/docs/dev/components/foundations.zh.mdc`

本轮把推荐示例改为：

- `@talex-touch/tuffex/base.css`
- `@talex-touch/tuffex/<component>`
- `@talex-touch/tuffex/<component>/style.css`

同时保留 full import 的 `@talex-touch/tuffex/style.css`，但明确它只适合迁移期兼容。

判断：

- 这解决了 2026-06-03 报告里“公开 docs 误导新消费者继续导入全量样式”的高信号文档问题。
- 后续仍需 `audit:size` / docs build 验证这些示例与 package export 真实一致。

### 3. 标准验证链已补齐关键证据

2026-06-05 继续执行结果：

- 已创建临时 Node 运行时：复制 Node `22.16.0` 到 `/tmp/talex-touch-node22-adhoc/node` 并 ad-hoc sign，仅影响 `/tmp`，不修改仓库文件或 `node_modules`。
- 已确认脚本内 `node` 解析到 `/private/tmp/talex-touch-node22-adhoc/node v22.16.0`；临时 `pnpm` shim 指向 pnpm `10.32.1`。
- 已通过 `pnpm -C "packages/tuffex" run build`。
- 已通过 `pnpm -C "packages/tuffex" run audit:exports`。
- 已通过 `pnpm -C "packages/tuffex" run audit:size`。
- 已通过 `pnpm -C "packages/tuffex" run audit:types`；同时修正 `audit-package-types.mjs`，让脚本优先复用 `npm_execpath` 中的 pnpm 入口，避免 automation shell 没有裸 `pnpm` 时误失败。
- 已通过 `pnpm -C "apps/nexus" run typecheck`。
- 已通过 `pnpm -C "apps/nexus" run build`；构建完成 Nitro / Cloudflare Pages 输出与 `trim-content-assets`，并移除重复 sqlite wasm 与 root SQL dumps。
- 已通过 `pnpm -C "packages/utils" exec vitest run "__tests__/core-box/preview-sdk.test.ts"`。

Nexus build 仍出现非阻断 warning：

- UnoCSS web fonts fetch timeout。
- Vite 提醒 `packages/utils` 中部分 Node 模块被 browser externalized。
- 部分 client chunks 超过 500 KiB。
- prerender 期间 `auth.*` / `pricing.*` 若干英文 i18n key 缺失。
- 本地未配置 D1 binding 时 dashboard/plugins store 退回内存存储。
- OpenAI 依赖包 ESM top-level `this` rewrite warning。

判断：

- 之前的 Rollup/OXC native binding code-signature 已不再是代码阻塞；后续 automation 可沿用临时 ad-hoc Node + PATH 前置方式。
- Nexus visual smoke 未执行：当前没有 `127.0.0.1:9224` CDP 浏览器服务，也没有 3200 端口的 Nexus dev/preview 服务；不把 visual screenshot evidence 写成已完成。

### 4. 未发现 i18n 直接访问回潮

证据：

- `rg "window\\.\\$t|window\\.\\$i18n"` 在扫描范围内无命中。

判断：

- 当前 i18n 规则继续保持：前端消费应使用 hooks / helper，不回到 `window.$t` 或 `window.$i18n`。

### 5. HTML / storage 边界仍需分层治理

高信号项：

- `apps/nexus/app/pages/notes/[slug].vue` 已改为对 `/api/notes/:slug` 返回的 `notesHtml` 先执行共享 `sanitizeMarkdownHtml()`，再进入 `v-html`。这已关闭 release notes 直接 HTML 渲染边界；后续可继续用 TrustedHtml 类型让边界更显式。
- CoreApp / TuffEx dialog 的 `messageHtml` 已有 trusted-only 语义，但仍需要更明确的 wrapper/type 约束，避免业务组件绕过文本默认路径。
- CoreBox 高亮、文本预览、AI answer 与 Markdown renderer 不应一刀切删除 `v-html`，但应按来源区分 escaped highlight、sanitized Markdown、trusted internal HTML、dynamic widget runtime。
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 仍使用 `new Function` 执行 widget runtime，这是 sandbox evidence / runtime safety 长尾，不是 PreviewSDK 假实现。
- Nexus OAuth context localStorage 当前只保存 `flow/provider/redirect/ts/ver`，且有 redirect sanitize 与 TTL，不是 token 明文；Nexus locale/docs assistant/docs analytics/privacy/device marker 均更接近非敏感浏览器偏好。仍建议长期沉淀统一 browser preference facade。
- `packages/tuffex/packages/components/src/group-block/src/TxGroupBlock.vue` 仍直接 localStorage；CoreApp 已新增 `UiPreferenceStorage`，后续可考虑让 TuffEx 暴露可注入 persistence adapter，而不是组件内部固定浏览器 storage。

### 6. 占位、假的、不优雅代码分层

不构成生产假实现：

- UI input `placeholder`。
- Vitest / API tests / playground mock。
- `plugins/touch-intelligence/index.js` 的 `buildPlaceholderItem()`：这是 CoreBox 空输入状态提示，状态为 `empty`，不返回成功业务 payload。
- `touch-text-snippets` / `touch-code-snippets`：已 `hidden: true`、`deprecated: true`、`replacedBy: "touch-snippets"` 且无 features。
- `PresetCloudUnavailableService`：fail-closed，`getStatus()` 返回 `available: false` 与 `reason: "not-shipped"`。
- `apps/core-app/src/preload/home-gear/preload.ts` 中的 `innerHTML` 命中为注释。

仍需治理但不是 P0：

- `touch-music` 仍直接导入 `@talex-touch/tuffex/style.css`，属于示例插件/P2 polish；如果它要作为官方可见插件，应迁到 `base.css` + 子路径样式。
- `touch-image` 仍有局部 localStorage 迁移痕迹和模板观感长尾。
- `plugins/touch-translation/src/composables/useTranslationProvider.ts` 注释仍写 localStorage，但实际已通过 plugin storage + secret stripping/migration；建议下一轮把注释改成 storage，避免误导。
- theme `TouchBubbles` SVG HTML、docs code renderer 等 HTML 渲染点仍需要 trusted/sanitized 边界文档与 focused tests。

## 下一步建议

1. **固化 Node 22 automation 验证入口**：短期可继续用 `/tmp/talex-touch-node22-adhoc` + PATH 前置方式跑标准 Node 22.16 验证；长期仍建议在正常 dev shell 中安装可加载本机 native binding 的 Node 22，减少临时 shim 依赖。
2. **收 TuffEx 切片**：只包含 exports、局部 style、on-demand plugin、组件 helper、audit 脚本与相应测试/文档，不混 Nexus 页面和 CoreApp renderer；本轮 build/audit evidence 已具备。
3. **收 Nexus 切片**：包含本轮 TuffEx docs 推荐用法、async component name、visual smoke 和页面适配；typecheck/build evidence 已具备，下一步只缺 CDP visual smoke。
4. **补 HTML trusted boundary 后续小切片**：Nexus `notesHtml` 已先落到 `sanitizeMarkdownHtml()`；后续优先 CoreApp/TuffEx dialog `messageHtml`，并建立 `TrustedHtml` / `EscapedHighlightHtml` 的轻量约束。
5. **收 CoreApp renderer/i18n/UI 切片**：跑 `pnpm -C "apps/core-app" run typecheck:web`，继续确认无 `window.$t` / `$i18n` 回潮。
6. **收 `intelligence-uikit` 切片**：跑 package typecheck，确认 AI UI 子路径样式和类型完整。
7. **再回 P1-APP-DATA**：File write/store boundary、Browser Bookmarks 官方插件 lifecycle、Everything Windows evidence、Quicklinks feed/UI evidence 依次推进。

## 验证

- 已执行静态扫描：`@talex-touch/tuffex/style.css`、`window.$t`、`window.$i18n`、`v-html`、`innerHTML`、`new Function`、`localStorage`、`placeholder`、`mock`、`not implemented` 等。
- 已确认当前分支差异：`origin/master...HEAD` 为 `0 0`。
- 已确认当前默认 shell：Codex Node `v24.14.0`，`pnpm` / `corepack` 不在默认 `PATH`。
- 已通过显式临时工具链验证 Node `v22.16.0` + pnpm `10.32.1`。
- 已通过：`pnpm -C "packages/tuffex" run build`、`audit:exports`、`audit:size`、`audit:types`（使用临时 ad-hoc Node `22.16.0` + pnpm `10.32.1`）。
- 已通过：`pnpm -C "apps/nexus" run typecheck`、`pnpm -C "apps/nexus" run build`（同一 Node 22.16 + pnpm 10.32 环境）。
- 已通过：`pnpm -C "packages/utils" exec vitest run "__tests__/core-box/preview-sdk.test.ts"`。
- 已通过：Node `22.16.0` + `tsx` sanitizer smoke，确认 `sanitizeMarkdownHtml()` 会移除 script、事件属性与危险 `javascript:` URL。
- 未执行：Nexus visual smoke，因为本轮没有 CDP 浏览器服务 `127.0.0.1:9224`，也没有已启动的 Nexus dev/preview server。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES` 与 `docs/INDEX.md`。本轮只修改文档和 Nexus content 示例，不改变运行时代码、目标范围或质量门禁，因此不更新 Roadmap 与 Quality Baseline。
