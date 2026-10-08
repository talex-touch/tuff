# nexus-admin-ai-services

后台「AI 服务」组页面的行为规格，覆盖 AI 概览 `/admin/intelligence-overview`、服务渠道 `/admin/provider-registry` 与 AI 调用审计 `/admin/intelligence-audits`。

三页都挂在后台布局下：管理员闸门、侧栏与切页骨架由布局负责，页面不自带闸门，也不会对非管理员发请求。页面只用后台组合件（`AdminPageShell`、`AdminSection`、`AdminStatGrid`、`AdminFilterBar` / `AdminFilterField`、`AdminFormField`、`AdminTable`、`AdminConfirmDialog`、`useAdminList`、`useAdminQueryState`、`useAdminResource`、`useAdminFormat`、`resolveAdminErrorMessage`、`createClientListFetcher`），并显式 import。

## Requirement: 页面外壳

两页都使用 `AdminPageShell`：

- 标题取侧栏文案键：`dashboard.sections.menu.intelligenceOverview`（AI 概览 / AI Overview）和 `dashboard.sections.menu.intelligenceAudits`（AI 调用审计 / AI Call Audits）；
- 「刷新」放在 `#actions`；
- 正文不再出现第二个页级标题或副标题，区块标题由 `AdminSection` 承担。

### Scenario: AI 概览标题与侧栏一致

- WHEN 管理员以中文打开 `/admin/intelligence-overview`
- THEN 页面标题为「AI 概览」，与侧栏选中项文字相同
- AND 正文中没有「智能概览」二级标题及其副标题，也没有 `ClientOnly` 的手写跳动占位

Acceptance: A17

### Scenario: AI 调用审计标题与侧栏一致

- WHEN 管理员以中文打开 `/admin/intelligence-audits`
- THEN 页面标题为「AI 调用审计」，与侧栏选中项文字相同；英文为「AI Call Audits」

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

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

Acceptance: A17

## Requirement: 服务渠道外壳

`/admin/provider-registry` 使用 `AdminPageShell`：

- 标题取侧栏文案键 `dashboard.sections.menu.providerRegistry`（服务渠道 / Provider Registry）。
- `#actions` 放「刷新」：刷新注册表资源和当前标签页的列表，刷新期间已有内容保留。
- `#nav` 自上而下放两样东西：
  - 五张统计卡（`AdminStatGrid`）；
  - 分区条：由 `useAdminQueryState('tab', ['providers', 'routes', 'usage', 'health'], 'providers')` 读写 `?tab=`。切换用 `replace` 导航并保留其他 query；不认识的值回到 `providers`。
- 正文不再出现以下标题与说明：「已注册服务渠道」「能力路由」「用量账本」「健康检查」「服务渠道能力索引」。区块标题由 `AdminSection` 承担，正文没有 `max-w-*` 限宽。

五张统计卡（数字用 `useAdminFormat().number`）：

| 卡片 | 数字 | 说明 |
| --- | --- | --- |
| 服务渠道 | 服务渠道总数 | 已启用数 |
| 能力 | 已声明的能力数 | — |
| 场景 | 场景数 | — |
| 用量 | 用量账本总条数：观测窗口请求 `usage?limit=25` 返回的 `total` | — |
| 健康 | 未通过的检查总数：`health?status=degraded,unhealthy&limit=1` 返回的 `total` | — |

页面不自带管理员闸门：

- `useProviderRegistryAdmin` 不 watch 角色、不调用 `useAuthUser()`、不导航；
- 面板不渲染「只有管理员可以管理服务渠道」；
- 非管理员由后台布局拦截。

### Scenario: 标题与面板

- WHEN 管理员以中文打开 `/admin/provider-registry`
- THEN 页面标题为「服务渠道」，与侧栏选中项文字相同
- AND 正文中没有「已注册服务渠道」「能力路由」「用量账本」「健康检查」「服务渠道能力索引」这些标题与说明
- AND 1920px 宽时内容随外壳铺开，不受 `max-w-*` 限制

Acceptance: A1

### Scenario: 标签页深链

- WHEN 管理员点分区条上的「能力路由」
- THEN URL 变为 `?tab=routes`，并显示能力路由标签页
- WHEN 直接打开 `/admin/provider-registry?tab=usage`
- THEN 显示用量标签页
- WHEN 打开 `?tab=unknown`
- THEN 显示服务渠道标签页
- WHEN URL 已有 `pv_q=openai` 时切换到「健康」
- THEN URL 保留 `pv_q=openai`

Acceptance: A2

### Scenario: 统计卡

