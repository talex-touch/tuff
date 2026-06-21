# Pricing SoT

> 更新时间：2026-06-18
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
- 当前没有正式 credits 单价、超额计费策略、月度赠送额度或团队池分摊规则。
- UI 可以展示当前账户可用额度与消耗状态，但不得把未定价格、未定超额费率或 mock checkout 写成可购买事实。

## 4. 待决策项

| 决策 | 当前建议 | 需要确认 |
| --- | --- | --- |
| Pioneer 免费期结束条件 | 到 GA / stable public launch 前保持免费 | GA 判定标准与日期窗口 |
| Pro 初始价 | 暂不公开 | 月付/年付价格、地区货币、税费口径 |
| Team seat | 暂不公开 | seat 单价、owner/member 差异、最低席位数 |
| AI credits | 暂不公开 | 免费额度、月度重置、超额购买、provider 成本换算 |
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
