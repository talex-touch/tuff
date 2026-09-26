# Cloudflare AI Gateway 接入 Nexus 的可行性与计费分析

> 日期：2026-09-25
> 性质：调研结论（未落地）。仅基于 Cloudflare 官方文档 + 本仓代码静态核对，**尚未在真实 CF 账号上实测**。
> 本仓核对基线：当前工作树（`apps/nexus`、`apps/core-app`、`infra/qwen-asr-relay`）。
> 上游依据：Cloudflare AI Gateway 官方文档，页面 `Last updated` 集中在 2026-04 ~ 2026-09-24（见 §9）。

## 0. 一句话定性

CF AI Gateway 值得接，但**只能当「传输 + 观测 + 限流层」，不能当 Nexus 的选路大脑**。

理由：它自带的「按条件选模型」能力（Dynamic Routes）与 Nexus 已有的 `scene_registry` / `scene_strategy_bindings` 选路体系功能重叠；且 Dynamic Routes 与「CF 代付推理（Unified Billing）」在文档层面互斥——前者只能用 `gateway.ai.cloudflare.com/.../compat/chat/completions`，后者主推 `api.cloudflare.com/.../ai/v1/*`，而 REST API 明确不支持 dynamic routing。

## 1. 是否收费

| 项 | 收费 | 备注 |
| --- | --- | --- |
| 转发、缓存、限流、Analytics、自定义元数据 | **免费**（所有 plan） | 官方原话：core features offered for free |
| BYOK（自带上游 API key） | **免费** | CF 不加价，只做透传 |
| Unified Billing（CF 代付推理） | **5% 充值手续费**，推理按上游原价透传 | 充 \$100 → 实扣 \$105；余额负数时次月月初补扣 |
| **日志存储** | ⚠️ **按「建第一个 gateway 的时间」分档** | 见下方分界说明 |
| DLP 内容扫描 | 免费（所有 plan） | 无 Zero Trust 时可用 2 个预置 profile |
| Guardrails 内容审核 | 按 Workers AI token 计费 | 底层跑 `@cf/meta/llama-guard-3-8b` |
| Logpush 导出 | 仅 Workers Paid：1000 万请求/月，超量 \$0.05/百万 | 带外导日志用 |

### 1.1 日志计费分界：2026-09-24（本次调研前一天）

| 建 gateway 时间 | 计费口径 | 额度 / 留存 |
| --- | --- | --- |
| `2026-09-24` **之前**已建过 | Legacy Logs | Free：10 万条/账号；Paid：1000 万条/gateway；单条 ≤10 MB |
| `2026-09-24` **当天及之后**建第一个 | **Workers Logs 计费** | Free：20 万条/天、留存 3 天；Paid：2000 万条/月含 + \$0.6/百万、留存 7 天；单条 ≤256 KB |

**本仓现状（已核实）**：全仓 `grep -E 'ai-gateway|gateway\.ai\.cloudflare|AI_GATEWAY|cf-aig'` → **零命中**，即本仓代码从未接入过任何 gateway。**这只证明仓库侧**：账号里是否在 `2026-09-24` 之前手工建过 gateway（从而落进 Legacy Logs）只能在 dashboard 复核；若没有，**一旦开始接入就会落进新计费口径**（Workers Logs）。

### 1.2 计费结论

- 只想「带观测地转发」：**零边际成本**（BYOK 路线）。
- 想让 CF 代付推理：**5% 手续费 + 200 req/60s 硬限流**（见 §2）。
- 日志是唯一容易被低估的成本项：Paid 计划下 2000 万条/月含，按「每请求 1 条 invocation + 1 条自定义日志」估算，约 1000 万请求/月即触顶。若对全量请求开日志需先算量。

## 2. 硬限制（决定架构，非可选）

| 限制项 | 值 | 影响 |
| --- | --- | --- |
| **Unified Billing 请求速率** | **200 req / 60s / gateway**（超出 429） | 🔴 即 3.33 rps。**BYOK 不受此限** |
| Gateway 数量 | Free 10 / Paid 20 个/账号 | 靠多 gateway 分片绕限流，上限 20 片 |
| 缓存 key 构成 | provider + endpoint + model + **provider 认证头** + 完整 body（SHA-256） | 🔴 见 §7.1 串号风险 |
| Custom metadata | **5 条/请求**（超出丢弃），仅 string / number / boolean | 归因维度只有 5 个槽位 |
| 请求重试 | 最多 5 次，delay ≤60s，末次不限时 | 够用 |
| 请求超时 | 按「首字节返回」计；流式只要首包及时即继续等待 | 对长流式友好 |
| 缓存体积 / TTL | 25 MB / 请求；TTL 60s ~ 1 个月 | 够用 |
| Spend limits | 20 条规则/gateway，按 model / provider / metadata 分桶 | 可做预算闸门 |
| **授权 token 作用域** | `AI Gateway Run` 是**账号级**，无法限定单个 gateway | 🔴 见 §7.2 |
| DLP 自定义条目 | 25 条；词表 1000 关键词/账号 | 够用 |

