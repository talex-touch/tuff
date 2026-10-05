# models.dev 定价接入

父任务：`../10-03-intelligence-audit-rebuild/`（需求 R-B1–R-B4，以及 R-B5 的数据侧；决定 D11 / D12 / D13）。设计以父任务 `design.md` §2 为准。

## Goal

用 models.dev 替换主进程里只有 11 个旧型号的 `MODEL_COSTS`，让每条调用的估算费用都有可追溯的来源；查不到定价时明确标成「未找到定价」并按 0 计，不再用默认价编数字。同时把模型单价、上下文长度、输出上限提供给后续的账本与审计页。

## Requirements

- **A1 目录**：主进程经统一网络层拉取 `https://models.dev/api.json`。
  - 使用 ETag 条件请求，精简后存 `system_config['intelligence.pricing.models-dev.catalog']`。
  - 24 小时内最多刷新一次；模块启动后至少延迟 30 秒才检查。
  - 拉取不阻塞启动与任何调用；失败保留旧目录；加载时 `sha256` 校验不过视为无目录。
- **A2 解析**：`resolveModelPricing({ providerId, model })` 按父 `design.md` §2.3 输出 `ModelPricing`。
  - 先判类别：Nexus → `credits`，本地 → `local`。
  - 再选服务商：渠道类型 → 服务商；自定义渠道按 base URL 主机匹配。
  - 再查模型，失败则按模型族回退到原厂服务商；仍未命中为 `unpriced`。
  - 不跨转售商取价，不模糊匹配。
- **A3 费用**：`estimateCostUsd` 的取值顺序：
  1. 显式 `estimatedCost`；
  2. provider 自报 `usage.cost`；
  3. `priced` 时 `(prompt × input + completion × output) / 1e6`；
  4. 其余为 0。

  结果保留 6 位小数。`MODEL_COSTS` 与默认价删除；费用在 flush 准备阶段计算，不在 `log()` 同步路径、也不在写事务里等网络。
- **A4 起始标记**：首次拿到可用目录时写 `system_config['intelligence.pricing.models-dev.since'] = { sinceMs }`，供账本区分「可信的写入时费用」与「需重算的旧行」。拿到目录前落库的行都早于 `sinceMs`，读侧重算。
- **A5 对外函数**（主进程内部，供账本子任务使用）：
  - `resolveModelPricing`
  - `estimateCostUsd`
  - `getPricingCatalogStatus(): { available, fetchedAt, checkedAt }`
  - `requestPricingRefresh()`（过期才拉，不等待）

## Acceptance Criteria

- [ ] AC-A1：夹具测试覆盖父 AC-9 全部样例：
  - 官方 OpenAI 渠道 `gpt-4o`；
  - `dashscope.aliyuncs.com` 自定义渠道 → `alibaba-cn`；
  - 未知网关 `claude-sonnet-4-5` → `anthropic`；
  - Ollama → `local`；
  - Nexus → `credits`；
  - 未收录 → `unpriced`。
- [ ] AC-A2：`gpt-4o` 1000 输入 + 1000 输出 token 的费用等于按夹具单价算出的值（夹具里 openai `gpt-4o` 为 $2.5 / $10，即 0.0125）；Pi 自报费用优先于目录价。
- [ ] AC-A3：网络层模拟：
  - 200 → 写库；
  - 304 → 只更新 `checkedAt`、不重写目录；
  - 抛错 → 保留旧目录；
  - 从无目录且离线时，`invoke` 照常完成，费用为 0、状态 `unpriced`。
- [ ] AC-A4：篡改库里目录内容后加载 → `available:false`。
- [ ] AC-A5：全仓 `rg MODEL_COSTS` 为 0；`intelligence-audit-logger-caller-period.test.ts:74-112` 的费用锚点按新口径更新，并说明原因。
- [ ] AC-A6：`pnpm -C apps/core-app run typecheck:node` 本子任务范围 0 新错误；相关 vitest 全绿；`git diff --check` 干净。

## Out of Scope

- 模型渠道页展示价格（D12，留作后续）。
- 缓存读写、推理、音频单价与分档价：usage 只有输入 / 输出 token，页面在方法说明里写明。
- 任何 renderer 界面（由审计页子任务实现）。

## Dependencies

无前置。下游：账本子任务用 A2 / A3 / A4 做写入费用与历史回填；审计页子任务通过账本的读接口拿到 `ModelPricing`。
