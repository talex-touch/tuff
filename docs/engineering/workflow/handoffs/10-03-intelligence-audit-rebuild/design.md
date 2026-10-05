# Design — 智能审计页按洞察页 shell 重做

本文件是 6 个子任务共用的技术设计。子任务的 `design.md` 只补本文件没覆盖的细节，冲突时以本文件为准；需要改动这里的契约，先回父任务改。

需求编号（R-*、D*）见 `prd.md`。

## 0. 总览

```
写入（主进程）
SDK invoke / stream
  ├─ 查结果缓存（命中直接返回：不计数、不受限）
  ├─ checkUsageLimits()          ← §3，所有调用（有无 caller 都检查）
  ├─ checkQuota(caller)          ← 既有逐调用方配额（只在带 caller 时，语义不变）
  ├─ provider 调用
  └─ writeSuccess/FailureAudit   ← 不再因 enableAudit=false 提前 return
        └─ auditLogger.log(entry, { detail: enableAudit })
              ├─ pendingGlobalDeltas += entry（外层 agent/workflow 行除外）
              └─ flush：准备阶段（§2 定价 → estimatedCost）
                       事务：明细行（仅 detail）+ 逐调用方 UTC 桶（全部）+ 全局本地桶（全部，外层除外）
                       提交后：扣减 pendingGlobalDeltas

读取（renderer → 主进程，均 host-only）
审计页 ── getUsageInsights({ range }) ──► 全局桶 + 未落库增量 → 总量 / 本地日序列 / 限额状态
                                       ► 明细行 → 四维去向（含定价、覆盖率）
       ── queryAuditLogs(filters)    ──► 明细行 { rows, total }
       ── get/setUsageLimits          ──► intelligence_quotas 保留行
```

## 1. 用量账本（子任务 `10-03-audit-usage-ledger`）

### 1.1 写入

- `TuffIntelligenceSDK.writeSuccessAudit / writeFailureAudit`（`apps/core-app/src/main/modules/ai/intelligence-sdk.ts:2345-2440`）去掉 `if (!this.config.enableAudit) return`，改为始终调用 `intelligenceAuditLogger.log(entry, { detail: this.config.enableAudit })`。
- `IntelligenceAuditLogger.log(entry, options)`：
  - `detail:false` 的条目不进 `memoryLogs`（`getRecentLogs` 只服务明细），只进 `pendingLogs` 参与计数。
  - `flushBatch` 只为 `detail:true` 的条目 INSERT `intelligence_audit_logs`；两类条目都更新计数桶。
  - `retentionFloorMs`（隐私删除后的地板）只拦明细行重插，不拦计数——隐私删除本来就不动计数（`privacy-data-lifecycle.md:177`）。
- 渠道归属（R-A4）：entry 新增 `providerId`，取值 = 实际选中渠道配置 id，写入 `provider` 列，provider 自报的上游 id 不再落库：
  - 主路径：`strategyResult.selectedProvider.id`（`intelligence-sdk.ts:764-768`）；
  - fallback：辅助函数返回实际使用的 fallback 配置 id；
  - 失败：已经是选中 id（`:895-908`）；
  - stream：同主路径，不再被 chunk 里的 provider 覆盖（`:998-1006,1097-1112,1144-1148`）。
- 外层行判定：`capabilityId ∈ {'agent.run','workflow.execute'}` → `countsTowardGlobal=false`。逐调用方桶照旧计入（它是发起方唯一的归属来源，见 PRD Out of Scope 第 3 条）。

### 1.2 计数桶

| 桶 | caller_id / caller_type | period 键 | 时区 | 计入 |
|---|---|---|---|---|
| 逐调用方（既有） | 原 caller 或 `system` / `system\|plugin` | `day:YYYY-MM-DD`、`month:YYYY-MM` | **UTC**（不变） | 全部条目 |
| 全局（新增） | `__global__` / `system` | `day:YYYY-MM-DD`、`month:YYYY-MM` | **主进程本地** | 全部条目，外层行除外 |

