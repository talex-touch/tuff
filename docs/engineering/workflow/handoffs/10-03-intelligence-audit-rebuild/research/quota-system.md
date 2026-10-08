# Research: 本地 Intelligence 配额（quota）系统 —— 审计页「全局限制」前置调研

- **Query**: 配额的存储位置与表结构、调用链里在哪里执行检查、超限后的报错与提示、用量怎么计（分钟/天/月口径）、有没有全局配额、和 Nexus 积分/团队配额怎么区分、`getCurrentUsage` 返回什么、`enableAudit=false` 时会怎样、现有哪些 i18n 键能直接用。
- **Scope**: internal（只读：rg / sed / 读源码与测试；没跑测试、没起 dev，也没读用户 profile 或数据库）
- **Date**: 2026-10-03（基线：`stage` HEAD `a4433ae90`；行号取自工作树。两个 lang JSON 各有 +7 行未提交改动，不涉及配额键，但行号以工作树为准）
- 路径约定：`ai/…` = `apps/core-app/src/main/modules/ai/…`；`renderer/…` = `apps/core-app/src/renderer/src/…`

## 0. 速览

| 事实 | 证据 |
|---|---|
| 配额存在 SQLite 表 `intelligence_quotas`，由 `IntelligenceQuotaManager` 单例负责；IPC 只允许宿主调用 | `db/schema.ts:896-929`；`ai/intelligence-quota-manager.ts:50-478`；`ai/intelligence-module.ts:2652-2721,372-376` |
| 执行点只有一个：`TuffIntelligenceSDK.checkQuota`，只在 `invoke()` / `stream()` 里、且**带 `caller` 时**才会调用；查询时 **callerType 写死为 `'plugin'`** | `ai/intelligence-sdk.ts:714-723,950-959,2574-2610`（`:2585`） |
| 主要的应用内流量**没有 caller，完全不受本地配额约束**（Home 对话、开场白、会话标题、CoreBox 上下文动作、文件嵌入、OCR 任务）；它们的用量被归到 `system` 桶里 | 见 Q2 表 |
| 超限报错 → 统一成 `QUOTA_EXHAUSTED`；渲染层所有入口都显示成 **「检查 Nexus credits 或团队配额」** 这类文案 | `ai/intelligence-error-normalizer.ts:87-99`；`renderer/modules/intelligence/ai-error-recovery.ts:58-67` |
| 按天/月的计数读 `intelligence_usage_stats`，周期键用 `toISOString()` 生成，即 **UTC**（北京时间早上 8 点换日） | `ai/intelligence-quota-manager.ts:231,244`；`ai/intelligence-audit-logger.ts:99-101` |
| 用量表从来没写过 `minute` 桶；但每分钟限额**确实会被统计**：读原始审计日志最近 60 秒，请求数另外有一份内存「放行台账」兜底 | `ai/intelligence-audit-logger.ts:97-102`；`ai/intelligence-quota-manager.ts:213-228,291-301,375-378` |
| 没有全局 / 通配配额；有个保留 id `__default_plugin__`，但没人调用，检查时也不会去读它 | `ai/intelligence-quota-manager.ts:279-284,459-475` |
| `enableAudit=false` 时计数器停止增长 → 只剩每分钟请求数还管用（靠内存台账）；而**新装的默认值就是 `enableAudit=false`** | `ai/intelligence-sdk.ts:2355-2357,2401-2403`；`packages/utils/types/intelligence.ts:2942-2948`；`ai/intelligence-config.ts:839-850,1093-1101` |

## Files Found

| File Path | Description |
|---|---|
| `apps/core-app/src/main/db/schema.ts:859-959` | `intelligence_audit_logs` / `intelligence_quotas` / `intelligence_usage_stats` 三张表 |
| `apps/core-app/resources/db/migrations/0014_sad_black_crow.sql:26-61` | 建表 SQL（`caller_type` 没有 CHECK，`(caller_id, caller_type)` 也没有唯一约束） |
| `apps/core-app/src/main/modules/ai/intelligence-quota-manager.ts` | 配额 CRUD、`getCurrentUsage`、`checkQuota`、内存放行台账、三层缓存 |
| `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts` | 审计缓冲 / 落库；`aggregateUsageStatsByCallerAndPeriod`（只产出 day/month 桶）；`getUsageStats` / `getTodayStats` |
| `apps/core-app/src/main/modules/ai/intelligence-sdk.ts` | invoke / stream 的配额关口、`checkQuota` 包装、`writeSuccessAudit` / `writeFailureAudit` |
| `apps/core-app/src/main/modules/ai/intelligence-module.ts:2652-2721` | 6 个配额 IPC handler（只限宿主） |
| `apps/core-app/src/main/modules/ai/intelligence-error-normalizer.ts` | `QUOTA_EXHAUSTED` / `QUOTA_CHECK_UNAVAILABLE` 的归一化 |
| `apps/core-app/src/main/modules/ai/intelligence-config.ts:839-880,1093-1101,1211-1213` | `enableAudit` / `enableQuota` 的种子值与运行时默认值 |
| `packages/utils/transport/sdk/domains/intelligence.ts:199-247,719-737,1040-1079,1729-1772` | 配额相关类型、事件名 `intelligence:api:*-quota` / `get-current-usage`、SDK 实现 |
| `packages/utils/renderer/hooks/use-intelligence-stats.ts:115-120,261-279` | 已封装好的 `useIntelligenceStats()` 配额方法（core-app 渲染层零调用） |
| `packages/utils/plugin/sdk/intelligence.ts:31-36,103-108` | 插件 SDK 把配额方法列为 host-only |
| `apps/core-app/src/renderer/src/modules/intelligence/ai-error-recovery.ts` | 渲染层报错恢复分类（含 quota 分支） |
| `apps/core-app/src/renderer/src/modules/nexus/credits-summary.ts` | Nexus 积分摘要（远端） |
| `apps/core-app/src/main/service/storage-maintenance.ts:373-390` | 闲置的 `cleanupIntelligence`（会清空全部配额，目前没接线） |

