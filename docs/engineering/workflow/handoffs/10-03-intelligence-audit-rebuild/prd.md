# 智能审计页按洞察页 shell 重做（父任务）

## Goal

把「设置 › 智能 › 审计」从 7 张折叠卡竖排的长页，重做成与「语音输入」同一套洞察页 shell：页面本身回答「AI 用了多少、花在哪、哪里出错、离上限还有多远」，调用记录与设置收进抽屉。功能上：

- 修正统计口径（全部调用方、本地自然日）；
- 补上用量去向拆解（渠道 / 模型 / 能力 / 调用方）；
- 升级调用记录（筛选、总数分页、详情、全量导出）；
- 补上全局限制；
- 接入 models.dev 作为定价与模型元数据来源；
- 把「记忆复核」拆成「智能」下的独立子页。

本文件是父任务：持有全部需求与跨子任务验收，实现落在子任务里（见「子任务」）。

## Decisions（老板，2026-10-03）

| ID | 决定 |
|---|---|
| D1 | 建 Trellis 任务，先规划再实现。 |
| D2 | 功能四层全做：修正统计口径 / 拆解用量去向 / 升级调用记录 / 补上全局限制。 |
| D3 | 版式走洞察页，同「语音输入」：标题行 + 主指标 + 趋势 + 去向；调用记录、设置进抽屉。 |
| D4 | 记忆复核拆成「智能」下独立子页（主从布局），审计页只留用量与日志。 |
| D5 | 记忆子页进侧栏，排在 MCP 之后：侧栏「塔芙智能」组 = 智能 / 模型渠道 / 语音输入 / 技能 / MCP / 记忆。 |
| D6 | 手动新建记忆默认范围改为「全局」（当前唯一会被注入的范围）；「会话 / 工作区 / 项目」在选择处标「暂不生效」，已有的不生效记忆在列表与详情里同样标出。 |
| D7 | 洞察页骨架抽成 CoreApp 共享组件，审计页与语音页都切过去；语音页回归纳入验收。 |
| D8 | 用量计数与审计开关解耦：计数始终进行；「启用审计」只决定是否保存逐条记录。新装默认开启审计，老用户保留原值，页面在未开启时给一键开启。 |
| D9 | 全局限制计入所有 AI 调用（Home 对话、CoreBox、划词、插件、后台文件 embedding / OCR / 推荐，本地模型也算），周期 = 本地时区自然日 / 自然月；到顶即拒绝并提示「已达到你设置的上限」（与 Nexus 积分文案区分），后台功能暂停并写明原因；任一上限用到 80% 时页面先提醒。 |
| D10 | 写入端一起修：审计行统一记「实际选中的渠道配置 id」；内置调用补稳定 `core.*` 调用方。旧行读取时分层映射。 |
| D11 | 主数字用 Token（输入 / 输出）；费用降为辅助指标并标「估算」；全局限制可设请求数、Token、估算费用上限（界面写明是估算）。 |
| D12 | 接入 models.dev（「Token 费用这些信息都能从它获取」）作为定价与模型元数据唯一来源：替换 `MODEL_COSTS`，查不到定价按 0 计、不再用默认价编数字；按模型拆解时展示单价、上下文长度、输出上限。模型渠道页暂不接入（兄弟任务正在改该页）。 |
| D13 | 定价为 0 的模型要提示用户：凡展示估算费用处，区间内有调用落在「定价为 0 / 本地 / Nexus 积分 / 未找到定价」的模型上，列出这些模型并说明其调用未计入费用。 |

规划中的设计取舍（老板未逐条拍板，评审时可推翻），详见 `design.md`：

- 全局上限只管本机、不随同步走：`IntelligenceConfig` 在同步清单里（`apps/core-app/src/main/modules/sync/index.ts:84-91`），而计数按设备记；同步上限会让实际总量变成「设备数 × 上限」。
- 不新增「清空日志」按钮：清空与保留期统一在隐私设置里处理，设置抽屉给跳转。
- Nexus 托管调用按积分计费，不折算美元，归入 D13 的「Nexus 积分」类提示。

## Background（现状与证据）

### 页面

- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceAuditPage.vue`：`SettingsPage` column 布局 + 7 个 `TuffGroupBlock`（用量统计 / 用量趋势 / 记忆复核 / 审计日志（`v-if enableAudit`）/ 全局设置 / 审计设置 / 缓存设置）。
- 重复控件：「启用审计」同时在 `components/intelligence/config/IntelligenceGlobalSettings.vue`（`TuffBlockSwitch`）与页面审计设置块（`TxSwitch`）；「缓存」也两处，过期时间一处下拉（5m / 15m / 1h / 6h / 24h），一处数字输入（60–86400，`handleCacheExpirationBlur`）。
- 趋势图缺陷（`components/intelligence/audit/IntelligenceUsageChart.vue`）：
  - 星期标签用 `t('intelligence.usage.weekdays') as unknown as string[]`，但 `weekdays` 是数组键、`t()` 返回 key 路径字符串，结果被按星期下标逐字取出（截图 X 轴 i/i/n/t/e/l/l：9/19 周六 → 第 6 位 `i`，9/21 周一 → `n`）。
  - 零值也画柱（蓝黄细线，来自 `.bar { min-height: 2px }`）。
  - 日期用 `toISOString()`（UTC）。
  - 查询 `callerId: props.callerId || 'system'`。
- `IntelligenceAuditLogs.vue`：无筛选；CSV / JSON 只导出已加载行；行展开按 traceId 拉上下文包与检查点（`context-package-log-summary.ts`）。
- `IntelligenceAuditOverlay.vue` 无调用方（孤儿）。上述五个子组件只被本页使用。
- 参照 shell：
  - 「语音输入」：`IntelligenceVoicePage.vue` + `views/base/VoiceInsights.vue`（2294 行）——标题行（h1 + 记录按钮 + ⋯ 菜单）、`useDeferredLoading` 骨架、空态、主指标 + 辅助指标（`TxCard`）、记录抽屉（`TxDataTable` + `TxPagination` + 详情 + `FlipDialog`）、设置抽屉；样式用 `--shell-*` token，标题行 / 提示条 / 指标卡 / 菜单均为页面私有样式。测试 `VoiceInsights.test.ts`（839 行）。
  - 「更新」`views/base/settings/SettingUpdate.vue`：状态优先，高级项进开发者模式。
  - `components/settings/SettingsPage.vue`：仅 `column`（标题 / 返回）与 `split`（主从）两种形态。
- TuffEx 现成可用：`TxStatCard`、`TxTimeseriesChart`（`@talex-touch/tuffex/charts`，SVG + d3，`type='bar'` 自动堆叠，自带骨架 / 提示框）、`TxAllocationBar`、`TxFilterChips`、`TxDataTable`、`TxPagination`、`TxDrawer`、`TxPopover`、`TxProgressBar`、`TxNumberInput`、`TxEmptyState`。core-app 尚未使用 charts。

### 计数、审计与配额

- `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts`：
  - `getUsageStats(callerId, …)` 按 `callerId` 精确过滤（`:664-704`）；`getTodayStats/getMonthStats` 缺省 `'system'`（`:713-726`）→ 页面只显示 `system` 桶。
  - `aggregateUsageStatsByCallerAndPeriod` 用 `toISOString()` 切日 / 月 = UTC（`:48-104`），东八区「今天」从 08:00 起算。
  - 计数器只在审计落库事务里 upsert（`:511-517,539-601`），并被配额检查读取（`:584-591`，#780）。
  - 读接口只查库：flush 条件是 20 条 / 30 秒 / 200 ms 延迟（`:252-254,330-333,824-833`），刚发出的调用最多约 30 秒后可见。
- `enableAudit=false` 时 `writeSuccessAudit/writeFailureAudit` 直接 return（`ai/intelligence-sdk.ts:2355,2401`）→ 不写明细、不更新计数，按天 / 月的配额随之失效。
- **新装默认 `enableAudit=false`**：
  - `DEFAULT_GLOBAL_CONFIG`（`packages/utils/types/intelligence.ts:2942-2948`）；
  - 主进程首启播种（`ai/intelligence-config.ts:839-850`），运行时 `?? true` 只在字段缺失时生效（`:1211`）；
  - renderer 存储迁移 `enableAudit ?? false`（`packages/utils/renderer/storage/intelligence-storage.ts:259`）。
  - 结论：开箱审计页为空（截图全 0 与此一致；读代码推得，未在全新 profile 实测）。
- 明细保留期由隐私设置配置：1 小时到永久，默认 30 天（`apps/core-app/src/main/modules/privacy/retention-policy.ts:55`），每 24 小时清理一次，可经 `privacySdk.policy.get()` 读取。隐私清理只删明细，不动计数与配额（`.trellis/spec/frontend/privacy-data-lifecycle.md:177`）。
- 配额（`research/quota-system.md`）：
  - 接口全链路已存在、渲染层零调用：`getQuota / setQuota / deleteQuota / getAllQuotas / checkQuota / getCurrentUsage`（`packages/utils/transport/sdk/domains/intelligence.ts:715-738`）。智能页入口描述 `settingsIntelligenceHub.auditDesc` =「用量、日志、记忆复核与全局限制。」早已承诺「全局限制」。
  - 存储：`intelligence_quotas` 表（`apps/core-app/src/main/db/schema.ts:900-929`），按 `(caller_id, caller_type)` 精确匹配，无全局 / 通配；保留 id 先例 `__default_plugin__` 无人调用（`ai/intelligence-quota-manager.ts:459-475`）。
  - 检查只在 `invoke()/stream()` 且带 caller 时运行（`ai/intelligence-sdk.ts:714-723,950-959`），callerType 写死 `'plugin'`（`:2585`），且在缓存命中判断之前。
  - 超限抛 `[Intelligence] Quota exceeded: …`，归一成 `QUOTA_EXHAUSTED`，与 Nexus 积分 / 团队配额、provider 429 共用（`ai/intelligence-error-normalizer.ts:87-99`）。renderer 一律显示「检查 Nexus credits 或团队配额」（`renderer/src/modules/intelligence/ai-error-recovery.ts:58-67`，测试 `ai-error-recovery.test.ts:64-70` 写死）。共享错误码表 `packages/utils/transport/events/types/intelligence.ts:1-12`。被拦请求不写审计。
  - `setQuota` 的坑：省略 `enabled` → 缓存 `undefined` → 该调用方被拦；省略字段不清库、缓存与库不一致；`enabled:false` = 封禁。IPC `checkQuota` 有副作用（占名额）。
- `IntelligenceConfig` 参与云同步（`apps/core-app/src/main/modules/sync/index.ts:84-91`）。

### 数据质量（`research/audit-data-layer.md`）

- 原始表聚合可行：`idx_audit_timestamp` 覆盖范围扫描，20 万行 / 30 天实测总量 25 ms、分组 36–51 ms、本地日分组 75 ms；`model` 无索引。
- `provider` 列三义混存：
  - OpenAI 兼容系 chat 记渠道配置 id，同系 embedding / OCR / 图片 / 语音记渠道类型；
  - Anthropic / Ollama / Pi 记类型；
  - Nexus 记服务端 provider id；
  - invoke 失败行记选中渠道 id、model 固定 `'unknown'`（`ai/intelligence-sdk.ts:895-908`）。
  - 选中渠道配置 id 在 `strategyResult.selectedProvider.id`（`:764-768`），成功行却写 provider 自报的 `result.provider`（`:811-825,859-873`）。
- `caller` 大量为 NULL：
  - 为 NULL 的来源：Home 对话 / 开场白 / 会话标题、CoreBox 上下文动作、剪贴板 OCR、文件 embedding、无 caller 的 TTS / chatLangChain。
  - NULL 中只有 Home 可凭 `metadata.operation` 识别；`'system'` 实为能力测试。
  - 插件 caller = `plugin:<manifest name>`，由宿主强制绑定。
  - caller 是不透明标识，不得按分隔符拆（`docs/plan-prd/03-features/ai-2.5.0-plan-prd.md:26`、`docs/plan-prd/TODO-AI.md:59`）。
- 重复计数：`agent.run / workflow.execute` 外层行的 token = 内层 `'ai-cli-orchestrator'` 行之和，成本又按默认价重估。
- 成本：`MODEL_COSTS` 仅 11 个旧型号、精确匹配，其余按默认 $0.001 / $0.002 每 1K token；本地为 0；Pi CLI 用自报 cost；Nexus 实际按积分计费（`ai/intelligence-audit-logger.ts:129-146,300-313`）。
- 不进审计的调用：渠道连通性测试、实时流式 ASR（含端侧）、Nexus scene（截图翻译 / 划词翻译 / 汇率）、结果缓存与 TTS 缓存命中。
- 本地自然日先例：语音洞察由主进程按系统时区出日期 key 并返回 `timezone`，renderer 补零天（`apps/core-app/src/main/modules/voice/voice-insights-store.ts:74-80,397-448`）；libSQL `strftime(..., 'localtime')` 与 JS 本地日期实测一致。
- 新增读接口须 host-only：主进程 handler 首行 `assertHostOwnedIntelligenceControlPlane`（`ai/intelligence-module.ts:372-376`），并加入插件 facade host-only 清单（`packages/utils/plugin/sdk/intelligence.ts:16-158`），否则 `packages/utils/__tests__/plugin-facing-events.test.ts` 变红。`getAuditLogs` 无总数、`limit` 无上限、无 model 过滤（`ai/intelligence-audit-logger.ts:606-659`）。

### models.dev（2026-10-03 实测）

- `https://models.dev/api.json`：226 个服务商、8385 个模型；7303 个有定价、647 个明确 0 定价、435 个缺 `cost`。单位 USD / 1M token，字段 `input / output / cache_read / cache_write / reasoning / input_audio / output_audio / context_over_200k / tiers`；模型另有 `limit.context / limit.output / modalities`；多数服务商带 `api` 基址（如 `siliconflow-cn`、`alibaba-cn`、`deepseek`、`openrouter`）。
- 体积：全量 5.3 MB（gzip 传输 531 KB，约 1.2 s）；精简到「服务商 → 模型 → 价格 + 上下限」约 557 KB（gzip 76 KB）。Cloudflare 托管，带 `ETag`。
- 同一模型多家报价不同（`gpt-4o` 10 家、`gemini-2.5-pro` 15 家，含转售商）→ 必须先定服务商再查模型。
- 已下架型号（`claude-3-5-sonnet-20241022`）、Ollama 本地名（`qwen2.5:3b`）不收录；DeepSeek 官方别名 `deepseek-chat` 不在 `deepseek` 服务商下 → 会落到「未找到定价」。
- 仓库此前无任何 models.dev 接入（全仓扫描含阳性对照）。主进程统一网络层 `getNetworkService().request()`（`apps/core-app/src/main/modules/network/network-service.ts:740`，带代理）可复用。

