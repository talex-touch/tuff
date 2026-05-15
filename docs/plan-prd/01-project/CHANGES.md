# 变更日志

> 更新时间：2026-05-14
> 说明：主文件只保留近 30 天重点索引与后续新增变更；压缩前完整快照见 `./archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`。更早历史继续按月归档在 `./archive/changes/`。

## 历史归档

- [压缩前完整快照（截至 2026-05-14）](./archive/changes/CHANGES-pre-doc-compression-2026-05-14.md)
- [2026-03 历史归档](./archive/changes/CHANGES-2026-03.md)
- [2026-02 历史归档](./archive/changes/CHANGES-2026-02.md)
- [2025-11 历史归档](./archive/changes/CHANGES-2025-11.md)
- [Legacy full snapshot](./archive/changes/CHANGES-legacy-full-2026-03-16.md)

## 2026-05-15

### fix(core-app): refine Intelligence channel management

- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceProviderHeader.vue`
- `apps/core-app/src/renderer/src/components/intelligence/layout/IntelligenceInfo.vue`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceChannelsPage.vue`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
  - Nexus 官方通道使用 Tuff Logo，隐藏官方通道 API/模型/速率限制编辑，仅保留优先级设置。
  - 右上操作菜单补充复制 ID、复制渠道、修改基本信息，并禁止删除官方通道。
  - 修复浏览器登录回调后渲染端账户状态未及时刷新；登录凭证保护默认开启且仅在高级设置中提供关闭入口。
  - 智能首页移除 AI 积分区块，能力配置商统计摘要调整为“已绑定：x/y”格式。

### docs: align FileProvider quality status

- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 将 FileProvider 口径从 `0 字节/typecheck:node 失败` 更新为已恢复完整 `fileProvider` 导出且 CoreApp `typecheck:node` 已通过。
  - 保留 `quality:release` 受既有 CoreApp lint debt 阻断、需记录最近路径替代验证的质量约束。

## 2026-05-14

### feat(nexus): streamline admin management surfaces

- `apps/nexus/app/pages/dashboard/admin/users.vue`
- `apps/nexus/server/api/admin/users/[id]/profile.patch.ts`
- `apps/nexus/app/components/dashboard/DashboardNav.vue`
- `apps/nexus/app/components/dashboard/admin/AccountTabs.vue`
- `apps/nexus/app/components/dashboard/admin/CommentTabs.vue`
- `apps/nexus/app/pages/dashboard/admin/subscriptions.vue`
- `apps/nexus/app/pages/dashboard/admin/reviews.vue`
- `apps/nexus/app/pages/dashboard/admin/doc-comments.vue`
- `apps/nexus/app/pages/dashboard/admin/intelligence.vue`
- `apps/nexus/i18n/locales/zh.ts`
- `apps/nexus/i18n/locales/en.ts`
  - Nexus 管理员导航收敛：Intelligence Lab 与 AI 积分并入 Intelligence 分组入口，用户管理/订阅管理合并为账号管理 tabs，评论审核/文档评论合并为评论管理 tabs。
  - 用户管理表格压缩为用户、权限状态、创建时间、编辑操作，避免长邮箱撑宽；行内权限/状态操作统一收进编辑 Drawer。
  - 新增管理员用户资料编辑接口，Drawer 可编辑显示名、头像、语言、角色、状态，并可直接授予/续期订阅。

### fix(ai): align tuff-intelligence transport events with TuffTransport

- `packages/tuff-intelligence/src/transport/event/builder.ts`
- `packages/tuff-intelligence/src/transport/types.ts`
- `packages/tuff-intelligence/src/transport/event/builder.test.ts`
- `packages/utils/transport/sdk/renderer-transport.ts`
  - 修复 OmniPanel 调用 AI client 时，`@talex-touch/tuff-intelligence` 自有 event builder 只生成 `{ toEventName }`、缺少 `__brand: 'TuffEvent'` 等运行时字段，导致 `TuffRendererTransport.send` 拒绝 `intelligence:api:invoke` 的问题。
  - Renderer transport 在非法 event 场景新增结构化诊断输出，包含 event 摘要、候选 eventName、payload/options 摘要与调用栈，便于后续定位 SDK/事件对象不兼容。