## Findings

### Q1. 配额存在哪：表、结构、归谁管

- **表 `intelligence_quotas`**（`db/schema.ts:900-929`，迁移 `0014_sad_black_crow.sql:26-43`）：`id`、`caller_id`（NOT NULL）、`caller_type`（Drizzle 枚举 `plugin|user|system`，DB 层没有 CHECK）、`requests_per_minute/day/month`、`tokens_per_minute/day/month`、`cost_limit_per_day/month`（real）、`enabled`（默认 true）、`created_at/updated_at`。只有普通索引 `idx_quota_caller(caller_id, caller_type)`（`:927`），**没有唯一约束**。
- **归谁管**：`IntelligenceQuotaManager` 单例（`ai/intelligence-quota-manager.ts:50,478`），通过 `databaseModule.getDb()` 访问（`:65-67`）。IPC 在 `IntelligenceModule.registerQuotaChannels`（`ai/intelligence-module.ts:2652-2721`），每个 handler 都先跑 `assertHostOwnedIntelligenceControlPlane`（`:372-376`）——插件调用会抛 `INTELLIGENCE_HOST_ONLY_CAPABILITY`（测试：`ai/intelligence-quota-boundary.test.ts:87-140`）。`callerType` 缺省时补 `'plugin'`（`:2666,2685,2703,2718`）；`setQuota` 除了「是不是对象」以外不做任何校验（`:2669-2676`）。
- **三层缓存**（`ai/intelligence-quota-manager.ts:51-63`）：
  - `quotaCache`：没有 TTL，只在 setQuota / deleteQuota / clearCache 时更新（`:127,195,453-457`）。直接改库要重启才生效。
  - `usageCache`：10 秒（`:53,205-210,267`）。
  - `admissions`：内存里的放行时间戳台账（`:63`）。
- **`setQuota` 的写入语义**（`:72-128`）：先 select，再 update 或 insert，不在事务里。
  - **update 时传 `undefined` 的字段不会被清空**：drizzle-orm 0.45.2 的 `mapUpdateSet` 会过滤掉 `value !== void 0`（`apps/core-app/node_modules/drizzle-orm/utils.js:83-95`）。
  - 缓存却被**直接设成调用方传进来的原对象**（`:127`）。结果：省略一个字段 → 缓存认为「不限」，库里还是旧值，重启后旧值复活。要真正清掉某项，只能传 `null`，或者先 delete 再 set。
  - **`enabled` 省略时**：库里写 `config.enabled ?? true`（`:100,122`），缓存里却是 `undefined`。`checkQuota` 的判断是 `if (!quota.enabled)`，于是该调用方被拒，理由「Quota is disabled for this caller」（`:287-289`），一直持续到缓存被清。`getAllQuotas` 读库不读缓存（`:394-411`），所以列表会显示「已启用」，实际却在拦。
- **`enabled:false` 的语义 = 封禁该调用方的全部请求**（`:286-289`），不是「关闭这条限额」。
- **保留与清理**：
  - 隐私保留策略只裁剪 `intelligence_audit_logs`（`modules/privacy/owners/intelligence-retention-owner.ts:116-124`，默认 30 天：`modules/privacy/retention-policy.ts:55`）。配额表和用量表都会保留（测试 `modules/privacy/intelligence-retention-owner.test.ts:94-147`；spec `.trellis/spec/frontend/privacy-data-lifecycle.md:177`）。
  - `storage-maintenance.ts:373-390` 的 `cleanupIntelligence` 会**无条件** `db.delete(intelligenceQuotas)`（`:388`），而且不清 `quotaCache`。不过它目前没接线：`channel/common.ts:64` 只引入了 downloads / fileIndex / updates 三个清理函数。
- **全局开关 `enableQuota`** 存在持久化的 intelligence 配置 JSON 里，不在数据库。默认 true（`packages/utils/types/intelligence.ts:2945`；`ai/intelligence-config.ts:846,871,877-880,1213`，测试 `ai/intelligence-config.test.ts:535-559`）。**渲染层没有对应开关**：`IntelligenceGlobalSettings.vue:20-21,86-111` 只有审计和缓存两项。

### Q2. 执行：在哪检查、拦谁、超限后怎样

**唯一的执行点**：`TuffIntelligenceSDK.checkQuota(caller, estimatedTokens, signal)`（`ai/intelligence-sdk.ts:2574-2610`）。

