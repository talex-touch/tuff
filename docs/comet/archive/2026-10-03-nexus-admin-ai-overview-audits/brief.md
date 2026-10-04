# 目标

把后台「AI 服务」组的两个页面迁到统一后台骨架：AI 概览 `/admin/intelligence-overview` 和 AI 调用审计 `/admin/intelligence-audits`。迁移后：

- 去掉双重标题，标题与侧栏文案一致；
- 修正未格式化的数字和用浏览器默认语言格式化的时间；
- 加载、刷新、失败三种状态分开，可以区分；
- 审计记录从卡片流改为可筛选、可翻页、可深链的表格，带只读详情。

同时给后台组合件新增 `useAdminResource`。它负责单个非分页请求的加载、刷新、错误和请求代次，供概览、后续的服务渠道（5b）、数据分析、数据治理等页面复用。

这是父任务 `10-02-nexus-admin-console-overhaul`（已于 2026-10-03 随 Trellis → Comet 迁移冻结，交接副本见 `docs/engineering/workflow/handoffs/`）子任务 #5 的前半部分 5a；后半部分「服务渠道」（5b）另建 change。

# 范围

- AI 概览页：
  - `AdminPageShell`，标题取侧栏文案（AI 概览 / AI Overview），`#actions` 放「刷新」；
  - 去掉面板里的二级标题「智能概览」与副标题，去掉 `ClientOnly` 的手写跳动占位；
  - 四个指标改用 `AdminStatGrid`：样本请求数、成功率、Token 消耗、平均延迟；
  - 四个 Top 列表：模型分布、服务渠道 Top（接口已返回、此前未展示）、IP 热点、国家 / 地区；
  - 「用户消耗查询」：带标签的输入框，按 Enter 或点「查询」提交，结果卡与模型分布，「无记录」状态；
  - 所有数字与时间走 `useAdminFormat`，错误文案走 `resolveAdminErrorMessage`。
- 手动 IP 封禁区块不动：原样留在 `IntelligenceOverviewPanel.vue`，其余内容迁出该文件后，该区块的行逐字节不变，在页面上仍位于概览内容之后。
- AI 调用审计页：
  - `AdminPageShell`，标题取侧栏文案（AI 调用审计 / AI Call Audits），`#actions` 放「刷新」；
  - `AdminFilterBar`：用户 ID、服务渠道 ID，文本防抖；
  - `AdminTable`：列为时间、服务渠道 / 模型、结果、延迟、接口、Trace；每页 20 / 50 / 100；筛选与页码进 URL；
  - 点行或在行上按 Enter 打开只读详情抽屉（`TxDrawer` + `TxDescriptions`），metadata 逐项展示，不出现整段 JSON。
- 组合件：新增 `app/composables/useAdminResource.ts` 与单测，并在 `.trellis/spec/frontend/component-guidelines.md` 的后台组合件条目中登记。
- 文案：中英两份 `dashboard` route chunk 同步；补上缺失的服务渠道类型文案（`dashscope`、`tencent-cloud`、`exchange-rate`）。
- 测试：组合式函数与页面纯函数（列表参数、视图模型、详情字段）的单测；i18n 守卫覆盖新文件。

## 来源覆盖

覆盖边界：用户指定的输入材料中与 5a（AI 概览、AI 调用审计、`useAdminResource`）有关的全部条目，以及它们依赖的共用契约，具体包括：

- `docs/engineering/workflow/handoffs/10-02-nexus-admin-migrate-ai-services/prd.md` 的 Goal、R1、R3、R4、Acceptance Criteria、Out of Scope；
- 同目录 `research/current-state.md` 的 §1（与 R1、R3 有关的行）、§2、§4、§6（intelligence 行）、§7 和 Open questions 1、2、9、10、11；
- 父任务 `design.md` 的 §2.2 与 §4；
- 组合件 `design.md` §8；
- 老板 2026-10-03 的四项决定，以及请求中列出的默认项。

