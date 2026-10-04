# Design — MCP 独立成页

行号引用 `research/mcp-page.md` 与 2026-10-03 工作区。`R/` = `apps/core-app/src/renderer/src/`。

## 边界

- **只动 renderer**：新增页面、拆出两个分块组件、IA 接线、图标 safelist、i18n、测试迁移。
- **不动** 主进程、SDK、transport 和发现数据的形状。发现结果的命名（「config MCP」）和覆盖（omp、pi 的 `mcp.json`）归 `10-03-local-agent-detection`。本任务只按 `candidate.name` 原样渲染，不依赖具体文案。
- 拆出的组件放在 `R/views/base/settings/`，原因：
  - `components/**` 会被自动注册，并改写有他人改动的 `components.d.ts`；
  - `views/base/intelligence/` 和 `views/base/settings/categories/` 根目录会被 smoke glob 扫到。

## 组件拆分

| 文件 | 来源（`SettingSkillsMcp.vue` 行号） | 职责 |
|---|---|---|
| `R/views/base/settings/SettingMcpServers.vue`（新） | 脚本 (a) 部分：48–66、132、136、144、150–160、162–236（MCP 用到的）、293–301、329–347、355–427 中 MCP 相关、505–600。模板 787–911（错误行与 MCP 组）、1157–1279（对话框）。样式 1283–1357 | 「MCP 服务器」组和新建/编辑对话框 |
| `R/views/base/settings/SettingMcpHost.vue`（新） | 脚本 606–770，模板 919–1050，样式 1359–1392 | 「本机 MCP 服务」组 |
| `R/views/base/settings/setting-mcp-display.ts` 与 `.test.ts` | 由 `setting-skills-mcp-display.ts` 和它的测试改名而来，内容不变 | 拆分后只剩 MCP 在用，按归属改名 |
| `R/views/base/settings/setting-ai-import-shared.ts`（新） | 175–191 的 `errorMessage`、`displayName`、`agentLabel`，以及 46 行的 `MAX_VISIBLE_ROWS` | MCP 和技能两边共用的纯函数与常量 |
| `R/views/base/intelligence/IntelligenceMcpPage.vue`（新） | — | 带标题的 column 页面，依次挂 `SettingMcpServers`、`SettingMcpHost` |

**`SettingMcpServers.vue` 的数据加载**

- 自己调一次 `aiClient.orchestratorGetSnapshot()`，只取 `kind === 'mcp'` 的条目。
- 有自己的 `loading` / `loadError` / `hasLoaded`。错误行放在 MCP 组内，不再借用共享的错误行。
- `onMounted` 时依次调用 `loadItems` 和 `refreshDiscovery`。
- `setItemActive`（370–380）复制一份，失败后的重载调本组件自己的 `loadItems`。

**`SettingMcpHost.vue` 的数据加载**

- `onMounted` 调用 `loadMcpHost`。
- 在 `getState` 返回之前显示骨架，骨架的行数与加载后的版式一致：开关行、地址、端口、令牌、工具行、配置块。
- 读取失败时显示原有的失败行（921–931），不显示成「未开启」。
- 不再受 orchestrator 快照的骨架闸门（919）控制。

**`SettingSkillsMcp.vue`**

- 删掉 (a)、(b) 两部分，只剩「技能」和「本地技能目录」。技能页任务会把它们接走，然后删除这个文件。
- 快照失败时，错误行挪进技能组，组名用 `settings.skillsMcp.skills.label`。
- `rescan()`（602–604）不再调 `refreshDiscovery`。
- 骨架只剩技能和目录两组。
- 头部注释与 `SettingIntelligencePage.vue:31` 的注释同步改成只说技能。

**安全契约**（`spec/main-process/agent-tool-gateway-contracts.md` 147–242）随代码原样搬进 `SettingMcpHost.vue`，不改逻辑：

- 令牌在行内和配置块里都掩码（645–689）；
- 读取失败时不显示「未开启」（921–931）；
- 端口归用户控制；
- 导入含敏感值的配置前先确认（405–410，在 `SettingMcpServers.vue`）。