- **调用位置**：`invoke()` 在 `:714-723`，`stream()` 在 `:950-959`。条件都是 `!outerGoverned && this.config.enableQuota && caller`。
- **查询方式**：`intelligenceQuotaManager.checkQuota(caller, 'plugin', estimatedTokens)`，callerType 写死为 `'plugin'`（`:2585`）。两个调用点传的 `estimatedTokens` 都是 `0`（`:717,953`）。
- **结果**：token 类限额都是「事后」判断，单个大请求可以超出；而且用的是 `usage + 0 > limit`（严格大于），请求数和费用用的是 `>=`（`ai/intelligence-quota-manager.ts:304-372`）。
- **outerGoverned**：用 WeakSet 打标（`ai/intelligence-invoke-governance.ts:3-22`）。生产代码只有 `inheritOuterGovernance` 一处（`ai/intelligence-context-execution.ts:318`），`markOuterGovernedInvocation` 只在测试里出现，所以生产环境里这个值实际恒为 false。
- **能力维度**：所有走 `invoke()` 的能力都受管，`audio.stt/tts`、`text.*` 这些类型化 helper 也都转到 invoke（`:2721-2738,2845-2857`）。例外：
  - `asr` 类型在关口前就抛 `INTELLIGENCE_ASR_STREAM_REQUIRED`（`:709-711`）；
  - `stream()` 只接受 chat（`:946-948`）；
  - `invokeStream` / `text.chatStream`（`:2446-2528,2725-2726`）**既不查配额也不写审计**，不过生产代码里没有调用方；
  - 实时听写走 voice provider adapter（`modules/voice/voice-service.ts:1442` 起），不经过 SDK。
  - **没有按能力设的限额**，粒度只有调用方。
- **配额检查发生在查缓存之前**（`:715` vs `:736-742`）：命中缓存的请求会占一个放行台账名额，但不产生审计行。

**超限之后**：

1. Manager 返回 `{allowed:false, reason}`。可能的 reason 有：`'Rate limit exceeded (requests per minute)'`、`'Daily request limit exceeded'`、`'Monthly request limit exceeded'`、`'Rate limit exceeded (tokens per minute)'`、`'Daily token limit exceeded'`、`'Monthly token limit exceeded'`、`'Daily cost limit exceeded'`、`'Monthly cost limit exceeded'`、`'Quota is disabled for this caller'`（`ai/intelligence-quota-manager.ts:288-370`）。
2. SDK 抛 `new Error('[Intelligence] Quota exceeded: <reason>')`（`ai/intelligence-sdk.ts:721,957`）。这一步在 provider 的 try（`:790`）之前，所以**不写失败审计，审计页看不到「被配额拦下」的请求**。
3. 模块层把错误包一层（`normalizeCapabilityInvokeError`：`ai/intelligence-module.ts:325-337,1431-1434,1474-1476`），再经 `toNormalizedIntelligenceError`（`ai/intelligence-error-normalizer.ts:172-186`），靠消息里的 `'quota exceeded'` 命中 `QUOTA_EXHAUSTED`（`:87-99`）。最终消息形如 `[QUOTA_EXHAUSTED:text.chat] [Intelligence] Quota exceeded: Daily request limit exceeded`。
4. 配额存储本身出故障时**拒绝放行**，报 `QUOTA_CHECK_UNAVAILABLE`（`ai/intelligence-sdk.ts:2588-2609`；`ai/intelligence-error-normalizer.ts:40-52`；测试 `ai/intelligence-sdk.test.ts:276-377`）。

**渲染层怎么展示**（都没区分本地配额和 Nexus）：

- CoreBox AI 答案 `components/render/custom/CoreIntelligenceAnswer.vue:105` 和 OmniPanel `views/omni-panel/OmniPanel.vue:170` → `resolveIntelligenceErrorRecovery`：任何含 `QUOTA` 的错误都落到 `intelligence.errorRecovery.quotaTitle/quotaDetail`，即「AI 额度不可用 / 检查 Nexus credits 或团队配额后再重试。」（`renderer/modules/intelligence/ai-error-recovery.ts:58-67`；测试把这个行为写死了：`ai-error-recovery.test.ts:64-70`）。只有 `QUOTA_CHECK_UNAVAILABLE` 有单独文案（`:44-56`）。
- VoicePanel `views/assistant/VoicePanel.vue:1006-1007` 和 Home 听写提示 `views/base/home/composer/dictation-notice.ts:155,217` → `assistant.voicePanel.quotaExhausted`「AI 额度已用完，去设置查看」。
- CoreBox 结果信号 `components/render/sourceMeta.ts:49-51,80-82` → 「额度不足」+「先检查积分或额度，再重试。」
- Home 对话 `modules/conversation/conversation-error-display.ts:29-40` 只解析 `[CODE:cap]` 前缀；流式路径上只有 message 能传到渲染层（`:4-8` 的注释）。
- 插件只拿到稳定的错误码，拿不到 message（`ai/intelligence-module.ts:416-419`；`.trellis/spec/frontend/plugin-runtime-security.md:357-358`）。

**谁带 caller（受配额管）、谁不带**：

| 受管（caller 存在，查询键 `(caller,'plugin')`） | 不受管（没有 caller，关口直接放行） |
|---|---|
| 插件：`plugin:<name>`，由主进程强制绑定（`ai/intelligence-module.ts:428-441,521-534`；插件宿主校验 `^plugin:[A-Za-z0-9._-]+$`：`modules/plugin/host/plugin-intelligence-host-service.ts:402-427`） | Home 对话 invoke / stream：metadata 里只有 `surface/operation/autoContext/identity`（`renderer/modules/conversation/useHomeConversation.ts:198-216`） |
| context execution：`host:core-app` 或 `plugin:<name>`（`ai/intelligence-module.ts:421-426`；`ai/intelligence-context-execution.ts:313`） | Home 开场白 `renderer/modules/home-push/opening.ts:291`、会话标题 `renderer/modules/conversation/conversation-title.ts:185` |
| `core.voice.dictate`（`modules/voice/voice-service.ts:260`）、`core.voice.file-transcription`（`:1354`）、`core.voice.buffered-asr`（`modules/voice/buffered-stt-provider.ts:269`） | CoreBox 上下文动作（`modules/box-tool/addon/context-actions/context-actions-provider.ts:137-144`） |
| `core.recommendation.semantic-embedding/rerank`（`recommendation-engine.ts:3167,3184,3262`）、`core.assistant.screenshot-translate`（`modules/assistant/module.ts:128`） | 文件嵌入（`modules/box-tool/addon/files/embedding-service.ts:101,145,315`）、OCR agent 任务（`modules/ocr/ocr-service.ts:880-887`）、旧的 `ai/intelligence-service.ts:99,191` |
| `ai-cli-orchestrator`（`ai/pi-agent-runtime-host.ts:693`）、`omni-panel`（`renderer/views/omni-panel/ai-actions.ts:385`）、`system`（只有能力测试会用：`ai/intelligence-module.ts:1893-1901`） | 宿主发起、且 metadata 没带 caller 的 `chatLangChain` / `ttsSpeak`（`ai/intelligence-module.ts:1516,1529-1544`） |