R2、Acceptance Criteria 第 2 条，以及老板四项决定的具体内容均属服务渠道（5b），本 change 只记录分类。

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| S1：prd.md Goal | complete | 消除双重标题；服务渠道限宽与溢出 | nexus-admin-ai-services「页面外壳」 | A1、A7 | covered | 双重标题部分在本 change；限宽与溢出属 5b |
| S2：prd.md R1 第 1 条 | complete | 标题改为侧栏文案「AI 概览」；删除面板 h2「智能概览」与副标题 | nexus-admin-ai-services「页面外壳」 | A1 | covered | 当前有效 |
| S3：prd.md R1 第 2 条 | complete | 四个指标用 `AdminStatGrid`，数字带千分位；Top 列表与用户查询放 `AdminSection`；「四个独立请求各自加载、失败、重试」 | nexus-admin-ai-services「概览指标」「Top 列表」「用户消耗查询」 | A2、A3、A4、A5 | covered | 「四个独立请求」与事实不符：IP 封禁以外只有两个请求（overview、usage），见 S16。按两个请求各自加载、失败、重试落实 |
| S4：prd.md R1 第 3 条 | complete | `ClientOnly` 手写跳动占位换成贴合版式的骨架 | nexus-admin-ai-services「加载与失败」 | A3 | covered | 当前有效 |
| S5：prd.md R1 第 4 条 | complete | 手动 IP 封禁区块不动（含 step-up 输入与「风险控制未启用」提示），由风控子任务迁走 | nexus-admin-ai-services「手动 IP 封禁区块」 | A6 | covered | 当前有效；保留位置见 D3 |
| S6：prd.md R2 | complete | 服务渠道页迁移 | — | — | non-goal | 属 5b |
| S7：prd.md R3 第 1 条 | complete | 标题改为「AI 调用审计」 | nexus-admin-ai-services「页面外壳」 | A7 | covered | 与 `/admin/audits` 重名已由 #2040 消除（S17），标题与侧栏不一致仍需修 |
| S8：prd.md R3 第 2 条 | complete | 卡片流改 `AdminTable`（时间、渠道 / 模型、结果与状态码、延迟、接口、Trace）；点行开详情抽屉（错误、完整接口、Trace、metadata）；按用户 ID 筛选 | nexus-admin-ai-services「调用列表」「调用详情」 | A7、A8、A9 | covered | 另加服务渠道 ID 筛选（D5） |
| S9：prd.md R3 第 3 条 | complete | 时间改用 `useAdminFormat` | nexus-admin-ai-services「调用列表」 | A7 | covered | 当前有效 |
| S10：prd.md R4 | complete | `provider-registry-admin.test.ts` 与 `docs-page-performance.test.ts:263-265` 的结构断言改为行为契约 | — | — | non-goal | 两组断言都属服务渠道，归 5b；两个 intelligence 面板目前没有测试，本 change 新增行为测试（A11） |
| S11：prd.md Acceptance 第 1 条 | complete | 逐条满足父任务 design §4；ego 截图存档并与基线对照（双重标题、重名、英文日期消失） | 验证预期 | A12 | covered | 截图存档位置改为本 change 的验证记录，交接副本不再写入 |
| S12：prd.md Acceptance 第 2 条 | complete | 服务渠道四个 tab 深链与 spec `:105` 四项浏览器验证 | — | — | non-goal | 属 5b |
| S13：prd.md Acceptance 第 3 条 | complete | 全量 vitest、typecheck、改动文件 eslint、`git diff --check` | 验证预期 | A12 | covered | 当前有效 |
| S14：prd.md Out of Scope | complete | 手动 IP 封禁区块不在范围；Provider Registry 的业务逻辑与接口不变 | 非目标 | — | non-goal | 与 S5、S6 一致 |
| S15：父任务 design §4 第 1–11 条 | complete | 迁移完成标准：标题等于侧栏、无自带闸门、骨架 / 刷新保留 / 失败可重试且不含 API 路径、列表组合件与 URL、只用 `useAdminFormat`、1280 不折行不溢出、全部走 `t()`、破坏性操作确认、详情走 `TxDrawer` + `TxDescriptions`、只用 `--tx-*` token、测试测行为、ego 截图 | nexus-admin-ai-services 各节 | A1–A12 | covered | 本 change 两页没有破坏性操作（IP 封禁区块不动），第 7 条不适用 |
| S16：research §2.1–2.4 | complete | overview 一个请求同时供四个指标、Top 列表与样本提示；usage 按需请求；`successRate` 是 0–100 的整数；`avgLatency` 单位毫秒；`totalRequests` 恒等于样本数（≤200）；`providers[]` 已返回未展示；用户查询的错误会带出 ofetch 原文，`ok:false` 带出英文原文 | nexus-admin-ai-services「概览指标」「Top 列表」「用户消耗查询」 | A2、A4、A5 | covered | 事实依据 |
| S17：research §1、§4 | complete | 审计接口参数 `page`、`limit`、`userId`、`providerId`；返回 `{audits,total,page,pageSize}`；字段清单；当前双请求与无代次问题；类型文案缺 `dashscope`、`tencent-cloud`；重名已消除 | nexus-admin-ai-services「调用列表」「调用详情」「类型文案」 | A7、A8、A9、A10 | covered | 事实依据；按代码复核，类型值还来自 `PROVIDER_REGISTRY_VENDORS`，另缺 `exchange-rate` |
| S18：research §2.5 | complete | IP 封禁区块行号、状态与共享物（只共享 4 个 import、`t`、根 div、`onMounted` 中的一个 if）；最小切口是组件边界 | nexus-admin-ai-services「手动 IP 封禁区块」 | A6 | covered | 事实依据 |
| S19：research §6（intelligence 行） | complete | 两个 intelligence 面板没有测试；`dashboard-admin-i18n-coverage.test.ts` 的 `ADMIN_SURFACE` 只扫描列出的目录与字面量键 | 验证预期 | A11、A12 | covered | 新文件要加入扫描范围 |
| S20：research §7 第 1、2、6、11 条 | complete | 非表格区块缺错误 / 重试 / 空态；缺单请求组合式函数；可点行会吞控件点击；小型排行列表缺骨架 | nexus-admin-resource；nexus-admin-ai-services「Top 列表」「加载与失败」 | A3、A4、A11 | covered | 第 2 条由新增 `useAdminResource` 补上；其余在页面内组合 `TxErrorState` / `TxEmptyState` / `TxSkeleton` |
| S21：research §7 第 3–5、7–10 条 | complete | 客户端分页表、空态措辞、列隐藏、校验文案丢失、表格内编辑器、多列表前缀、组合式函数位于面板内 | — | — | non-goal | 都只出现在服务渠道，归 5b |
| S22：research Open question 1 | complete | 「请求总量」实为样本数 | nexus-admin-ai-services「概览指标」 | A2 | covered | 按默认项改名「样本请求数」，不改接口（D1） |
| S23：research Open question 2 | complete | 是否展示服务渠道 Top | nexus-admin-ai-services「Top 列表」 | A4 | covered | 按默认项展示（D2） |
| S24：research Open question 9 | complete | 是否开放 `providerId` 筛选；`invoke-audits` 是否接入 | nexus-admin-ai-services「调用列表」 | A8 | covered | 开放 `providerId` 筛选（D5）；`invoke-audits` 不接入，列为非目标 |
| S25：research Open question 10 | complete | IP 封禁区块留原文件（S1）还是搬新组件（S2） | nexus-admin-ai-services「手动 IP 封禁区块」 | A6 | covered | 按默认项留原文件（D3），保住风控子任务的锚点 |
| S26：research Open question 11 | complete | 延迟用 `duration()` 还是精确毫秒 | nexus-admin-ai-services「概览指标」「调用列表」 | A2、A7 | covered | 按默认项显示精确毫秒带千分位（D4） |
| S27：research Open questions 3–8 | complete | 服务渠道统计卡位置、行点击、确认范围、URL 与分页、缺失能力展示、「降级」含义 | — | — | non-goal | 属 5b，已由老板 2026-10-03 决定，记入 5b |
| S28：组合件 design §8 | complete | 冻结 API 及已登记扩展（`queryKeyPrefix`、`tableDate` / `{timeZone:'UTC'}`、`AdminFormField`）；扩展须先登记再实现 | 约束与不变量；nexus-admin-resource | A11 | covered | 交接副本冻结后，登记改写在 `.trellis/spec/frontend/component-guidelines.md` |
| S29：父任务 design §2.2 | complete | 组合件职责与文件位置（`components/admin/`、`composables/`，页面显式 import） | 约束与不变量 | A11 | covered | 当前有效 |
| S30：老板 2026-10-03 决定 1–4 | complete | 行点击开只读详情、确认范围、用量 / 健康服务端分页、「回退」用词 | — | — | non-goal | 全部针对服务渠道，归 5b |
| S31：请求中的工作方式 | complete | 独立 worktree 基于 stage；PR 合进 stage；ego 验收 1280 / 1920 × 亮 / 暗 × 中 / 英；本机时区 America/Los_Angeles | 验证预期 | A12 | covered | 当前有效 |