### feat(nexus): allow guarded CLI cross-IP authorization

- `apps/nexus/server/utils/authStore.ts`
- `apps/nexus/server/api/dashboard/security-settings.get.ts`
- `apps/nexus/server/api/dashboard/security-settings.patch.ts`
- `apps/nexus/server/api/app-auth/device/info.get.ts`
- `apps/nexus/server/api/app-auth/device/approve.post.ts`
- `apps/nexus/app/pages/dashboard/privacy.vue`
- `apps/nexus/app/pages/device-auth.vue`
- `apps/nexus/i18n/locales/en.ts`
- `apps/nexus/i18n/locales/zh.ts`
  - 新增账号级安全设置 `allowCliIpMismatch`，默认关闭；Dashboard 隐私/安全设置页提供“允许 CLI 跨 IP 授权”开关，开启前二次确认并明确警告不可随意开启。
  - CLI 设备授权在请求 IP 与浏览器确认 IP 不一致时，默认仍拒绝；仅当当前账号开启该设置且请求来源为 `clientType=cli` 时放行，并在授权页展示高风险警告。
  - App / External 授权不受该开关影响，仍保持 IP 不一致拒绝策略。
  - 验证：`pnpm -C "apps/nexus" run typecheck` 通过（仅保留既有 Nuxt 自动导入重复 warning）。

### fix(nexus): harden docs props table prerender

- `apps/nexus/app/components/content/TuffPropsTable.vue`
- `docs/plan-prd/01-project/CHANGES.md`
  - `TuffPropsTable` 不再假设 `type/default` 一定是字符串，复制与可复制判定前会统一归一化 boolean/number/string，避免 docs prerender 在 `/docs/dev/components/floating` 遇到 boolean default 时因 `.trim()` 崩溃。
  - 目标是恢复 Cloudflare Pages / Nexus build；不改变文档表格数据结构与展示入口。

### fix(intelligence): address tool and handoff review feedback

- `apps/core-app/src/main/modules/ai/agents/tool-registry.ts`
- `packages/tuff-intelligence/src/tools/*`
- `packages/tuff-intelligence/src/registry/skill-registry.ts`
- `plugins/touch-intelligence/index.js`
- `apps/nexus/server/api/docs/sidebar-components.get.ts`
  - CoreApp Tuff tool bridge 改为通过 `ToolKit` 执行，保留 Zod 输入校验与 approval gate；ToolKit 注册重复 id 会拒绝覆盖，approval gate 异常会返回结构化 tool error，capability bridge 不再默认绕过高风险工具审批。
  - SkillRegistry 移除长 query 包含短 candidate 的过宽匹配；`touch-intelligence` handoff session id 加入 sha256 短摘要避免 slug 碰撞，并优先采用更长远端 handoff 历史。
  - Nexus docs sidebar cached handler 移除冗余 `cache-control` 手写 header，继续由 Nitro cache options 生成。

### perf(nexus): prerender docs routes and smooth docs switching

- `apps/nexus/nuxt.config.ts`
- `apps/nexus/build/docs-prerender-routes.ts`
- `apps/nexus/build/docs-prerender-routes.test.ts`
- `apps/nexus/server/api/docs/sidebar-components.get.ts`
- `apps/nexus/app/components/DocsSidebar.vue`
- `apps/nexus/app/pages/docs/[...slug].vue`
- `apps/nexus/vitest.config.ts`
  - Nexus 构建期扫描 `content/docs/**/*.{md,mdc}` 生成 canonical `/docs/**` 预渲染路由，并将稳定 docs API 纳入 prerender 列表。
  - Docs Sidebar 与 pager 局部启用 NuxtLink prefetch；feedback/comments 延后到内容稳定后客户端挂载，减少切换时重复 DOM 扫描。

### feat(plugin): bridge touch-intelligence to handoff sessions

- `plugins/touch-intelligence/index.js`
- `packages/test/src/plugins/intelligence.test.ts`
- `apps/nexus/content/docs/guide/features/plugins/intelligence.{zh,en}.mdc`
- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
  - `touch-intelligence` 发送 CoreBox AI Ask 前会确保稳定 `corebox_ai_ask_<featureId>` Intelligence Session，并在成功回答后把最近业务消息写入 `context.conversation` 供后续恢复/接续。
  - `text.chat` / `vision.ocr` 调用 metadata 增加 `sessionId`、`handoffSessionId` 与 `handoffSource=corebox.touch-intelligence`，保留原有审计字段。
  - 已验证：`corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"` 通过。