- **`system` 调用方**：只有能力测试会带字面量 `'system'`，它被拿去比对 `('system','plugin')` 这一行；**`('system','system')` 这一行永远不会被执行路径读到**。
- 但聚合时 `system` 的 callerType 写成 `'system'`（`ai/intelligence-audit-logger.ts:64`），而 `getCurrentUsage` 读用量时不按 callerType 过滤（`ai/intelligence-quota-manager.ts:236-239,249-252`）。所以给 `('system','plugin')` 设的日 / 月限额，消耗它的是**整个 system 桶，包括所有没带 caller 的 Home 等流量**（聚合规则 `log.caller || 'system'`：`ai/intelligence-audit-logger.ts:98`），被拦的却只有能力测试。

### Q3. 配额用量怎么计：读哪些计数、周期口径

- **天 / 月**：只读 `intelligence_usage_stats`。周期键是 `day:${now.toISOString().split('T')[0]}` 和 `month:${now.toISOString().substring(0,7)}`（`ai/intelligence-quota-manager.ts:231,244`），**确认是 UTC**。
  - 写入一侧：`aggregateUsageStatsByCallerAndPeriod` 用 `new Date(log.timestamp).toISOString()` 的 `slice(0,10)` / `slice(0,7)`（`ai/intelligence-audit-logger.ts:97-102`），同样是 UTC。
  - 审计页的 `getTodayStats/getMonthStats` 也是 UTC（`:713-726`）。
  - 在 Asia/Shanghai，「今日」在本地 08:00 翻篇，「本月」在每月 1 日 08:00 翻篇。
- **从来没写过 `minute` 桶**：
  - schema 注释和枚举里有 `minute`（`db/schema.ts:941-942`），`IntelligenceUsageSummary.periodType` 也包含它（`ai/intelligence-audit-logger.ts:29`；`packages/utils/transport/sdk/domains/intelligence.ts:188`）。
  - 但唯一的写入方产出的桶类型是 `'day' | 'month'`（`ai/intelligence-audit-logger.ts:40-46,97-102`），也没有别的地方写这张表（全仓 grep：读写只在 `intelligence-audit-logger.ts`、`intelligence-quota-manager.ts` 和闲置的 `storage-maintenance.ts`）。
  - 测试断言 periodType 集合等于 `{day, month}`（`ai/intelligence-stream-ledger.integration.test.ts:179`）。
- **每分钟限额确实会被统计**，只是数据源不同：
  - `requestsThisMinute/tokensThisMinute` 来自 `intelligence_audit_logs`：`count(*)` 和 `sum(total_tokens)`，条件是 `caller = callerId AND timestamp >= now-60s`，滑动窗口，成功失败都算（`ai/intelligence-quota-manager.ts:213-228`）。
  - **请求数**另外和内存放行台账取较大值（`:291-301`；台账在放行瞬间记录：`:375-378,420-444`；#778，测试 `ai/intelligence-quota-burst.test.ts:55-96`）。
  - 所以：`requestsPerMinute` 能立刻生效；`tokensPerMinute` 只能看到已经落库的行。
- **落库节奏**：凑满 20 条、或每 30 秒、或延迟 200ms 触发（`ai/intelligence-audit-logger.ts:252-254,330-333,824-833`）。计数器最多滞后约 30 秒。落库后会让对应调用方的用量缓存失效（`:518-525`）。测试断言落库前读到全是 0（`ai/intelligence-stream-ledger.integration.test.ts:142-146`）。
- **时间戳取的是请求开始时间**（`ai/intelligence-sdk.ts:2373,1020`）。一个超过 60 秒的长请求结束时，已经不在分钟窗口里了。
- **计入的**：所有写了审计的调用，包括 provider 失败（`requestCount = success + failure`：`ai/intelligence-audit-logger.ts:84-89`）。
- **不计入的**：
  - 被配额拦下的请求；
  - 中途取消或 abort 的 invoke / stream（`ai/intelligence-sdk.ts:834-836,1261-1262,1302-1303`）；
  - 命中缓存的请求；
  - outerGoverned 调用；
  - `enableAudit=false` 期间的一切调用。
- **费用的单位**：取值顺序是 `estimatedCost ?? usage.cost ?? estimateCost(model)`（`ai/intelligence-audit-logger.ts:310-313`）。`estimateCost` 查硬编码的 `MODEL_COSTS`，按每 1K token 的美元价计，表里没有的模型（包括 Nexus）一律走 `default`（`:129-146,300-305`）。本地 provider 的 cost 是 0（`ai/providers/local-provider.ts:81`），pi CLI 用它自报的 cost（`ai/providers/pi-cli-runtime.ts:520-531`）。**这不是 Nexus 积分。**