# 非目标

- 服务渠道 `/admin/provider-registry`（5b）及其测试、交互确认、分页与「回退」用词改动。
- 手动 IP 封禁区块的任何改动：迁移、汉化、确认、step-up，都归风控子任务 #11。
- 接口与统计口径变更：概览仍基于最近 ≤200 条样本；不新增全量请求数接口；不接入 `invoke-audits`。
- 后台整体视觉重设计；冻结的交接副本（`docs/engineering/workflow/handoffs/`）不修改。

# 验收示例

- A1：中文进入 AI 概览，页面标题为「AI 概览」，与侧栏一致；英文为「AI Overview」。页面正文里不再出现「智能概览」二级标题和它的副标题，也不再出现手写的跳动占位。
- A2：概览有四张指标卡：样本请求数、成功率、Token 消耗、平均延迟。
  - 接口返回 `totalRequests: 1234, successRate: 87, totalTokens: 1234567, avgLatency: 1850, sampleSize: 200` 时，四张卡依次显示「1,234」「87%」「1,234,567」「1,850 ms」。
  - 「基于最近 200 条审计」只出现一次。
  - 样本为 0 时，平均延迟显示「—」。
- A3：概览的加载、刷新、失败三种状态可以区分：
  - 首次加载时，指标卡和列表显示同尺寸骨架；
  - 点「刷新」时，已有内容保留在屏幕上；
  - overview 请求失败且屏幕上还没有数据时，显示本地化失败文案和「重试」，文案不含 `/api/` 路径，点「重试」成功后恢复内容；
  - 已有数据时刷新失败，保留原有内容，同时显示失败提示和「重试」。
