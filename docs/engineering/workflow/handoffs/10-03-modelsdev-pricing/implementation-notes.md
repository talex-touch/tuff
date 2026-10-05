# Implementation notes — models.dev 定价接入

实现代理的工作记录。2026-10-03 05:03 起曾被 Comet shape 守卫拦截，05:09 迁移进入 build 后按协调方指示恢复；
取舍已由协调方写回 `design.md` / `prd.md`。

## 已定的实现取舍（均已获批）

- **依赖方向**：`pricing/model-pricing.ts` 静态引用 `intelligence-sdk`（运行时渠道配置）与 `storage`（持久化
  渠道兜底）。审计 logger 只能**动态** `import()` 定价模块，否则形成 logger → pricing → sdk → logger 静态环；
  SDK 与 logger 之后也不得静态引入 `pricing/**`。实测 logger 静态闭包 25 个文件，够不到 SDK 与 storage。
- **费用计算位置**：`log()` 不再估价。净化后的条目只保留显式 `estimatedCost` 与 provider 自报 `usage.cost`；
  `flushToDB` 取出批次后、`flushBatch`（写事务）之前，对 `estimatedCost === undefined` 的条目调用
  `estimateCostUsd`；批次已全部有费用时不额外 await，既有 flush 时序不变。定价模块加载失败时保留自报费用，
  其余记 0，批次照常写入。
- **checkedAt**：304 只更新 `system_config.updated_at`，不改 value；加载时取 `max(value.checkedAt, updated_at)`。
- **写库**：一律 `scheduleDbWrite(..., { priority: 'background' })`，不包 `withSqliteRetry`。
- **调度**：首检 `max(30 s, 启动降级窗口剩余)`，之后每小时复查，过期 24 h 才发请求；失败后 1 h 内不重试；
  回调立即返回。`onInit` 末尾登记，`onDestroy` 开头注销。
- **base URL 匹配**：比较 host（含非默认端口、去 `www.`）；同 host 先按 URL 路径前缀（最长者胜），仍并列取目录顺序。
- **since 标记**：首次拿到可用目录（首次成功加载或拉取）时写入，已存在不改；在目录装入内存之后取时间。
  已知局限：计数桶在拿到目录前的费用为 0，无法事后重算（写在 `PRICING_SINCE_CONFIG_KEY` 注释里）。
- **系统 OCR id**：`model-pricing.ts` 用字面量 `local-system-ocr`，不引 `intelligence-config`（多个套件 mock 该模块且
  不带此常量）；`model-pricing.test.ts` 读源码钉住两处一致。

## 进度

- [x] 夹具 `pricing/__fixtures__/models-dev-subset.json`（11 个服务商 / 19 个模型，原始格式与原顺序）
- [x] `pricing-provider-map.ts`、`models-dev-catalog.ts`、`model-pricing.ts`
- [x] logger 接线 + 删除 `MODEL_COSTS` / `ModelCostConfig` / `estimateCost`
- [x] module `onInit` / `onDestroy` 接线
- [x] 测试与门禁

## 验收证据（2026-10-03 06:2x）

| AC | 证据 |
|---|---|
| AC-A1 | `pricing/model-pricing.test.ts` › 「resolveModelPricing — parent AC-9 samples」7 例；另有规范化、不跨转售商、同 host 路径（zhipuai vs coding plan）、端口、渠道查找顺序等 16 例 |
| AC-A2 | 同文件 › estimateCostUsd › gpt-4o 1000/1000 = 0.0125；Pi 自报费用优先 |
| AC-A3 | `pricing/models-dev-catalog.test.ts`（真实迁移库）：200 写库 / 304 只动 `updated_at` / 抛错保留旧目录并退避 / 并发共享一次请求；`pricing/pricing-audit.integration.test.ts`：目录请求挂起时 invoke 照常完成、落库费用 0、状态 `unpriced` |
| AC-A4 | `models-dev-catalog.test.ts` › stored catalog verification（篡改价格、截断 JSON）→ `available:false` |
| AC-A5 | `rg -n MODEL_COSTS apps packages` 0 条（阳性对照：HEAD 版文件 2 条、`estimateCostUsd` 19 条）；`intelligence-audit-logger-caller-period.test.ts` 锚点 0.02 → 0.0125，注释写明新口径 |
| AC-A6 | `tsc --noEmit -p tsconfig.node.json --composite false` exit 0、0 个 error TS（`--listFilesOnly` 确认本任务文件在程序内）；门禁 vitest 7 文件 49 例全绿；`modules/ai` + `modules/privacy` 108 文件 1199 例全绿（1 skipped 为既有）；eslint 本任务文件 0 问题；`git diff --check` 干净 |

反向对照（对自有新文件临时改坏后恢复，逐字节核对）：去掉路径比较 → zhipuai 用例失败；host 改 hostname → 端口用例失败；
跳过 sha256 校验 → 篡改用例失败；304 改整行重写 → 304 用例失败。

真实目录冒烟（`/tmp/modelsdev-api.json`，2026-10-03 下载，临时测试跑完即删）：226 个服务商、8385 个模型、7950 个有价；
精简后 **1.21 MB**（不是计划估的约 0.5 MB：design 规定的模型名与缓存单价约占 340 KB，两者都去掉也有 841 KiB）；
解析 20 ms、精简加哈希 34 ms、读回校验 18 ms；`deepseek-default` 渠道的 `deepseek-chat` 为 `unpriced`（与 PRD 预期一致）。

未做：dev 实例里的真实网络冒烟（共享工作区内另有会话在跑 dev 与迁移，未启动）。