- WHEN 管理员在任一标签页查看页面
- THEN 五张统计卡显示在分区条上方，数字带千分位
- AND 用量卡的数字等于用量标签页筛选为「全部」时的「共 N 条」
- AND 健康卡的数字等于健康标签页筛选为「需关注」时的「共 N 条」

Acceptance: A3

### Scenario: 页面不自带闸门

- WHEN 阅读 `useProviderRegistryAdmin`
- THEN 其中没有针对管理员角色的 `watch`，也没有 `useAuthUser()` 和 `navigateTo` 调用
- WHEN 非管理员访问 `/admin/provider-registry`
- THEN 后台布局显示无权限状态，页面不挂载，也不发出注册表请求

Acceptance: A14

## Requirement: 服务渠道加载与失败

注册表数据作为一个资源，由 `useAdminResource` 加载。加载顺序：

1. `POST …/seed`；
2. 并行请求：
   - `GET …/providers`（含适配器目录）；
   - `GET …/capabilities`；
   - `GET …/scenes`（含就绪状态）；
   - `GET …/usage?limit=25`；
   - `GET …/health?limit=25`；
   - `GET …/health?status=degraded,unhealthy&limit=1`；
3. 按服务渠道请求配额。

它供以下区域使用：

- 五张统计卡；
- 服务渠道表、能力路由表、能力索引；
- 服务渠道表的健康徽标，以及能力路由表的「最近运行」（取最近 25 条用量和最近 25 次检查）。

注册表资源的四种状态：

- 首次加载：统计卡显示同尺寸占位，三张表显示贴合列宽的骨架行。
- 刷新：已有内容保留。
- 首次失败：依赖它的区域显示 `TxErrorState`。文案经 `resolveAdminErrorMessage`，带本地化兜底，并提供「重试」。点「重试」后，这些区域回到占位，直到新结果到达。
- 刷新失败：保留数据，显示失败提示和「重试」。

失败文案不含 `/api/` 路径或 ofetch 请求行。

用量账本与健康检查是独立的列表，各自加载、失败、重试，不受注册表资源影响。变更成功后，注册表资源刷新，已有内容保留。

### Scenario: 区域各自加载、各自失败

- WHEN 页面首次加载
- THEN 统计卡和服务渠道表显示与成品同尺寸的骨架
- WHEN 管理员点「刷新」
- THEN 已有统计与表格留在屏幕上，直到新数据到达
- WHEN 注册表请求失败，屏幕上还没有数据
- THEN 服务渠道标签页显示本地化失败文案和「重试」，文案不含 `/api/`
- AND 切到用量或健康标签页时，该列表照常加载
- WHEN 用量列表请求失败
- THEN 只有用量列表显示失败与「重试」，其他标签页不受影响

Acceptance: A4

## Requirement: 服务渠道列表

服务渠道、能力路由、能力索引三个列表都基于注册表资源，在客户端筛选和分页（`createClientListFetcher`），经 `useAdminList` 与 URL 同步。每个列表都用：

- `AdminFilterBar` + `AdminFilterField`（有可见标签）；
- `AdminTable`：放在不带内边距的 `AdminSection` 中，每页 20 / 50 / 100，「共 N 条」。

取默认值的参数不写进 URL。各列表的键前缀互不覆盖：服务渠道 `pv_`，能力路由 `rt_`，能力索引 `cap_`。

**服务渠道**：

- 筛选：
  - 搜索 `pv_q`：匹配名称、显示名称、ID、厂商、能力等字段，防抖约 300ms；
  - 状态 `pv_status`：全部 / 需关注 / 健康 / 受限 / 异常 / 未知。
- 列：

  | 列 | 内容 |
  | --- | --- |
  | 服务渠道 | 显示名称，单行省略，悬停看全文 |
  | 状态 | 开关：已停用为关，已启用与受限为开 |
  | 能力 | 最多 3 个能力徽标，其余显示「+N」 |
  | 健康 | 最近一次检查的状态徽标；没有检查时显示「未知」 |
  | 操作 | 检查、编辑、配额、删除四个图标按钮，各自有 `aria-label` 和提示文字 |

**能力路由**：

- 筛选：状态 `rt_status`，可选全部 / 需关注 / 已完成 / 失败 / 计划 / 未知。
- 列：

  | 列 | 内容 |
  | --- | --- |
  | 路由 | 名称，再加 `id · 归属` |
  | 启用 | 开关 |
  | 就绪 | 就绪状态徽标；缺少能力时附「缺失 N 项」 |
  | 最近运行 | 徽标 |
  | 操作 | 运行、编辑、删除图标按钮 |