- A4：概览有四个 Top 列表：模型分布、服务渠道 Top、IP 热点、国家 / 地区。
  - 每行显示名称和带千分位的次数；
  - 列表为空时显示「暂无数据」，与加载失败的提示不同；
  - 首次加载时显示行状骨架。
- A5：「用户消耗查询」：
  - 输入框有可见标签「用户 ID」，并通过 `for` 关联；
  - 输入为空时「查询」不可点；按 Enter 与点「查询」效果相同；
  - 有记录时显示请求数、Token 消耗、成功率、最近请求时间（`YYYY-MM-DD HH:mm`，悬停可看完整时间）四张卡和模型分布；
  - 无记录时显示「该用户暂无 AI 调用记录」；
  - 失败时显示本地化文案，不含 ofetch 的 `[GET] "/api/…"` 原文，也不含服务端英文原文；
  - 快速连续查询两个用户，只显示后一次的结果。
- A6：手动 IP 封禁区块行为不变：
  - `IntelligenceOverviewPanel.vue` 中属于该区块的代码行与 stage 上逐字节一致；
  - 风控开关关闭时仍显示「当前环境未启用风险控制能力」提示；
  - 区块仍位于概览内容之后。
- A7：中文进入 AI 调用审计，页面标题为「AI 调用审计」，与侧栏一致。
  - 表格列依次为时间、服务渠道 / 模型、结果、延迟、接口、Trace；
  - 时间为 `YYYY-MM-DD HH:mm`，悬停显示完整本地化时间；延迟为「1,850 ms」形式；
  - 结果列显示成功或失败徽标，并附 HTTP 状态码；
  - 1280px 视口下表格不横向溢出，单元格不折行，过长内容以省略号截断。
- A8：AI 调用审计的筛选与分页：
  - 筛选栏有「用户 ID」「服务渠道 ID」两个带标签的输入，输入停止约 300ms 后生效，并回到第 1 页；
  - 每页条数可选 20 / 50 / 100；
  - 页码、每页条数和两个筛选都写进 URL，带这些参数打开链接时恢复同一页同一筛选，取默认值的参数不写进 URL；
  - 刷新时保留现有行；
  - 筛选为空与「没有任何记录」显示不同的空态。