- 常量 `GLOBAL_USAGE_CALLER_ID = '__global__'` 放在 `apps/core-app/src/main/modules/ai/usage-ledger/constants.ts`，代码里不得出现字面量。
- 本地日 / 月键由唯一 helper `localDayKey(ts) / localMonthKey(ts)` 生成，用 `Date#getFullYear/getMonth/getDate`，与语音洞察 `localDate` 同法（`voice/voice-insights-store.ts:74-80`）。
- 时区名 `Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'` 随读接口返回。
- 不改表结构：`intelligence_usage_stats` 主键 `(caller_id, caller_type, period)` 天然隔离全局桶（`db/schema.ts:936-959`）。
- 未落库增量：`pendingGlobalDeltas: Map<periodKey, UsageDelta>` 在 `log()` 时累加；flush 事务提交后按该批次扣减，失败重排队时不扣。读全局用量 = 库值 + 增量。
- 守卫：任何「列出所有调用方」的读取都必须排除 `__global__`（目前没有这种读取，加一条测试防回归）。

### 1.3 历史回填（R-A3）

- 标记存 `system_config`（`db/schema.ts:1479-1483`），key = `intelligence.usage.global-backfill`，value = JSON：

  ```json
  { "version": 1, "cutoffMs": 1790000000000, "status": "pending|done", "completedAt": null }
  ```

- 流程：
  1. logger 初始化时若无标记，先写 `{status:'pending', cutoffMs: now}`，再允许全局桶的实时累加。实时条目的 `timestamp ≥ cutoffMs` 恒成立，因为请求开始于进程启动之后。
  2. 延迟后台执行回填：读 `timestamp < cutoffMs` 的明细，排除外层行，按 `(本地日, provider, model)` 分组，费用按 §2 当前目录重算，再汇总到日 / 月。
  3. 在**一个写事务**里以 `+=` upsert 全局桶并把标记改成 `done`。中途失败整个回滚，下次启动用同一个持久化的 `cutoffMs` 重做，不会重复。
- 回填只能覆盖保留期内的明细，更早的日子没有数据，属正常。

### 1.4 内置调用方命名（R-A5）

| 调用点 | 新 caller | 证据 |
|---|---|---|
| Home 对话轮 | `core.home.conversation` | `renderer/src/modules/conversation/useHomeConversation.ts:198-215` |
| Home 开场白 | `core.home.opening` | `renderer/src/modules/home-push/opening.ts:282-292` |
| 会话标题 | `core.home.conversation-title` | `renderer/src/modules/conversation/conversation-title.ts:171-186` |
| CoreBox 上下文动作 | `core.corebox.context-action` | `main/modules/box-tool/addon/context-actions/context-actions-provider.ts:137-144` |
| 剪贴板 OCR agent | `core.ocr.clipboard` | `main/modules/ocr/ocr-service.ts:880-887` |
| OCR 文本 embedding | `core.ocr.embedding` | `main/modules/ocr/ocr-service.ts:1146-1152` |
| 文件内容 embedding | `core.files.embedding` | `main/modules/box-tool/addon/files/embedding-service.ts:101,145,315` |
| 宿主 TTS（无 caller 时） | `core.app.tts` | `main/modules/ai/intelligence-module.ts:1510-1551` |
| 宿主 chatLangChain（无 caller 时） | `core.app.chat` | 同上 |

- 已有、保持不变：`core.voice.dictate / file-transcription / buffered-asr / speak`、`core.assistant.screenshot-translate`、`core.recommendation.semantic-embedding / semantic-rerank`、`omni-panel`、`ai-cli-orchestrator`、`intelligence.orchestrator`、`host:core-app`、`system`（能力测试）、`core.intelligence.capability-test`、`plugin:<name>`。
- 全部符合 `boundedAuditIdentifier` 的 `^[\w.:/-]{1,128}$`（`intelligence-audit-logger.ts:149`）。
- 带上 caller 后，这些调用会走一次逐调用方配额查找：不存在配额行即放行。实现时确认 `quotaCache` 会缓存「无配额」结果，避免每次调用都查库。

### 1.5 读接口

均定义在 `packages/utils/transport/sdk/domains/intelligence.ts`，主进程注册在 `registerStatsChannels`（`ai/intelligence-module.ts:1941-1974`），handler 首行 `assertHostOwnedIntelligenceControlPlane(context)`；插件 facade host-only 联合与 Record 同步（`packages/utils/plugin/sdk/intelligence.ts:16-158`）。

