# 智能用量审计

## 目标与适用范围

「设置 › 智能 › 审计」回答「AI 用了多少、花在哪、哪里出错、离上限还有多远」。本能力包括四部分：

- 主进程用量账本与读接口；
- models.dev 定价目录；
- 本机全局上限；
- 审计洞察页及其共享洞察组件。

统计覆盖本机全部 AI 调用方。以下调用不进审计，页面在说明里注明：渠道连通性测试、实时流式 ASR、Nexus scene（截图翻译 / 划词翻译 / 汇率），以及结果缓存与 TTS 缓存命中。

## 用量账本

计数与明细分开：

- 每次会写审计的调用（成功或失败）都更新计数，与「启用审计」无关；
- 「启用审计」只决定是否把这次调用写成 `intelligence_audit_logs` 明细行；
- 隐私清理只删明细，不动计数与上限。

计数桶有两类，都存在 `intelligence_usage_stats`，不改表结构：

| 桶 | 调用方键 | 周期键 | 时区 | 计入 |
| --- | --- | --- | --- | --- |
| 逐调用方（既有） | 原 caller，或 `system` | `day:YYYY-MM-DD`、`month:YYYY-MM` | UTC，语义不变 | 全部条目 |
| 全局（新增） | 保留键 `__global__` / `system` | `day:YYYY-MM-DD`、`month:YYYY-MM` | 主进程本地时区 | 全部条目，`agent.run`、`workflow.execute` 外层行除外 |

- 本地日 / 月键由唯一的 helper 生成；读接口同时返回时区名。
- 任何列出全部调用方的读取都排除全局保留键。
- 外层行仍计入逐调用方桶，因为那是发起方唯一的归属来源。

写入端：

- 审计行的 `provider` 统一记实际选中渠道的配置 id。主路径、fallback、失败、stream 四条路径一致，provider 自报的上游 id 不落库。
- 内置调用使用以下稳定调用方。调用方是不透明标识，不按分隔符拆分。

| 调用点 | 调用方 |
| --- | --- |
| Home 对话轮 | `core.home.conversation` |
| Home 开场白 | `core.home.opening` |
| 会话标题 | `core.home.conversation-title` |
| CoreBox 上下文动作 | `core.corebox.context-action` |
| 剪贴板 OCR | `core.ocr.clipboard` |
| OCR 文本 embedding | `core.ocr.embedding` |
| 文件内容 embedding | `core.files.embedding` |
| 宿主 TTS（无 caller 时） | `core.app.tts` |
| 宿主 chatLangChain（无 caller 时） | `core.app.chat` |

已有的 `core.voice.*`、`core.assistant.*`、`core.recommendation.*`、`omni-panel`、`ai-cli-orchestrator`、`plugin:<name>`、`system` 等保持不变。

新鲜度：

- 总量与上限读数 = 库值 + 尚未落库的增量；增量在该批次落库提交后扣减，落库失败重排队时不扣。
- 明细最多约 30 秒后可见，页面写明。

历史回填：

- 升级后首次启动，先在 `system_config` 写入带截止时间的待回填标记，再开始实时累加。
- 后台用截止时间之前、仍在保留期内的明细回填全局桶：排除外层行，费用按当前定价目录重算。回填和标记改为完成在同一个写事务里。
- 中途失败整体回滚，下次启动用同一个截止时间重做，结果不重复。保留期之前的日子没有数据，属正常。

新装默认：

- `DEFAULT_GLOBAL_CONFIG.enableAudit` 为 true，主进程首启播种与渲染层存储迁移都读这个常量；
- 已持久化的值一律不改。

### Scenario: 关闭审计仍然计数

验收：A1

WHEN 「启用审计」关闭时完成一次调用。
THEN 明细表没有新行，全局桶与这次调用方的计数各加 1。
AND 审计开启时完成的调用同时写明细与计数，两者整数一致。

### Scenario: 全局桶按本地自然日切分

验收：A2

WHEN 主进程时区为 Asia/Shanghai，两次调用分别发生在本地 07:59 与 08:01（跨 UTC 日界）。
THEN 两次调用落在同一个本地日；跨本地零点的两次调用落在两个本地日。
AND 时区为 America/Los_Angeles 时同样按当地零点切分。