**能力索引**：放在能力路由标签页内，路由列表之后。列为能力（名称与 id）、服务渠道、计量单位、适配器就绪。

两种空态：

- 没有数据：例如「还没有服务渠道」；
- 筛选后为空：以对应标题提示（例如「没有需要关注的服务渠道」），带「清空筛选」。

原来的彩色横幅不再出现，表格和单元格只用 `--tx-*` token 着色。1280px 视口下表格不横向溢出，单元格不折行。

三个列表都等注册表返回后再分页：链接里的页码（如 `rt_page=2`）不会因为数据晚到被改回第 1 页；注册表首次加载失败时，页码同样保留。

### Scenario: 服务渠道列表

- WHEN 管理员以 1280px 宽打开服务渠道标签页
- THEN 表格没有横向滚动，所有单元格单行显示
- WHEN 管理员在搜索框输入并停止输入
- THEN 约 300ms 后列表按关键字筛选，回到第 1 页，URL 带上 `pv_q`
- WHEN 状态筛选为「需关注」且没有符合的服务渠道
- THEN 表格显示「筛选后为空」的标题和「清空筛选」，与没有任何服务渠道时的空态不同
- WHEN 管理员把每页条数改为 50
- THEN URL 带上 `pv_limit=50`

Acceptance: A5

### Scenario: 能力路由与能力索引

- WHEN 管理员以 1280px 宽打开 `?tab=routes`
- THEN 路由表没有横向滚动
- AND 缺少能力的场景显示「降级」徽标和「缺失 N 项」
- WHEN 管理员点这一行
- THEN 详情抽屉列出全部缺失能力和每条无效绑定，原因为本地化文案（服务渠道不存在 / 能力缺失 / 适配器缺失 / 模型无效）
- WHEN 管理员在能力索引翻到第 2 页
- THEN URL 带上 `cap_page=2`，路由列表的页码不变

Acceptance: A7

## Requirement: 用量账本与健康检查

用量账本和健康检查是两个服务端分页列表，各自用 `useAdminList`：

- 键前缀：用量 `u_`，健康 `h_`；
- `page` / `limit` 原样作为请求参数，「共 N 条」取接口返回的 `total`；
- 每页 20 / 50 / 100。

两个列表都用 `AdminFilterBar` + `AdminTable`，放在不带内边距的 `AdminSection` 中。

**用量账本**（`GET …/usage`）：

- 筛选与接口参数：

  | 筛选 | 选项 | 接口参数 |
  | --- | --- | --- |
  | 状态 `u_status` | 全部 | 不发送 |
  | | 需关注 | `attention=true` |
  | | 已完成 / 失败 / 计划 | `status=completed` / `failed` / `planned` |
  | | 估算 | `estimated=true` |
  | 模式 `u_mode` | 全部 / 执行 / 试运行 | `mode=execute` / `dry_run` |
  | 服务渠道 `u_provider` | 注册表中的服务渠道 | `providerId` |
  | 场景 `u_scene` | 注册表中的场景 | `sceneId` |

- 列：

  | 列 | 内容 |
  | --- | --- |
  | 运行 | 场景，再加 `runId · 模式 · 能力` |
  | 状态 | 徽标 |
  | 服务渠道 | 名称 |
  | 计量 | 数量加单位 · 是否计费 |
  | 时间 | `tableDateTime`，悬停显示 `dateTimeTitle` |

**健康检查**（`GET …/health`）：

- 筛选与接口参数：

  | 筛选 | 选项 | 接口参数 |
  | --- | --- | --- |
  | 状态 `h_status` | 全部 | 不发送 |
  | | 需关注 | `status=degraded,unhealthy` |
  | | 健康 / 受限 / 异常 | `status=healthy` / `degraded` / `unhealthy` |
  | 服务渠道 `h_provider` | 注册表中的服务渠道 | `providerId` |

- 列：

  | 列 | 内容 |
  | --- | --- |
  | 服务渠道 | 名称，再加 `id · 厂商` |
  | 状态 | 徽标 |
  | 能力 | — |
  | 延迟 | 「{number} ms」 |
  | 检查时间 | `tableDateTime`，悬停显示 `dateTimeTitle` |

点行或在行上按 Enter，打开对应的只读详情抽屉（见「服务渠道详情」）。

### Scenario: 用量账本服务端分页与筛选