### feat(intelligence): add native tool kit foundation

- `apps/core-app/src/main/modules/ai/agents/tool-registry.ts`
- `apps/core-app/src/main/modules/ai/agents/tool-registry.test.ts`
- `packages/tuff-intelligence/src/adapters/*`
- `packages/tuff-intelligence/src/runtime/decision-dispatcher.ts`
- `packages/tuff-intelligence/src/tools/*`
- `packages/tuff-intelligence/src/registry/*`
- `packages/tuff-intelligence/README.md`
- `packages/tuff-intelligence/package.json`
  - 新增 Tuff-native Tool Kit 基础层，提供 `defineTuffTool()`、`createToolKit()`、工具 manifest/discovery、LangChain/DeepAgents adapter、approval gate 与 SkillRegistry deterministic resolution。
  - 工具输入/输出使用 Zod runtime schema 校验，并统一返回结构化错误码；`CapabilityRegistry.registerTool()` 支持直接注册 Tuff Tool。
  - 修复 DeepAgent Responses 输入中未授权 system message 进入模型上下文的问题，并补 Core App 旧 AgentTool/TuffTool 双向桥接。
  - 已验证：`packages/tuff-intelligence` vitest/lint/build 与 CoreApp tool-registry targeted test 通过。

### feat(ai): charge Nexus invoke credits and surface usage

- `apps/nexus/server/utils/tuffIntelligenceLabService.ts`
- `apps/nexus/server/utils/tuffIntelligenceLabService.invoke.test.ts`
- `apps/nexus/server/api/v1/intelligence/invoke.api.test.ts`
- `apps/core-app/src/renderer/src/modules/nexus/credits-summary*.ts`
- `apps/core-app/src/renderer/src/components/account/CreditsSummaryBlock.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligencePage.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`
  - Nexus `/api/v1/intelligence/invoke` 成功返回模型结果后按 `usage.totalTokens` 扣减 AI credits；provider 调用失败与 `totalTokens <= 0` 不扣 credits。
  - `Team credits exceeded.` / `User credits exceeded.` 映射为 `402 CREDITS_EXCEEDED`，避免落成 500。
  - CoreApp 通过既有登录态代理复用 `/api/credits/summary` 展示个人剩余、已用、总额度与团队池剩余；模型倍率与 dynamic `pricingRef` 留给 Provider Registry Phase 4。

### fix(core-app): restore Windows PowerShell app source scans

- `apps/core-app/src/main/modules/box-tool/addon/apps/win.ts`
- `apps/core-app/src/main/modules/box-tool/addon/apps/win.test.ts`
- `apps/core-app/scripts/windows-capability-evidence.ts`
  - Windows app scanner and capability evidence scripts now pass PowerShell object-literal scripts with newline separators instead of semicolon-joining `[PSCustomObject]@{ ... }`, preventing parser failures that silently dropped `Get-StartApps`, registry, and Start Menu evidence.
  - Real Windows scan smoke now finds Codex as `shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App` with `launchKind=uwp`; `windows:capability:verify --requireTargets --requireUwp --strict` passes for the Codex target, with only the local `es.exe` Everything warning remaining.
  - Added regression coverage so Windows PowerShell scan scripts do not reintroduce the invalid `@{;` form that previously caused Codex/UWP apps to miss the app index.

### fix(core-app): contain prod feature native crash paths