### Scenario: 外层编排行不重复计数

验收：A3

WHEN 一次 `agent.run` 内部发起两次模型调用。
THEN 全局桶请求数加 2，Token 等于两次内层调用之和；外层行不计入全局桶。

### Scenario: 历史回填幂等且原子

验收：A4

WHEN 含历史明细的库首次在新版本启动。
THEN 全局桶等于按本地日重算的期望值，再次启动不重复回填。
AND 回填事务中途失败时，库里不留下任何回填数据，标记仍为待回填。

### Scenario: 渠道归属与内置调用方

验收：A5

WHEN 同一个自定义渠道先后完成 chat 调用、完成 embedding 调用、发生一次失败调用。
THEN 三条审计行的 `provider` 都是该渠道的配置 id。
AND Home 对话、CoreBox 上下文动作、剪贴板 OCR、文件 embedding 的新行，`caller` 是上表对应的 `core.*` 值。

### Scenario: 新装默认开启审计

验收：A6

WHEN 用全新 profile 首次启动。
THEN `enableAudit` 为 true；已持久化为 false 的 profile 升级后仍为 false。

### Scenario: 总量包含未落库的增量

验收：A8

WHEN 一次调用刚完成，批量落库尚未发生。
THEN 2 秒内 `getUsageInsights` 返回的今日请求数已包含这次调用。

## 读接口与权限

新增接口都定义在 `packages/utils` 的 transport 域里，主进程 handler 首行校验宿主来源，同时进入插件 facade 的 host-only 清单。

- `getUsageInsights({ range })`：`range` 为 `today`、`7d` 或 `30d`。
  - `today` 指本地今天 0 点至今，`7d`、`30d` 为含今天往回数的本地日。
  - 返回内容：
    - 时区与窗口；
    - 全局桶总量（含未落库增量）；
    - 稀疏的本地日序列；
    - 渠道、模型、能力、调用方四维拆解，附明细覆盖率；
    - 零费用模型清单；
    - 上限状态；
    - 审计状态（开关、保留期、最早明细时间）；
    - 定价目录状态。
  - 拆解排除外层行；调用方为空的旧行按 `metadata.operation` 再分。
- `queryAuditLogs(query)`：
  - 筛选：时间范围、成功 / 失败、渠道、调用方、能力、模型；
  - 分页：`offset`，`limit` 截断到 1–200，缺省 50；
  - 返回 `{ rows, total }`，行只带安全的 metadata。
- `getUsageLimits()`、`setUsageLimits(limits)`：见「全局上限」。

### Scenario: 新接口只对宿主开放

验收：A7

WHEN 插件来源调用用量洞察、调用记录、全局上限读写、MCP 清单或技能清单接口。
THEN 返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`，`plugin-facing-events.test.ts` 通过。
AND `queryAuditLogs` 传入大于 200 的 `limit` 时只返回 200 行，`total` 与筛选条件一致。

## 定价目录

拉取与缓存：

- 主进程通过统一网络层（走用户代理）拉取 `https://models.dev/api.json`，带 `If-None-Match` 条件请求。
- 精简为「服务商 → 模型 → 单价 + 上下文 + 输出上限」后，存为 `system_config` 的一行，带 `sha256` 自校验。
- 模块启动后至少延迟 30 秒再检查，距上次检查超过 24 小时才请求；读接口发现过期时只在后台触发。
- 返回 200 时重写缓存，返回 304 时只更新检查时间；失败保留旧缓存并限频记录日志。
- 从未成功时，一切按「未找到定价」处理，并标明定价目录尚未下载。拉取不阻塞启动与任何调用。

解析：输入为渠道配置 id 与模型名。

1. 特殊类别：
   - Nexus 托管渠道 → `credits`（Nexus 积分）；
   - 本地渠道（Ollama、系统 OCR、本机 CLI 且无自报费用）→ `local`。
2. 选服务商：
   - 按渠道类型映射；
   - 自定义或兼容渠道，按 base URL 主机与目录里服务商的 `api` 主机精确匹配。