- A9：点审计表格的任意一行，或聚焦行后按 Enter，打开只读详情抽屉，内容包括：
  - 完整时间；
  - 服务渠道名称、类型与 ID；
  - 模型、用户 ID、完整接口、状态码与结果、延迟、Trace ID；
  - 错误信息（有则显示）；
  - metadata：逐项以「名称—值」展示，嵌套值也格式化，不出现整段 JSON 字符串；
  - 响应片段（有则以等宽块展示）。
  - 抽屉可用 Esc 或关闭按钮关闭。
- A10：服务渠道类型在中英文下都有可读名称，包括此前缺失的 `dashscope`、`tencent-cloud`、`exchange-rate`，不再显示 `intelligence.types.*` 原始键或空白；未知类型回落显示原值。
- A11：`useAdminResource` 满足其规格：
  - 首次加载期间 `loading` 为真；
  - 刷新期间 `refreshing` 为真且保留 `data`；
  - 失败时 `error` 为本地化文案而非传输层原文；
  - 较新的调用胜出，较旧响应（含失败）不覆盖；
  - `immediate: false` 时不自动请求。
  - 有单测覆盖，并已登记在 `component-guidelines.md` 的后台组合件条目中。
- A12：全量门禁通过：
  - `apps/nexus` 全量 vitest、Nexus typecheck、改动文件的包内 ESLint、`git diff --check`；
  - i18n 守卫（键存在、后台覆盖）把新文件纳入扫描并通过；
  - 两页在真实浏览器（ego）中按 1280 / 1920 × 亮 / 暗 × 中 / 英各验一遍，截图存档，与基线对照：双重标题、英文日期、未格式化数字均已消失。

# 约束与不变量

- 只用后台组合件的冻结 API 与已登记扩展；新增 `useAdminResource` 前先在 `component-guidelines.md` 登记。页面显式 import 组件与组合式函数，新组件命名遵守 `component-auto-import` 守卫。
- 不改服务端接口与统计口径。
- 只用 `--tx-*` token 着色，亮 / 暗主题都没有写死的色值，也不用 `:deep()` 覆写 TuffEx 内部。
- 所有可见文案走 `t()`，中英 route chunk 同步，不出现 `isZh ?` 三元。
- 错误文案统一经 `resolveAdminErrorMessage`，绝不显示 ofetch 原文或服务端英文原文。
- 不修改冻结的交接副本；本 change 的进度与证据只写在本 change 的正式产物和验证记录中。

# 决策

- D1（默认项，老板未推翻）：「请求总量」改名「样本请求数」，不改接口。
- D2（默认项）：展示接口已返回的服务渠道 Top。
- D3（默认项）：IP 封禁区块原样留在 `IntelligenceOverviewPanel.vue`（research 的 S1 方案），保住风控子任务 #11 对该文件的锚点。
- D4（默认项）：延迟显示精确毫秒加千分位（「1,850 ms」），不用 `duration()`，因为它会在 ≥1s 时四舍五入到整秒。
- D5（默认项）：AI 调用审计开放接口已支持的 `providerId` 筛选，用文本输入，标签为「服务渠道 ID」。
- D6（老板 2026-10-03）：#5 拆成两个 change / PR。本 change 为 5a，服务渠道为 5b，5b 在本 change 合入后再开始，以便复用 `useAdminResource`。
- D7（Agent 实现选择，不改变用户可见结果）：概览的新内容放在页面与新组件中，`IntelligenceOverviewPanel.vue` 只保留 IP 封禁区块。

# 验证预期

- 门禁：在 `apps/nexus` 下按 CI 同款命令运行。
  - `./node_modules/.bin/vitest run`；
  - `PATH="$PWD/node_modules/.bin:$PATH" node build/check-typecheck-plugin-resolution.mjs`；
  - 包内 ESLint，只检查改动文件，不整文件 `--fix`；
  - `git diff --check`，同时检查未跟踪文件的行尾空白。
- IP 封禁区块逐字节不变：对比 stage 与本分支的 `IntelligenceOverviewPanel.vue`，只允许出现区块以外的删除。
- ego 验收：
  - 在 worktree 的 dev server 上做，用本地数据，会话为本地测试管理员账号；
  - 本机时区是 America/Los_Angeles，按洛杉矶时间计算时间预期值；
  - 交互用真实鼠标点击，不用 `element.click()` 合成点击，后者曾在下拉控件上造成误报。
- 截图与验收记录存放在本 change 的验证记录中，冻结的交接副本不写入。
