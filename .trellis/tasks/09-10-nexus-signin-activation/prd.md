# Nexus 登录即用与 credits 计费

## Goal

让用户在 CoreApp 里配置并登录 Nexus 之后，**不需要再手工开启渠道**就能直接使用 Nexus 提供的 AI 能力；
所有会花钱的调用按 Nexus credits 计费，并且**在产生上游成本之前**就能因余额不足而拒绝。

## Confirmed facts

### 接入面（CoreApp）

- 服务地址来源按优先级：构建期 env `TUFF_NEXUS_BASE_URL` → 用户自定义地址 `appSetting.auth.nexusBaseUrl`
  → `appSetting.dev.runtimeServer`（`production` 用官方 `NEXUS_BASE_URL=https://tuff.tagzxia.com`，`local` 用
  `NEXUS_LOCAL_BASE_URL=http://localhost:3200`）：`packages/utils/env/index.ts:259-287`、
  `apps/core-app/src/main/modules/nexus/runtime-base.ts:31-68`、渲染层同构实现 `renderer/src/modules/nexus/runtime-base.ts:48-62`。
- 用户自定义地址**已对普通用户开放**：设置页有输入框 + 保存/恢复默认 + 当前生效来源提示
  （`SettingUser.vue` 的 `.nexus-endpoint` 块 → `renderer/src/modules/nexus/runtime-base.ts:98-130`
  写入 `appSetting.auth.nexusBaseUrl`），换址会清登录态。
  地址校验规则（`validateNexusBaseUrl`，`packages/utils/env/index.ts:203-247`）：https，或 **http 仅限 loopback**；
  必须是**裸 origin** —— 不接受路径、query、fragment 与内嵌凭据（请求路径按 `new URL('/api/…', base)` 拼接，
  基址里的路径会被丢弃，等于把请求打到另一个部署上）。存储值不再通过校验时按未设置处理
  （`main/modules/nexus/runtime-base.ts:31-38`）。
  构建期 env 覆盖同样要过这条校验：非 loopback 的 `http://` 覆盖会被忽略并回落（`env/index.ts:259-268`），
  CLI 的 `--api-base` 则直接报错退出（`packages/tuff-cli/src/bin/tuff.ts:1676-1688`）。
- 内置 provider `tuff-nexus-default`：`packages/utils/types/intelligence.ts:2860-2882`，
  `enabled: false`、`priority: 1`、`baseUrl: ${NEXUS_BASE_URL}/v1`，
  能力 `text.chat / text.translate / text.summarize / text.rewrite / vision.ocr / image.translate.e2e / audio.stt`，
  标记 `metadata.origin = 'tuff-nexus'`。
- 登录：设备码 `auth/index.ts:1193-1244` → 轮询 `:1289-1345` → 回调 `setAuthToken` `:1491-1521`；
  凭据是加密的 version-1 bundle（AK 1 小时 / RK 30 或 180 天）`:80-90`、`:343-398`；
  `getAuthToken()` 在临期时单飞刷新 `:225-234`、`:992-1105`；`subscribeAuthState` 可订阅登录态 `:218`。
- 运行时注入：`modules/ai/provider-runtime.ts:33-43` 把 AK 写进 Nexus provider 的 `apiKey`，
  并标记 `tokenMode: 'auth' | 'guest'`，**但保留 provider 自身的 `enabled` 标记**。
- 配置收敛：`modules/ai/intelligence-config.ts:336-357`（补齐 provider 与 capability）、
  `:423-447`（provider 未启用时把该 provider 的所有 binding 置 `enabled:false`，并补一条
  `text.chat` disabled binding）、`:451-475`（补 `audio.stt` disabled binding）、
  `:739-747`（auth 状态监听**只 reload 配置**）。
  → **结论：登录本身不会让 Nexus 渠道可用，用户必须去渠道页手动开启。**
- 客户端已经能读余额：`renderer/src/modules/nexus/credits-summary.ts`
  （`GET /api/credits/summary`，经 `AuthEvents.nexus.request` → main `performNexusRequestWithAuth`
  自动带 AK 并在 401 时刷新），由 `CreditsSummaryBlock.vue` 在设置页渲染。

### 计费面（Nexus server）

- 余额模型：D1 `credit_balances(scope, scope_id, month, quota, used)` +
  `credit_ledger(delta, reason, metadata, idempotency_key)`；**UTC 自然月**；
  台阶 PLUS 100,000 / PRO 240,000 / TEAM|ENTERPRISE 1,000,000 不变，FREE 由 1,000 抬到 **20,000**
  （完成资料后 5,000 → **40,000**，签到 1 → **500**）（`server/utils/creditsStore.ts`）。
- **计价表**：D1 表 `credit_pricing` 是单价唯一来源（`server/utils/creditPricingStore.ts`）。
  单位 `1k_tokens` / `audio_second` / `transcript_unit` / `image`；未登记的能力按 `1k_tokens` 兜底。
  disabled 的价格行 = 不再售卖，派发前 503 `CAPABILITY_DISABLED`（不回落 token 兜底——对 image/audio 会结算成 0）。