### 记忆（`research/memory-subpage-and-ia.md`）

- 命名被测试锁定：key `memory`、路径 `/setting/intelligence/memory`、页面文件必须是 `views/base/intelligence/IntelligenceMemoryPage.vue`，且该目录不允许多余 `.vue`（`apps/core-app/src/renderer/src/modules/settings/categories.smoke.test.ts:177-190`）。
- `apps/core-app/src/renderer/src/base/router.ts:99-128` 的 `childLoaders` 是手写映射，漏加会让 renderer 启动即抛错且无测试覆盖。
- 侧栏图标须进 `apps/core-app/uno.config.ts:41-53` 的 safelist。
- split 布局无标题与返回（`SettingsPage.vue:24-29`）；有 `navIcon` 的子页才进侧栏，且不再出现在智能页入口行（`SettingIntelligencePage.vue:20-23`）。
- 只有 `global` 范围，或 `session` 且来源会话匹配的记忆会被注入（`apps/core-app/src/main/modules/ai/intelligence-context-hygiene.ts:1143-1166`，最多 5 条、注入 ≤240 字摘要）。手动新建默认 `temporary/session` 且不带来源会话 → 永远不会被使用。
- `usage_count / last_used_at` 全仓无写入点。替换会生成新 id，旧条目停用并写 tombstone；启停会刷新 `updatedAt`。删除无确认框，而 `docs/plan-prd/03-features/ai-2.5.4-context-hygiene-memory-details.md:481-486` 要求删除后提示「后续回答不会再使用这条记忆」。
- 文案：`intelligence.memoryReview.title` 是「记忆审核」，入口写「记忆复核」，用词不一。

