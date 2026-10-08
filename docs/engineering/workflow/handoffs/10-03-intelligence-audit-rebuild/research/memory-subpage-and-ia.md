# Research: 记忆复核拆成「智能」独立子页（split 主从）——注册方式、组件、领域事实、i18n、入口、split 约定

- **Query**: 把 `IntelligenceMemoryReview.vue` 从审计页拆到 设置 › 智能 下的独立子页（`SettingsPage layout="split"`），需要知道子页注册链路、组件结构、Memory 领域事实、i18n、所有入口，以及 split 页的既有约定。
- **Scope**: internal（core-app renderer + main + shared + utils SDK + specs/docs）
- **Date**: 2026-10-03
- 行号以 2026-10-03 工作树为准；`ShellSidebar.vue` 工作树里有别的会话未提交的 `ShellUpdateNotice` 改动（+3 行），所以它的行号比 HEAD 多 1–3 行。

## Findings

### Files Found

| 文件 | 作用 |
|---|---|
| `apps/core-app/src/renderer/src/modules/settings/categories.ts` | 设置 IA 唯一表：`SETTING_CATEGORIES`、`children[]`、`navIcon/beta/advanced`，侧栏和路由都从这里取 |
| `apps/core-app/src/renderer/src/base/router.ts` | `createSettingCategoryRoutes`：给每个子页注册兄弟路由 + 设置 keep-alive key + 高级页守卫 |
| `apps/core-app/src/renderer/src/views/base/settings/categories/SettingIntelligencePage.vue` | 「智能」枢纽页，没有 `navIcon` 的子页在这里显示成入口行 |
| `apps/core-app/src/renderer/src/components/shell/ShellSidebar.vue` / `ShellNavItem.vue` | 设置侧栏；有 `navIcon` 的子页会提升为侧栏项 |
| `apps/core-app/src/renderer/src/modules/settings/categories.smoke.test.ts` | 唯一锁定子页表 ↔ 页面文件 ↔ 目的地目录三方一致的测试 |
| `apps/core-app/src/renderer/src/components/settings/SettingsPage.vue` | 设置页外壳，只有 `column` / `split` 两种布局 |
| `apps/core-app/src/renderer/src/components/tuff/template/TuffAsideTemplate.vue` | split 布局真正的两栏实现 |
| `apps/core-app/src/renderer/src/components/intelligence/audit/IntelligenceMemoryReview.vue`（1054 行）+ `.test.ts`（393 行） | 要搬走的记忆复核组件 |
| `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceAuditPage.vue:66-75` | 审计页里挂载记忆复核的那块 `TuffGroupBlock` |
| `apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts` | Memory 服务（列表、评估、保存、替换、启停、删除）和注入逻辑 |
| `apps/core-app/src/main/modules/ai/intelligence-module.ts:1664-1719` | Memory IPC handler，除评估外都是宿主专用 |
| `packages/utils/types/intelligence.ts:1809-2050` | Memory 相关类型 |
| `packages/utils/transport/sdk/domains/intelligence.ts:766-783, 1282-1317, 1927-1987` | 渲染层 SDK 签名、事件、实现 |
| `apps/core-app/src/shared/app-destinations.ts` | CoreBox「目的地」目录，也就是设置页唯一的搜索入口来源 |
| `apps/core-app/uno.config.ts:41-53` | 侧栏图标的 UnoCSS safelist |
| `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json` | i18n |

### Q1. 设置子页怎么注册（表 → 路由 → 枢纽页 → 侧栏）

**表（categories.ts）**
- `SettingSubPage` 有这些字段：`key`、`path`、`labelKey`、`descriptionKey`、`navIcon?`、`beta?`、`advanced?`（`categories.ts:18-32`）。注释说明：子页注册成兄弟路由，不是嵌套路由；侧栏靠 `ShellNavItem` 的路径前缀匹配让父项保持选中（`:12-17`）。
- intelligence 的 `children` 按顺序是（`:92-144`）：
  1. `channels`，navIcon `i-ri-global-line`
  2. `voice`，navIcon `i-ri-mic-line`
  3. `prompts`，navIcon `i-carbon-text-font`，beta
  4. `agents`，navIcon `i-carbon-bot`，beta
  5. `workflows`，beta + advanced，没有 navIcon
  6. `audit`，没有 navIcon，`:131-136`
  7. `capabilities`，navIcon `i-carbon-machine-learning-model`
- `settingCategoryChildren(key, includeRestricted)` 会在 `includeRestricted=false` 时滤掉 beta 和 advanced（`:216-219`）。
- `groupedSettingNavigation(includeRestricted)`（`:246-277`）：
  - 只提升有 `navIcon` 的子页；开发者模式关闭时还要再去掉 beta（`:255-257`）。
  - 只要有子页被提升，父项就设成 `activeExact: true`，即只在精确路径上高亮（`:264`）。
  - 提升出来的子项 key 是 `${category.key}-${child.key}`，`activeExact:false`，并带上 `beta`（`:266-273`）。

**路由（router.ts）**
- `childLoaders` 是一张手写映射，键是 `'<category>/<child>'`（`router.ts:99-128`，audit 在 `:116-119`，route name 是 `$I18n:router.intelligenceAudit`）。
- 子路由按表生成（`:148-164`）：
  - `meta.parentRoute = category.path`
  - `keepAliveKey: setting-${category.key}-${child.key}`（`:160`），memory 自动得到 `setting-intelligence-memory`
  - 只有 `child.advanced` 才加 `requiresAdvanced`（`:161`）