## IA 接线

- **`R/modules/settings/categories.ts`**：在 `intelligence.children` 里紧跟 `capabilities` 之后插入。如果到时候「记忆」子页（`memory`，来自另一个会话的任务树 `10-03-intelligence-audit-rebuild`，其决策 D5 定的顺序是「…技能 / MCP / 记忆」）已经落地，就插在 `memory` 之前；按那边的约定，由后落地的一方负责调整顺序。插入的项是：

  ```ts
  {
    key: 'mcp',
    path: '/setting/intelligence/mcp',
    labelKey: 'settingsIntelligenceHub.mcp',
    descriptionKey: 'settingsIntelligenceHub.mcpDesc',
    navIcon: 'i-ri-plug-line'
  }
  ```

- **`R/base/router.ts`**：在 `childLoaders` 登记 `'intelligence/mcp'`，路由名为 `$I18n:router.intelligenceMcp`，懒加载 `IntelligenceMcpPage.vue`。
- **自动获得的部分**：缓存键 `setting-intelligence-mcp`、`/intelligence/mcp` 重定向、侧栏前缀高亮。
- **i18n**（zh-CN / en-US）：
  - `settingsIntelligenceHub.mcp`：「MCP」/ "MCP"
  - `settingsIntelligenceHub.mcpDesc`：「管理 MCP 服务器，以及让其他 AI 调用 Tuff。」/ "Manage MCP servers and let other AI clients call Tuff."
  - `router.intelligenceMcp`：「MCP」/ "MCP"
  - 两份语言文件里有他人未提交的改动。改法：用唯一锚点做插入式编辑，不做整文件重排，提交时只取自己的 hunk。
- **`apps/core-app/uno.config.ts`**：把 `i-ri-plug-line` 显式加进设置图标的 safelist，注释写明「子页 `navIcon` 写在 `.ts` 表里，UnoCSS 扫不到」。
  - 不顺带补登其他子项图标：它们现在能显示，补登属于范围外。

## 测试迁移

- `SettingSkillsMcp.mount.test.ts`：
  - 131–142 中断言 MCP 组的部分、163–171（发现行），迁到 `SettingMcpServers.mount.test.ts`；
  - 技能和目录的断言留在原文件。
- `SettingSkillsMcp.host.test.ts` 迁成 `SettingMcpHost.test.ts`，9 个用例照搬。
  - 365–389「开 host 不影响邻居」这条改为挂载 `IntelligenceMcpPage`（两个分块都在），断言打开 host 之后 MCP 服务器行（`fs`、`legacy-server`）不变；技能邻居去掉。
- `setting-skills-mcp-display.test.ts` 跟着改名。
- `SettingIntelligencePage.test.ts` 里对 `SettingSkillsMcp` 的 mock 保留，因为技能部分仍在智能页。
- `categories.smoke.test.ts` 不需要改：stem 规则会把 `mcp` 映射成 `IntelligenceMcpPage`。
- Phase 3：`agent-tool-gateway-contracts.md:238` 点名的测试路径改成 `SettingMcpHost.test.ts`。

## 取舍

- **两个分块各自加载，不合并成一个页面级 loader**：两块的数据源互不相干，host 自成一体；合并只会把失败也耦合在一起。
- **页面用带标题的 column**：和智能页一致。两组都是 `TuffGroupBlock`，不需要 split。
- **KeepAlive 期间回访不刷新**：维持现状（`onMounted` 加载），PRD 已列为 Out of Scope。

## 回滚

本任务只新增文件，加上对 `SettingSkillsMcp.vue`、`SettingIntelligencePage.vue`、`categories.ts`、`router.ts`、`uno.config.ts`、两份语言文件和测试的改动。回滚方法：删除新增文件，被改文件逐个 `git show HEAD:<path> > <path>` 还原（不用 stash 或 checkout，以免碰到他人的工作区改动）。
