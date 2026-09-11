# Pricing SoT

> 更新时间：2026-06-18
> 2026-09-11 修订：§3.1 记录 Nexus 服务端内部 credit 记账口径（单价、月度赠额、预留/结算）。§1/§2 的公开口径不变。
> 定位：当前公开定价、套餐分层与待决策项的单一口径。本文是 pricing 决策入口。

## 1. 当前公开口径

- 当前公开站只承诺 Pioneer 阶段全量开放，价格为 `0 元 / $0`。
- Pioneer 阶段不等于永久免费；正式 GA 后可能推出付费层。
- Pioneer 团队权益保留到正式公开发布前；GA 后是否继续保价、保哪些能力，仍是待决策项。

## 2. 套餐分层状态

| 层级 | 当前状态 | 可表达内容 | 禁止表达 |
| --- | --- | --- | --- |
| `FREE` | 权限层级占位 | 免费基础能力、有限配额方向 | 具体额度、永久免费承诺 |
| `PRO` | 权限层级占位 | 个人高级能力方向 | 具体月费/年费、正式权益清单 |
| `PLUS` | 权限层级占位 | 更高配额或更完整能力方向 | 与 Pro 的正式价格差异 |
| `TEAM` | 权限层级占位 | 团队协作、共享配额方向 | seat 单价、团队池具体额度 |
| `ENTERPRISE` | 权限层级占位 | 定制、合规、专属支持方向 | 标准报价或默认 SLA |

## 3. Credits / quota 当前口径

- `credits`、AI requests、AI tokens 与 provider quota 当前可作为产品/治理模型存在。
- 对外**仍未公开** credits 单价、超额购买价格、月度赠送额度的承诺或团队池分摊规则；`0 元 / $0` 的 Pioneer 公开价不变。
- **服务端已有内部记账口径**（见 §3.1）：它决定一次调用实际扣多少 credits，不等于对外报价，也不在 pricing 页面展示单价。
- UI 可以展示当前账户可用额度与消耗状态，但不得把未定价格、未定超额费率或 mock checkout 写成可购买事实。

### 3.1 Nexus 内部 credit 记账口径（2026-09-11 起生效）

> 本节记录服务端**实际扣费**的口径。改这一节不需要动 §1/§2 的公开口径；反过来，改公开价必须先走 §4。
> 管理员可通过 `PATCH /api/admin/credits/pricing` 调价并留审计，因此这里是快照而不是契约。

- **锚点**：1 credit = 1 chat token。`text.chat` 等文本能力为 1,000 credits / 1K tokens，与上线以来逐 token 扣费完全相同。
- **计价单位**：按能力自身单位计费 —— `1k_tokens` / `audio_second` / `transcript_unit` / `image`；单价只存在于 D1 表 `credit_pricing`，代码内不得再出现价格常量。
- **已生效单价**：
  - 文本/代码类：1,000 credits / 1K tokens；
  - `vision.ocr` 2,000 credits/张、`image.translate` 3,000 credits/张、`image.translate.e2e` 4,000 credits/张；
  - `audio.transcribe` / `audio.stt`：4 credits/音频秒，次级基准 1 credit/转写单位，结算取较高者，预留 ×2.5（等价于既有的 10 credits/秒）。
  - 未登记的 capability 按 `1k_tokens` 兜底，不会因为漏登记而静默免费。
- **月度赠送额度**（UTC 自然月，与既有的 `credit_balances` 一致）：FREE 20,000、完成资料后 40,000、每日签到 500；PLUS 100,000 / PRO 240,000 / TEAM|ENTERPRISE 1,000,000 台阶不变。
  这些数字只影响赠额口径，不追溯历史账本。
- **提交前预留**：`/api/v1/intelligence/invoke|stream`、`/api/v1/scenes/[id]/run`、`/api/v1/ai/audio/transcribe` 在调用上游之前先扣一笔预留；
  余额不足时在**上游被调用之前**返回 402 `CREDITS_EXCEEDED`；结算后按 provider 真实用量补扣差额或释放多占部分。
- **上游成本**：Nexus 自身采购价不在本仓库记录，`upstreamCostUsdPerUnit` 保持 null。记账单价不等于对外报价，也不据此声称毛利。
- **仍未做**：对外价目表与购买页面、超额购买（top-up）、团队池分摊规则 —— 仍在 §4。

## 4. 待决策项

| 决策 | 当前建议 | 需要确认 |
| --- | --- | --- |
| Pioneer 免费期结束条件 | 到 GA / stable public launch 前保持免费 | GA 判定标准与日期窗口 |
| Pro 初始价 | 暂不公开 | 月付/年付价格、地区货币、税费口径 |
| Team seat | 暂不公开 | seat 单价、owner/member 差异、最低席位数 |
| AI credits 对外报价 | 暂不公开（内部记账口径见 §3.1，已定） | 免费额度是否随 GA 调整、超额购买、provider 成本换算 |
| Pioneer 保价 | 暂不公开 | 是否永久、是否限核心能力、是否限团队规模 |
| Checkout provider | 暂不承诺 | Clerk Pricing Table / Stripe / Paddle / 内部授权码的最终选择 |

## 5. UI / 文案规则

- Pricing 页面缺配置时，只能显示 Pioneer 免费阶段或 pricing table 未配置提示。
- 禁止返回 mock payment URL、伪成功购买结果或固定假价格。
- `FREE / PRO / PLUS / TEAM / ENTERPRISE` 只能作为权限层级、feature gate 或未来占位展示。
- 任何新增价格、credits 单价、团队席位价，必须同步 `README`、`TODO`、Roadmap、Quality Baseline、Nexus pricing UI 与 CHANGES。

## 6. 下一步

1. 确认 GA 前 Pioneer 权益边界。
2. 制定 Pro / Team 首版候选价格和 credits 配额。
3. 选择正式 checkout / billing provider。
4. 如需推进订阅/credits/团队计费，基于本文新建当前 PRD，不恢复旧订阅方案。