- **陷阱**：`:149-152` 直接读 `loader.name`。表里加了子页、`childLoaders` 却没加，路由模块求值时就会抛 TypeError，整个 renderer 起不来。目前没有任何测试覆盖这张映射（smoke test 只比对「表 ↔ 磁盘文件」）。
- 守卫只看 `requiresAdvanced`：开发者模式关闭时跳回 `DEFAULT_SETTING_PATH`（`/setting/overview`，`:417-423`；`categories.ts:206`）。**beta 子页没有路由守卫**，只在导航和枢纽里隐藏，直链照样能进。
- `createLegacyIntelligenceRedirects` 会给每个 child 自动生成 `/intelligence/<key>` 的重定向（`:174-183`），所以新子页会自动多一条 `/intelligence/memory`。
- KeepAlive：`AppShell.vue:214-220`，`:max="10"`，缓存键取 `meta.keepAliveKey`（`:100-112`）。设置子页都会被缓存，`onMounted` 只跑一次，再次进入不会重新挂载（`release-testing.md:876` 里也有同样说明）。

**枢纽页（SettingIntelligencePage.vue）**
- 入口行 = `settingCategoryChildren('intelligence', developerMode).filter(c => !c.navIcon)`（`:20-23`）。也就是说，**有 navIcon 的子页不会出现在枢纽**。
- 目前枢纽里的行：普通模式只有 `[audit]`，开发者模式是 `[workflows, audit]`，顺序就是数组顺序。
- 每一行是 `SettingRow navigable`，title 取 `t(labelKey)`、description 取 `t(descriptionKey)`，点击执行 `router.push(path)`；beta 行在尾部加 `SettingChip tone="info"`（`:43-56`）。这些行统一放在 `TuffGroupBlock :name="t('settingsIntelligenceHub.label')"` 里，组名当前是「工作流与审计」。
- 页面结构依次是：`SettingAssistant` → `SettingSkillsMcp` → `SettingLocalAiCli` → 入口组（`:27-57`）。注释写明了 IA 规则：「Workflows and audit remain hub destinations; the other intelligence pages live in the nav」（`:20`、`:41`）。

**侧栏**
- `ShellSidebar.vue:80-82` 调 `groupedSettingNavigation(Boolean(appSetting.dev.developerMode))`；`:133-141` 渲染 `ShellNavItem`，传入 `:badge`（beta 文案）和 `:active="item.activeExact ? route.path === item.path : undefined"`。
- `ShellNavItem.vue:29-33` 在没有强制 active 时按 `path === to || startsWith(to + '/')` 判断高亮。
- 由此推出的事实：父项「智能」是 `activeExact`，所以停在 `/setting/intelligence/audit` 这种只在枢纽出现的子页上时，**侧栏没有任何一行高亮**；审计页靠 column 布局的 `back-to` 链接回到枢纽。
- **图标陷阱**：`.ts` 表里写的图标类 UnoCSS 不会扫描到。分类图标是手工 safelist 的 `SETTINGS_CATEGORY_ICONS`（`uno.config.ts:41-53`），**里面不包含任何子页 navIcon**。现有 4 个子页 navIcon 之所以能显示，只是因为它们碰巧也出现在别的 `.vue` 模板里：`i-ri-mic-line` 在 `VoiceInsights.vue`，`i-carbon-text-font` 在 `IntelligenceChannelsPage.vue`，`i-carbon-bot` 在 `IntelligenceAgentsPage.vue`，`i-carbon-machine-learning-model` 在 `CoreIntelligenceAnswer.vue`。新 navIcon 如果没有在别处出现，必须加进这个 safelist，否则侧栏会是空框。

**锁定 children 的测试**（已对 `*.test.ts` 全量 grep）
- `categories.smoke.test.ts` 的 sub-page table 部分（`:128-191`）：
  - path 必须等于 `${category.path}/${child.key}`，`labelKey/descriptionKey` 不能为空（`:135-143`）
  - key 和 path 都要唯一（`:145-152`）
  - 用 `arrayContaining` 断言 beta 子页仍注册、但在普通模式下隐藏（`:154-175`）
  - **每个子页都要有页面文件，并且 `views/base/intelligence/*.vue` 下不能有多余文件**（`:177-190`）。文件名规则 `subPageStem` 是 `Intelligence${Key 首字母大写}Page`，只有 `workflows` 例外（`:130-133`）。所以 key `memory` 必须对应 `IntelligenceMemoryPage.vue`；带连字符的 key（比如 `memory-review`）会算出 `IntelligenceMemory-reviewPage`，不能用。拆出来的列表、详情子组件不能放在这个目录。
  - destination catalog parity（`:199-252`）：每个 `settings-<key>` 目的地的 route 都必须等于同名子页的 path。
- `SettingIntelligencePage.test.ts:17-19` 把 `settingCategoryChildren` mock 成 `[]`；`ShellSidebar.test.ts:42-44` 把 `groupedSettingNavigation` mock 成 `[]`。这两个都不锁 children。
- **没有任何测试锁 intelligence children 的顺序或数量**。唯一被锁顺序的是 system 组（`categories.smoke.test.ts:71-77`）。

