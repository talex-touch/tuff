# Nexus 登录即用与 credits 计费 — 设计

## 决策（用户已拍板）

| # | 决策 | 选择 |
| - | ---- | ---- |
| D1 | 登录后启用策略 | **登录即自动启用**（登出回退，不抢占用户既有渠道） |
| D2 | 计费模型 | **引入能力级定价表**，按产品能力定价而非上游 token |
| D3 | 计费范围 | **一并补上** scenes 与 `vision.ocr` |
| D4 | 服务地址 | **开放自定义地址**给普通用户（含登录态隔离） |

## 不变量

1. **预留先于派发**：任何会产生上游成本的调用，必须先扣一笔预留；余额不足时上游一次都不能被调用。
2. **结算只信 provider 用量**：客户端传入的任何数量都不参与计价。
3. **价格只有一处**：能力的计价单位与单价只存在于 `credit_pricing` 表；模块内不得再出现价格常量。
4. **结算超额不砸用户结果**：上游跑出的量超过预留时补扣，补扣失败只记 metering-integrity 告警，绝不把用户已拿到的结果改判失败。
5. **幂等**：同一业务请求的预留/结算/释放各自使用稳定幂等键，重试不重复扣费。
6. **不出现内容**：账本与审计（`credit_ledger.metadata`）只存数量、单位、能力、trace，不存 prompt/文本。
7. **登出不破坏用户选择**：登录态跃迁才动 Nexus 的 enabled；会话中途用户手动关闭不会被 token 刷新重新打开。

## 定价表

`apps/nexus/server/utils/creditPricingStore.ts`（纯函数 + D1 表 `credit_pricing`）

计价单位（面向用户的报价单位，非上游单位）：

| unit | 含义 |
| ---- | ---- |
| `1k_tokens` | 每 1,000 tokens |
| `audio_second` | 每音频秒 |
| `transcript_unit` | 每转写单位（CJK 逐字、拉丁词按 2 计，沿用 ASR 既有定义） |
| `image` | 每张图 |

种子（**精确复刻上线价格，引入定价表本身不是价格变更**）：

| capability | unit | credits/unit | 次级基准 | reserve× |
| ---------- | ---- | ------------ | -------- | -------- |
| `text.chat` 等 11 个文本/代码能力 | `1k_tokens` | 1000 | – | 1 |
| `vision.ocr` | `image` | 10 | – | 1 |
| `image.translate.e2e` | `image` | 10 | – | 1 |
| `audio.transcribe` / `audio.stt` | `audio_second` | 4 | `transcript_unit` 1 | 2.5 |

对照既有实现：
- chat：`tokens / 1000 × 1000 = tokens`，与“1 credit = 1 token”逐 token 相同。
- ASR：`max(transcriptUnits × 1, seconds × 4)`，与线上 `calculateFiletransCredits` 相同；
  预留 `seconds × 4 × 2.5 = seconds × 10`，与线上 10 credits/秒相同。
- 未登记的 capability 走 fallback（`1k_tokens` / 1000），**不会**因为漏登记而变成免费。

`credits_per_unit` / `min_credits` / `reserve_multiplier` 可由管理员通过
`PATCH /api/admin/credits/pricing` 调整并留审计；**单位基准不可在线改**，因为它属于能力契约。

面向用户的价目表：`GET /api/credits/pricing`（不含上游成本与预留系数）。

## 结算流程

```text
resolveCreditPricingRule(capability)
   ↓
computeCreditReservation(rule, estimate)         ← 派发前
   ↓ consumeCredits('*-reserve', idempotencyKey=…-reserve:<id>)
   │   余额不足 → 402 CREDITS_EXCEEDED，不派发
   ↓ 调用上游
   ├─ 失败 → releaseConsumedCredits(全额) → 抛原错误
   └─ 成功 → computeCreditCharge(rule, providerUsage)
              charge > reserve → 补扣差额（失败只告警）
              reserve > charge → releaseConsumedCredits(差额)
```

预留倍率对**未取整的基准**相乘后只取整一次：否则 0.1 秒的 ASR 片段会预留 3 credits 而不是线上的 1。

## 各路径现状与改动

| 路径 | 改前 | 改后 |
| ---- | ---- | ---- |
| `/api/v1/intelligence/invoke` | 上游跑完按 token 事后扣 | 派发前预留 → 按 provider 用量结算 → 释放差额 |
| `/api/v1/intelligence/stream` | 同上 | 同上（流式同样在派发前预留） |
| `vision.ocr` | provider 已返回 `{unit:'image',quantity:1,billable:true}`，被硬编码成 0 token 丢掉 → 免费 | 真实计量单位进入定价表，按张计价 |
| `/api/v1/scenes/[id]/run` | 只写 usage/governance 账本，完全不扣费 | 同形预留/结算/释放；`dryRun` 不扣费 |
| `/api/v1/ai/audio/transcribe` | 已正确（自带 10/秒、4/秒常量） | 常量收敛进定价表，行为不变 |
| 桌面端登录 | AK 注入 provider，但 binding 恒 disabled → 必须手动开渠道 | 登录态跃迁自动启用，登出自动关闭 |

## 风险

- **预留额度**：chat 的预留上限依赖输出上限估算，估得过高会误伤余额紧张的用户（表现为提前被拒而不是事后 402）。估算常量与依据必须写在代码注释里。
- **价格变更**：`vision.ocr` 与 `image.translate.e2e` 从 0 变成 10 credits/张，是**真实的价格变更**（此前是漏洞）。历史账本不追溯。
- **ASR 结算恒等式**：`credits_per_unit`/`secondary`/`reserve_multiplier` 三个数只要改动就会改变 ASR 收费，改动必须同时核对 `ASR_RESERVATION_EXCEEDED` 分支。
- **自定义地址**：换地址必须清登录态，否则旧 AK 会被带到新端点。