```ts
type UsageRange = 'today' | '7d' | '30d'

interface UsageTotals {
  requestCount: number; successCount: number; failureCount: number
  promptTokens: number; completionTokens: number; totalTokens: number
  estimatedCostUsd: number; avgLatencyMs: number | null
}

interface UsageInsights {
  timezone: string
  window: { range: UsageRange; startDay: string; endDay: string; startMs: number; endMs: number }
  totals: UsageTotals                              // 全局桶 + 未落库增量
  days: Array<{ day: string } & UsageTotals>       // 稀疏，renderer 补零
  breakdown: {
    coverage: { detailRequests: number; totalRequests: number } // 明细覆盖率
    channel: BreakdownRow[]; model: ModelBreakdownRow[]
    capability: BreakdownRow[]; caller: BreakdownRow[]
  }
  zeroCostModels: Array<{ providerId: string; model: string; status: PricingStatus; requestCount: number }>
  limits: UsageLimitsStatus                         // §3.5
  audit: { enabled: boolean; retentionMs: number | null; oldestDetailMs: number | null }
  pricing: { source: 'models.dev'; fetchedAt: number | null; checkedAt: number | null; available: boolean }
}

interface BreakdownRow {
  key: string                       // 渠道配置 id / 能力 id / 原始 caller（NULL → ''）
  operation?: string                // 仅调用方维度：caller 为 NULL 的旧行按 metadata.operation 再分（Home 各项）
  requestCount: number; failureCount: number
  totalTokens: number; promptTokens: number; completionTokens: number
  estimatedCostUsd: number
}

interface ModelBreakdownRow extends BreakdownRow {
  providerId: string; model: string; pricing: ModelPricing   // §2.4
}

interface AuditLogQuery {
  startMs?: number; endMs?: number; success?: boolean
  providerId?: string; caller?: string | null; capabilityId?: string; model?: string
  offset?: number; limit?: number   // limit 截断到 1..200，缺省 50
}
interface AuditLogPage { rows: IntelligenceAuditLogEntry[]; total: number }  // 行带 metadata（安全字段）
```

- 去向拆解排除外层行。`caller` 维度 NULL 键为 `''`，renderer 再按 `metadata.operation` 区分 Home。旧数据只能粗分：对 NULL 行加一层 `json_extract(metadata,'$.operation')` 分组。
- 估算费用口径：
  - 定价接入**之后**写入的行用库里的 `estimated_cost`；
  - 之前的行按当前目录重算；
  - 分界 = 定价子任务写入的 `system_config` 标记 `intelligence.pricing.models-dev`，见 §2.5。
- 窗口：`today` = 本地今天 0 点至今；`7d / 30d` = 含今天往回 7 / 30 个本地日。
- 性能目标：20 万行明细时 `getUsageInsights` < 150 ms（研究实测分组 36–75 ms）。

### 1.6 新装默认开审计（R-A6）

- `DEFAULT_GLOBAL_CONFIG.enableAudit = true`（`packages/utils/types/intelligence.ts:2942-2948`）。
- renderer 存储迁移的 `?? false` 改为 `?? DEFAULT_GLOBAL_CONFIG.enableAudit`（`packages/utils/renderer/storage/intelligence-storage.ts:259`）。
- 主进程播种已读常量（`ai/intelligence-config.ts:839-850`）。已有持久值一律不动。

## 2. models.dev 定价（子任务 `10-03-modelsdev-pricing`）

### 2.1 模块

`apps/core-app/src/main/modules/ai/pricing/`：

- `models-dev-catalog.ts`：拉取、精简、缓存、加载。
- `model-pricing.ts`：解析与估算。
- `pricing-provider-map.ts`：静态映射表。
- `__fixtures__/models-dev-subset.json`：测试夹具，从真实 api.json 截取，含本文提到的全部样例。

### 2.2 目录拉取与缓存（R-B1）

- 请求：`getNetworkService().request({ url: 'https://models.dev/api.json', method: 'GET', headers: { 'If-None-Match': etag }, timeout: 20_000 })`，走用户代理配置（`modules/network/network-service.ts:740`）。
- 精简格式（整行替换写入，见下条存储位置）：

  ```ts
  interface CompactCatalog {
    version: 1; source: 'models.dev'; fetchedAt: number; checkedAt: number
    etag: string | null; sha256: string           // 对 providers 的稳定序列化求哈希，加载时校验
    providers: Record<string, {
      name: string; api: string | null
      models: Record<string, {
        name?: string
        input?: number; output?: number; cacheRead?: number; cacheWrite?: number   // USD / 1M
        context?: number; outputLimit?: number
        priced: boolean                            // cost 字段存在
      }>
    }>
  }
  ```