- `apps/core-app/src/main/modules/plugin/runtime/plugin-require.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts`
- `apps/core-app/src/main/modules/system/active-app.ts`
- `apps/core-app/src/main/modules/database/index.ts`
- `packages/utils/plugin/sdk/system.ts`
- `packages/utils/transport/events/types/app.ts`
  - Plugin runtime now denies direct `electron`, `.node`, `@libsql/*`, `@crosscopy/clipboard`, and `extract-file-icon` imports with `PLUGIN_RUNTIME_DENIED_MODULE`, keeping failures scoped to the plugin/feature.
  - Plugin `dialog`, `openUrl`, and `clipboard` globals remain compatible but now go through narrow main-process wrappers instead of exposing raw Electron objects.
  - `system.getActiveApp` adds `includeIcon`; plugin transport and main channel default it to `false`, so `app.getFileIcon` only runs for explicit icon requests.
  - WAL checkpoint now runs through DB maintenance scheduling and skips when the DB write queue or search-index worker is busy, logging `DB_WAL_CHECKPOINT_SKIPPED_BUSY`.
  - Feature execution, widget registration, plugin lifecycle, and WAL checkpoint paths emit lightweight breadcrumbs without query text, clipboard text, or full file paths.

### ci(quality): scope PR lint to changed files

- `package.json`
- `scripts/run-eslint-changed.mjs`
- `.github/workflows/ci.yml`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - `quality:pr` 的 lint 阶段从全仓 `pnpm lint` 调整为 `pnpm lint:changed`，PR CI 中按 base 分支三点 diff 仅 lint PR 修改过的 JS/TS/Vue 文件。
  - PR Quality checkout 改为 `fetch-depth: 0`，避免 shallow checkout 下 changed-file lint 找不到 merge base。
  - `quality:release` 仍保留全仓 lint，不降低正式 release gate。

### feat(ai): add translation TTS beta path

- `apps/core-app/src/main/modules/ai/intelligence-tts-service.ts`
- `packages/utils/plugin/sdk/intelligence.ts`
- `packages/tuff-intelligence/src/types/intelligence.ts`
- `plugins/touch-translation/widgets/translate-panel.vue`
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
  - `audio.tts` 进入 2.5.0 Beta 调用链，新增 typed `ttsSpeak` API，统一封装 TTS invoke、data URL 归一与进程内短期缓存。
  - `touch-translation` 翻译结果新增朗读入口，通过 Intelligence SDK 调用 TTS，保留 trace metadata，插件侧不接触 provider secret。
  - Stable 范围仍只承诺文本 + OCR，TTS 不升级为 2.5.0 Stable blocker。

### docs: refresh compatibility and placeholder follow-up

- `docs/plan-prd/report/cross-platform-compat-placeholder-followup-2026-05-14.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
  - 新增 2026-05-14 跟进报告，记录 `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 0 字节导致 `typecheck:node` 失败，并将其提升为当前 `2.4.10` 质量 blocker。
  - 更新 CLI/plugin secret 口径：CLI token 已有 POSIX `0700/0600` 权限缓解与 Windows ACL warning，`touch-translation` provider secret 已迁入 `usePluginSecret()`；OS 级 credential backend、secure-store degraded health 与遗留 secret 清理 evidence 仍待闭环。
  - 验证：`pnpm -C "apps/core-app" run typecheck:node` 失败，错误均指向 `file-provider.ts is not a module`；未恢复该文件，避免覆盖并行/既有工作区改动。

### fix(core-app): restore file provider compile boundary

- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `docs/plan-prd/TODO.md`
  - 按确认恢复 `file-provider.ts` 到完整 `fileProvider` 导出，解除主进程编译边界的 0 字节阻断。
  - 验证：`pnpm -C "apps/core-app" run typecheck:node` 通过。
  - Windows 真机 evidence、Nexus Release Evidence 与发版前完整质量复核仍按 TODO 保持未处理。

### refactor(transport): continue corebox retained alias migration

