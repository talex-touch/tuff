# MCP 独立成页（侧栏技能下方）

父任务：`.trellis/tasks/10-03-intelligence-settings-revamp`（需求来源：图 1）。调研：`research/mcp-page.md`（行号以 2026-10-03 工作区为准）。

## Goal

「MCP 服务器」和「本机 MCP 服务」两组从智能页挪到一个独立页面。侧栏入口叫「MCP」，排在「塔芙智能」组里「技能」（现在叫「能力」）的正下方。

## 现状

- 两组都在 `renderer/src/views/base/settings/SettingSkillsMcp.vue`（1393 行），渲染顺序依次是：
  - MCP 服务器（798–911）
  - 本机 MCP 服务（919–1050）
  - 技能（1057–1101）
  - 本地技能目录（1108–1155）
  - 新建/编辑对话框在 1157–1279。
- 这个组件唯一的使用方是 `SettingIntelligencePage.vue:12,32`。
- 「本机 MCP 服务」（606–770）自成一体：只用 `useMcpHostSdk`，不读另外几组的任何状态，样式也独立（`.SettingsMcpHost-*`）。
- MCP 服务器和技能之间有共享，拆分时必须分开（research §1.5）：
  - 共用一次 `orchestratorGetSnapshot`（`loadItems` 355–368）、`setItemActive`、`showStateRow`。
  - 共用骨架闸门 `hasLoaded`/`showSkeleton`（315–316），四组都受它控制。
  - 快照读取失败时，错误行占的是 MCP 组的位置（787–795）。
  - 技能组的「重新扫描」会顺带刷新 MCP 发现（602–604）。
  - 骨架 `skeletonGroups`（323–327）漏了「本机 MCP 服务」组，不符合 `spec/frontend/component-guidelines.md` 里「骨架镜像加载后版式」的硬规则。
- 侧栏、路由、目的地：
  - 侧栏项由 `modules/settings/categories.ts` 的 `intelligence.children` 里带 `navIcon` 的项依次提升而来，顺序就是数组顺序（246–277）。
  - 路由由 `base/router.ts` 的 `childLoaders`（99–128）生成，缺项会在模块求值时抛错（149–152）。
  - 没有任何链接、锚点或滚动专门指向 MCP 区块（research §3），入口都只指向智能页整体，搬走后不用改写。

## Requirements

- **M1 新子页**：`intelligence.children` 里、`capabilities` 之后加一项：
  - `key: 'mcp'`，`path: '/setting/intelligence/mcp'`，`navIcon` 为 MCP 图标（见 M6）。
  - `labelKey` 用 `settingsIntelligenceHub.mcp`（中文「MCP」，en「MCP」），`descriptionKey` 用 `settingsIntelligenceHub.mcpDesc`。
  - `router.ts` 的 `childLoaders` 登记 `'intelligence/mcp'`，路由名 `$I18n:router.intelligenceMcp`，两种语言都补上 `router.intelligenceMcp`。
  - 页面 `renderer/src/views/base/intelligence/IntelligenceMcpPage.vue`，用带标题的 column 布局，和智能页一致。
- **M2 侧栏顺序**：普通模式下为 智能 / 模型渠道 / 语音输入 / 技能 / MCP；开发者模式下 beta 项照旧插在「语音输入」之后，MCP 仍然紧跟「技能」。另一个会话的任务树 `10-03-intelligence-audit-rebuild` 的 D5 要在 MCP 之后加「记忆」。它若先落地，MCP 就插在它前面，最终顺序是「…技能 / MCP / 记忆」。
- **M3 拆组件**：
  - 「MCP 服务器」组连同新建/编辑对话框，拆成独立的设置分块组件。
  - 「本机 MCP 服务」组拆成另一个设置分块组件。
  - 两者放在 `renderer/src/views/base/settings/`，沿用 `SettingLocalAiCli.vue` 的先例。不能放进 `views/base/intelligence/` 或 `views/base/settings/categories/` 根目录，否则 smoke glob 会失败；也不放进 `components/**`，那里会被自动注册并改写别人正在改的 `components.d.ts`。
  - 新页按「MCP 服务器 → 本机 MCP 服务」的顺序渲染。
  - 智能页不再出现这两组。技能和本地技能目录暂留在原组件里，由 `10-03-skills-page-revamp` 接走。
- **M4 各管各的加载、错误和骨架**：
  - MCP 页自己读快照，只取 `kind === 'mcp'` 的条目；读取失败的错误行留在 MCP 服务器组内。
  - 骨架同时镜像「MCP 服务器」和「本机 MCP 服务」两组，复用 `SettingSkeleton` 和 `useDeferredLoading`。
  - 技能侧的「重新扫描」不再触发 MCP 发现；MCP 组自己的「重新扫描」保持现状。
- **M5 安全契约原样迁移**（`spec/main-process/agent-tool-gateway-contracts.md` 147–242）：
  - 令牌在行内和配置片段里都掩码，复制拿到的是真值，重置后重新掩码。
  - 读取失败时不能显示成「未开启」。
  - 导入含敏感值的配置前要先确认。
- **M6 图标**：用 `i-ri-plug-line`，与 `views/base/home/preview/HomePreviewSources.vue:23` 的 MCP 图标一致。它必须保证能被 UnoCSS 生成：在 `uno.config.ts` 的 safelist 里显式登记，不依赖别的 `.vue` 碰巧出现同名类。
- **M7 测试与 spec 跟着迁移**：
  - `SettingSkillsMcp.mount.test.ts` / `SettingSkillsMcp.host.test.ts` 按新组件拆分迁移。host.test 365–389 的同页邻居对照改为在 MCP 页内对照 MCP 服务器行。
  - `SettingIntelligencePage.test.ts` 的 mock 同步更新。
  - `agent-tool-gateway-contracts.md:238` 点名的测试文件路径同步更新（Phase 3 spec 更新）。

## Acceptance Criteria

- [ ] 真实应用：侧栏「技能」正下方出现「MCP」，图标可见；点进去依次是「MCP 服务器」和「本机 MCP 服务」两组，功能与搬迁前一致：
  - 启用、探测、编辑、手动添加、重新扫描；
  - 开关「让其他 AI 调用 Tuff」、复制地址、改端口、显示/重置令牌、逐个工具开关。
- [ ] 真实应用：智能页不再有这两组；首次加载时 MCP 页的骨架是两组，形状与加载后一致。
- [ ] `categories.smoke.test.ts`、迁移后的 MCP 与 host 测试、`SettingIntelligencePage.test.ts` 通过；core-app `typecheck:web` 通过；改动文件 lint delta 为 0。

## Out of Scope

- 让 CoreBox 搜「MCP」能命中这个设置页（需要新增 `settings-mcp` 目的地，research §4）。这次不做，作为后续可选项。
- KeepAlive 缓存期内回访不刷新（research §2.6）。这是现状，和智能页一样，这次不改。
- 发现结果的命名和覆盖缺口（「config MCP」、omp 的 `mcp.json`）由 `10-03-local-agent-detection` 负责。

## Dependencies

- 和 `10-03-skills-page-revamp` 都要拆 `SettingSkillsMcp.vue`，也都要改 `settingsIntelligenceHub` 文案块。**本任务先做**，技能页任务以本任务拆完后剩下的技能部分为基线。