- 存储位置：`system_config`（`db/schema.ts:1479-1483`）一行，key = `intelligence.pricing.models-dev.catalog`，value = 上述 JSON（约 560 KB）。
  - 智能模块没有独立的模块目录（`IntelligenceModule` 构造时未声明 file 配置，`ai/intelligence-module.ts:727`），而 SQLite 是本地业务 SoT。
  - 写入走主写通道的后台优先级（`.trellis/spec/main-process/database-write-contracts.md`），加载时校验 `sha256`。
  - 不复用 `modules/catalog`：它服务签名包，类型枚举固定为 `domain-lexicon | voice-provider`（`db/schema.ts:1632-1642`）。
- 触发时机：
  - 模块启动后延迟（≥ 30 s，不占启动关键路径）检查，`checkedAt` 超过 24 h 才请求；
  - `getUsageInsights` 发现过期时后台触发，不等待。
- 状态码处理：
  - 200：重写缓存；
  - 304：只更新 `checkedAt`；
  - 失败：保留旧缓存，记一次限频日志。
- 首次使用时读该行（解析毫秒级），`sha256` 不符则视为无目录。

### 2.3 解析（R-B2）

输入 `{ providerId, model }`。主进程用 `providerId` 查渠道配置，拿到 `type / baseUrl / metadata`。

1. 先判定特殊类别：
   - Nexus 托管（`isNexusManagedProvider`，`packages/utils/intelligence/nexus-provider.ts:16-40`，含 `tuff-nexus-default`）→ `credits`；
   - 本地（`type==='local'`、`local-system-ocr`、本机 CLI 且无自报费用）→ `local`。
2. 选 models.dev 服务商：
   - 按类型映射：`openai→openai`、`anthropic→anthropic`、`deepseek→deepseek`、`siliconflow→siliconflow-cn`（baseUrl 主机以 `.cn` 结尾）或 `siliconflow`；
   - 自定义 / 兼容渠道：baseUrl 主机与目录里各服务商 `api` 的主机做精确匹配。
3. 在选中服务商下查模型。依次尝试，命中即停：
   1. 原样；
   2. 小写；
   3. 去 `org/` 前缀；
   4. 去日期后缀（`-YYYY-MM-DD` 或 `-YYYYMMDD`）；
   5. 去 `:latest`。
4. 没选到服务商或没查到模型时，按模型族回退到原厂服务商，查找规则同第 3 步：
   - `gpt-* / o1* / o3* / o4* / chatgpt-* / text-embedding-*` → openai
   - `claude-*` → anthropic
   - `gemini-*` → google
   - `deepseek-*` → deepseek
   - `qwen*` → alibaba-cn
   - `glm-*` → zhipuai
   - `kimi-* / moonshot-*` → moonshotai-cn
   - `grok-*` → xai
   - `mistral-* / codestral-*` → mistral
5. 仍未命中 → `unpriced`。不跨转售商取价，不做模糊匹配。

输出：

```ts
type PricingStatus = 'priced' | 'free' | 'local' | 'credits' | 'unpriced'
interface ModelPricing {
  status: PricingStatus
  resolvedVia: 'channel-type' | 'base-url' | 'model-family' | null
  catalogProvider: string | null; catalogModel: string | null
  inputPerMTokens: number | null; outputPerMTokens: number | null
  contextTokens: number | null; outputLimitTokens: number | null
}
```

- `free` = 目录里有 `cost` 且输入、输出都为 0。
- 结果按 `(providerId, model, catalog.sha256)` 记忆化。

### 2.4 费用（R-B3）

- 估算费用：
  - 显式 `estimatedCost` 优先；
  - 其次 provider 自报 `usage.cost`（Pi CLI，`ai/providers/pi-cli-runtime.ts:505-532`）；
  - 再次 `status==='priced'` 时 `(promptTokens × input + completionTokens × output) / 1e6`；
  - 其余为 0。
  - 结果保留 6 位小数。