### Q4. 有没有全局配额 / 通配 callerId；现有测试

- **没有**。`checkQuota` 按 `(callerId, callerType)` 精确查找（`ai/intelligence-quota-manager.ts:133-175,279`），查不到就是不限（`:281-284`），没有通配和兜底。
- 现有的保留 id 先例 `__default_plugin__`（`setDefaultPluginQuota/getDefaultPluginQuota`：`:459-475`）：`checkQuota` 不读它，全仓也没人调用。
- **也没有「所有调用方合计」的读取 API**：`getUsageStats/getTodayStats/getMonthStats` 都只按单个 callerId 过滤（`ai/intelligence-audit-logger.ts:664-726`；IPC 在 `ai/intelligence-module.ts:1954-1973`），也没有「列出所有 caller」的接口。审计页「只显示 system」这个统计口径问题（见 PRD）和全局配额，缺的是同一块能力。
- 做合计查询有现成索引可用：`idx_usage_period(period_type, period)`（`db/schema.ts:957`）、`idx_audit_timestamp`（`:889`）。
- 最小改动的做法放在下文 D1–D3（只列选项和取舍）。

**现有配额相关测试**：

| 文件 | 覆盖内容 |
|---|---|
| `ai/intelligence-quota-burst.test.ts:55-96` | 放行台账：每分钟 3 次限额下第 4 次被拒；窗口滑过后恢复；没设分钟限额时不受影响（DB 固定为 0） |
| `ai/intelligence-quota-boundary.test.ts:87-157` | 6 个 IPC 对插件全部拒绝 `INTELLIGENCE_HOST_ONLY_CAPABILITY`；setQuota 对 null 的校验先于存储访问 |
| `ai/intelligence-usage-stats-consistency.test.ts:43-85` | 用量 upsert 失败时整个审计事务回滚（#780） |
| `ai/intelligence-audit-logger-caller-period.test.ts:154-296` | 按调用方 × 天/月聚合；带冒号的 caller 原样保留；`system` 的 callerType |
| `ai/intelligence-sdk.test.ts:276-377` | `QUOTA_CHECK_UNAVAILABLE` 拒绝放行（直接调用 / invoke / stream）；`:405-460,509-528,721-750,3359` outerGoverned 时跳过配额；`:779,859` 取消的优先级 |
| `ai/intelligence-typed-transport.integration.test.ts:342-383,418-489` | 真实临时库：插件 invoke 走完权限 → provider → 审计 → 用量 → 配额；落库后 `requestsThisMinute:1, tokensThisMinute:20` |
| `ai/intelligence-stream-ledger.integration.test.ts:60-205` | 流式请求落库前计数为 0，落库后各项计数正确，只有 day/month 两种桶 |
| `ai/intelligence-config.test.ts:535-559` | 持久化配置缺 `enableQuota` 时补成 true |
| `ai/intelligence-error-normalizer.test.ts:20-22,71-83` | `Quota exceeded` 映射到 `QUOTA_EXHAUSTED`；`QUOTA_CHECK_UNAVAILABLE` |
| `modules/privacy/intelligence-retention-owner.test.ts:94-147` | 保留策略清理不动配额和用量表 |
| `renderer/modules/intelligence/ai-error-recovery.test.ts:48-71` | `quota_exceeded` 显示 Nexus credits 文案 |
| `packages/utils/__tests__/intelligence-client-hard-cut.test.ts:205-216` | 插件 SDK 上看不到配额方法 |
| `packages/utils/__tests__/transport-domain-sdks.test.ts:1141,1163` | 事件名 `intelligence:api:get-quota` |

没有测试覆盖的：`setQuota` 省略 `enabled` 或省略字段时缓存和库不一致、天/月/费用超限的端到端拒绝、`system` 的 callerType 不一致。

### Q5. 本地配额与 Nexus 积分 / 团队配额的区别

- **Nexus 积分（远端、按账户）**：
  - 数据来自 `fetchNexusWithAuth('/api/credits/summary')`（`renderer/modules/nexus/credits-summary.ts:106`），包含个人剩余/已用/总额和团队池（`:58-74`；`credits-summary-normalizer.ts:44-71`），按计费月统计。
  - 展示在「设置 › 账户」的 `CreditsSummaryBlock`（`views/base/settings/SettingUser.vue:432`；标题「AI 积分」：`components/account/CreditsSummaryBlock.vue:21-30`），可跳 Nexus `/dashboard/credits`（`credits-summary.ts:135-137`）。
  - 由服务端执行：creditsStore 抛 `Team/User credits exceeded.`（`apps/nexus/server/utils/sceneOrchestrator.ts:1821-1826`），平台治理的 provider 请求/token 配额抛 `INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED`（`apps/nexus/server/utils/platformGovernanceStore.ts:8575-8597`）。两者统一成 `QUOTA_EXHAUSTED` + HTTP 429（`apps/nexus/server/utils/intelligenceErrorContract.ts:111-117,132-134,151-158,223-224`）。
  - Nexus ASR 遇到 402/429 → `QUOTA_EXHAUSTED`「Nexus credits are insufficient or unavailable.」（`main/modules/nexus/asr-client.ts:84-87`）。
