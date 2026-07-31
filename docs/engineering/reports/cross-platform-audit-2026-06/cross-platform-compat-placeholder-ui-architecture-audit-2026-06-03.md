# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-06-03）

> 范围：`apps/core-app`、`apps/nexus`、`packages/tuffex`、`packages/intelligence-uikit`、`packages/utils`、`packages/tuff-business`、`plugins/*` 与 `docs/plan-prd` 当前 live tree / dirty worktree。
> 关系：承接 2026-06-02 增量审计，重点复核 UI/SDK 大切片、TuffEx 按需样式、Markdown/HTML 边界、占位/假实现、当前 git 口径与下一步计划。

## 总结

- **P0 结论**：本轮继续未发现新的生产路径 fixed fake-success、mock payment URL、伪成功空 payload 或可消费占位响应。测试 mock、playground mock、输入框 placeholder、显式 deprecated legacy 插件和本地 UI 偏好不计为生产假实现。
- **UI 适配度**：整体产品形态仍是专业桌面指令中心，信息密度、低装饰、可扫描的方向正确。当前 UI 的主要短板不是“是否好看”，而是统一组件消费、状态表达、键盘语义、HTML 渲染边界和真实截图/构建 evidence 还没有完全闭环。
- **兼容性判断**：TuffEx `base.css`、组件子路径 `style.css`、on-demand style plugin 与消费侧 alias 的方向正确，但仍必须用 Node `22.16.0` + `pnpm@10.32.1` 跑 build/audit/typecheck 证明 dev/prod 一致性。
- **文档口径修正**：当前 `master` 与 `origin/master` 已不再有 ahead 差异（`origin/master...HEAD` 为 `0 0`），但 worktree 仍很脏：304 个 tracked 改动文件、23 个 untracked 文件。后续风险来自 dirty 切片混杂，而不是本地提交领先远端。
- **下一步判断**：先把当前 UI/SDK worktree 按 TuffEx、Nexus、CoreApp renderer、`intelligence-uikit` 四批收口并补验证，再回到 File write/store boundary 和 Windows 真机 evidence。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.6 / 10 | `base.css`、TuffEx 子路径、safe Markdown、preload DOM 构建、UI preference facade 与首批语义控件方向正确；但 dialog / highlight / Widget runtime 仍有可信 HTML、`new Function` 与旧 base 组件长尾。 |
| Nexus 文档与生态站 | 8.1 / 10 | Dashboard/docs/store/auth 页面持续迁向 TuffEx，已有 30/30 visual smoke 历史 evidence；但 content docs 仍残留旧 `@talex-touch/tuffex/style.css` 示例，SSR/build 仍需复跑。 |
| TuffEx 组件体系 | 8.3 / 10 | 组件子路径 exports、107 个局部 `style.css`、`base.css`、on-demand style plugin、组件 helper 拆分和 audit 脚本明显提升边界质量；仍缺当前环境下的完整 build/audit/type evidence。 |
| `intelligence-uikit` | 7.4 / 10 | 已改为 `base.css` + chat/markdown/icon 等局部样式，playground mock 不构成生产占位；仍需要 package typecheck 与消费侧样式完整性 evidence。 |
| 官方/示例插件 UI | 6.7 / 10 | 旧 snippets 已 hidden/deprecated/replacedBy，不再是用户可见能力；`touch-image` / `touch-music` 仍有模板 SVG、局部 localStorage 和示例观感长尾，适合作为 P2 polish。 |
| 架构健壮性 | 8.0 / 10 | Search/Indexing SDK 主线目前没有新增脏改动，计划顺序合理；短板是当前 UI/SDK dirty 范围过大、验证环境不合规、Windows/macOS 真机 evidence 仍未闭环。 |

## 本轮代码证据

### 1. 当前风险来自 dirty worktree，不是本地分支 ahead

证据：

- 当前分支为 `master`。
- `git rev-list --count --left-right origin/master...HEAD` 返回 `0 0`。
- 当前工作区有 304 个 tracked 改动文件、23 个 untracked 文件。
- `git diff --stat` 仍显示约 300 个文件改动，主要集中在 `packages/tuffex`、CoreApp renderer、Nexus app、`intelligence-uikit`、`packages/utils` 与 plan-prd 文档。

判断：

- 入口文档里“本地 `master` 领先 `origin/master` 56 个提交”的旧口径应更新。
- 继续坚持 related-only 分批是必要的。当前最不优雅的风险是把 TuffEx/Nexus/CoreApp/AI UI 和后续 FileProvider 写入边界混成一个不可审阅的大切片。

### 2. Markdown / preload / cloud preset 高信号项已进入实现切片

证据：

- `packages/utils/renderer/shared/markdown-sanitizer.ts` 新增 `renderMarkdownToSafeHtml()`，会移除 `script/style`、事件属性和危险 `href/src` 协议。
- `SharedPluginDetailReadme.vue` 默认使用 safe Markdown renderer。
- `UpdatePromptDialog.vue` 的 release notes 已使用 `renderMarkdownToSafeHtml()` 后再 `v-html`。
- `apps/core-app/src/preload/index.ts` 的 loading overlay 和 debug log panel 已使用 `createElement` / `textContent`，不再用静态 `innerHTML` 组装。
- `PresetCloudUnavailableService` 现在 fail-closed，`getStatus()` 返回 `available: false` 与 `reason: "not-shipped"`，旧 `PresetCloudServicePlaceholder` 仅保留 deprecated alias。

判断：