- **聊天/文本**：`POST /api/v1/intelligence/invoke|stream` 现在**派发前预留**（输出上限估算），
  拿到 provider 用量后结算并释放差额；余额不足在调用上游**之前** 402 `CREDITS_EXCEEDED`。
  `vision.ocr` 不再被硬编码成 0 token：按 `image` 单位计价。
- **ASR**：`POST /api/v1/ai/audio/transcribe` 提交前 `reserve`，结算按
  `max(transcript units × 1, billedSeconds × 4)` 并释放差额；常量已收敛进定价表，行为与线上一致。
  结算用的是 admission 时写入 ASR 记录的 `pricing_snapshot`，中途改价不影响在途请求。
- **场景**：`POST /api/v1/scenes/[id]/run` 由「完全不扣费」改为同形预留/结算/释放；`dryRun` 仍不扣费。
- 鉴权：`requireAuth` = session 优先、Bearer app token 兜底（`server/utils/auth.ts:546-557`）；
  `requireVerifiedEmail` 额外要求邮箱已验证（`:559-569`）；`kind:refresh` 的 RK 被拒，legacy kind-less 视为 access。
- 余额读取：`GET /api/credits/summary|ledger|trend`（verified email），团队/Admin 另有接口；
  **app-auth 命名空间下没有 credits 端点**（`/api/v1/quotas` 是同步存储配额，不是 credits）。
- 错误字面量：`Team credits exceeded.` / `User credits exceeded.` / `Credits exceeded.`
  （`creditsStore.ts:1047-1070`）→ HTTP 402 `CREDITS_EXCEEDED`
  → 客户端归一为 `QUOTA_EXHAUSTED`（`server/utils/intelligenceErrorContract.ts:26-33,112-158`）。

## Gaps（状态截至本轮实现）

| # | 缺口 | 影响 | 状态 |
| - | ---- | ---- | ---- |
| G1 | 登录不会启用 Nexus 渠道 | “登录即可用”不成立 | **已修**：登录态跃迁自动启用/登出回退；用户显式关停写入 `metadata.nexusRouteUserDisabled`，不会被 token 刷新重新打开 |
| G2 | 没有面向普通用户的服务地址配置 | 自建/私有化 Nexus 无法接入 | **已修**：设置页开放自定义地址（D4），换址清登录态；校验见上文 |
| G3 | chat 计费事后扣、无预留 | 0 余额仍消耗上游成本 | **已修**：派发前预留 + 按 provider 用量结算/释放 |
| G4 | scenes 路由不计费 | 上游成本白吃 | **已修**：同形预留/结算/释放，`dryRun` 不计费 |
| G5 | `vision.ocr` 无 token → 免费 | 同上 | **已修**：按 `image` 单位计价（2,000/张） |
| G6 | 客户端只显示余额，不显示单次消耗，也没有提交前预检 | 用户不知道钱花在哪 | **部分**：`GET /api/credits/pricing` + 设置页价目表（能力名/单位随语言）；提交前预检由服务端预留承担，客户端不做余额判断 |
| G7 | 计费单位是 token，不是用户可理解的能力单位 | 无法对外解释定价 | **已修**：`credit_pricing` 能力级单位（`1k_tokens`/`audio_second`/`transcript_unit`/`image`） |

## Requirements（已按上述决策实现）

1. 登录成功后 Nexus 能力可用；退出登录 / 设备被撤销后恢复不可用，且**不静默覆盖用户自己配置的渠道选择**。
2. 任何会产生上游成本的调用，在派发前完成额度预留；拿到可信用量后结算，剩余自动释放。
3. 余额不足在派发前被拒绝；错误必须能区分“额度耗尽”和“未登录”。
4. 桌面端能读到剩余额度与最近消耗。

## Decisions（用户已拍板，实现已对齐）

| # | 决策 | 选择 | 落地位置 |
| - | ---- | ---- | -------- |
| D1 | 登录后启用策略 | **登录即自动启用**（登出回退；不覆盖用户显式关停） | `intelligence-config.ts` `applyNexusProviderAuthState` + `metadata.nexusRouteUserDisabled` |
| D2 | 计费模型 | **引入能力级定价表**，按能力单位定价而非上游 token | `apps/nexus/server/utils/creditPricingStore.ts` + D1 表 `credit_pricing` |
| D3 | 计费范围 | **一并补上** scenes 与 `vision.ocr`（含此前无价格行的 `image.translate`） | `sceneOrchestrator.ts`、`tuffIntelligenceLabService.ts` |
| D4 | 服务地址 | **开放自定义地址**给普通用户，换址即清登录态 | `SettingUser.vue` nexus 端点块 + `nexus/runtime-base.ts` |

定价与赠额的推导见 `design.md`（"定价表"/"免费额度与价格锚"）；对外公开价不变，仓库 pricing SoT 的对应记录在
`docs/plan-prd/04-implementation/Pricing-SoT-2026-06-18.md` §3.1。

## Out of scope

- 定价页面与支付流程改造。
- 团队池展示之外的团队/组织功能。
