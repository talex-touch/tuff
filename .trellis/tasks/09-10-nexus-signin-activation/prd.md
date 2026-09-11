# Nexus 登录即用与 credits 计费

## Goal

让用户在 CoreApp 里配置并登录 Nexus 之后，**不需要再手工开启渠道**就能直接使用 Nexus 提供的 AI 能力；
所有会花钱的调用按 Nexus credits 计费，并且**在产生上游成本之前**就能因余额不足而拒绝。

## Confirmed facts

### 接入面（CoreApp）

- 服务地址来自 `appSetting.dev.runtimeServer`（`production` | `local`），不是任意 URL：
  `packages/utils/env/index.ts:167-175`（env `TUFF_NEXUS_BASE_URL` 覆盖优先，`runtimeServer==='local'`
  时用 `NEXUS_LOCAL_BASE_URL=http://localhost:3200`，否则官方 `NEXUS_BASE_URL=https://tuff.tagzxia.com`）、
  `packages/utils/env/index.ts:216-222`（legacy `authServer`/`runtimeServer` 迁移）、
  `apps/core-app/src/main/modules/nexus/runtime-base.ts:16-37`。
  渲染层只有 dev-only 的 local/production 切换：`SettingUser.vue:81-90`；没有面向普通用户的服务地址输入框。
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
  FREE 1,000 / PLUS 100,000 / PRO 240,000 / TEAM|ENTERPRISE 1,000,000，FREE 验证邮箱 + OAuth/passkey 后次月起 5,000
  （`server/utils/creditsStore.ts:159-264`、`:269-273`、`:299-310`、`:422-471`）。
- **聊天/文本**：`POST /api/v1/intelligence/invoke|stream` → `tuffIntelligenceLabService.ts:1572-1617`
  **事后**按 `totalTokens` 扣费（1 credit = 1 token），幂等键 `intelligence-invoke:${traceId}`，
  **没有预留**；余额不足要等上游跑完才 402 `CREDITS_EXCEEDED`；`vision.ocr` 无 token → `billable:false`（等于免费）。
- **ASR**（正确范式）：`POST /api/v1/ai/audio/transcribe` 提交前 `reserve`（10 credits/秒），
  轮询拿到可信用量后按 `max(transcript units, billedSeconds × 4)` 结算并**释放差额**
  （`asrTranscriptionService.ts:145-180,224-251`、`asrTranscriptionStore.ts:13-15,192-235`）。
- **场景**：`POST /api/v1/scenes/[id]/run` **完全不扣费**（`sceneOrchestrator.ts:1700-1743,1925-1953`）。
- 鉴权：`requireAuth` = session 优先、Bearer app token 兜底（`server/utils/auth.ts:546-557`）；
  `requireVerifiedEmail` 额外要求邮箱已验证（`:559-569`）；`kind:refresh` 的 RK 被拒，legacy kind-less 视为 access。
- 余额读取：`GET /api/credits/summary|ledger|trend`（verified email），团队/Admin 另有接口；
  **app-auth 命名空间下没有 credits 端点**（`/api/v1/quotas` 是同步存储配额，不是 credits）。
- 错误字面量：`Team credits exceeded.` / `User credits exceeded.` / `Credits exceeded.`
  （`creditsStore.ts:1047-1070`）→ HTTP 402 `CREDITS_EXCEEDED`
  → 客户端归一为 `QUOTA_EXHAUSTED`（`server/utils/intelligenceErrorContract.ts:26-33,112-158`）。

## Gaps

| # | 缺口 | 影响 | 位置 |
| - | ---- | ---- | ---- |
| G1 | 登录不会启用 Nexus 渠道 | “登录即可用”不成立，用户必须手动开启 | `intelligence-config.ts:423-447,739-747` |
| G2 | 没有面向普通用户的 Nexus 服务地址配置（只有 dev 开关 + 构建期 env） | 自建/私有化 Nexus 无法接入 | `SettingUser.vue:81-90`、`env/index.ts:167-175` |
| G3 | chat 计费事后扣、无预留 | 0 余额仍消耗上游成本；并发可超支 | `tuffIntelligenceLabService.ts:1572-1617` |
| G4 | scenes 路由不计费 | 上游成本白吃 | `sceneOrchestrator.ts` |
| G5 | `vision.ocr` 无 token → 免费 | 同上 | `tuffIntelligenceLabService.ts:1578-1587` |
| G6 | 客户端只显示余额，不显示单次消耗，也没有提交前预检 | 用户不知道钱花在哪 | `credits-summary.ts` |
| G7 | 计费单位是 token，不是用户可理解的能力单位 | 无法对外解释定价 | `intelligenceProviderRegistryBridge.ts:75-86` |

## Requirements（待决策后细化）

1. 登录成功后 Nexus 能力可用；退出登录 / 设备被撤销后恢复不可用，且**不静默覆盖用户自己配置的渠道选择**。
2. 任何会产生上游成本的调用，在派发前完成额度预留；拿到可信用量后结算，剩余自动释放。
3. 余额不足在派发前被拒绝；错误必须能区分“额度耗尽”和“未登录”。
4. 桌面端能读到剩余额度与最近消耗。

## Open decisions

- **D1 启用策略**：登录即自动启用，还是登录后一次性引导手动启用，还是维持现状。
- **D2 计费模型**：维持 1 credit = 1 token 只补预留，还是引入能力级定价表。
- **D3 计费范围**：是否本轮一并把 scenes / `vision.ocr` 的免费漏洞补上。
- **D4 服务地址**：是否把自定义 Nexus 地址开放给普通用户。

## Out of scope

- 定价页面与支付流程改造。
- 团队池展示之外的团队/组织功能。