- 删除 `MODEL_COSTS` 与 `default` 价（`ai/intelligence-audit-logger.ts:129-146,300-305`）。
- 计算放在 flush 的**准备阶段**（事务之外），不在 `log()` 同步路径：保证目录在首批 flush 前大概率已加载，也不在写通道里等网络。
- 缓存、推理、音频等其它单价暂不用：usage 只有输入 / 输出 token。`tiers` 与 `context_over_200k` 用基础价，在页面方法说明里写明。

### 2.5 与账本的分界

定价子任务在**首次拿到可用目录**时写入 `system_config['intelligence.pricing.models-dev.since'] = { "sinceMs": <该时刻> }`（不是首次启动时，详见子任务 design）。

- `timestamp ≥ sinceMs` 的明细，`estimated_cost` 可信；
- 之前的行在读侧按当前目录重算（§1.5）；
- 全局桶回填（§1.3）同样走重算。

## 3. 全局限制（子任务 `10-03-intelligence-usage-limits`）

### 3.1 存储（R-C1）

- `intelligence_quotas` 保留行：`caller_id='__global__'`、`caller_type='system'`、`enabled=1`，字段只用：
  - `requests_per_day / requests_per_month`
  - `tokens_per_day / tokens_per_month`
  - `cost_limit_per_day / cost_limit_per_month`

  分钟字段恒为 NULL。
- 该表不在同步清单里，上限只管本机（`prd.md` 设计取舍第 1 条）。
- `IntelligenceQuotaManager` 新增方法：
  - `getGlobalLimits()`。
  - `setGlobalLimits(limits)`：整行替换语义，缺省即 NULL，在事务里 upsert，提交后再刷新缓存，保证读后写一致。
  - `getAllQuotas()` 过滤掉保留行。
- 逐调用方 `checkQuota(caller, 'plugin')` 永远匹配不到它，无需改动。

### 3.2 接口（R-C1 / R-C2）

```ts
interface UsageLimits {
  requestsPerDay: number | null; requestsPerMonth: number | null
  tokensPerDay: number | null;   tokensPerMonth: number | null
  costUsdPerDay: number | null;  costUsdPerMonth: number | null
}
getUsageLimits(): Promise<UsageLimits>
setUsageLimits(limits: UsageLimits): Promise<UsageLimits>   // 校验：请求 / Token 为正整数，费用 > 0，否则 INVALID_REQUEST
```

两者都是 host-only，接线同 §1.5。

### 3.3 执行（R-C3）

- 位置：`invoke()` 与 `stream()` 内，结果缓存未命中之后、`checkQuota(caller)` 之前；条件 `this.config.enableQuota && !outerGoverned`。
- 读数：全局桶本地日 / 月（库值 + 未落库增量 + 请求数的在途放行数），与保留行比较，任一项「已用 ≥ 上限」即拒绝。
  - 在途放行数：放行时 +1；条目进入 `pendingGlobalDeltas` 或调用在落账前中止时 −1。保证并发到达时请求数上限精确，测试 N 个并发、只剩 1 个名额 → 只放行 1 个。
  - Token 与费用上限是事后计量，可能被在途请求小幅越过，在页面说明里写明。
- 被拒请求：不写审计、不计数（与既有配额一致）。

### 3.4 错误（R-C4）

- `INTELLIGENCE_ERROR_CODES` 增加 `USAGE_LIMIT_REACHED`（`packages/utils/transport/events/types/intelligence.ts:1-12`）。
- 抛出：

  ```ts
  Object.assign(
    new Error(`[USAGE_LIMIT_REACHED:${capabilityId}] Usage limit reached: ${limitKey}; resets at ${resetsAtIso}`),
    { code: 'USAGE_LIMIT_REACHED', usageLimit: { key: limitKey, used, max, resetsAt } }
  )
  ```

  消息里不得出现 `quota exceeded / quota exhausted / rate limit / too many requests`，以免被旧的子串规则归成 `QUOTA_EXHAUSTED`（`ai/intelligence-error-normalizer.ts:87-92`）。
- 归一化：显式 code 或消息 token `usage_limit_reached` 命中时，在 quota 分支之前返回 `{ code:'USAGE_LIMIT_REACHED', reason, recovery }`。
- renderer 分类器（每处都要有测试）：