## 3. 能力边界

### 3.1 支持

- OpenAI 兼容 `chat/completions`；Anthropic Messages（`/ai/v1/messages`）；OpenAI Responses（`/ai/v1/responses`）。
- `/ai/run` 通用信封：任意模型与模态（LLM / image / TTS / **ASR**），支持 `background: true` + `webhookUrl` 回调。
- Provider 原生透传：任意上游路径（如 `/openai/audio/transcriptions`）。
- Custom Provider：任意 `https://` base_url，以 `custom-{slug}/` 前缀拼路径透传。
- WebSocket（含 realtime）。
- 缓存 / 限流 / Spend limits / DLP / Guardrails / 分析 / 日志 / OTel / 人工反馈评分。

### 3.2 不支持 / 不覆盖

- 🟠 **Dynamic Routes 只作用于 `/compat/chat/completions`**。该端点对「单模型 chat completions」已被标 **Deprecated**；而新的 REST API（`api.cloudflare.com/client/v4/accounts/{acct}/ai/v1/*`）**明确不支持 dynamic routing**。
  → **「CF 原生动态选模型」与「CF 代付推理」二选一。**
- 不做多步编排：DashScope 那类「提交任务 → 轮询 task → 拉结果」的异步链，CF 只能透传单次 HTTP。
- `cf-aig-byok-alias` 只在**原生透传端点**生效；在 Unified Billing 路径（`/ai/v1/*`、`env.AI.run()`）只认 `default` 别名，否则直接落回 Unified Billing 扣 CF 余额。

### 3.3 上游覆盖实测（扫 model catalog）

| 上游 | 覆盖 | 证据 |
| --- | --- | --- |
| **百炼 / DashScope** | ✅ 官方已收录 | `alibaba/qwen3-max`：Third-party，**Zero data retention**，明写 served via DashScope's OpenAI-compatible endpoint；亦收录 `qwen3.7-max` / `qwen3.8-max` / `qwen-image-3.0-pro` 等 |
| DeepSeek | ✅ | `deepseek/deepseek-v4-pro`（走 Fireworks 基础设施） |
| Moonshot / Kimi | ✅ | `moonshotai/kimi-k3` |
| Zhipu / GLM | ✅ | `@cf/zai-org/glm-5.3` 等（Cloudflare-hosted） |
| 自托管 CF 模型 | ✅ | `@cf/qwen/qwen3.8-27b`、`@cf/deepseek-ai/*`、`@cf/moonshotai/*` |
| **火山引擎 / 豆包** | ❌ **查无此项** | `doubao` / `volcengine` 在 catalog 中零命中 → 只能走 Custom Provider |

> 补充：Custom Provider 的 `base_url` 只放域名（或固定前缀），路径全部由请求 URL 决定；其官方示例均自带 `Authorization: Bearer $PROVIDER_API_KEY`，但同页 Best practices 第 6 条明确**推荐用 BYOK 存 key**（`configuration/bring-your-own-keys`），即 custom provider 走 BYOK 是官方推荐而非未文档化；未文档化的是它能否走 Unified Billing（CF 代付）。**按「必须自带 key 或自建 BYOK 条目」规划更安全。**

## 4. Nexus 现状对照（本仓事实，带行号）