- WHEN 管理员打开 `?tab=usage` 并翻到第 2 页
- THEN 请求带 `page=2` 与当前 `limit`，「共 N 条」等于接口返回的 `total`，URL 带上 `u_page=2`
- WHEN 状态筛选选「需关注」
- THEN 请求带 `attention=true`，回到第 1 页，URL 带上 `u_status=attention`
- WHEN 状态筛选选「估算」
- THEN 请求带 `estimated=true`
- WHEN 在新标签页打开带 `u_status=failed&u_page=2` 的链接
- THEN 显示同一筛选、同一页
- WHEN 管理员点一行
- THEN 详情抽屉列出运行 ID、场景、模式、能力、状态、服务渠道、数量与计量单位、计费与估算、计价与服务渠道引用、错误码与错误信息、trace、回退链路与选中的服务渠道

Acceptance: A8

### Scenario: 健康检查服务端分页与筛选

- WHEN 管理员打开 `?tab=health` 并把状态筛选选为「需关注」
- THEN 请求带 `status=degraded,unhealthy`，URL 带上 `h_status=attention`
- WHEN 管理员点一行
- THEN 详情抽屉列出服务渠道、厂商、端点、能力、状态、延迟、受限原因、错误码与信息、request id 和检查时间

Acceptance: A9

## Requirement: 服务渠道详情

服务渠道与能力路由表格可点行。点行，或聚焦行后按 Enter，打开只读详情抽屉（`TxDrawer` + `TxDescriptions`）：

- **服务渠道**：
  - 基本信息：ID、厂商、适配器、端点、地域、认证类型、归属；
  - 完整能力列表：每项有计量单位、适配器就绪情况与原因；
  - 最近一次健康检查：状态、延迟、原因、检查时间；
  - 其他：最近一次用量、配额摘要、更新时间。
- **能力路由**：
  - 基本信息：ID、归属、策略、回退、所需能力；
  - 缺失能力的完整列表；
  - 无效绑定：服务渠道、能力、本地化原因；
  - 绑定列表；
  - 最近运行：状态、服务渠道、时间。

行内的开关和按钮阻止事件冒泡，点它们不会打开详情抽屉。抽屉可用 Esc、遮罩或关闭按钮关闭；同时只显示一条记录。

### Scenario: 打开服务渠道详情

- WHEN 管理员点服务渠道表的一行，或聚焦一行后按 Enter
- THEN 打开该服务渠道的只读详情抽屉，列出 ID、厂商、适配器、端点、地域、认证类型、归属、完整能力列表、最近健康、最近用量、配额摘要和更新时间
- WHEN 管理员点同一行的状态开关、检查、编辑、配额或删除
- THEN 不打开详情抽屉，只执行对应操作

Acceptance: A6

## Requirement: 服务渠道确认

以下操作先弹 `AdminConfirmDialog`。取消后不发请求、界面状态不变；确认后在请求结束前锁定按钮。

| 操作 | 确认内容 |
| --- | --- |
| 服务渠道状态开关 | 启用与停用两个方向都确认 |
| 场景启用开关 | 启用与停用两个方向都确认 |
| 运行抽屉的「执行」 | 会真实调用上游 |
| 保存服务渠道编辑 | 当编辑会删除已有能力时确认，列出将删除的能力 |
| 保存场景编辑 | 当编辑会删除已有绑定时确认，列出将删除的绑定 |
| 删除服务渠道 | 说明一并删除的能力数，替换原来的 `TxBottomDialog` |
| 删除场景 | 说明一并删除的绑定数，替换原来的 `TxBottomDialog` |

以下两项不确认：

- 「试运行」：不调用上游、不占用额度；
- 「检查」：行内图标打开检查抽屉，在抽屉里选定能力后点「检查」直接发出探测请求。按钮的提示文字说明它会向上游发一次探测请求。

绑定以「服务渠道 + 能力」识别，与服务端的唯一键一致：只改模型、优先级、权重或状态是编辑，不算删除。

确认框叠在抽屉上时，键盘只作用于确认框：Esc 关闭确认框（提交中不关闭），不会连带关掉下面的抽屉；Tab 在确认框内循环，不会被抽屉抢走焦点。

### Scenario: 确认后才执行

- WHEN 管理员关闭一个已启用服务渠道的状态开关
- THEN 先弹出确认；取消后开关仍为开，没有请求发出
- WHEN 管理员打开一个已停用场景的启用开关并确认
- THEN 发出启用请求，请求结束前确认按钮处于锁定状态
- WHEN 管理员在运行抽屉点「执行」
- THEN 先弹出确认；点「试运行」则直接运行
- WHEN 管理员删掉编辑抽屉中的一条已有能力后点保存
- THEN 先弹出确认并列出这条能力
- WHEN 管理员在检查抽屉选定能力后点「检查」
- THEN 直接发出检查请求，不弹确认