| 入口 | 文件 | 现状 |
|---|---|---|
| CoreBox AI 答案 / OmniPanel | `renderer/src/modules/intelligence/ai-error-recovery.ts`（`CoreIntelligenceAnswer.vue:105`、`OmniPanel.vue:170`） | quota → Nexus 文案 |
| VoicePanel / Home 听写提示 | `views/assistant/VoicePanel.vue:1006-1007`、`views/base/home/composer/dictation-notice.ts:155,217` | `assistant.voicePanel.quotaExhausted` |
| CoreBox 结果信号 | `components/render/sourceMeta.ts:49-51,80-82` | 「额度不足」 |
| Home 对话 | `modules/conversation/conversation-error-display.ts:29-40` | 解析 `[CODE:cap]` |

- 新文案统一表达「已达到你在『审计』里设置的 AI 用量上限，<本地时间> 重置」，并给打开 `/setting/intelligence/audit` 的入口。
- 插件只拿到 code。官方 `plugins/touch-intelligence` 若把未知 code 落到积分文案，补一条映射。

### 3.5 状态（R-C6）

```ts
interface UsageLimitsStatus {
  limits: UsageLimits
  items: Array<{
    key: keyof UsageLimits; period: 'day' | 'month'; metric: 'requests' | 'tokens' | 'cost'
    max: number; used: number; ratio: number
    state: 'ok' | 'warn' | 'reached'   // warn: ratio ≥ 0.8
    resetsAt: number                    // 本地次日 0 点 / 次月 1 日 0 点
  }>
}
```

### 3.6 后台降级（R-C5）

| 后台调用方 | 遇到 `USAGE_LIMIT_REACHED` 时的处理 |
|---|---|
| 文件 embedding（`embedding-service.ts`） | 停止当前批次，在文件索引诊断里写降级原因，`resetsAt` 前不再发起 |
| 剪贴板 OCR agent（`ocr-service.ts`） | 任务以该 code 结束，不重试 |
| 推荐语义（`recommendation-engine.ts`） | 当日关闭语义层，回落到非语义排序 |

三处都不得进入重试循环。

## 4. 共享洞察页组件（子任务 `10-03-insights-shell-kit`）

目录 `apps/core-app/src/renderer/src/components/settings/insights/`。样式从 `views/base/VoiceInsights.vue` 原样迁出，继续用 `--shell-*` token。这些组件的形状由 CoreApp shell 布局决定，所以放 CoreApp、不进 TuffEx。

| 组件 | 职责 | 接口 |
|---|---|---|
| `InsightsHeader.vue` | 一行标题 | `title` prop；`#status`、`#actions` 插槽；h1 不可选中；操作区带 `shell-chrome-safe-inline-end` |
| `InsightsNotice.vue` | 页内提示条 | `tone: 'error' \| 'warning' \| 'info'`、`title?`、`description?`；`#action` 插槽；error 用 `role="alert"`，其余用 `role="status"` |
| `InsightsHeroMetric.vue` | 主指标 | `label`、`value: string`、`note?`（悬停说明，图标可聚焦）；数值走 `TxTextMorph` |
| `InsightsMetricCard.vue` | 辅助指标卡 | `value`、`unit?`、`label`、`note?`；`TxCard shadow="none"` |
| `InsightsMenu.vue` | ⋯ 菜单 | `items: { key, icon, label, disabled?, danger?, separatorBefore?, testId? }[]`；`select` 事件；`TxPopover` + 原生 `button` |

- 语音页迁移时保留全部 `data-testid`，用透传 attrs 或 `testId` 字段；`VoiceInsights.test.ts` 不改断言。
- 迁移前后在同一 profile、同一窗口尺寸截图，逐区域对比。

## 5. 审计洞察页（子任务 `10-03-audit-insights-page`）

### 5.1 结构