| 事实 | 位置 |
| --- | --- |
| Nexus = Nuxt + nitro `cloudflare-pages`，部署为 **Cloudflare Pages Functions**（非 Workers） | `apps/nexus/nuxt.config.ts:438`；根 `wrangler.toml` 用 `pages_build_output_dir`（`apps/nexus/SETUP.md:28-30`） |
| 已绑 D1(`DB`) / R2 / KV，经 `readCloudflareBindings` 读取 | `apps/nexus/server/utils/cloudflare.ts`（SETUP.md:189-192） |
| 上游调用是**直连**：拼 `${compatBaseUrl}/chat/completions` 并带上游 key | `apps/nexus/server/utils/sceneOrchestrator.ts:573-574` |
| scene 选路已在 Nexus 内实现，落 `scene_registry` / `scene_strategy_bindings` | `sceneRegistryStore.ts:8-9`；`strategyMode` 支持 `priority\|least_cost\|lowest_latency\|balanced\|manual`（同文件 :15） |
| provider vendor 枚举 | `providerRegistryStore.ts:14` = `tencent-cloud \| openai \| deepseek \| dashscope \| exchange-rate \| custom`（**无 newapi / volcengine**） |
| 无任何 CF AI Gateway 集成 | 全仓 grep 零命中 |
| ASR 走 DashScope 专有端点 + 异步轮询，非 OpenAI 兼容 | `apps/nexus/server/utils/dashscopeAsrProvider.ts`（含 `services/aigc/multimodal-generation/generation` 与 filetrans 轮询） |
| **已存在**一个独立 CF Worker 做 DashScope 中转（保 key、恒定时间比对、体积上限） | `infra/qwen-asr-relay/wrangler.toml` + `index.mjs` |

**最小接入点很干净**：`sceneOrchestrator.ts:573` 的 baseUrl 来自 provider registry 记录的 `endpoint` 字段。把该 endpoint 指向 gateway URL + 新增一个 transport/adapter，即可让**所有 scene 一次性经过 CF**，无需改动选路逻辑本身。

## 5. 与既有不变量的冲突（重点）

前作 `.trellis/tasks/09-08-nexus-ai-channel-billing/prd.md` 已确立以下不变量，本次方案**必须服从它们**：

| 既有不变量（前作） | 与「CF 管选路」的冲突 |
| --- | --- |
| 「Client-controlled model, provider, price, charge, endpoint fields are rejected/ignored at the API boundary」(Requirements 5 / AC) | 若把模型选择交给 CF Dynamic Route，Nexus 不再是模型选择的唯一权威，审计口径与「Nexus 独占路由」冲突 |
| 「Do not expose unimplemented NewAPI or Volcengine provider types」(Requirement 1) | 用 Custom Provider 接豆包前，需先补 vendor 语义，否则又是一条未实现的 provider 类型 |
| 「Out of Scope: NewAPI or Volcengine runtime adapters, models, automatic fallback, or **arbitrary HTTP provider configuration**」 | Custom Provider 本质上就是「任意 HTTP provider 配置」——需明确它是否算违反此条 |
| 「Nexus alone resolves the encrypted upstream credential」 | CF BYOK 会把 key 存到 CF 侧（Secrets Store），凭据权威发生位移 |
| 「never forwards a caller-supplied URL to DashScope」+ 媒体边界 Nexus 独占 | ⚠️ ASR 音频若经 CF gateway 出境，等于把用户音频送入 CF 境外边缘；与「媒体只在 Nexus ↔ DashScope 之间」的设计相抵触 |

→ 建议在报告基础上先定一条边界：**CF 是传输与观测层，不是凭据与选路权威**；媒体（音频/图像）默认**不经 CF**。

## 6. 需要拍板的三个分叉

1. **CF 代付推理 vs scene 动态选路**
   - Unified Billing：免管 key、省事，但 200 req/60s + 5% 手续费 + 不能配 Dynamic Route。
   - BYOK：免费、无限速、可配 Route，但上游 key 仍需自管（且存到 CF Secrets Store）。
2. **谁当选路大脑**
   - Nexus `sceneOrchestrator`（现状）与 CF Dynamic Route 功能重叠。两边都配会互相覆写，且日志归因不可信。
   - 建议：Nexus 保留 scene 语义 / 身份 / 预算 / 审计；CF 只做重试、缓存、限流、可观测，**不配 Dynamic Route**（除非确需非研发同学改模型）。
3. **成本归因对齐**
   - CF spend limits 只能按 `cf-aig-metadata` 的 5 个槽位分桶。若要让 CF 的账对得上 Nexus 的 credits 账本，这 5 个槽位需与 Nexus 的 `userId` / `scene` / `capability` / `account`（+1 保留）对齐并写入契约。

## 7. 两个必须先解决的风险

### 7.1 🔴 缓存串号

默认缓存 key = `provider + endpoint + model + provider 认证头 + 完整 body` 的 SHA-256。若走 Unified Billing（请求里**没有** provider 认证头），则**两个不同用户发出相同 prompt 会命中同一份缓存响应**。桌面端极易发生（同一模板、同一 system prompt）。