- 还有两个容易混淆的「限额」概念：
  - **AccountSDK 套餐配额**：`DEFAULT_PLAN_QUOTAS`（`packages/utils/account/account-sdk.ts:28`；`main/modules/auth/index.ts:2051-2068`），按套餐档位给出数值，core-app 里没有消费方。
  - **渠道级 `rateLimit`**：类型 `IntelligenceProviderRateLimit` 定义在 `packages/utils/types/intelligence.ts:238-247,348`，在渠道详情页通过 `IntelligenceRateLimitConfig.vue`（`components/intelligence/layout/IntelligenceInfo.vue:303`）可以编辑。但**主进程没有任何代码读它**（在 `apps/core-app/src/main` 里 grep `rateLimit`，只有 update 模块和一个测试夹具），所以**不生效**。入口文案还写着「Configure channel credentials, priorities and rate limits.」（`settings.intelligence.landing.channels.desc`）。
- **冲突点**：
  - 同一个错误码 `QUOTA_EXHAUSTED` 有三个来源：本地配额、Nexus 服务端、provider 返回的 429（normalizer 把 `rate limit` 和 `too many requests` 也算成它：`ai/intelligence-error-normalizer.ts:87-92`）。共享错误码表里也只有这一个（`packages/utils/transport/events/types/intelligence.ts:1-12`）。
  - 渲染层文案全都指向 Nexus（见 Q2）。
  - 目前唯一能把本地配额区分出来的信号，是 message 里的 `[Intelligence] Quota exceeded:`，而且只有宿主拿得到，插件只有错误码。
  - 审计行里，provider 的 `QUOTA_EXHAUSTED` 被清洗器改写成 `INTELLIGENCE_INVOCATION_FAILED`（`AUDIT_ERROR_CODE_PATTERN` 只允许 `INTELLIGENCE_|NEXUS_|OCR_|PROVIDER_` 前缀：`ai/intelligence-audit-logger.ts:150,211-217`）；本地配额拦截则根本不进审计。所以「哪里出错」视图看不到这两类原因。

### Q6. `getCurrentUsage` 返回什么

- 形状是 8 个数字（`ai/intelligence-quota-manager.ts:25-34`；SDK 类型 `IntelligenceCurrentUsage`：`packages/utils/transport/sdk/domains/intelligence.ts:199-208`）：`requestsThisMinute`、`tokensThisMinute`、`requestsToday`、`tokensToday`、`costToday`、`requestsThisMonth`、`tokensThisMonth`、`costThisMonth`。
- 来源：分钟两项来自审计日志最近 60 秒（`:213-228`）；天和月来自用量表，按 callerId + UTC 周期键查（`:230-254`），**不按 callerType 过滤**。结果缓存 10 秒，缓存键里带 callerType（`:205-210,267`）。
- **分钟两项是真算出来的，不是恒为 0**，但：
  - (a) 只算已经落库的审计行，落库前是 0（测试 `ai/intelligence-stream-ledger.integration.test.ts:142-146`；落库后是 1 / 20：`ai/intelligence-typed-transport.integration.test.ts:481-488`）；
  - (b) **不包含内存放行台账**——台账只在 `checkQuota` 里合并，所以 UI 读到的分钟数会比执行时用的值小；
  - (c) 对 `system`，分钟查询是 `caller = 'system'`，匹配不到 caller 为 NULL 的行；而天/月的 `system` 桶包含 NULL caller 的流量（`ai/intelligence-audit-logger.ts:98`）。所以同一个 `system`，分钟和天/月统计的是两批不同的请求。
  - (d) 执行路径把用量缓存在 `usage:plugin:system` 下，而落库后失效的是 `usage:system:system`（`ai/intelligence-audit-logger.ts:518-525`）。`system` 这一项的缓存只能等 10 秒 TTL 自然过期。
- 对照：IPC 的 `checkQuota` handler 有副作用。只要该调用方有配额行且放行成功，就会记一次放行（`ai/intelligence-module.ts:2694-2706` → `ai/intelligence-quota-manager.ts:378`），等于用掉一个分钟名额。展示时不能拿它来读状态。

### Q7. `enableAudit=false` 时会怎样

- **确认**：`writeSuccessAudit` 在 `ai/intelligence-sdk.ts:2355-2357`、`writeFailureAudit` 在 `:2401-2403` 直接 return。它们是 SDK 写审计的唯一入口；用量表只在审计落库事务里更新（`ai/intelligence-audit-logger.ts:511-517`）。所以审计行和天/月计数**全都停止增长**。
- 另外几条绕过 `enableAudit` 的写入路径都没有生产调用方：`recordRuntimeAudit`（`ai/intelligence-sdk.ts:2559-2561`）、`DbTuffIntelligenceStorageAdapter.saveAuditLog/saveUsageDelta`（`ai/tuff-intelligence-storage-adapter.ts:64-114`，这个类在仓库里没有任何引用）。
- **配额检查本身照常执行**：它只看 `enableQuota`（`ai/intelligence-sdk.ts:715,951,2580`）。各项限额此时的表现：
  - `requestsPerMinute`：**仍然生效**，靠内存台账（`ai/intelligence-quota-manager.ts:295-301,378`），应用重启后清零；
  - `tokensPerMinute`：最近 60 秒没有新行，恒为 0，永远不会触发；
  - 天/月的请求、token、费用：冻结在关闭审计前当天/当月已累计的值，下一个 UTC 日或月翻篇后变成 0。如果关闭前就已经超限，这个调用方会被一直拦到周期结束，而且界面上看不到新增用量；
  - `enabled:false` 的行照样封禁。