```
IntelligenceAuditPage.vue  (SettingsPage column, back-to /setting/intelligence)
├─ InsightsHeader 「审计」  #actions: [调用记录] InsightsMenu[设置, 导出 CSV, 导出 JSON]
├─ InsightsNotice*         审计未开启(一键开启) / 限额 ≥80% / 已到顶 / 读取失败(重试) / 定价目录未下载
├─ AuditRangeChips         TxFilterChips role=tablist [今天 | 近 7 天 | 近 30 天]，默认 30 天
├─ 指标区                   InsightsHeroMetric(Token：输入 / 输出) + InsightsMetricCard × 4
│                           (请求 成功/失败 · 成功率 · 平均延迟 · 估算费用[估算 + AuditZeroCostNotice])
├─ AuditTrendCard          TxTimeseriesChart type=bar；TxFilterChips 切 Token / 请求 / 估算费用
├─ AuditBreakdownCard      TxFilterChips 切 渠道 / 模型 / 能力 / 调用方；TxAllocationBar(前 5 + 其他)
│                           + TxDataTable(可排序)；模型行带单价 / 上下文 / 输出上限 / 定价状态；覆盖率脚注
├─ AuditLimitsCard         TxProgressBar × 已设项；未设时「设置上限」
├─ AuditLimitsDrawer       TxNumberInput × 6；费用项注明估算 + AuditZeroCostNotice
├─ AuditRecordsDrawer      筛选 + TxDataTable + TxPagination(服务端) + 行详情(上下文包 / 检查点) + 导出
└─ AuditSettingsDrawer     启用审计 / 响应缓存 + 过期时间 / 保留期 → 隐私设置
```

- 新组件放 `apps/core-app/src/renderer/src/components/intelligence/audit/`。
- `context-package-log-summary.ts` 及其测试保留复用。
- 删除 `IntelligenceUsageStats.vue`、`IntelligenceUsageChart.vue`、`IntelligenceAuditLogs.vue`、`IntelligenceAuditOverlay.vue`、`components/intelligence/config/IntelligenceGlobalSettings.vue`。删前全仓 grep 一次，含 `components.d.ts`。

### 5.2 数据与状态

- 加载：
  - `onMounted` 加载 `getUsageInsights({ range })`，KeepAlive 下 `onActivated` 再刷新；
  - 首次加载用骨架（同容器、同行数，`useDeferredLoading`）；
  - 后续刷新保留内容，不回到骨架。
- 切范围：只重拉，不清空已显示内容。
- 趋势 X 轴：
  - 由 `days[].day` 生成 `Date.UTC(y, m-1, d)`；
  - 刻度与提示框用 `timeZone: 'UTC'` 格式化，不再出现星期下标拆字；
  - renderer 按 `window` 补零天。
  - 零值不画柱：已核实 `TxBarSeries` 的柱高为 `|y0 - y1|`（`packages/tuffex/packages/components/src/charts/src/series/src/TxBarSeries.vue:76-104`），0 值是 0 高矩形、不可见，无需改 TuffEx。真机截图仍要确认没有细线（旧图表的蓝黄细线来自它的 `.bar { min-height: 2px }`，见 `IntelligenceUsageChart.vue` 样式段）。
- 名称映射（renderer 侧）：
  - 渠道：`useIntelligenceManager().providers` 的 name + `resolveProviderIcon`；查不到时，值是类型名就显示类型，否则显示「已删除的渠道」+ 原 id。
  - 调用方：静态表 `core.* → i18n`；插件按已安装列表构造 `plugin:${name}` 精确匹配（不拆字符串）；`''` + `operation` → Home 各项；`''` 其余 → 「应用内其他」；`system` → 「能力测试」；`ai-cli-orchestrator` → 「Agent 运行时」。
  - 能力：`DEFAULT_CAPABILITIES[id].label`（经 `useIntelligenceManager().capabilities`）。
- 格式：
  - Token 与请求用 `Intl.NumberFormat` compact；延迟 < 1 s 显示 ms，否则 s；
  - 费用：USD 保留 2 位有效小数，不足 $0.01 显示「< $0.01」，标签恒带「估算」。
- 导出：按当前筛选分页拉取（每页 200）直到 `total`，生成 CSV / JSON，沿用 Blob + `<a download>`（同 `SettingUpdate.vue:666-683`）。文件名带本地日期与范围。

### 5.3 文案

- 新命名空间 `intelligenceAudit.*`，中英同时加，`translation-coverage.test.ts` 要求键集合相等。
- `settingsIntelligenceHub.auditDesc` 改为不含「记忆复核」的描述。
- 旧 `intelligence.usage.*` 等键若删除组件后无引用，保留或删除二选一；删除时两种语言同删。

## 6. 记忆子页（子任务 `10-03-intelligence-memory-page`）