- 这些项已经从“待治理”变成“已落地但待验证”的状态。
- 仍需补 Node 22 / pnpm 环境下 focused tests。当前 Codex shell 只有 Node `v24.14.0`，且 `pnpm` / `corepack` 不在 `PATH`，不能把 Vitest/audit 写成已通过。

### 3. TuffEx 按需入口方向正确，但 Nexus content docs 仍有旧示例

证据：

- `packages/tuffex/package.json` 已暴露 `./base.css`、`./*/style.css` 与组件子路径 export。
- `packages/tuffex/dist/es/base.css` 为 9554 bytes，`components.css` 为 313566 bytes；`dist/es` 下已有 107 个组件 `style.css`。
- CoreApp 生产构建接入 `tuffexOnDemandStylePlugin({ enabled: isProduction })`。
- Nexus 在 workspace source 模式下 alias `base.css` 与 `*/style.css`，在 package 模式下启用 on-demand style plugin。
- `packages/intelligence-uikit/src/style/index.scss` 已改成 `base.css` + 具体组件局部样式。
- `packages/tuffex/README.md` 与 `README_ZHCN.md` 已把推荐用法改成 subpath + `base.css`，并把 `style.css` 降级为 legacy full-style。
- `apps/nexus/content/docs/dev/tools/tuffex.en.mdc` 与 `tuffex.zh.mdc` 仍残留旧 `@talex-touch/tuffex/style.css` 示例。

判断：

- 包内 README 已修正，但公开 Nexus docs 还会误导新消费者继续导入全量样式。
- 下一步应把 Nexus content docs 同步为 `base.css` + 子路径 import，并明确 `style.css` 只用于迁移期兼容。

### 4. 未发现新增 `window.$t` / `$i18n` 直接访问，但 HTML 边界仍需分层治理

证据：

- 本轮扫描未发现 `window.$t` / `window.$i18n` 直接访问。
- 剩余 `v-html` 主要分为三类：已 sanitize Markdown、可信 dialog message HTML、搜索高亮 / AI answer / docs code rendering。
- `packages/tuffex/packages/components/src/markdown-view/src/TxMarkdownView.vue` 使用 `safeHtml`。
- CoreApp `WidgetFrame.vue` 清空 `shadowRoot.innerHTML = ''` 属于清理容器，不是渲染用户 HTML。
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 仍有 `new Function`，属于 Widget runtime sandbox / 动态执行治理长尾，不是本轮新增假实现。

判断：

- 当前不应把所有 `v-html` 一刀切删除，应按来源分级：sanitized Markdown、可信内部 HTML、转义高亮 HTML、动态 Widget runtime。
- 高架构健壮性的下一步是给 `v-html` 建立明确 wrapper / sanitizer / trusted 类型边界，而不是在业务组件里散落约定。

### 5. 占位、假的、不优雅代码分层

不构成生产假实现：

- UI input `placeholder`。
- Vitest `vi.mock`、stub、dummy query。
- `packages/intelligence-uikit/src/playground` 的 mockup。
- `touch-text-snippets` / `touch-code-snippets`：已 `hidden: true`、`deprecated: true`、`replacedBy: "touch-snippets"`，并且 index 只记录 retired 信息。
- `PresetCloudServicePlaceholder`：deprecated alias，真实服务 fail-closed unavailable。

仍需治理但不是 P0：

- Nexus content docs 旧 TuffEx `style.css` 示例。
- CoreApp / TuffEx dialog message HTML 的 trusted boundary 需要继续收敛。
- `TxGroupBlock` 组件内部 `localStorage` persistence 与 CoreApp UI preference facade 口径需要长期统一。
- `touch-image` / `touch-music` 仍保留 Vue/Vite 模板 SVG，影响示例插件观感。
- Widget runtime `new Function` 需要继续纳入 Runtime Safety / sandbox evidence，不应被误标为 PreviewSDK 假实现。

## 下一步建议

1. **恢复验证环境**：使用 Volta Node `22.16.0` + `pnpm@10.32.1`，先跑 `pnpm -C "packages/tuffex" run build`、`audit:exports`、`audit:size`、`audit:types`。
2. **收 TuffEx 包内切片**：只提交 exports、局部 style、on-demand plugin、组件 helper 与 audit 脚本，附 build/audit 证据。
3. **收 Nexus 切片**：同步 Nexus content docs 旧 `style.css` 示例，跑 `pnpm -C "apps/nexus" run build` 与必要的 `visual:smoke:tuffex`。
4. **收 CoreApp renderer/i18n/UI 切片**：跑 `pnpm -C "apps/core-app" run typecheck:web`，继续确认无 `window.$t` / `$i18n` 回潮。
5. **收 `intelligence-uikit` 切片**：跑 package `typecheck`，确认 AI UI 子路径样式与类型完整。
6. **再回 P1-APP-DATA**：File write/store boundary、Browser Bookmarks 官方插件 lifecycle、Everything Windows evidence、Quicklinks feed/UI evidence 依次推进。
7. **建立 HTML trusted boundary 小规范**：先从 dialog / highlighted HTML / Markdown 三类抽薄 wrapper，避免每个组件各自解释 `v-html` 安全性。

## 验证

- 已执行静态扫描：placeholder / fake / mock / `v-html` / `innerHTML` / `localStorage` / `new Function` / `window.$t` / `window.$i18n`。
- 已确认当前 shell：Node `v24.14.0`，`pnpm` / `corepack` 不在 `PATH`。
- 未执行 `pnpm` build/audit/typecheck/test；这些必须在仓库标准环境补跑。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES` 与 `docs/INDEX.md`。本轮只修改文档口径和审计报告，不改变运行时代码、目标范围或质量门禁，因此不更新 Roadmap 与 Quality Baseline。