**侧栏「搜索设置」要不要为新子页注册？**
- 不需要。`ShellSidebar.vue:126` 的 `ShellSearchEntry` 点击后只执行 `openCoreBox()`，即 `transport.send(CoreBoxEvents.ui.show)`（`:87-89`），设置区没有自己的索引。
- CoreBox 能搜到设置页，来源是 `shared/app-destinations.ts`。审计页本来就**不在**这个目录里（`AppDestinationId` 见 `:12-30`）。
- 如果想让「记忆」能被 CoreBox 搜到，是可选的，需要同时满足：
  - id 必须是 `settings-memory`，route 等于子页 path（parity 测试）
  - aliases 归一化后要全局唯一（`app-destinations.ts:494-520`，构建时冲突直接抛错）
  - 图标只能是 `i-ri-*`，并且确实是 ri 字形（`app-destinations.test.ts:378-388`）
  - `APP_DESTINATION_ICON_CLASSES` 的完整顺序被锁（`:355-376`）：用新图标要改测试，复用已有图标就不用
  - `COMMON_SETTING_DESTINATION_IDS` 被锁（`:261-273`）
  - title/subtitle 两种语言都必须有（`:332-346`）

**兄弟任务冲突（决策相关）**
- `.trellis/tasks/10-03-intelligence-settings-revamp/prd.md` 是 planning 状态的父任务，子任务有 `mcp-settings-page`、`skills-page-revamp` 等。它的「跨子任务验收」写死了：「侧栏『塔芙智能』组的顺序为：智能 / 模型渠道 / 语音输入 / 技能 / MCP（beta 项在开发者模式下照旧插入）」。
- 同一个任务还会：把 MCP 拆成新的子页（排在侧栏「技能」下方），把「能力」改名为「技能 Skills」。
- 因此给记忆加 navIcon 会改变这条验收里的侧栏顺序，两个任务需要对齐；两者也都要改 `categories.ts` 的 children 和 `router.ts` 的 childLoaders。

### Q2. `IntelligenceMemoryReview.vue` 现状

**区块（行号）**
- 状态（`:22-49`）：
  - `memoryTypes` / `memoryScopes` 两个常量数组
  - `pageSize = 20`
  - 候选表单字段：content、summary、tags（逗号分隔）、type（默认 `temporary`）、scope（默认 `session`）
  - `editingMemory`、`evaluationResult`、`evaluatedReplacement`、`evaluationInvalidated`、`savedMemory`
  - 列表筛选：`searchQuery`、`filterType`、`filterScope`、`filterStatus='all'`、`listOffset`、`hasMoreMemories`
- 头部（`:347-362`）：标题在新建时是 `panelTitle`、编辑时是 `editTitle`，右侧有「仅手动保存」守卫 chip，图标 `i-carbon-policy`。
- 编辑横幅（`:364-374`）：显示「正在替换: <id>」和取消按钮。
- 候选表单（`:376-471`）：原生 `textarea`、`input`、`select`；按钮有「评估策略」「保存/确认替换」（只有 `suggested` 时出现）和「忽略」。
- 错误提示和「评估已失效」提示（`:473-478`）。
- 评估结果卡（`:480-519`）：显示 status、reason、candidate 的摘要/类型/范围/隐私级别（原样输出 `normal`，没走 i18n）/置信度/标签；非 `suggested` 时显示 `failClosed` 文案。
- 「已保存 ID」（`:521-523`）。
- 已保存列表（`:525-719`）：
  - 标题和刷新按钮（`:526-541`）
  - 筛选（`:543-588`）：搜索框按 Enter 或点「应用筛选」才生效，加 type、scope、status 三个下拉
  - 加载中和空态（`:590-596`）
  - 条目（`:597-696`）：summary、disabled 徽标、content 全文、`type · scope · 置信度`、tags、审计 `dl`（来源会话、来源轮次、隐私级别、创建时间、更新时间、最近使用、使用次数、替换自）
  - 每条的操作：编辑、启用/停用、删除（`:657-694`）
  - 分页（`:698-718`）：上一页 / 第 N 页 / 下一页

**SDK 调用**（都走 `useIntelligenceSdk()`，实现在 `packages/utils/transport/sdk/domains/intelligence.ts:1927-1987`）

| UI 动作 | 调用 | 事件 | 代码行 |
|---|---|---|---|
| 加载列表 | `contextListMemories({query,type,scope,status,offset,limit:20})` | `intelligence/context memory:list` | `:178-197`，`onMounted` 时调用（`:340-342`） |
| 评估 | `contextEvaluateMemory(buildEvaluationInput())`，编辑时会带上原记忆的 confidence、source、privacy、ttl | `memory:evaluate` | `:160-176`、`:216-251` |
| 新建保存 | `contextSaveMemory(evaluatedReplacement)` | `memory:save` | `:273-275` |
| 编辑保存 | `contextReplaceMemory({memoryId, expectedUpdatedAt: editing.updatedAt, evaluationFingerprint, replacement})`；捕获 `MEMORY_REPLACE_CONFLICT` 后提示并重载列表 | `memory:replace` | `:264-283` |
| 启用/停用 | `contextSetMemoryEnabled({memoryId, enabled})`，只在本地改 `enabled/updatedAt`，不重载列表 | `memory:set-enabled` | `:292-316` |
| 删除 | `contextDeleteMemory({memoryId, reason:'user-memory-review-delete'})`；**没有确认框**，点了就删；删的是正在编辑的条目时会重置表单 | `memory:delete` | `:318-338` |

- 可以保存的条件：`status==='suggested'`、有 candidate、有 fingerprint、有 evaluatedReplacement，并且不在保存中（`:55-62`）。
- 表单里任何字段的 input 或 change 事件都会调用 `invalidateEvaluation`，清掉评估结果（`:118-126`）。
- 保存成功后会重载列表并重置表单（`:277-278`）。