3. 在选中服务商下按以下顺序查模型：原样、小写、去 `org/` 前缀、去日期后缀、去 `:latest`。
4. 未命中时按模型族回退到原厂服务商（`gpt-*` → openai、`claude-*` → anthropic、`gemini-*` → google 等）。
5. 仍未命中 → `unpriced`（未找到定价）。不跨转售商取价，不做模糊匹配。

目录里有定价但输入、输出都为 0 的记 `free`。

费用：

- 估算费用的取值优先级：
  1. 显式费用；
  2. provider 自报费用（Pi CLI）；
  3. `priced` 时按「输入 token × 输入单价 + 输出 token × 输出单价」（USD / 1M）；
  4. 其余为 0。
- 结果保留 6 位小数。
- 费用在落库的准备阶段计算。删除 `MODEL_COSTS` 与默认价。
- 首次拿到可用目录时写入起算标记：此后写入的明细费用可信，之前的行在读侧按当前目录重算。

按模型拆解的每一行带：定价状态、解析到的服务商与模型、输入 / 输出单价、上下文长度、输出上限。

### Scenario: 按渠道解析模型价格

验收：A9

WHEN 用 models.dev 子集夹具估算官方 OpenAI 渠道的 `gpt-4o`、base URL 为 `dashscope.aliyuncs.com` 的自定义渠道，以及未知网关上的 `claude-sonnet-4-5`。
THEN 三者分别按 `openai`、`alibaba-cn`、`anthropic` 的价格计费。
AND Ollama 模型记「本地」、Nexus 记「Nexus 积分」、未收录模型记「未找到定价」，三者费用为 0；离线且无缓存时全部为「未找到定价」，调用不被阻塞；ETag 命中时不重写缓存。

## 全局上限

存储与接口：

- 保存在 `intelligence_quotas` 的保留行（`__global__` / `system`），恒为启用。该表不参与同步，上限只管本机。
- 维度为每日 / 每月 × 请求数 / Token / 估算费用（USD），可任意组合，未设即不限。
- `setUsageLimits` 整行替换：缺省或 `null` 表示清除。请求数与 Token 必须是正整数，费用必须大于 0，否则返回 `INVALID_REQUEST`。在事务里写库，提交后再刷新缓存。
- 通用配额接口的列表过滤掉保留行，也不能借通用 `setQuota` 改写它。

执行：

- 所有 `invoke()`、`stream()` 都检查，不论有无 caller（含后台）。检查位置在结果缓存未命中之后、逐调用方配额之前，沿用 `enableQuota` 总开关。
- 读数 = 全局桶本地日 / 月的库值 + 未落库增量 + 请求数的在途放行数；任一项「已用 ≥ 上限」即拒绝。
- 在途放行数保证并发时请求数上限精确：只剩 1 个名额时，N 个并发请求只放行 1 个。
- Token 与费用是事后计量，可能被在途请求小幅越过，页面写明。
- 被拒请求与缓存命中都不计数、不写审计。

报错：

- 新增共享错误码 `USAGE_LIMIT_REACHED`，与 Nexus 积分或团队配额的 `QUOTA_EXHAUSTED` 区分。
- reason 写明是哪一项上限，以及本地重置时间（次日 0 点或次月 1 日 0 点）。
- 消息里不出现 `quota exceeded`、`rate limit` 这类会被旧规则误判的词。
- 归一化在 quota 分支之前识别该错误码。
- 宿主的智能调用通道与流式通道一样做错误投影：
  - 宿主渲染层拿到规范化的错误码与 reason；
  - 插件只拿到稳定的错误码。
- 以下入口都显示「已达到你设置的上限」：CoreBox AI 答案、OmniPanel、VoicePanel、Home 听写提示、Home 对话、CoreBox 结果信号。其中 CoreBox AI 答案、OmniPanel、Home 对话给出打开 `/setting/intelligence/audit` 的入口。
- 官方插件 `touch-intelligence` 识别该错误码，只给文案，不加跳转。

后台降级：