Acceptance: A10

## Requirement: 服务渠道抽屉表单

以下抽屉的块级字段一律用 `AdminFormField`，标签通过 `for` 关联控件：

- 服务渠道：创建、编辑、配额；
- 场景：创建、编辑、运行；
- 检查抽屉。

表格内的逐行编辑器（能力行、绑定行）用 `aria-label` 命名。

保存失败时，抽屉保持打开，并在抽屉内显示本地化错误。保存按请求代次处理：保存成功后只关闭发起这次保存的抽屉；保存期间打开了另一条记录的抽屉，旧的保存完成后不会关掉它。保存期间抽屉被关闭或换成了别的记录，之后保存失败时，用 toast 显示同一条本地化错误。

### Scenario: 抽屉字段与保存

- WHEN 管理员打开创建服务渠道抽屉
- THEN 每个块级字段都有可见标签，点击标签会聚焦对应控件
- WHEN 保存请求失败
- THEN 抽屉保持打开，显示本地化错误
- WHEN 管理员保存服务渠道 A 的编辑，在请求返回前打开服务渠道 B 的编辑抽屉
- THEN A 的保存完成后，B 的抽屉仍然打开

Acceptance: A11

## Requirement: 服务渠道文案与格式

所有可见文案走 `t()`，中英两份 `dashboard` route chunk 同步。

用词：

| 用词 | 用于 | 英文 |
| --- | --- | --- |
| 降级 | 只用于场景缺少能力（就绪状态 degraded） | Degraded |
| 回退 | 场景的 fallback 设置与回退链路 | Fallback |
| 受限 | 服务渠道状态与健康状态的 degraded | Degraded |

以下内容也走本地化文案，不再显示写死的英文：

- 就绪状态 `ready`；
- 运行提示里的 `${n} failed`；
- 客户端校验错误（JSON 解析、模型不在列表、数字、重复），其中的字段名用表单上的可见标签（例如「约束 JSON（第 2 行）」），不用请求字段路径；
- 无效绑定原因：`PROVIDER_MISSING`、`CAPABILITY_MISSING`、`ADAPTER_MISSING`、`MODEL_INVALID`。

传输层错误经 `resolveAdminErrorMessage`。

格式：

- 时间：表格用 `tableDateTime`，悬停显示 `dateTimeTitle`；详情抽屉用 `dateTime`。
- 数字（统计、计数、数量、配额）：`number`。
- 延迟：「{number(ms)} ms」，没有数据时为「—」。

### Scenario: 用词与本地化

- WHEN 管理员以中文查看能力路由标签页与健康标签页
- THEN 缺少能力的场景显示「降级」
- AND 场景的回退设置与回退链路显示「回退」
- AND 健康状态 degraded 显示「受限」
- AND 页面上没有 `ready`、`3 failed` 这类英文
- WHEN 保存时某条能力的 JSON 无法解析
- THEN 显示本地化的校验错误

Acceptance: A12

### Scenario: 时间与数字格式

- WHEN 管理员查看健康检查列表
- THEN 检查时间形如 `2026-10-03 06:21`，悬停显示完整本地化时间
- AND 延迟形如「1,850 ms」，没有数据时显示「—」

Acceptance: A13

## Requirement: 场景路由浏览器验证

spec `nexus-provider-scene-routing.md:105` 要求以下四项在真实浏览器中成立：

1. 服务渠道创建与编辑抽屉的适配器选择器，选项与 `GET …/providers` 返回的适配器目录一致。
2. 能力选择器列出完整的内置能力目录（`listTuffIntelligenceBuiltinAbilities()`），与预设无关。
3. 场景绑定行的模型选择器，除「使用默认模型」外，选项等于该行所选服务渠道的模型列表。
4. 缺少能力的场景在能力路由表显示「降级」与缺失原因。

### Scenario: 四项在浏览器中成立

- WHEN 管理员在创建服务渠道抽屉打开适配器选择器
- THEN 选项数量与名称和接口返回的适配器目录一致
- WHEN 在能力行打开能力选择器
- THEN 列出完整的内置能力目录
- WHEN 在场景绑定行选定一个服务渠道后打开模型选择器
- THEN 除「使用默认模型」外，选项等于该服务渠道的模型列表
- WHEN 某场景缺少所需能力
- THEN 能力路由表的就绪列显示「降级」和「缺失 N 项」，详情抽屉列出缺失原因

Acceptance: A15