- **新装用户的默认值就是 `enableAudit=false`**：
  - `DEFAULT_GLOBAL_CONFIG.enableAudit = false`（`packages/utils/types/intelligence.ts:2942-2948`，经 `packages/tuff-intelligence/src/types/intelligence.ts:21-34` 转出）；
  - 主进程第一次读到空配置时用它播种（`createDefaultPersistedConfig`：`ai/intelligence-config.ts:839-850`；`getLatestConfig`：`:1093-1101`）；
  - 运行时的 `?? true` 只在字段缺失时才起作用（`:1211`）；
  - 渲染层存储默认值同样来自 `DEFAULT_GLOBAL_CONFIG`（`packages/utils/renderer/storage/intelligence-storage.ts:62,313`），v2 迁移里还写着 `enableAudit ?? false`（`:259`）。
  - 结论：开箱状态下，除了每分钟请求数以外的配额都不会触发。（这是从代码推出来的，还没在全新 profile 上实测。）

### Q8. 配额 UI 能直接用的 i18n 键

`renderer/modules/lang/zh-CN.json` 和 `en-US.json` 两边都有：

| 键 | zh / en | 现状 |
|---|---|---|
| `settings.settingAISDK.{rateLimit,requestsPerMinute,requestsPerDay,tokensPerMinute,tokensPerDay,unlimited}`（`:3874-3883` 一带） | 速率限制 / 每分钟请求数 / 每天请求数 / 每分钟令牌数 / 每天令牌数 / 无限制 | **没被引用** |
| `intelligence.{rateLimit,requestsPerMinute,tokensPerMinute,unlimited}`（`:5705-5708`） | 速率限制 / 每分钟请求数 / 每分钟令牌数 / 无限制 | **没被引用** |
| `settings.intelligence.{rateLimit,requestsPerMinute,tokensPerMinute,unlimited}`（`:4693-4696`） | 速率限制 / 每分钟请求 / 每分钟令牌 / 无限制（en 是 `Requests / Minute`） | **没被引用** |
| `intelligence.config.rateLimit.*`（`:5829-5840` 一带：title / description / requestsPerMinute / tokensPerMinute / unlimitedPlaceholder「留空表示无限制」/ requestsUnit「请求/分钟」/ tokensUnit / *Hint / invalidValue「值必须是正数」/ infoMessage） | — | 被渠道级 `IntelligenceRateLimitConfig.vue` 使用（那个设置不生效）；复用的话语义会和渠道限速混在一起 |
| `intelligence.usage.{requests,tokens,cost,today,thisMonth,success,failure,successRate,promptTokens,completionTokens}`（`:5859` 起） | 请求数 / Token 用量 / 成本 / 今日 / 本月… | 审计页正在用；适合拿来标注「已用 / 上限」 |
| `intelligence.errorRecovery.quotaVerificationTitle/Detail`（`:5643-5644`） | AI 配额校验暂不可用 / 请稍后重试… | 在用；指向的是本地配额存储，语义正确 |
| `intelligence.errorRecovery.quotaTitle/quotaDetail`（`:5641-5642`） | AI 额度不可用 / 检查 Nexus credits 或团队配额后再重试。 | 在用，**指向 Nexus**，不能拿来提示本地限额 |
| `coreBox.resultSignalReasons.quotaExceeded/quotaCheckUnavailable/rateLimited`、`coreBox.resultSignalActions.checkQuota/inspectQuota`（`:2945-2970`） | 额度不足 / 先检查积分或额度，再重试。… | 在用（CoreBox）；文案同样偏向积分 |
| `assistant.voicePanel.quotaExhausted`（`:5460`） | AI 额度已用完，去设置查看 / AI credits are used up — check Settings | 在用；en 明确写的是 credits |
| `settingsIntelligenceHub.auditDesc`（`:1774`） | 用量、日志、记忆复核与全局限制。 | 入口文案已经承诺了「全局限制」 |
| `settingTools.noLimit`（`:524`） | 无限制 / No limit | 被 SettingTools 使用，属于其他命名空间 |
| `creditsSummary.*`（`:957-974`）、`userProfile.subscription`「订阅与配额」 | — | Nexus 积分 / 订阅专用，本地限额应该避开 |

**没有现成的键**：天/月的 token 上限、费用上限、「本地」限额说明、「本地限额已触发」的报错文案、UTC 周期提示。

## Design implications（只列选项和取舍，不涉及实现）

**D1. 全局限额存在哪**

- **(a) 在 `intelligence_quotas` 加一行保留 id**，例如 `('__global__','system')`。
  - 优点：不用迁移（没有 CHECK 和唯一约束：`0014_sad_black_crow.sql:26-43`）；先例是 `__default_plugin__`；现有 IPC 的 get/set/delete 原样可用。
  - 缺点：`getAllQuotas` 会把它一起返回，按调用方的列表要过滤掉；callerType 选 `'system'` 会和「system 调用方」的含义撞车；Q1 里 setQuota 缓存与库不一致的问题全部继承。
- **(b) 放进 `IntelligenceGlobalConfig`**，和 `enableAudit/enableQuota` 一起持久化（`ai/intelligence-config.ts:839-880,1211-1213`）。
  - 优点：和其他全局设置在同一份配置里，SDK 可以直接从 `this.config` 读，不碰数据库缓存。
  - 缺点：多出一套与配额 API 平行的结构，还要改 `packages/utils/types/intelligence.ts`（`DEFAULT_GLOBAL_CONFIG`）和渲染层存储迁移。
- **(c) 新建表或新加列**：语义最清楚，但要迁移，改动最大。
- **区分好两种含义**：「每个调用方各自不超过 X」是默认值，对应 `__default_plugin__` 那种用法；「所有调用方合计不超过 X」才是全局。两者的用量查询完全不同。

**D2. 全局限额管不管没带 caller 的流量**