### 文档硬约束

- 用量 / 审计统计 / 配额是宿主独占控制面（`docs/plan-prd/TODO-AI.md:53,55`）。
- 审计默认不保存完整 prompt / response（`ai-2.5.0-plan-prd.md:66`）。
- quota 用尽 / 校验不可用必须 fail-closed 并给恢复建议（`ai-2.5.0-plan-prd.md:24`、`TODO-AI.md:44`）。
- `.trellis/spec/main-process/pi-provider-contracts.md:191-195` 要求打包证据中计数器与审计行整数一致。
- 敏感数据生命周期变化须同步 `docs/engineering/sensitive-data-inventory.json`。

## Requirements

### A. 用量账本（主进程数据层）

- **R-A1 计数常开**（D8）：每次会写审计的调用（成功 / 失败）都更新计数，与 `enableAudit` 无关；`enableAudit` 只控制是否写入 `intelligence_audit_logs` 明细行。
- **R-A2 全局计数桶**（D2 / D9）：新增汇总全部调用方（含 caller 为空）的全局桶，按主进程本地时区的自然日 / 自然月切分；`agent.run / workflow.execute` 外层行不计入全局桶；按调用方的既有 UTC 桶语义不变（现有逐调用方配额不受影响）。
- **R-A3 历史回填**（D2）：升级后首次启动，用仍在保留期内的明细一次性回填全局桶（同样排除外层行、费用按 R-B3 重算）；回填幂等，中途失败不留下半套数据。
- **R-A4 渠道归属**（D10）：审计行 `provider` 统一记实际选中渠道的配置 id，主路径、fallback、失败、stream 四条路径一致。
- **R-A5 内置调用方**（D10）：Home 对话 / 开场白 / 会话标题、CoreBox 上下文动作、剪贴板 OCR、文件 embedding、宿主 TTS / chatLangChain 补稳定 `core.*` caller（命名表见 `design.md`）；caller 继续按不透明标识处理。
- **R-A6 新装默认开审计**（D8）：`DEFAULT_GLOBAL_CONFIG.enableAudit=true`；主进程播种与 renderer 存储迁移同步；已有持久值不变。
- **R-A7 洞察读接口**（D2 / D3）：host-only 的 `getUsageInsights({ range })`，返回：
  - 时区与窗口；
  - 全局桶的总量与本地日序列（含尚未落库的增量）；
  - 四维去向拆解（来自明细，附覆盖率）；
  - 限额状态；
  - 审计状态（开关、保留期、最早明细时间）；
  - 定价目录状态。
