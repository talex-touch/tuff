# nexus-admin-ai-services

后台「AI 服务」组页面的行为规格。本版覆盖 AI 概览 `/admin/intelligence-overview` 与 AI 调用审计 `/admin/intelligence-audits`。服务渠道 `/admin/provider-registry` 由后续 change 补入本规格。

两页都挂在后台布局下：管理员闸门、侧栏与切页骨架由布局负责，页面不自带闸门，也不会对非管理员发请求。页面只用后台组合件（`AdminPageShell`、`AdminSection`、`AdminStatGrid`、`AdminFilterBar` / `AdminFilterField`、`AdminFormField`、`AdminTable`、`useAdminList`、`useAdminResource`、`useAdminFormat`、`resolveAdminErrorMessage`），并显式 import。

## Requirement: 页面外壳

两页都使用 `AdminPageShell`：

- 标题取侧栏文案键：`dashboard.sections.menu.intelligenceOverview`（AI 概览 / AI Overview）和 `dashboard.sections.menu.intelligenceAudits`（AI 调用审计 / AI Call Audits）；
- 「刷新」放在 `#actions`；
- 正文不再出现第二个页级标题或副标题，区块标题由 `AdminSection` 承担。

### Scenario: AI 概览标题与侧栏一致

- WHEN 管理员以中文打开 `/admin/intelligence-overview`
- THEN 页面标题为「AI 概览」，与侧栏选中项文字相同
- AND 正文中没有「智能概览」二级标题及其副标题，也没有 `ClientOnly` 的手写跳动占位

验收：A1

### Scenario: AI 调用审计标题与侧栏一致

- WHEN 管理员以中文打开 `/admin/intelligence-audits`
- THEN 页面标题为「AI 调用审计」，与侧栏选中项文字相同；英文为「AI Call Audits」

验收：A7

## Requirement: 概览指标

概览数据来自一次 `GET /api/dashboard/intelligence/overview`，通过 `useAdminResource` 加载。`summary` 渲染为 `AdminStatGrid` 的四张卡：

| 卡片 | 数据 | 显示 |
| --- | --- | --- |
| 样本请求数 | `summary.totalRequests` | `useAdminFormat().number` |
| 成功率 | `summary.successRate`，接口给的是 0–100 的整数 | `percent(successRate / 100)` |
| Token 消耗 | `summary.totalTokens` | `number` |
| 平均延迟 | `summary.avgLatency`，单位毫秒 | `「{number(ms)} ms」`；`sampleSize` 为 0 时显示「—」 |

「基于最近 N 条审计」提示（N 取 `summary.sampleSize`，带千分位）只出现一次，放在指标区块的说明里。

### Scenario: 指标格式化

- WHEN overview 返回 `totalRequests: 1234, successRate: 87, totalTokens: 1234567, avgLatency: 1850, sampleSize: 200`
- THEN 四张卡依次显示「1,234」「87%」「1,234,567」「1,850 ms」
- AND 「基于最近 200 条审计」在页面上只出现一次
- AND 当 `sampleSize` 为 0 时，平均延迟显示「—」

验收：A2

## Requirement: 加载与失败

overview 请求的状态分为四种：

- 首次加载：指标卡与 Top 列表显示同尺寸骨架（`AdminStatGrid` 的 `loading` 与行状 `TxSkeleton`）。
- 刷新：已有内容保留，不换回骨架。
- 首次失败：还没有数据时，区块显示 `TxErrorState`，文案经 `resolveAdminErrorMessage`、带本地化兜底，并提供「重试」。
- 刷新失败：已有数据时，保留数据并显示失败提示与「重试」。

失败文案绝不包含 `/api/` 路径或 ofetch 的请求行。

### Scenario: 首次加载、刷新与失败可以区分

- WHEN 页面首次加载 overview
- THEN 指标卡和四个 Top 列表显示与成品同尺寸的骨架
- WHEN 用户点「刷新」
- THEN 已有指标和列表留在屏幕上，直到新数据到达
- WHEN 还没有数据时 overview 请求失败
- THEN 区块显示本地化失败文案和「重试」，文案不含 `/api/`；点「重试」成功后显示内容
- WHEN 已有数据时刷新失败
- THEN 原有内容保留，同时显示失败提示和「重试」