| 后台调用方 | 遇到 `USAGE_LIMIT_REACHED` |
| --- | --- |
| 文件 embedding | 停止当前与后续批次，到重置时间前不再发起；在文件索引诊断里写明暂停原因 |
| 剪贴板 OCR | 任务以该错误码结束，不重试 |
| 推荐语义层 | 当日关闭语义层，回落到非语义排序 |

三处都不进入重试循环。

状态：每个已设上限项都返回已用量、上限、比例、重置时间与状态。比例 ≥ 0.8 为提醒，到顶为已暂停。

### Scenario: 上限读写与本机保存

验收：A10

WHEN 设置「每日 3 次请求」后读回，再传 `null` 清除后读回，并重启应用。
THEN 读回值依次为 3、不限，重启后与库里一致。
AND 同步载荷里不出现该设置。

### Scenario: 到顶拒绝所有调用方

验收：A11

WHEN 设置「每日 3 次请求」后，不同调用方（含无 caller 的 Home 对话与后台 embedding）发起第 4 次调用。
THEN 第 4 次被拒；缓存命中既不被拒也不计数；跨本地零点后恢复放行。
AND 「每日 Token」与「每日费用」上限按同样规则拒绝。

### Scenario: 上限错误到达各界面入口

验收：A12

WHEN 一次调用因全局上限被拒。
THEN 错误码为 `USAGE_LIMIT_REACHED`，reason 含上限项与本地重置时间；宿主渲染层拿到的是该错误码，而不是「The operation failed. Please retry.」。
AND 六个界面入口显示本地上限文案而不是 Nexus 积分文案，`QUOTA_EXHAUSTED` 仍给原文案；CoreBox AI 答案、OmniPanel、Home 对话可以从提示直接打开审计页。

### Scenario: 后台 embedding 暂停并说明原因

验收：A13

WHEN 文件 embedding 运行中触发全局上限。
THEN 后续批次停止，不进入重试循环。
AND 文件索引诊断显示「因用量上限暂停」及重置时间。

## 审计洞察页

结构（`SettingsPage` column 布局，返回「智能」）：

- 标题行：
  - 标题「审计」；
  - 右侧「调用记录」按钮与 ⋯ 菜单，菜单项为设置、导出 CSV、导出 JSON。
- 提示条，按需出现：读取失败（带重试）、导出进度、审计未开启（带一键开启）、上限 ≥ 80% 或已到顶、定价目录不可用。
- 范围切换：今天 / 近 7 天 / 近 30 天，默认近 30 天。范围超出明细保留期时，在去向与记录处注明。
- 指标：
  - 主指标为 Token，分输入 / 输出；
  - 辅助指标为请求（成功 / 失败）、成功率、平均延迟、估算费用；
  - 估算费用标「估算」，带悬停说明与零费用模型提示。
- 趋势：本地自然日柱图，可切换三种指标：
  - Token（输入 / 输出堆叠）；
  - 请求（成功 / 失败堆叠）；
  - 估算费用。

  X 轴是本地日期，零值不画柱，缺失的日子补零。
- 去向：
  - 维度切换：渠道 / 模型 / 能力 / 调用方。
  - 展示：份额条（前 5 + 其他）加可排序表，列为请求、Token、估算费用、失败数。
  - 名称映射：
    - 渠道显示名称与图标，已删除的渠道标「已删除」；
    - 模型行带定价元数据；
    - 能力显示标签；
    - 调用方显示插件名或内置调用方名；旧数据中调用方为空的行按 Home 各项区分，其余归「应用内其他」；`system` 显示「能力测试」。
  - 明细覆盖不足（审计曾关闭、保留期短于范围、隐私删除）时注明覆盖率。
- 限额卡：
  - 已设的上限显示日 / 月用量进度；
  - 未设时给「设置上限」入口；
  - 上限编辑抽屉有六个数字输入，费用项注明是估算，并附零费用模型提示。
- 调用记录抽屉：
  - 列：时间、能力、渠道 · 模型、调用方、Token、耗时、状态；
  - 筛选：状态、渠道、调用方、能力；
  - 分页：服务端分页，显示总数；
  - 行详情：trace、用量、估算费用、错误码、metadata、上下文包与检查点；
  - 导出：按当前筛选分页拉全，导出全部结果，不只是当前页。