- `packages/utils/transport/events/core-box-retained.ts`
- `packages/utils/transport/events/index.ts`
- `packages/utils/__tests__/transport-domain-sdks.test.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/key-transport.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/window.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/meta-overlay.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/index.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/renderer/src/components/render/CoreBoxRender.vue`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useChannel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/usePreviewHistory.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useVisibility.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/views/base/begin/internal/Done.vue`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `packages/utils/plugin/sdk/quick-actions-sdk.ts`
- `docs/plan-prd/TODO.md`
  - CoreBox UI control、UI state/input visibility、beginner shortcut、input focus、ui resume、forward key event、input command、input visibility/value request、input monitoring、clipboard allow、provider management、recommendation、preview history/copy、action panel、MetaOverlay bridge、layout control 与 uiMode enter/exit 小组继续迁入 retained alias registry：`CoreBoxEvents.beginner.*` / `CoreBoxEvents.ui.*` / `CoreBoxEvents.input.*` / `CoreBoxEvents.inputMonitoring.*` / `CoreBoxEvents.clipboard.allow` / `CoreBoxEvents.provider.*` / `CoreBoxEvents.recommendation.*` / `CoreBoxEvents.previewHistory.*` / `CoreBoxEvents.preview.*` / `CoreBoxEvents.actionPanel.*` / `CoreBoxEvents.metaOverlay.*` / `CoreBoxEvents.layout.*` / `CoreBoxEvents.uiMode.*` 默认暴露 canonical `core-box:*:*` typed events。
  - 保留旧 `core-box:*` / `corebox:*` / `meta-overlay:*` / `beginner:shortcut-triggered` wire names 作为 `CoreBoxRetainedEvents.legacy.*` aliases；main IPC/key transport/search recommendation/MetaOverlay bridge/beginner shortcut/input focus/ui resume 双监听或双发，shortcut trigger 与 UI mode exit push 在兼容窗口内双发，renderer 保留 legacy push 双监听。
  - QuickActions/MetaSDK action execute 监听改为 canonical + legacy 双监听，并增加短窗口去重，避免 main 双发期间插件 action 回调重复触发。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-sdk-lifecycle.test.ts" "__tests__/transport-domain-sdks.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过；`pnpm -C "apps/core-app" run typecheck:web` 通过（仍输出既有 Tuffex `TouchScroll` dts/Sass/Browserslist 噪声）；`git diff --check` 通过。

### feat(plugin): expose plugin secret storage health

- `packages/utils/transport/events/index.ts`
- `packages/utils/transport/events/types/plugin.ts`
- `packages/utils/plugin/sdk/secret.ts`
- `packages/utils/plugin/sdk/types.ts`
- `packages/utils/__tests__/plugin-storage-sdk.test.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/main/modules/plugin/plugin.ts`
- `apps/core-app/src/main/modules/plugin/plugin.test.ts`
- `docs/plan-prd/TODO.md`
  - 新增只读 `PluginEvents.storage.getSecretHealth`，复用已有 `SecureStoreHealthResponse`，让插件 secret SDK 可查询当前 secure-store backend、available/degraded 与 reason。
  - `usePluginSecret().health()` 与 prelude 注入的 `plugin.secret.health()` 均走 typed event；主进程 handler 只返回 `getSecureStoreHealth()`，不读取或写入任何 secret 值。
  - 为后续插件配置页展示 secret storage degraded/unavailable reason 提供 SDK 入口；OS Keychain/Credential Locker/libsecret backend 与遗留 secret 清理 evidence 仍待闭环。
  - 验证：`pnpm -C "packages/utils" exec vitest run "__tests__/plugin-storage-sdk.test.ts" "__tests__/transport-domain-sdks.test.ts" "__tests__/transport-event-boundary.test.ts"` 通过；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/plugin/plugin.test.ts"` 通过。

### feat(plugin): surface translation provider secret health

- `plugins/touch-translation/src/components/ProviderConfigModal.vue`
- `plugins/touch-translation/src/composables/useTranslationProvider.ts`
- `docs/plan-prd/TODO.md`
  - 将翻译插件 provider secret 字段清单导出为配置页与持久化逻辑共用的单一来源，避免重复维护哪些 provider 需要密钥保护。
  - 配置弹窗在 Deepl、Bing、Custom、Baidu、Tencent 等含 secret 字段的 provider 上展示 `usePluginSecret().health()` 查询结果，区分 secure-store available、local-secret degraded 与 unavailable/reason。
  - 不读取或展示任何 secret 值；仅提示保存密钥前的本地保护后端状态。OS Keychain/Credential Locker/libsecret backend 与遗留 secret 清理 evidence 仍待闭环。

### docs: compress planning entry documents

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
- `docs/plan-prd/README.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md`
- `docs/plan-prd/01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`
  - 将主 TODO 压缩为 2 周执行清单，仅保留 P0/P1/P2 当前任务、验收证据与文档同步规则。
  - 长期事项下沉到 `TODO-BACKLOG-LONG-TERM.md`；压缩前 TODO 完整内容保留为 archive 快照。
  - 将 PRD README 与全局 INDEX 改为轻量入口，移除长历史叙事，保留当前基线、主线、阻塞项与高价值专题导航。
  - 将 CHANGES 主文件压缩为近 30 天索引 + 归档入口；压缩前完整 CHANGES 保留为 archive 快照，避免历史信息丢失。

