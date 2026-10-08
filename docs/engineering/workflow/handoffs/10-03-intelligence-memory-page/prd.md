# 记忆独立子页

父任务：`../10-03-intelligence-audit-rebuild/`（需求 R-F1–R-F7；决定 D4 / D5 / D6）。设计以父任务 `design.md` §6 为准，事实依据见 `../10-03-intelligence-audit-rebuild/research/memory-subpage-and-ia.md`。

## Goal

把「记忆复核」从审计页拆成「设置 › 智能 › 记忆」独立子页（侧栏可达、主从布局），并修正「手动新建的记忆永远不会被使用」这个默认值问题。

## Requirements

- **M1（R-F1）路由与导航**：
  - `categories.ts` 新增 `memory` 子页（`navIcon: 'i-ri-brain-line'`，不标 beta / advanced）；
  - `uno.config.ts` safelist 加图标；
  - `router.ts` 的 `childLoaders` 加 `'intelligence/memory'`，route name 为 `$I18n:router.intelligenceMemory`；
  - 侧栏位置按 D5 排在 MCP 后。兄弟任务的 MCP 未落地时先排在 `capabilities` 后，由后落地一方调整。
- **M2（R-F2）主从**：`IntelligenceMemoryPage.vue`（`SettingsPage layout="split"`）。
  - 左栏 aside：
    - 搜索框（`SettingsPage` 自带，300 ms 防抖后走服务端 `contextListMemories({ query })`）；
    - `#filter` 放类型 / 范围 / 状态筛选（状态默认 `all`）；
    - 列表行：摘要、类型 · 范围、停用徽标、不生效标记；
    - 每页 20 条分页；
    - `#aside-footer` 放「新建记忆」。
  - 右栏 detail（带 key 的单根节点，`TxScroll` + `#header`）：
    - 选中时：全文、注入说明（模型看到的是 ≤240 字摘要、该范围是否生效）、来源与审计字段、启停、编辑、删除；
    - 编辑 / 新建态：表单 → 评估 → 保存 / 确认替换 / 忽略；
    - 未选中：`TxEmptyState variant="no-selection"` + 记忆专用文案。
- **M3（R-F3）范围生效**：
  - `memory-scope.ts` 的 `memoryScopeEffect` 镜像 `apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts:1143-1166`；
  - 新建默认 `scope:'global'`、`type:'preference'`；
  - 范围下拉里「会话 / 工作区 / 项目」标「暂不生效」；
  - 列表与详情对不生效记忆加标记。
- **M4（R-F4）交互**：
  - 删除前 `TxBottomDialog` 确认，成功后提示「后续回答不会再使用这条记忆」，并选中同位置下一条；
  - 替换成功后选中新 id；
  - `MEMORY_REPLACE_CONFLICT` 时重载并保持选中；
  - 启停只更新本地行、不重排；
  - KeepAlive `onActivated` 时刷新列表。
- **M5（R-F5）**：去掉「最近使用 / 使用次数」。
- **M6（R-F6）**：
  - 迁移 `components/intelligence/audit/IntelligenceMemoryReview.test.ts` 的全部流程断言到新组件，尽量保留 `data-testid`；
  - 删除 `IntelligenceMemoryReview.vue`；
  - 用词统一为「记忆」（含 `intelligence.memoryReview.title`）。
- **M7（R-F7）文案**：`settingsIntelligenceHub.memory` / `memoryDesc`、`router.intelligenceMemory`、页面新增文案，中英同步。

## Acceptance Criteria

- [ ] AC-M1（父 AC-19）：
  - 侧栏出现「记忆」，进入时该行高亮，顺序符合 D5（截图）；
  - 图标非空框；
  - `categories.smoke.test.ts` 绿；
  - `/setting/intelligence/memory` 与 `/intelligence/memory` 直链可达。
- [ ] AC-M2（父 AC-20）：
  - 新建默认范围为全局；
  - 「会话 / 工作区 / 项目」在下拉、列表、详情三处都有「暂不生效」标记；
  - `memory-scope.ts` 单测覆盖 global、带来源 session、无来源 session、workspace、project 五种情况。
- [ ] AC-M3：
  - 删除需确认、删除后有提示并选中下一条；
  - 替换后选中新 id；
  - 冲突后重载；
  - 离开再回来列表已刷新（组件测试 + 一次真机验证）。
- [ ] AC-M4：迁移后的记忆测试覆盖原 `IntelligenceMemoryReview.test.ts` 的全部流程（评估后保存、失效、替换与 CAS、冲突、启停、tombstone、服务端筛选），全绿；`IntelligenceMemoryReview.vue` 已删除且无引用。
- [ ] AC-M5：`translation-coverage.test.ts` 绿；审计页入口描述不再含「记忆复核」（与审计页子任务共享此键，以先落地者为准，另一方核对）。
- [ ] AC-M6：
  - `pnpm -C apps/core-app run typecheck:web` 本子任务范围 0 新错误；
  - `pnpm check coreapp-ui-contract` 通过；
  - lint delta 为 0；
  - `git diff --check` 干净。

## Out of Scope

- 记忆「最近使用 / 使用次数」的写入端。
- Explain Drawer「打开记忆面板」入口与 CoreBox「记忆」目的地。
- 兄弟任务的 MCP / 技能页。

## Dependencies

- 无前置。
- 协调：与兄弟任务 `10-03-intelligence-settings-revamp` 共改 `categories.ts`、`router.ts`、语言包、`SettingIntelligencePage.vue`，后落地方以先落地方为基线；该任务的侧栏顺序验收需追加「/ 记忆」。