必须二选一：默认 `cf-aig-skip-cache: true`，或强制 `cf-aig-cache-key` —— 该头是**整体覆盖**默认 key、不是追加维度，所以自定义 key 必须自带全部维度（provider + endpoint + model + 认证头 + 完整 body）；只放 userId 会让同一用户的不同 prompt 命中同一份缓存响应。

### 7.2 🔴 凭据与内容边界

- `AI Gateway Run` token 是**账号级**，能解所有 gateway 的 BYOK key → 只能存在于 Nexus 服务端，**绝不下发客户端**（与既有「云端签发短时 token」一致，但需写入契约）。
- AI Gateway 日志默认记录 prompt / response → 用户内容会落在 CF 侧。是否接受留存是合规决定；不接受则需显式 `cf-aig-collect-log: false`（注意与 §1.1 的日志计费联动）。

## 8. 待实测清单（文档无法定案）

1. Nexus 是 **Pages Functions**，而 AI Gateway 的 binding 文档都以 Workers 为例；Pages 上的 `context.env.AI` **只被文档确认为 Workers AI**。→ 实测 `/ai/run` 与 gateway 参数在 Pages 上是否可用；不可用则一律走 HTTP。
2. `/compat/chat/completions` 上「不带 provider key」时的实际落点：走 BYOK default、还是落 Unified Billing（文档在 unified-billing 与 custom-providers 两处表述不完全一致）。
3. ~~Custom Provider 是否支持 BYOK 存 key~~ 已定案：官方 Best practices 第 6 条推荐用 BYOK 存 key。仍需实测的是 BYOK 条目对 **custom** provider 是否生效——该页只给了 per-request key 示例，未给 custom 专属的 BYOK 示例。
4. Custom Provider 能否走 **Unified Billing**（CF 代付），即豆包能否免 key 使用。
5. Dynamic Routes 的 **REST 端点**：`features/dynamic-routing/json-configuration` 页明写「用 REST API 定义」并给出 JSON 结构，具体 endpoint 从该页取；它与 REST API 索引页「不支持 dynamic routing」的表述仍需实测对齐（账号内鉴权与可用性）。
6. 从 CF 边缘出网到**国内上游**（`dashscope.aliyuncs.com` 等）的连通性与延迟基线。
7. Free plan 下 gateway 数量（10）与日志额度（20 万条/天）在真实用量下的余量。
8. 三个 `cf-aig-*` 头在 Pages 环境透传是否完整（`metadata` / `skip-cache` / `cache-key`）。

## 9. 上游依据

Cloudflare 官方文档（2026-09-25 访问；括号内为该页 `Last updated`）：

- `https://developers.cloudflare.com/ai-gateway/`（2026-04-20）
- `.../reference/pricing/`（**2026-09-24**）
- `.../reference/limits/`（2026-09-24）
- `.../features/unified-billing/`（2026-09-23）
- `.../configuration/bring-your-own-keys/`（2026-09-22）
- `.../observability/custom-metadata/`（2026-09-24）
- `.../usage/rest-api/`（2026-09-17）
- `.../usage/worker-binding-methods/`（2026-09-17）
- `.../glossary/`（2026-09-15）
- `.../configuration/request-handling/`（2026-09-14）
- `.../features/spend-limits/`（2026-09-09）
- `.../features/caching/`（2026-08-27）
- `.../features/dynamic-routing/`（2026-08-07）及其 `json-configuration/`、`usage/`
- `.../configuration/custom-providers/`（2026-06-15）
- `.../configuration/authentication/`（2026-06-17）
- `.../configuration/fallbacks/`（2026-04-20）
- `https://developers.cloudflare.com/workers/observability/logs/workers-logs/`（2026-08-11）
- `https://developers.cloudflare.com/pages/functions/bindings/`（2026-06-25）
- model catalog：`https://developers.cloudflare.com/ai/models/`（含 `alibaba/qwen3-max`）

本仓代码：`apps/nexus/server/utils/{sceneOrchestrator,sceneRegistryStore,providerRegistryStore,dashscopeAsrProvider}.ts`、`apps/nexus/nuxt.config.ts`、`apps/nexus/SETUP.md`、`infra/qwen-asr-relay/`、`.trellis/tasks/09-08-nexus-ai-channel-billing/prd.md`。