验收：A3

## Requirement: Top 列表

overview 返回的四个列表各放一个 `AdminSection`：

- `models`：模型分布；
- `providers`：服务渠道 Top，此前已返回但未展示；
- `ips`：IP 热点；
- `countries`：国家 / 地区。

每行显示名称（过长省略，悬停可看全文）和 `number` 格式的次数。列表为空时显示「暂无数据」；它和加载失败（由「加载与失败」负责）在文案和样式上都不同。

### Scenario: 四个 Top 列表

- WHEN overview 返回四个非空列表
- THEN 页面显示模型分布、服务渠道 Top、IP 热点、国家 / 地区四个列表，次数带千分位
- WHEN 某个列表为空
- THEN 该列表显示「暂无数据」，其余列表照常显示

验收：A4

## Requirement: 用户消耗查询

「用户消耗查询」区块包含一个 `AdminFormField`（标签「用户 ID」，`for` 关联输入框）和「查询」按钮：

- 输入去掉首尾空白后为空时，「查询」不可点；
- 按 Enter 与点「查询」效果相同；
- 查询调用 `GET /api/dashboard/intelligence/usage?userId=<去掉首尾空白的输入>`，通过 `useAdminResource`（`immediate: false`）发出，较新的查询胜出。

结果展示：

- 有记录时，四张 `AdminStatGrid` 卡：请求数（`totalRequests`，该用户的全部历史）、Token 消耗、成功率、最近请求时间（`tableDateTime`，悬停显示 `dateTimeTitle`；没有时显示「—」）；
- 卡片下方是模型分布；
- 无记录（`totalRequests` 为 0）时显示「该用户暂无 AI 调用记录」；
- 失败时显示本地化文案。接口返回 `ok: false` 也按失败处理，同样显示本地化文案，不显示服务端原文。

### Scenario: 查询一个用户

- WHEN 管理员在「用户 ID」输入框中输入一个用户 ID 并按 Enter
- THEN 显示该用户的请求数、Token 消耗、成功率、最近请求时间四张卡和模型分布
- WHEN 输入一个没有调用记录的用户 ID 并查询
- THEN 显示「该用户暂无 AI 调用记录」
- WHEN 查询请求失败
- THEN 显示本地化失败文案，不含 `[GET] "/api/…"`，也不含服务端英文原文
- WHEN 连续快速查询两个不同的用户
- THEN 页面只显示后一次查询的结果

验收：A5

## Requirement: 手动 IP 封禁区块

手动 IP 封禁区块的代码行原样留在 `components/dashboard/intelligence/IntelligenceOverviewPanel.vue` 中，与 stage 逐字节一致，包括：

- 状态、`ipBanAuthHeaders`、四个请求函数；
- `onMounted` 中属于该区块的分支；
- 模板中的 step-up 输入、添加表单、列表，以及「当前环境未启用风险控制能力」提示。

该文件中其余的概览内容迁出。页面在概览内容之后渲染这个组件。它的迁移与改造归风控子任务。

### Scenario: IP 封禁区块不变

- WHEN 对比 stage 与本分支的 `IntelligenceOverviewPanel.vue`
- THEN 只出现 IP 封禁区块以外的删除，区块的行没有任何改动
- AND 风控开关关闭时，页面仍显示「当前环境未启用风险控制能力」提示，位置在概览内容之后

验收：A6

## Requirement: 调用列表

AI 调用审计通过 `useAdminList` 调用 `GET /api/dashboard/intelligence/audits`，参数为 `page`、`limit`、`userId`、`providerId`；值为空的筛选不发送。

列表用 `AdminTable`，放在不带内边距的 `AdminSection` 中。列：

| 列 | 宽度 | 内容 |
| --- | --- | --- |
| 时间 | 148 | `tableDateTime`，悬停显示 `dateTimeTitle` |
| 服务渠道 / 模型 | 自适应，≥ 220 | 渠道名或类型名，后接模型 |
| 结果 | 120 | 成功 / 失败徽标，附 HTTP 状态码 |
| 延迟 | 96 | 「{number(ms)} ms」 |
| 接口 | 200 | 单行省略 |
| Trace | 160 | 单行省略，悬停显示全文 |