- **R-A8 调用记录接口**（D2）：host-only 的 `queryAuditLogs`，支持时间范围、状态、渠道、调用方、能力、模型筛选，`offset` + `limit ≤ 200`，返回 `{ rows, total }`，行带安全 metadata。
- **R-A9 新鲜度**：总量与限额读数包含尚未落库的增量；明细最多约 30 秒后可见，界面说明。
- **R-A10 插件不可读**：新事件进入插件 facade host-only 清单，主进程 handler 拒绝插件来源，契约测试同步。

### B. models.dev 定价（D11 / D12 / D13）

- **R-B1 定价目录**：
  - 主进程经统一网络层拉取 `https://models.dev/api.json`，ETag 条件请求，精简后缓存为本地可校验下载载荷，24 小时内最多刷新一次。
  - 拉取失败保留上次缓存；从未成功时一切按「未找到定价」处理并标明「定价目录尚未下载」。
  - 拉取不阻塞启动与调用。
- **R-B2 解析**：渠道 → models.dev 服务商（按渠道类型映射；自定义渠道按 base URL 主机匹配服务商 `api`；未知网关按模型族映射到原厂服务商）→ 模型 id（精确匹配，次选保守规范化）。
  - 本地渠道（Ollama、系统 OCR、本机 CLI 无自报费用时）记「本地」；
  - Nexus 托管记「Nexus 积分」；
  - 查不到记「未找到定价」；
  - 以上三类费用都按 0 计。
- **R-B3 费用计算**：估算费用 = 输入 token × 输入单价 + 输出 token × 输出单价（USD / 1M）。
  - provider 自报费用（Pi CLI）优先。
  - 写入明细与计数时计算；去向拆解按当前目录对明细重算。
  - `MODEL_COSTS` 与默认价移除。
- **R-B4 模型元数据**：拆解的模型行附带输入 / 输出单价、上下文长度、输出上限、定价状态与解析到的服务商。
- **R-B5 0 定价提示**：费用指标、按模型拆解、费用上限设置三处，若区间内有调用落在 R-B2 的 0 费用类别，列出模型与原因，说明其调用未计入估算费用、费用上限管不到它们。

### C. 全局限制（D9 / D11）

- **R-C1 存储**：本机保存（不随同步），用 `intelligence_quotas` 的保留行。专用 host-only 读写接口要求：
  - 校验非负数；
  - `null` 表示清除；
  - 写入恒为启用；
  - 不经过通用 `setQuota`。
- **R-C2 维度**：每日 / 每月 × 请求数 / Token / 估算费用（USD），任意组合，未设即不限。
- **R-C3 执行**：
  - 范围：所有 `invoke()/stream()`，不论有无 caller，含后台。
  - 时机：缓存命中判断之后、调用 provider 之前。
  - 读数：全局桶（本地日 / 月，含未落库增量）；任一项「已用 ≥ 上限」即拒绝。
  - 不计入：被拦请求、缓存命中。
  - 沿用 `enableQuota` 总开关。
- **R-C4 报错**：
  - 新增共享错误码 `USAGE_LIMIT_REACHED`（与 `QUOTA_EXHAUSTED` 区分），reason 写明哪一项上限与本地重置时间。
  - CoreBox AI 答案、OmniPanel、VoicePanel、Home 听写提示、Home 对话、CoreBox 结果信号都显示「已达到你设置的上限」，并给打开审计页的入口。
  - 插件拿到该错误码。
- **R-C5 后台降级**：文件 embedding、剪贴板 OCR、推荐语义遇到 `USAGE_LIMIT_REACHED` 时暂停、不重试风暴，并在各自现有的诊断 / 降级原因处写明。
- **R-C6 提醒**：任一上限用量 ≥ 80% 时审计页显示提醒；到顶时显示「已暂停，将于 <本地时间> 重置」。

### D. 审计洞察页（D3 / D7 / D11 / D13）