- 文件：
  - `views/base/intelligence/IntelligenceMemoryPage.vue`（split）；
  - `components/intelligence/memory/MemoryList.vue`、`MemoryDetail.vue`、`MemoryEditor.vue`、`memory-scope.ts`。
  - 迁移完成后删除 `components/intelligence/audit/IntelligenceMemoryReview.vue`，其测试断言迁到新组件。
- 注册：
  - `categories.ts` 新增 `{ key:'memory', path:'/setting/intelligence/memory', labelKey:'settingsIntelligenceHub.memory', descriptionKey:'settingsIntelligenceHub.memoryDesc', navIcon:'i-ri-brain-line' }`。
  - `uno.config.ts` 的 `SETTINGS_CATEGORY_ICONS` 加该图标。
  - `router.ts` 的 `childLoaders` 加 `'intelligence/memory'`，name 为 `$I18n:router.intelligenceMemory`。
  - 数组位置：兄弟任务的 MCP 已落地 → 放 MCP 后；未落地 → 放 `capabilities` 后，由后落地的一方按 D5 调整。
- `memory-scope.ts`：
  - `memoryScopeEffect(item) → 'effective' | 'source-session-only' | 'inactive'`，规则镜像 `intelligence-context-hygiene.ts:1143-1166`，注释注明出处；
  - 编辑器范围选择、列表行、详情共用；
  - 有单测。
- 新建默认 `scope:'global'`；`type` 默认改为 `preference`（`temporary` 不带 TTL 时无实际含义）。
- 交互：
  - 删除走 `TxBottomDialog` 确认（同提示词页），成功后提示「后续回答不会再使用这条记忆」；
  - 替换成功后选中 `replaced.memory.id`；
  - `MEMORY_REPLACE_CONFLICT` 时重载并保持选中；
  - 启停只更新本地行，不重排；
  - 搜索 300 ms 防抖，切换条件时 offset 归零；
  - KeepAlive `onActivated` 时刷新。
- 去掉「最近使用 / 使用次数」。用词统一为「记忆」（含 `intelligence.memoryReview.title`）。

## 7. 兼容、迁移、回滚

- **无表结构迁移**。新增的只是既有表里的新行：全局计数桶、配额保留行，以及 `system_config` 的三个 key（`intelligence.usage.global-backfill`、`intelligence.pricing.models-dev.catalog`、`intelligence.pricing.models-dev.since`）。旧版本读到这些行无害：它不查 `__global__`，renderer 也不展示配额列表。
- 回滚粒度为子任务。回滚后残留行可留在库里；`DEFAULT_GLOBAL_CONFIG` 回滚只影响之后的新装用户。
- 新错误码是增量，Nexus 服务端不会产生它；老插件遇到未知 code 走各自的兜底。
- 隐私：
  - 明细保留与删除语义不变；
  - 计数在审计关闭时也写，`docs/engineering/sensitive-data-inventory.json` 的计数项要更新（readers / writers / retention 说明）；
  - `pi-provider-contracts.md:191-195` 的「计数 = 明细」限定为审计开启时段。
- 网络：models.dev 仅在后台、24 h 一次、走用户代理；失败不影响任何调用。

## 8. 测试与验证策略

- 主进程：沿用真实迁移库的 harness（`ai/intelligence-stream-ledger.integration.test.ts:27-56`）。
  - 本地日测试用固定时间戳，并在用例内设 `process.env.TZ`（Node 运行时生效），同时覆盖 `Asia/Shanghai` 与 `America/Los_Angeles`。
  - 定价用夹具，不打网络。
- 契约：
  - `packages/utils/__tests__/plugin-facing-events.test.ts`（自动）；
  - `intelligence-client-hard-cut.test.ts`、`ai/intelligence-admin-surface-boundary.test.ts`（手写清单，补条目）。
- renderer：组件测试 mock SDK，照 `views/base/VoiceInsights.test.ts` 的写法。
- 真机：dev 实例 + CDP 截图，遵守 `.trellis/spec/frontend/component-guidelines.md` 的骨架无跳动要求。备注：Tuff dev 必须走 dev wrapper 启动；失焦会自动隐藏、KeepAlive 会缓存页面。
- 每个子任务完成前跑：
  - `pnpm -C apps/core-app run typecheck`
  - 涉及文件的 vitest
  - lint delta（包内配置）
  - `pnpm check coreapp-ui-contract`
  - `git diff --check`
- 账本子任务另跑 `corepack pnpm privacy:inventory:verify`。