**测试覆盖**（`IntelligenceMemoryReview.test.ts`）
- mock 了 `@talex-touch/utils/renderer`、`TxButton`、`vue-i18n`、`vue-sonner`。
- 已覆盖：
  - 先评估后显式保存，并断言默认 `temporary/session` 入参（`:76-137`）
  - `rejected` / `needs_review` 不出现保存按钮（`:139-156`）
  - 5 个字段各自修改都会让评估失效（`:158-190`）
  - 列表加载、来源字段展示、tombstone 删除，并断言默认列表参数（`:192-229`）
  - 搜索和筛选都交给服务端（`:231-251`）
  - 原子替换和重复点击防护（`:253-330`）
  - 冲突后重载列表（`:332-366`）
  - 启用/停用（`:368-391`）
- 未覆盖：分页、刷新、忽略、取消编辑、各类失败分支。
- 测试依赖的 `data-testid`：`memory-review-{content,summary,tags,type,scope,evaluate,save,ignore,cancel-edit,editing,result,saved-list,refresh,search,filter-type,filter-scope,filter-status,apply-filters,page-previous,page-next}` 和 `memory-review-{edit,toggle,delete}-<id>`。

**映射到 split 布局**
- 天然属于 **aside（左侧列表）** 的：
  - 搜索（`searchQuery`）
  - type、scope、status 筛选
  - 已保存列表本身，每行可以用 summary + type·scope + disabled 徽标
  - 分页或加载更多
  - 刷新
- 天然属于 **detail（右侧详情）** 的：
  - 选中记忆的完整内容、审计 `dl` 元数据
  - 编辑、启停、删除操作
  - 候选编辑器：表单 + 评估 + 结果卡 + 保存/替换/忽略
- **新建和编辑是两条不同的流程，但现在共用一个表单**：
  - 新建（`editingMemory=null`）：默认 `temporary/session`，没有来源字段，调 `contextSaveMemory`。服务端**不校验** fingerprint，只有客户端在拦（`intelligence-context-hygiene.ts:2073-2082`）。
  - 编辑：预填原记忆的值，调 `contextReplaceMemory`。服务端会重新评估、校验 fingerprint（不一致抛 `MEMORY_REPLACE_EVALUATION_MISMATCH`），并用 `updatedAt` 做 CAS 检查（不一致抛 `MEMORY_REPLACE_CONFLICT`）（`:2084-2167`）。
  - **替换会生成一个新 id**（`id('mem')`），原记忆被停用并写入 tombstone（reason `replaced-by:<newId>`），所以原 id 会从列表里消失。split 页替换成功后，选中项必须切到 `replaced.memory.id`。
  - 新记忆强制 `enabled:true`。
  - 在 split 里，新建通常是「没有选中项 + 点新建」进入的模式，编辑则是「选中项进入编辑态」。

### Q3. Memory 领域事实

**类型**（`packages/utils/types/intelligence.ts`；`@talex-touch/tuff-intelligence` 原样转出，`packages/tuff-intelligence/src/types/intelligence.ts:19`）
- `MemoryItem`（`:1809-1829`）字段：
  - `id`
  - `type`：`preference | project | task | knowledge | temporary`
  - `scope`：`global | workspace | project | session`
  - `content`、`summary`、`tags[]`、`confidence`
  - `sourceSessionId?`、`sourceTurnId?`
  - `replacesMemoryId?`
  - `privacyLevel`：`normal | sensitive | secret`（`:1673`）
  - `ttl?`：从最近一次保存（`updatedAt`）开始计算的毫秒数
  - `enabled`、`createdAt`、`updatedAt`、`lastUsedAt?`、`usageCount`
- `MemoryTombstone {id, memoryId, reason, createdAt}`（`:1831-1836`）
- `MemoryListStatus = 'all' | 'enabled' | 'disabled'`（`:1838`）
- `ListMemoriesInput/Result`（`:1840-1854`，带 `hasMore`）
- `EvaluateMemoryResult.status = suggested | rejected | needs_review`，另有 `reason`、`candidate?`、`fingerprint?`（`:1893-1899`）
- `MemoryReplacementInput`、`MemoryUpsertInput`（多一个 `id?`）、`ReplaceMemoryInput/Result`（`:2021-2050`）
- 表结构：`schema.ts:1247-1290`，对应 `intelligence_memory_items` 和 `intelligence_memory_tombstones`。

**服务规则**（`intelligence-context-hygiene.ts`）
- `listMemories`（`:2009-2071`）：
  - 只返回 `privacy_level='normal'` 且没有 tombstone 的记录
  - 不传 `status` 时服务端默认 `'enabled'`；UI 显式传了 `'all'`
  - `limit` 被限制在 1–100，默认 50
  - `query` 截到 200 字，对 content、summary、tags 做转义后的 `LIKE`
  - 排序 `updated_at DESC, id ASC`
  - 多取一条（`limit+1`）来判断 `hasMore`
  - 用子查询回填 `replacesMemoryId`
  - **不过滤 TTL 过期**：过期记忆照样出现在列表里，UI 也不显示 ttl
- `evaluateMemory`（`:2201-2249`）是纯函数，不写库：
  - 空内容 → `rejected/empty_content`
  - 命中「不要记住 / do not remember / forget this」等正则 → `rejected/user_opt_out`（`:266-271`）
  - 检测到凭据 → `rejected/secret_detected`（`containsCredentialLikeText`，`sensitive-text.ts:139`）
  - 入参 `privacyLevel` 是 `sensitive` → `needs_review/sensitive_content`
  - 其余 → `suggested/explicit_memory_candidate`
  - 置信度默认 0.6（`:273-276`）；summary 留空时取 content，压缩空白、截到 240 字（`:278-283`）；tags 最多 12 个、每个 40 字（`:285-297`）；fingerprint 是规范化 payload 的 sha256（`:298-316`）
  - 从 UI 触达 `needs_review` 实际上不可能：列表只返回 normal，新建也不传 privacyLevel