- **R-D1 骨架**：
  - 布局：`SettingsPage` column + 返回「智能」。
  - 标题行：h1「审计」，操作为「调用记录」+ ⋯ 菜单（设置、导出）。
  - 范围切换：今天 / 近 7 天 / 近 30 天，默认近 30 天；超出明细保留期时在去向与记录处注明。
- **R-D2 指标**：主指标 Token（输入 / 输出）；辅助指标为请求（成功 / 失败）、成功率、平均延迟、估算费用（标「估算」，悬停说明 + R-B5 提示）。
- **R-D3 趋势**：本地自然日柱图（`TxTimeseriesChart` bar），可切 Token（输入 / 输出堆叠）/ 请求（成功 / 失败堆叠）/ 估算费用；零值不画柱；日期按本地日。
- **R-D4 去向**：
  - 维度切换：渠道 / 模型 / 能力 / 调用方。
  - 展示：份额条 + 可排序表（请求、Token、估算费用、失败数）。
  - 名称映射：渠道名与图标（已删除渠道标「已删除」）、模型元数据（R-B4）、能力标签、调用方名（插件名 / 内置调用方名；旧数据的 NULL 归「应用内其他」，`system` 显示「能力测试」）。
  - 明细覆盖不足（审计曾关闭、保留期短于范围、隐私删除）时注明覆盖率。
- **R-D5 限额卡与编辑**：展示已设上限的日 / 月用量进度；未设时给「设置上限」入口；编辑抽屉按 R-C2 维度，费用项注明是估算并带 R-B5 提示。
- **R-D6 调用记录抽屉**：
  - 表格列：时间、能力、渠道 · 模型、调用方、Token、耗时、状态。
  - 筛选：状态、渠道、调用方、能力。
  - 分页：服务端分页并显示总数。
  - 行详情：trace、用量、估算费用与定价状态、错误码、metadata、上下文包 / 检查点（沿用现有加载逻辑）。
  - 导出：按当前筛选导出全部结果为 CSV / JSON，不止当前页。
- **R-D7 设置抽屉**：
  - 启用审计：说明只存元数据、不含对话内容、保留期 N 天，关闭后仍计数。
  - 响应缓存 + 过期时间：只保留一个控件。
  - 跳转隐私设置，管理保留期与删除。
  - 页面上不再有重复开关。
- **R-D8 状态**：
  - 首次加载：骨架与真实版式一致，经 `useDeferredLoading`。
  - 审计未开启：提示条 + 一键开启（总量 / 趋势 / 限额照常）。
  - 区间无调用：空态。
  - 读取失败：错误提示条 + 重试。
  - 新鲜度：给出说明。
- **R-D9 清理旧实现**：
  - 移除 `IntelligenceUsageStats`、`IntelligenceUsageChart`、`IntelligenceAuditLogs`（逻辑迁入记录抽屉）、`IntelligenceAuditOverlay`、`IntelligenceGlobalSettings`。
  - 页面不再挂记忆复核。
- **R-D10 文案**：中英同步；`settingsIntelligenceHub.auditDesc` 去掉「记忆复核」。

### E. 共享洞察页组件（D7）

- **R-E1**：在 `apps/core-app/src/renderer/src/components/settings/insights/` 抽出四个组件：标题行、提示条、主指标 / 辅助指标卡、⋯ 菜单。
- **R-E2**：语音页切到共享组件，外观与行为不变。
- **R-E3**：审计页使用同一套组件。

### F. 记忆子页（D4 / D5 / D6）

- **R-F1 路由与导航**：
  - key `memory`，路由文件 `IntelligenceMemoryPage.vue`，注册进 `childLoaders`。
  - 侧栏 `navIcon` 要进 safelist；侧栏排在 MCP 后，MCP 未落地时先排在最后一个已提升子页之后。
  - 不标 beta / advanced。
- **R-F2 主从**：
  - 左栏：
    - 服务端搜索，带防抖；
    - 类型 / 范围 / 状态筛选；
    - 列表：摘要、类型 · 范围、停用、不生效标记；
    - 分页；
    - 底部「新建记忆」。
  - 右栏：
    - 详情：全文、注入说明（模型看到的是摘要、该范围是否生效）、来源与审计字段、启停、编辑、删除；
    - 编辑器：评估 → 保存 / 替换 / 忽略。
  - 未选中：空态。
- **R-F3**：新建默认范围为全局；会话 / 工作区 / 项目标「暂不生效」；已有不生效记忆在列表与详情标出（D6）。
- **R-F4**：
  - 删除前确认，删除后提示「后续回答不会再使用这条记忆」。
  - 替换成功后选中新 id。
  - `MEMORY_REPLACE_CONFLICT` 时重载并保持选中。
  - KeepAlive 激活时刷新。