- 每页条数可选 20 / 50 / 100，「共 N 条」始终显示。
- 1280px 视口下表格不横向溢出，所有单元格单行显示。
- 「刷新」保留现有行，只更新数据。

### Scenario: 列与格式

- WHEN 管理员打开 AI 调用审计
- THEN 表格列依次为时间、服务渠道 / 模型、结果、延迟、接口、Trace
- AND 时间形如 `2026-10-03 06:21`，悬停显示完整本地化时间；延迟形如「1,850 ms」；结果列为成功或失败徽标并附状态码
- AND 在 1280px 视口下表格没有横向滚动，单元格不折行

验收：A7

## Requirement: 调用筛选与深链

筛选栏用 `AdminFilterBar`，含两个带标签的文本字段：「用户 ID」（`userId`）和「服务渠道 ID」（`providerId`），都使用 `TxSearchInput` 的内置防抖。

- 筛选变化后回到第 1 页。
- 页码、每页条数与两个筛选都同步到 URL query：值等于默认值的参数不写入；带这些参数打开链接时恢复对应状态。
- 空态分两种：「还没有调用记录」，以及「没有符合筛选的记录」（附「清空筛选」）。

### Scenario: 筛选、分页与深链

- WHEN 管理员在「用户 ID」中输入一个 ID 并停止输入
- THEN 约 300ms 后列表按该用户筛选，回到第 1 页，URL 带上 `userId`
- WHEN 管理员把每页条数改为 50，再翻到第 2 页
- THEN URL 带上 `limit=50` 与 `page=2`；在新标签页打开这个链接，显示同一页、同一筛选
- WHEN 筛选后没有记录
- THEN 显示「没有符合筛选的记录」和「清空筛选」，与「还没有调用记录」不同

验收：A8

## Requirement: 调用详情

表格行可点击。点行，或聚焦行后按 Enter，打开只读详情抽屉（`TxDrawer`，宽 520，内容用 `TxDescriptions`），字段如下：

- 完整时间（`dateTimeTitle`）；
- 服务渠道名称、类型名与服务渠道 ID；
- 模型、用户 ID、完整接口、HTTP 状态码与结果、延迟、Trace ID；
- 错误信息（有则显示）；
- metadata：逐项以「名称—值」列出，嵌套对象与数组格式化展示，不出现整段 JSON 字符串；
- 响应片段（有则以等宽块显示）。

抽屉可用 Esc、遮罩或关闭按钮关闭；同时只显示一条记录。

### Scenario: 打开一条调用详情

- WHEN 管理员点一行，或聚焦一行后按 Enter
- THEN 打开该记录的只读详情抽屉，列出完整时间、服务渠道名称 / 类型 / ID、模型、用户 ID、完整接口、状态码与结果、延迟、Trace ID
- AND 有错误信息时显示错误信息；metadata 逐项列出，没有整段 JSON 字符串
- WHEN 按 Esc
- THEN 抽屉关闭

验收：A9

## Requirement: 类型文案

审计记录里的服务渠道类型在中英文下都有可读名称。类型值有两个来源：

- `IntelligenceProviderType` 的六种：`openai`、`anthropic`、`deepseek`、`siliconflow`、`local`、`custom`，已有名称；
- 服务渠道厂商 `PROVIDER_REGISTRY_VENDORS` 中尚无名称的三种：`dashscope`、`tencent-cloud`、`exchange-rate`，本次补上。

未知类型回落显示原始值，不显示 `intelligence.types.*` 原始键，也不显示空白。

### Scenario: 每种类型都有名称

- WHEN 审计记录的服务渠道类型为 `dashscope`、`tencent-cloud` 或 `exchange-rate`
- THEN 列表与详情中都显示该类型的可读名称，中英文都有
- WHEN 类型不在已知列表中
- THEN 显示原始类型值

验收：A10