- `createMemoryItem`（`:318-354`）：
  - content、summary、tags 里只要有 secret，或 privacy 不是 normal，就抛 `MEMORY_POLICY_REJECTED_SECRET`
  - ttl 必须是正数
  - confidence 默认 1
- `setMemoryEnabled`（`:2169-2199`）会**更新 `updated_at`**，带来三个副作用：重载后排序变化、TTL 重新起算、下一次替换要用的 `expectedUpdatedAt` 变化。
- `deleteMemory`（`:2251-2281`）：先置 `enabled=0`，再插入 tombstone，默认 reason 是 `user-delete`。没有恢复接口，也没有列出 tombstone 的接口。
- **`usage_count` / `last_used_at` 全仓没有任何写入点**，只在 INSERT 时写成 0/NULL（grep `usage_count =`、`last_used_at =` 在 core-app 里都是 0 命中）。UI 上的「最近使用 / 使用次数」因此永远显示「无 / 0」。

**在哪里被消费（注入上下文包）**
- `listUsableMemories`（`:1143-1166`）的选取条件：
  - `enabled=1`、`privacy=normal`、没有 tombstone、TTL 未过期
  - **范围只能是 `global`，或者 `session` 且 `source_session_id` 等于当前会话**
  - 按 `updated_at DESC` 取 **最多 5 条**
- 只有 `metadata.noHistory !== true`（`:1382`）并且上下文范围是 `session` 或 `retrieval` 时才注入（`:1485-1495`）。
- **注入的是 `summary || content`**，而 summary 总是非空（最多 240 字），所以模型实际看到的是 summary，不是全文。
- invoke 之前会再校验一次（`revalidatePackageMemories`，`:1557-1625`，由 `intelligence-context-execution.ts:429` 调用）。被剔除的项会记下原因：`memory-missing`、`memory-tombstoned`、`memory-disabled`、`memory-privacy-blocked`、`memory-expired`、`memory-scope-mismatch`（`:184-188`、`:580-605`）。
- workspace 和 project 范围在稳定的 `scopeRef` 出来之前一律 fail-closed：管理 UI 能看到，但永远不会注入。
  - 测试：`intelligence-context-hygiene.test.ts:172-215`
  - 文档：`apps/nexus/content/docs/dev/api/intelligence.{zh,en}.mdc:74`、`docs/plan-prd/03-features/ai-2.5.4-context-hygiene-memory-details.md:621,634`
- **推论（有证据支撑）**：从 UI 手动新建、用默认 `session` 范围的记忆不带 `sourceSessionId`，永远不会被注入。workspace 和 project 同样不会。**今天只有 `global` 范围的手动记忆真的会被用上。**
- 目前只有记忆复核在创建记忆：`contextHygieneService.saveMemory` 只有 IPC 一个调用方（`intelligence-module.ts:1687`）；插件里的 `evaluateMemoryPolicyForAsk` 已经被改成直接 `return null`（`plugins/touch-intelligence/index.js:1079-1081`）；自动保存是关着的。

**治理和隐私**
- IPC（`intelligence-module.ts:1664-1719`）：list、save、replace、set-enabled、delete 都先过 `assertHostOwnedIntelligenceControlPlane`（定义在 `:372`）。只有 evaluate 对插件开放（`:1674-1679`）。
- 插件 facade 里隐藏了这些方法：`packages/utils/plugin/sdk/intelligence.ts:26-30, 98-102`。
- 隐私页：Memory 不属于集中隐私类目，不会在那里出现删除或导出入口（`PrivacyDataSection.test.ts:1026-1039`）。只有一条说明文案 `privacyData.retention.memoryIndependent`（`PrivacyDataSection.vue:1008`，zh「显式 AI Memory 遵循自身 TTL 或用户删除，不受审计保留策略影响。」），而且不带跳转链接。
- spec 的说法：「Explicit Memory remains under the Intelligence Memory delete/tombstone API」（`privacy-data-lifecycle.md:279`）；审计和上下文保留策略都不会删 Memory 或 tombstone（`:177`）。

**规格和文档中的 UX 要求**
- `ai-2.5.4-context-hygiene-memory-details.md:481-486` 的「Memory 面板」：要支持查看、搜索、编辑、禁用、删除，并显示来源 session/turn；保存要可见（「已记住 / 建议记住 / 已忽略 / 因敏感信息未保存」）；删除后要提示「后续回答不会再使用这条记忆」。
- 同一文档 `:479`：Explain Drawer 应该能执行「打开 Memory 面板」。这个入口目前没有实现。
- `:498`：「长期记忆」设置项写的是「开启但需可撤销」。
- 存档任务 `.trellis/tasks/archive/2026-07/07-10-r9-2-memory-review-management/{prd,design}.md` 定义了编辑状态机（`view → edit(dirty) → evaluate → suggested+unchanged → explicit replace`），并要求 UI 不能把替换拆成「先保存再删除」两个非原子请求。

### Q4. i18n

- `settingsIntelligenceHub.*`：zh-CN 和 en-US 都在 `:1760-1778`。
  - `label`（`:1761`）：「工作流与审计」/「Workflows & Audit」，是枢纽入口组的组名，只在 `SettingIntelligencePage.vue:43` 用到
  - `back`：「返回智能」
  - `audit`（`:1773`）：「审计」/「Audit」
  - `auditDesc`（`:1774`）：**「用量、日志、记忆复核与全局限制。」/「Usage, logs, memory review and global limits.」**
  - 其余是 channels、voice、prompts、agents、workflows、capabilities 及各自的 `*Desc`