- 设置抽屉：
  - 「启用审计」说明只存元数据、不含对话内容、保留 N 天，且关闭后仍计数；
  - 响应缓存与过期时间只保留一个控件；
  - 跳转到管理保留期与删除的设置页；
  - 页面上不再有重复的开关。

状态：

- 首次加载显示骨架，骨架与真实版式一致；
- 切换范围与 KeepAlive 激活时只重拉，不清空已显示内容；
- 审计未开启时，总量、趋势、上限照常显示；
- 区间无调用时显示空态。

文案：使用 `intelligenceAudit.*` 命名空间，中英文同步。`settingsIntelligenceHub.auditDesc` 不再提记忆复核。

移除：`IntelligenceUsageStats`、`IntelligenceUsageChart`、`IntelligenceAuditLogs`（逻辑迁入记录抽屉）、`IntelligenceAuditOverlay`、`IntelligenceGlobalSettings` 五个旧组件，以及只被它们使用的旧文案键。

### Scenario: 审计页各状态的真机呈现

验收：A14

WHEN 在隔离 dev 实例里依次构造：有数据、审计未开启、区间无调用、读取失败、首次加载。
THEN 指标、趋势、去向四维与限额卡按数据呈现；其余状态分别显示一键开启提示、空态、带重试的错误提示，以及与真实版式一致、无跳动的骨架。
AND 记录抽屉的筛选、分页、详情可用，导出的 CSV 与当前筛选一致；设置抽屉的开关生效。

### Scenario: 趋势按本地日期且零值无柱

验收：A15

WHEN 近 30 天中有若干天没有调用。
THEN X 轴显示本地日期，没有被逐字拆开的星期标签。
AND 没有调用的日子不显示柱子或细线。

### Scenario: 零费用模型在三处列出

验收：A16

WHEN 区间内有 Ollama 模型和一个 models.dev 未收录模型的调用。
THEN 估算费用指标的提示、按模型拆解、费用上限设置三处都列出这两个模型及原因（本地 / 未找到定价），并说明其调用未计入估算费用、费用上限管不到它们。

### Scenario: 旧实现清理干净

验收：A17

WHEN 检查仓库与审计页。
THEN 五个旧组件不存在，全仓没有引用；审计页没有记忆复核区块。
AND `translation-coverage.test.ts` 通过。

## 共享洞察组件

`apps/core-app/src/renderer/src/components/settings/insights/` 下有五个组件，样式继续用 `--shell-*` token：

- 标题行 `InsightsHeader`；
- 提示条 `InsightsNotice`：错误用 `role="alert"`，其余用 `role="status"`；
- 主指标 `InsightsHeroMetric`；
- 辅助指标卡 `InsightsMetricCard`；
- ⋯ 菜单 `InsightsMenu`。

语音页、审计页、技能页与 MCP 页都使用这组组件。语音页迁移后外观与行为不变，原有 `data-testid` 全部保留。

### Scenario: 语音页迁移无回归

验收：A18

WHEN 语音页切换到共享组件。
THEN `VoiceInsights.test.ts` 不改断言即全部通过，迁移前后的同尺寸截图逐区域对比无差异（数据不同除外）。
AND 审计页与语音页的标题行、指标卡来自同一组组件。

## 隐私与契约

- `docs/engineering/specs/` 中的契约同步更新：
  - Pi provider 契约：计数与明细一致，只限审计开启时段；
  - 隐私数据生命周期：计数常开；
  - 主进程 spec：新增用量账本、全局上限、定价目录的契约。
- `docs/engineering/sensitive-data-inventory.json` 的计数项写明：审计关闭时也写入；读取方、写入方与保留说明同步更新。
- 新错误码在共享类型、各处渲染层分类器、Nexus 错误契约表与测试中同步。Nexus 服务端不会产生它。

### Scenario: 契约与敏感数据清单同步

验收：A21

WHEN 检查文档与清单。
THEN 上述 spec 与敏感数据清单已更新，敏感数据清单校验通过，`coreapp-ui-contract` 检查通过。