### docs: compress roadmap quality and engineering entries

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/engineering/README.md`
- `docs/engineering/ARCHIVE.md`
- `docs/plan-prd/docs/archive/PRD-QUALITY-BASELINE-pre-compression-2026-05-14.md`
- `docs/plan-prd/01-project/archive/PRODUCT-OVERVIEW-ROADMAP-2026Q1-pre-compression-2026-05-14.md`
- `docs/engineering/archive/README-pre-compression-2026-05-14.md`
- `docs/engineering/archive/ARCHIVE-pre-compression-2026-05-14.md`
  - 将质量基线压缩为活跃 PRD 的最小强规则，保留 Windows evidence、Storage/Secret、typed transport、平台真实能力与文档同步门禁。
  - 将产品总览路线图压缩为产品定义、North Star、2.4.10/2.4.11/2.5.0 版本路线与当前状态快照。
  - 将工程文档入口与工程归档改为轻量索引，不再复制长报告正文；压缩前版本保留在 `docs/engineering/archive/`。

### docs: compress deep-dive and historical engineering reports

- `docs/engineering/electron-event-loop-perf-optimization.md`
- `docs/plan-prd/05-archive/TUFF-TRANSPORT-PRD.md`
- `docs/plan-prd/03-features/search/quick-launch-and-search-optimization-prd.deep-dive-2026-03.md`
- `docs/plan-prd/02-architecture/telemetry-error-reporting-system-prd.deep-dive-2026-03.md`
- `docs/plan-prd/docs/DIVISION_BOX_GUIDE.deep-dive-2026-03.md`
- `docs/clipboard-mechanism-analysis.md`
  - 将历史 deep-dive 与工程分析文档压缩为 `TL;DR + 当前口径 + 完整快照链接`。
  - 完整原文分别保留到对应 `archive/` 或 `full/` 快照文件，避免信息丢失。
  - 当前 release / quality 判定统一指向 `TODO`、`Quality Baseline`、现行压缩版 PRD 与 Release Evidence。

### docs: compress transport ai permission and inventory docs

- `docs/plan-prd/03-features/tuff-transport/IMPLEMENTATION-GUIDE.deep-dive-2026-03.md`
- `docs/plan-prd/03-features/tuff-transport/API-REFERENCE.deep-dive-2026-03.md`
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
- `docs/plan-prd/05-archive/permission-center-prd.md`
- `docs/engineering/typecheck/TYPECHECK_FIXES.md`
- `docs/plan-prd/ISSUES.md`
- `docs/engineering/reports/md-inventory.md`
  - 将 Transport deep-dive、AI 2.5.0 PRD、权限中心历史 PRD、typecheck 修复记录、i18n issues 与 Markdown inventory 压缩为当前口径索引。
  - 完整原文分别保留到对应 `archive/` 或 `full/` 快照文件。
  - 当前执行状态统一指向 `TODO`、`Quality Baseline`、`Roadmap` 与实际 CI/typecheck 结果。

### docs: compress provider scene search performance and sdk reports

- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/docs/DIVISION_BOX_API.deep-dive-2026-03.md`
- `docs/plan-prd/02-architecture/intelligence-agents-system-prd.deep-dive-2026-03.md`
- `docs/plan-prd/05-archive/direct-preview-calculation-prd.md`
- `docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.deep-dive-2026-03.md`
- `docs/plan-prd/03-features/SEARCH-REFACTOR-PRD.md`
- `docs/plan-prd/04-implementation/PerformanceLag260111.md`
- `docs/engineering/reports/sdk-unification-progress-2026-02-08.md`
  - 将 Nexus Provider/Scene 活跃 PRD 压缩为目标、原则、已落地、未闭环、验收清单与当前入口。
  - 将 DivisionBox API、Intelligence Agents、Direct Preview、Everything/Search、Performance Lag 与 SDK unification 报告压缩为历史索引。
  - 完整原文保留到对应 `archive/` 或 `full/` 快照文件。