- `router.*`：两种语言都在 `:3154-3182`，包括 `intelligenceAudit`（`:3177`）「智能审计」/「Intelligence Audit」。route name 用 `$I18n:router.<key>` 的形式，由 `resolveI18nLabel` 解析（`utils/i18n-helpers.ts:8-28`）。
- `intelligence.memoryReview.*`：两种语言都在 `:5876-5965`，大约 70 个键，包括 `types.*`、`scopes.*`、`status.*`、`reasons.*`。
  - zh 的 `title` 是「记忆审核」，但枢纽描述写的是「记忆复核」，**两边用词不一致**。
  - `contentChanged`（`:5899`）没有任何代码引用。
- 测试约束（`modules/lang/translation-coverage.test.ts`）：
  - zh-CN 和 en-US 的**键集合必须完全相等**（`:120-126`）
  - 静态写死的 `t('a.b')` 至少要在一个语言里存在（`:112-118`）
  - 动态的 `t(subPage.labelKey)`、`` t(`…${x}`) `` 不会被扫描到
- 「记忆」作为枢纽入口或子页最少需要新增：
  - `settingsIntelligenceHub.memory` 和 `settingsIntelligenceHub.memoryDesc`（`labelKey/descriptionKey`，smoke test 要求非空）
  - `router.intelligenceMemory`（route name）
  - 同步改掉 `settingsIntelligenceHub.auditDesc`，去掉「记忆复核 / memory review」
  - 如果记忆留在枢纽，还要改 `settingsIntelligenceHub.label`（「工作流与审计」装不下记忆）
- split 页还可能需要的文案：
  - 空选态：`IntelligenceEmptyState` 把 `intelligence.empty.title` 写死成「未选择提供商 / No Provider Selected」，**不能直接复用**；需要直接用 `TxEmptyState variant="no-selection"`，再加记忆专用的键
  - 新建按钮
  - 删除确认（现在没有）
  - 搜索 placeholder（可复用 `intelligence.memoryReview.searchPlaceholder`）
  - 清除按钮（可复用 `intelligence.search.clear`）
  - 加载更多（可复用 `common.loadMore`）

### Q5. 其他链接到记忆复核或审计页的地方

- `IntelligenceAuditOverlay.vue:18-21` 里有 `router.push('/setting/intelligence/audit')`（「查看完整审计」）。这个组件是孤儿，没有任何引用，模板里 kebab 和 PascalCase 写法都搜过了，只有 `components.d.ts` 里的自动声明。
- `router.ts:174-183` 自动生成的 `/intelligence/audit` 重定向。
- `IntelligenceAuditPage.vue:66-75` 是唯一的挂载点。`memory-name="intelligence-memory-review"` 是 `TuffGroupBlock` 的展开状态 uiPreference 键（`TuffGroupBlock.vue:47-68`），移走之后会留下一个无害的孤儿键。
- `components.d.ts:81, 289`：unplugin-vue-components 自动生成的条目，`electron.vite.config.ts:414` 设了 `dts:true`。组件挪位置后会自动变。
- **以下地方没有入口**（逐一确认过）：
  - `MainWindowCommandPalette` / `main-window-command-catalog.ts`：没有 intelligence、audit、memory 相关命令
  - `APP_DESTINATIONS`：没有 audit
  - 主进程 `AppDestinationNavigationService`：只接受目的地 id
  - 插件固定导航：`plugin-business-capabilities.ts:241-250` 只有 `/intelligence/channels`
  - onboarding（`views/base/begin`）、总览页：没有
  - 隐私页：只有说明文案，没有链接
  - Nexus 用户文档（`apps/nexus/content/docs/guide`）：从没写过审计页或记忆复核
  - dev 文档：只在 `dev/api/intelligence.{zh,en}.mdc:72-74` 泛泛提到「宿主管理 UI」，没写路径
- 历史文档里写着「Intelligence Audit 新增 host-side Memory Review 面板」：`docs/plan-prd/01-project/CHANGES.md:661-664`、`ai-2.5.4-context-hygiene-memory-prd.md:384`、`-details.md:488,611`、`PRD-QUALITY-BASELINE.md:25,27`。这些都是记录，不是入口。
- `docs/engineering/sensitive-data-inventory.json` 里的 `intelligence-audit-context-memory`：readers 只泛写了「audit UI」，evidence 里没有引用渲染层的文件路径。

### Q6. split 页约定

- `SettingsPage` 的 split 布局（`SettingsPage.vue:104-135`）：
  - props：`v-model:search`、`ariaLabel`、`searchPlaceholder`、`searchId`、`searchable`（默认 true）、`clearLabel`、`mainAriaLive`
  - **没有标题，也不支持 `backTo`**（`:24-29` 注明「Column layout only」，返回按钮只在 column 布局渲染，`:139-142`）
  - 插槽怎么落到 `TuffAsideTemplate`：
    - `#filter` 进入 aside 滚动区顶部的 `TuffAsideTemplate-Filters`（`TuffAsideTemplate.vue:64-67`）
    - `#aside` 进入同一个滚动区的 body（`:69-71`）
    - `#aside-footer` 进入 aside 底部固定的 footer（`:75-77`）
    - `#detail` 进入 main，外层包着 `<Transition name="fade-slide" mode="out-in">`（`:91-93`），所以 detail 要有一个带 key 的单根节点（参考 `IntelligenceChannelsPage.vue:394`）
    - `#overlay` 放在两栏之外，用来挂 drawer、dialog、file input
  - aside 宽度是 `w-76`，约 304px（`TuffAsideTemplate.vue:41`）
  - main 关了边缘模糊、`overflow:hidden`，**详情区要自己处理滚动**（现有页面用 `TxScroll` 加 `#header`：`IntelligenceInfo.vue:162-170`、`AgentDetail.vue:265-282`）
  - aside 的搜索框每次按键都会同时发 `update:modelValue` 和 `search`（`TuffAsideSearchBar.vue:29-35`）。现有页面都在客户端过滤，**记忆搜索在服务端，接上去需要自己加防抖**。