- **R-F5**：去掉恒为空的「最近使用 / 使用次数」。
- **R-F6**：迁移 `IntelligenceMemoryReview.test.ts` 的断言；用词统一为「记忆」。
- **R-F7**：新增 i18n 键 `settingsIntelligenceHub.memory` / `memoryDesc`、`router.intelligenceMemory` 和页面文案，中英同步。

### G. 契约与文档

- **R-G1**：spec 同步：
  - `pi-provider-contracts.md`：计数一致性限定在审计开启时段；
  - `privacy-data-lifecycle.md`：计数常开；
  - main-process spec：新增「用量账本 / 全局限制 / 定价目录」契约。
- **R-G2**：`docs/engineering/sensitive-data-inventory.json` 同步，并通过 `corepack pnpm privacy:inventory:verify`。
- **R-G3**：新错误码的共享类型、各处 renderer 分类器与测试同步。

## Acceptance Criteria

### 数据层与定价

- [ ] AC-1（R-A1）：关闭审计时发起一次调用：明细表无新行，全局桶与按调用方计数都 +1；开启时两者都增加，且整数一致。
- [ ] AC-2（R-A2）：本地时区下，跨 UTC 日界（东八区 07:59 与 08:01）的两次调用落在同一个本地日；跨本地零点的两次调用落在两个本地日。用固定时间戳 + 显式 TZ 的测试证明。
- [ ] AC-3（R-A2）：一次 `agent.run`（含两次内层模型调用）只让全局桶的请求 +2、Token 为内层之和，不重复。
- [ ] AC-4（R-A3）：用含历史明细的临时库首次启动：回填结果与按本地日重算的期望一致；再次启动不重复回填；在回填事务中途注入失败，库中无残留回填数据。
- [ ] AC-5（R-A4 / R-A5）：同一自定义渠道的 chat、embedding、失败三类调用，`provider` 都记该渠道配置 id；Home 对话、CoreBox 上下文动作、剪贴板 OCR、文件 embedding 的新行 `caller` 均为设计表中的 `core.*` 值。
- [ ] AC-6（R-A6）：全新 profile 首启后 `enableAudit === true`；已有 `false` 的 profile 升级后仍为 `false`。
- [ ] AC-7（R-A7 / R-A8 / R-A10）：
  - 两个新事件对插件来源返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`；
  - `plugin-facing-events.test.ts` 绿；
  - `queryAuditLogs` 的 `limit` 超过 200 被截断，`total` 与筛选条件一致。
- [ ] AC-8（R-A9）：一次调用完成后 2 秒内，`getUsageInsights` 的今日请求数已包含它（未等 flush）。
- [ ] AC-9（R-B1 / R-B2 / R-B3）：用 models.dev 子集夹具证明以下解析与费用：
  - 官方 OpenAI 渠道 `gpt-4o` 按 `openai` 服务商价格计费；
  - base URL 为 `dashscope.aliyuncs.com` 的自定义渠道解析到 `alibaba-cn`；
  - 未知网关上的 `claude-sonnet-4-5` 按 `anthropic` 原厂价；
  - Ollama 模型记「本地」0 费用；
  - Nexus 记「Nexus 积分」；
  - 未收录模型记「未找到定价」0 费用；
  - 离线且无缓存时全部为「未找到定价」，且调用不被阻塞；
  - ETag 命中时不重写缓存。

### 全局限制

- [ ] AC-10（R-C1 / R-C2）：
  - 设置「每日 3 次请求」后读回一致；
  - 传 `null` 清除后读回不限；
  - 重启后仍一致（缓存与库一致）；
  - 该设置不出现在同步载荷里。
- [ ] AC-11（R-C3）：设「每日 3 次」：
  - 任意调用方（含无 caller 的 Home 对话与后台 embedding）第 4 次被拒；
  - 缓存命中不被拒、不计数；
  - 跨本地零点后恢复；
  - 「每日 Token」与「每日费用」上限各有一条同类测试。
- [ ] AC-12（R-C4）：
  - 被拒错误的 code 为 `USAGE_LIMIT_REACHED`，reason 含上限项与重置时间；
  - `ai-error-recovery` 对它给出本地上限文案，而不是 Nexus credits 文案；
  - `QUOTA_EXHAUSTED` 仍给原文案；
  - 六个 renderer 入口各有覆盖。
- [ ] AC-13（R-C5）：文件 embedding 在上限触发后停止后续批次、不重试循环，并在文件索引诊断里显示原因。

### 审计洞察页

- [ ] AC-14（R-D1–R-D8）：真机（dev 实例，CDP 截图）依次验证：
  - 有数据：指标、趋势、去向四维、限额卡；
  - 审计未开启；
  - 区间无调用；
  - 读取失败；
  - 首次加载骨架无版式跳动；
  - 记录抽屉：筛选、分页、详情、导出 CSV 内容与筛选一致；
  - 设置抽屉开关生效。
- [ ] AC-15（R-D3）：趋势 X 轴为本地日期、无逐字拆分的星期标签；零值日没有柱。
- [ ] AC-16（R-B4 / R-B5 / R-D2 / R-D5）：区间含 Ollama 模型与一个未收录模型时，费用指标提示、按模型拆解与费用上限设置三处都列出这两个模型及原因。
- [ ] AC-17（R-D9 / R-D10）：
  - 五个旧组件已删除，全仓无引用；
  - 审计页不再出现记忆复核；
  - `translation-coverage.test.ts` 绿。
- [ ] AC-18（R-E1–R-E3）：`VoiceInsights.test.ts` 全绿；语音页迁移前后同尺寸截图逐区域对比无差异（允许数据不同）；审计页与语音页标题行 / 指标卡共用同一组件。

### 记忆子页

- [ ] AC-19（R-F1）：
  - 侧栏出现「记忆」并在进入时高亮，顺序符合 D5；
  - 图标非空框；
  - `categories.smoke.test.ts` 绿；
  - 直链 `/setting/intelligence/memory` 与 `/intelligence/memory` 均可达。
- [ ] AC-20（R-F2–R-F6）：
  - 新建默认范围为全局；
  - 不生效范围在选择处、列表、详情都有标记；
  - 删除需确认且删除后有提示；
  - 替换后选中新 id；
  - 冲突后重载；
  - 离开再回来列表刷新；
  - 迁移后的记忆测试全绿。

### 契约、验证与协调

- [ ] AC-21（R-G1–R-G3）：
  - spec 与 inventory 已更新；
  - `corepack pnpm privacy:inventory:verify` 通过；
  - `pnpm check coreapp-ui-contract` 通过。
- [ ] AC-22（全局）：
  - `pnpm -C apps/core-app run typecheck` 通过；
  - lint 不新增错误（按 core-app 包内配置判 delta）；
  - 涉及的 vitest 全绿；
  - `git diff --check` 干净。
- [ ] AC-23（协调）：兄弟任务 `10-03-intelligence-settings-revamp` 的侧栏顺序验收已追加「/ 记忆」；两边对 `categories.ts`、`router.ts`、语言包、`SettingIntelligencePage.vue` 的改动按约定先后落地，无互相覆盖。

## 子任务

| 子任务 | 覆盖 | 依赖 |
|---|---|---|
| `10-03-modelsdev-pricing` | R-B1–R-B4、R-B5 的数据侧 | 无 |
| `10-03-audit-usage-ledger` | R-A1–R-A10、R-G1 / R-G2 中账本部分 | 定价（回填与写入费用用新定价） |
| `10-03-intelligence-usage-limits` | R-C1–R-C6、R-G3 | 账本（全局桶） |
| `10-03-insights-shell-kit` | R-E1、R-E2 | 无 |
| `10-03-audit-insights-page` | R-D1–R-D10、R-E3、R-B5 的界面侧 | 账本、定价、限制、shell kit |
| `10-03-intelligence-memory-page` | R-F1–R-F7 | 无（与兄弟任务协调导航顺序） |

推荐顺序与并行方式见 `implement.md`。

## Out of Scope（只报告）

- 渠道详情页的 `rateLimit` 在主进程无人读取，填了不生效（`research/quota-system.md` Q5）。
- 闲置的 `apps/core-app/src/main/service/storage-maintenance.ts:388` `cleanupIntelligence` 会无条件清空配额表。
- `apps/core-app/src/main/modules/ai/pi-agent-runtime-host.ts:687-699` 把内层 caller 写死为 `'ai-cli-orchestrator'`，发起方归属丢失（与 `ai-2.5.0-plan-prd.md:27` 不一致）。
- 按插件（逐调用方）设上限的界面。
- 不进审计的调用（连通性测试、实时 ASR、Nexus scene、缓存命中）补审计；页面只在说明里注明。
- 记忆的「最近使用 / 使用次数」写入端。
- models.dev 进模型渠道页。
- Explain Drawer 的「打开记忆面板」入口，以及 CoreBox 的「记忆」目的地。

## Open Questions

无。实现方式已定（2026-10-03，老板）：分支收敛完成后在 `stage` 共享工作区按 4 波实现，每个子任务只汇报改动清单与验证证据，Git 提交交给协调方。