现在 `!caller` 会直接短路放行（`ai/intelligence-sdk.ts:715,951,2580`），而 Home 对话这个最大的消费方没有 caller。

- 如果全局限额不覆盖这部分，它就管不住主要流量。
- 如果覆盖，后台调用方（文件嵌入、OCR 任务、`core.recommendation.*`）在触顶后会一起失败，语义搜索、OCR 这类功能会降级。可选做法：给后台调用方豁免名单，或者只管交互式入口。

另外要定的是：全局用量要不要包括 NULL caller 的行。天/月层面，它们已经算在 `system` 桶里，对用量表做 `SUM` 时自然会包含；分钟层面，要按 `timestamp` 查全表，不能再按 caller 过滤（有 `idx_audit_timestamp` 可用）。放行台账也要单独开一个全局键。

**D3. 计数和 `enableAudit` 的耦合（默认是 false）**

- (a) 设置任何限额时，要求或自动打开审计：改动小，但「审计」开关的隐私含义会被配额绑架。
- (b) 把用量表的累计和审计明细拆开，审计关闭时只累计数字：配额在任何时候都可信，但「启用审计」的含义变了，隐私文档和 spec 要跟着改（`.trellis/spec/frontend/privacy-data-lifecycle.md:177`）。
- (c) 维持现状，UI 上明确提示「审计关闭时只有每分钟请求数生效」：零改动，但用户体验很绕。

**D4. 每分钟限额的可信度**

请求数是即时的（内存台账，重启后清零）；token 数最多滞后约 30 秒，而且按请求开始时间计。选项：

- 只开放 `requestsPerMinute`；
- 两个都开放，但 token 标注为「近似」；
- 把放行台账扩展到 token（需要改执行逻辑）。

**D5. 报错文案和 Nexus 区分开**

- (a) 新增一个错误码：语义最干净，但要改共享的错误码表（`packages/utils/transport/events/types/intelligence.ts:1-12`）、Nexus 服务端的契约，以及所有渲染层分类器。
- (b) 保留 `QUOTA_EXHAUSTED`，在 `resolveIntelligenceErrorRecovery`、VoicePanel、dictation-notice、sourceMeta 里识别 message 前缀 `[Intelligence] Quota exceeded:`，再配新的本地文案：改动小，但靠字符串匹配，插件也拿不到这个信号（插件只有错误码）。
- (c) 在错误上加结构化字段，比如 `scope:'local'`：流式路径上只有 message 能到渲染层（`conversation-error-display.ts:4-8`），所以还是要把信息编码进 message。

不管选哪种，`ai-error-recovery.test.ts:64-70` 都把「quota → Nexus 文案」写成了期望值，要一起改。

**D6. 周期口径**

- 继续用 UTC：UI 上写明「按 UTC 日/月重置」，或者显示下一次重置的本地时间。
- 改成本地时区：已有用量行全是 UTC 键，切换当天会出现新旧键混用；审计页的趋势图也是 UTC（PRD 已指出），要两边一起改。

**D7. 费用的单位**

费用是估算的美元（`MODEL_COSTS` 是旧价表，未知模型包括 Nexus 一律按默认价），不是积分。可以标成「估算费用（USD）」，也可以先不开放费用上限，避免和「AI 积分」混淆。

**D8. UI 调用现有 API 时要守的规则**

- 不论走 `setQuota` 还是 `useIntelligenceStats().setQuota`：
  - 必须**显式传 `enabled: true`**，否则执行时会被缓存里的 `undefined` 拦掉；
  - 清除某一项要传 `null`，或者先 delete 再 set；
  - 不要靠「省略字段」来清除，那样缓存和库会不一致（Q1）。
- 展示状态用 `getCurrentUsage`，**不要用 `checkQuota`**（它会占一个名额）。
- 写入的 callerType 必须和聚合时写的一致（spec `.trellis/spec/frontend/quality-guidelines.md:321-345`：除 `system` 以外都是 `plugin`）。
- 「关闭」某条限额应该做成 delete，而不是 `enabled:false`——后者的含义是封禁。

**D9. 测试**

现有覆盖见 Q4 的表。D1–D5 里任何一项落地，都需要补这几类：

- 天/月/费用超限的端到端拒绝（可以在 `ai/intelligence-typed-transport.integration.test.ts` 的临时库框架上扩展）；
- 全局合计包含 NULL caller 的情况；
- `enableAudit=false` 时的行为；
- setQuota 缓存与库一致性的负控。

## Caveats / Not Found

- `enableAudit` 默认为 false、开箱只有分钟请求数生效，这两条都是**读代码推出来的**，没在全新 profile 上实测。
- 没读用户本机数据库，不知道 `intelligence_quotas` 里有没有历史行（渲染层零调用，推测是空的）。
- 审计清洗器会把不匹配 `^[\w.:/-]{1,128}$` 的 caller 记成 `unknown`（`ai/intelligence-audit-logger.ts:149,167-178,228`）。现有插件名都符合这个模式（`plugins/*/manifest.json` 的 name 都是 `touch-*` 这类），但如果哪个插件名不符合，它的计数会落进 `unknown`，和它自己的配额行对不上。
- `packages/tuff-intelligence/src/transport/sdk/domains/intelligence.ts:680,980,1622-1660` 是 utils 版 SDK 的平行副本，配额相关部分没有逐行比对。
- 共享 SDK 的 `IntelligenceQuotaConfig` 类型（`packages/utils/transport/sdk/domains/intelligence.ts:227-239`）不允许 `null`，「传 null 清除」需要在类型层面放开或做类型断言。