- 现有页面的写法：

| 页面 | 列表组件 | aside-footer | 详情 | 空态 / 加载 | 键盘 |
|---|---|---|---|---|---|
| Channels `IntelligenceChannelsPage.vue:323-459` | `IntelligenceList` → `TuffListTemplate`（分「已启用 / 已禁用」两组）+ `IntelligenceItem` → `TuffItemTemplate` | 「添加渠道」 | keyed div + `IntelligenceInfo`，没有选中时显示 `IntelligenceEmptyState` | — | `useKeyboardNavigation` ↑↓（`:301-320`） |
| Agents `IntelligenceAgentsPage.vue:65-92` | `AgentsList`（自写分组 + `TxRowSkeleton`） | — | `AgentDetail`，或手写的 `.empty-state` | `hasLoaded` + `useDeferredLoading`，只在首次加载显示骨架（`:20-26`） | — |
| Prompts `IntelligencePromptsPage.vue:488-847` | 过滤 chip 放在 `#aside` 里 + `TuffAsideList`（listbox/option，带 badge） | 「新建提示词」 | `TxScroll` + `#header` | — | — |
| Capabilities `IntelligenceCapabilitiesPage.vue:456-534` | `#filter` 放列表标题和计数 + `TuffItemTemplate` 卡片 + `CapabilitySkeleton` | — | `IntelligenceCapabilityInfo` | `loading` | — |
| Applications `ApplicationIndex.vue:610-701` | `AppList`（`TxSkeleton` + `useDeferredLoading` + 加载失败重试，`AppList.vue:75, 153-176`） | 管理入口 | `AppDetail` | — | 用 `route.query` 指定选中项（`:224, 607`） |

- 骨架屏规范：见 `.trellis/spec/frontend/component-guidelines.md:309-342`、`index.md:94`。
  - 等数据的视图默认要有骨架，而且要和真实版式一致
  - 用 `TxRowSkeleton`、`TxSkeleton`、`SettingSkeleton` 加 `useDeferredLoading`（默认 delay 150ms、minDuration 400ms，`packages/tuffex/.../use-deferred-loading.ts:24-28`）
  - 后台刷新不要换回骨架
  - 骨架要设 `aria-hidden`
- 键盘：`useKeyboardNavigation`（`composables/useKeyboardNavigation.ts:55-123`）
  - 监听挂在 document 上，在 INPUT、TEXTAREA、contentEditable 里不响应
  - 在 `onMounted`/`onUnmounted` 时注册和注销。**KeepAlive 停用页面时不会注销**，缓存着的页面会继续响应方向键。
  - 提供 `enabled?: Ref<boolean>` 开关，可以配合 `onActivated`/`onDeactivated` 使用
  - 只有 Channels 页在用它
- `TuffItemTemplate` 自带 `tabindex=0` 和 Enter/Space 激活（`TuffItemTemplate.vue:82-89`）；`TuffAsideList` 是 `ul role=listbox` 加 `button role=option`。

### Related Specs

- `.trellis/spec/frontend/component-guidelines.md:309-342`：加载态和骨架规范
- `.trellis/spec/frontend/index.md:94`：骨架是硬性规则
- `.trellis/spec/frontend/type-safety.md:735-800`：Metadata-Only Tombstone Explain（审计详情里 `memory-tombstoned` 的计数和文案）
- `.trellis/spec/frontend/privacy-data-lifecycle.md:177, 279`：Memory 独立于集中隐私类目和保留策略
- `.trellis/spec/frontend/plugin-runtime-security.md:2246`：只有纯 `contextEvaluateMemory` 允许插件调用
- 没有专门讲「设置 IA / 子页」的 spec。规则只写在 `categories.ts` 和 `router.ts` 的注释里，靠 smoke test 守着。

## Design implications（只给方案，不含实现）

1. **路由键和文件名（基本被测试锁死）**
   - key `memory`
   - path `/setting/intelligence/memory`
   - 页面文件 `views/base/intelligence/IntelligenceMemoryPage.vue`（smoke test 的文件名规则决定）
   - `router.ts` 的 `childLoaders` 加 `'intelligence/memory'`，name 用 `$I18n:router.intelligenceMemory`（漏了会让整个 renderer 起不来）
   - keep-alive key 自动是 `setting-intelligence-memory`
   - 会自动多一条 `/intelligence/memory` 重定向
   - 拆出来的列表、详情、编辑器组件放到 `components/intelligence/memory/`（或保留在 `audit/` 再改名），**不能放进 `views/base/intelligence/`**