### docs: compress storage sync everything flow widget and analytics docs

- `docs/engineering/plans/2026-02-01_00-09-19-nexus-user-data-sync-auth.md`
- `docs/everything-integration.md`
- `docs/plan-prd/04-implementation/config-storage-unification.md`
- `docs/plan-prd/03-features/flow-transfer-prd.md`
- `docs/plan-prd/03-features/flow-transfer-detailed-prd.md`
- `docs/plan-prd/docs/DIVISION_BOX_MANIFEST.deep-dive-2026-03.md`
- `docs/plan-prd/04-implementation/CoreAppRefactor260111.md`
- `docs/plan-prd/05-archive/plugin-store-provider-frontend-plan.md`
- `docs/plan-prd/05-archive/widget-dynamic-loading-plan.md`
- `docs/analytics-data-prd.md`
  - 将同步/存储、Everything、Flow Transfer、DivisionBox Manifest、CoreApp 重构、插件市场、Widget 与 analytics 文档压缩为当前口径索引。
  - 完整原文保留到对应 archive/full 快照文件。
  - 当前权威口径统一指向 TODO、Quality Baseline、Roadmap 与现行专题入口。

### docs: compress clipboard automation recommendation and view docs

- `docs/plan-prd/03-features/corebox-clipboard-transport-migration.md`
- `docs/plan-prd/docs/github-automation.zh-CN.md`
- `docs/plan-prd/05-archive/intelligent-recommendation-system-prd.md`
- `docs/plan-prd/05-archive/NEXUS-TEAM-INVITE-PRD.md`
- `docs/plan-prd/05-archive/PROJECT_DOCS_INDEX.md`
- `docs/engineering/notes/notification-sdk.md`
- `docs/engineering/base-surface-refraction-advanced-rendering.md`
- `docs/engineering/reports/overall-code-optimization-2026-04-17.md`
- `docs/plan-prd/03-features/view/view-mode-prd.md`
  - 将剪贴板 transport、GitHub automation、推荐、Nexus Team Invite、旧索引、通知 SDK、视觉渲染、代码优化报告与 View Mode 文档压缩为当前口径索引。
  - 完整原文保留到对应 archive/full 快照文件。

### docs: compress startup platform build quality ai and capability docs

- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`
- `docs/engineering/plans/2026-01-20_18-55-03-context-requirements.md`
- `docs/plan-prd/02-architecture/platform-capabilities-prd.md`
- `docs/plan-prd/report/cross-platform-compat-placeholder-audit-2026-05-10.md`
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md`
- `docs/plan-prd/03-features/build/build-integrity-verification-prd.md`
- `docs/reports/quality-scan-2026-02-26.md`
- `docs/plan-prd/05-archive/MIGRATION_SUMMARY.md`
- `docs/plan-prd/docs/AISDK_GUIDE.md`
- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md`
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md`
  - 将启动异步化、上下文需求、平台能力、兼容审计、设备风控、构建完整性、质量扫描、迁移摘要、AI SDK、OmniPanel 与 Intelligence 能力路由文档压缩为当前口径索引。
  - 完整原文保留到对应 archive/full 快照文件。

### 近期重点变更索引

以下详细内容可在压缩前完整快照中追溯：

- sanitized telemetry 默认开启与 Sentry/telemetry sanitizer 隐私收口。
- Nexus dashboard asset publishing flows UI/交互 polish。
- Transport retained event alias 迁移：sync、terminal、opener、auth、CoreBox retained aliases 等批次。
- Tuff 2.5.0 Nexus AI invoke 与 OmniPanel Writing Tools MVP。
- CoreApp 启动异步化 P0/P1/P2/P3 切片。
- Windows App 索引、Everything diagnostic evidence、acceptance manifest、manual evidence 与 performance evidence 门禁强化。
- Native transport V1：screenshot、capabilities、file-index、file、media 五域。
- Nexus Provider Registry / Scene run / health & usage ledger / composed capability 最小链路。

## 后续记录格式

新增变更按以下模板追加到本文件顶部对应日期下：

```md
### type(scope): summary

- `changed/file.ts`
- `docs/changed.md`
  - 变更点 1。
  - 变更点 2。
  - 验证：`command` 通过 / 未执行原因。
```