2. **加不加 navIcon**（这是需要老板拍板的取舍）
   - **方案 A：加 navIcon**，提升到侧栏。
     - 好处：现有 4 个 split 子页（channels、prompts、agents、capabilities）全都提升到了侧栏，这样一致；进入后侧栏有高亮。
     - 代价：图标要加进 `uno.config.ts` 的 `SETTINGS_CATEGORY_ICONS`（建议在已有图标里选，现在记忆复核用的是 `i-carbon-policy`）；会改动兄弟任务 `10-03-intelligence-settings-revamp` 写死的侧栏顺序验收，需要对齐，比如追加成「… / 技能 / MCP / 记忆」。
     - 一旦提升，记忆就不会再出现在枢纽入口行里。
   - **方案 B：只放在枢纽**（不加 navIcon，和 audit、workflows 一样）。
     - split 布局没有标题和返回按钮，侧栏也没有任何行会高亮，用户从枢纽进来就没有回去的路。仓库里还没有「只在枢纽、又是 split」的先例，需要自己在 detail 头部或 aside 头部放一个返回入口。
     - 还要把 `settingsIntelligenceHub.label`「工作流与审计」改名。
   - **建议 A**；B 的成本主要在返回入口和改组名。
3. **在 children 数组里的位置**：数组顺序同时决定枢纽和侧栏的顺序。
   - A：放在 `capabilities`（以及兄弟任务要加的 `mcp`）之后，侧栏变成「智能 / 模型渠道 / 语音输入 /（提示词 / Agents，beta）/ 技能 / MCP / 记忆」。
   - B：放在 `audit` 前，枢纽普通模式显示 `[记忆, 审计]`，开发者模式显示 `[工作流, 记忆, 审计]`。
   - 现在没有测试锁这个顺序。
   - 记忆复核原来对所有人可见，所以**不要标 beta 或 advanced**。
4. **i18n**
   - 新增 `settingsIntelligenceHub.memory`、`settingsIntelligenceHub.memoryDesc`、`router.intelligenceMemory`
   - 改 `settingsIntelligenceHub.auditDesc`，去掉「记忆复核」
   - 方案 B 还要改 `settingsIntelligenceHub.label`
   - 页面新增：空选态标题和说明、新建按钮、删除确认（标题、正文，按 PRD 要提示「后续回答不会再使用这条记忆」）
   - 顺手统一「记忆审核」和「记忆复核」的用词
   - 两种语言必须同时加
5. **aside 放什么**
   - 搜索：用 `SettingsPage` 自带的搜索框，加防抖后调服务端 `contextListMemories({query})`，换搜索条件时 offset 归零
   - `#filter`：type、scope、status 三个筛选（status 默认 `all`）
   - `#aside`：列表行（标题用 summary；副标题用 type·scope；徽标显示停用；还可以标出「不会注入」，比如 workspace/project/没有来源的 session）+ 列表末尾的「加载更多」或上一页/下一页，每页 20 条
   - `#aside-footer`：「新建记忆」，参照 Channels 和 Prompts
   - 首次加载用骨架（`useDeferredLoading` + 首次加载标志），之后刷新保持内容不换
6. **detail 放什么**
   - 选中时：用 `TxScroll` 加 `#header`，头部放 summary、启用状态和操作（编辑、启停、删除）；正文分组显示：
     - 内容全文
     - 注入信息：模型实际看到的是 summary，以及按范围判断会不会被注入
     - 来源与审计：会话、轮次、隐私、创建/更新时间、替换来源
     - 「最近使用 / 使用次数」现在永远是空，可以去掉或加注释
   - 编辑态和新建态：把现有表单、评估、结果卡、保存/替换/忽略整套搬过来
   - 没有选中且不在新建时：`TxEmptyState variant="no-selection"`，配记忆专用文案
   - `#overlay`：删除确认框（照 Prompts 用 `TxBottomDialog`），现在的删除没有确认
7. **状态衔接**
   - 替换成功后选中项切到新 id
   - 删除成功后选中同位置的下一条（参考 Channels `:279-299`）
   - 启停会改 `updatedAt`：要么只在本地更新、保持位置，要么接受重载后排序变化
   - 发生 `MEMORY_REPLACE_CONFLICT` 时重载列表，并保持或重新选中
   - KeepAlive 下需要 `onActivated` 刷新列表，否则只在第一次挂载时加载
   - 如果用 `useKeyboardNavigation`，用 `enabled` 绑定页面是否处于激活状态
8. **测试迁移**
   - `IntelligenceMemoryReview.test.ts` 的流程断言（先评估后保存、失效、替换和 CAS、冲突、启停、tombstone、服务端筛选）要跟着拆分后的组件迁移，`data-testid` 能保留尽量保留
   - 照 `IntelligenceChannelsPage.test.ts:142-182` 补一个页面外壳测试：断言 `.SettingsPage-Split` 存在，list 在 aside、空态在 detail
   - smoke test 和翻译覆盖率测试会自动拦住缺文件或缺键
9. **可以顺带做的入口（可选）**
   - 把 PRD 里 Explain Drawer 的「打开 Memory 面板」接到 `/setting/intelligence/memory`，参考 Applications 用 `route.query` 指定选中项的做法
   - 增加 `settings-memory` CoreBox 目的地（约束见 Q1）

## Caveats / Not Found

- 「手动新建默认 `session` 范围的记忆永远不会注入」和「usageCount/lastUsedAt 从未写入」都是从代码路径推出来的，没有在真实 profile 上验证。默认范围怎么定是产品问题，需要老板决定。
- 没读 `docs/design/corebox/v2.5.0.pen`（artboard `iqbKR`，`categories.ts:6` 提到它是设置 IA 的设计源），.pen 文件只能用 pencil MCP 读。
- 兄弟任务 `10-03-mcp-settings-page`、`10-03-skills-page-revamp` 的 PRD 还是 TBD 模板，research 目录是空的，具体 key（比如是否把 `capabilities` 改名成 `skills`）还没定。改 `categories.ts`、`router.ts`、zh/en JSON 时需要和它们协调先后顺序。
- 没有找到任何讲「设置子页 IA」的 spec 文件。
