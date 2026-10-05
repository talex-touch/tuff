# Design — models.dev 定价接入

以父任务 `design.md` §2 为准，本文件只补实现细节。

## 文件

| 文件 | 内容 |
|---|---|
| `apps/core-app/src/main/modules/ai/pricing/models-dev-catalog.ts` | `compactModelsDevCatalog(raw)`、`loadPricingCatalog()`、`refreshPricingCatalog({ force? })`、`getPricingCatalogStatus()`、`requestPricingRefresh()` |
| `apps/core-app/src/main/modules/ai/pricing/pricing-provider-map.ts` | 渠道类型 → 服务商、模型族 → 原厂服务商两张静态表，附来源注释 |
| `apps/core-app/src/main/modules/ai/pricing/model-pricing.ts` | `resolveModelPricing`、`estimateCostUsd`、记忆化 |
| `apps/core-app/src/main/modules/ai/pricing/__fixtures__/models-dev-subset.json` | 从真实 api.json 截取：openai、anthropic、google、deepseek、alibaba-cn、siliconflow-cn、zhipuai、moonshotai-cn、一个全 0 定价模型、一个缺 `cost` 的模型 |
| `apps/core-app/src/main/modules/ai/pricing/*.test.ts` | 见 implement |

## 关键点

- **渠道配置来源**：先 `ensureProviderManager().get(providerId)?.getConfig()`（`ai/runtime/provider-manager.ts:51`、`ai/runtime/base-provider.ts:184`）；查不到再读持久化配置的 `providers`（`ai/intelligence-config.ts`）。都查不到时：
  - 值是已知类型名（`openai / anthropic / deepseek / siliconflow / local / custom`）→ 按类型处理；
  - 其余视为未知渠道，只走模型族回退。
- **Nexus 判定**：`isNexusManagedProvider`（`packages/utils/intelligence/nexus-provider.ts:27-40`）或 `providerId === 'tuff-nexus-default'`。
- **本地判定**：`type === 'local'`、`providerId === 'local-system-ocr'`、本机 CLI id（`pi-cli-default / omp-cli / codex-cli / claude-cli`，`ai/intelligence-config.ts:1195-1210`）且无自报费用。
- **base URL 主机匹配**：比较 `new URL(baseUrl).host`（去掉 `www.`，**带端口**，避免 127.0.0.1 上的本地服务互相匹配）与目录内各服务商 `api` 的 host。
  - 同 host 有多个服务商时，先比 URL 路径前缀，仍分不出再取目录顺序第一个。
  - 实测 `open.bigmodel.cn` 下全 0 价的 `zhipuai-coding-plan` 排在按量付费的 `zhipuai` 前面，只取第一个会把按量用户算成免费。
  - 测试里固定这组样例。
- **规范化**只在已选服务商的模型表里依次尝试：原样 → 小写 → 去 `org/` → 去日期后缀 → 去 `:latest`，命中即停。
- **哈希**：对 `providers` 做键排序的稳定序列化后算 `sha256`（`node:crypto`）；加载时重算比对。
- **写库**：经 `scheduleDbWrite` 后台优先级，整行 upsert `system_config`。**不包 `withSqliteRetry`**：`.trellis/spec/main-process/database-write-contracts.md` 禁止在调度任务里再套一层重试（2026-10-03 实现时按 spec 修正）。
- **调度**：模块 `onInit` 末尾登记一次延迟检查（≥ 30 s），用仓库已有的轮询设施；`checkedAt` 未超过 24 h 不发请求。`onDestroy` 注销该任务（2026-10-03 追加）。
- **网络**：`getNetworkService().request({ url, method: 'GET', headers, timeoutMs: 20_000, validateStatus: [200, 304] })`（`packages/utils/network/types.ts:38-56`）；304 时 `data` 为空，按状态码分支。
- **费用计算位置**：`IntelligenceAuditLogger.flushToDB` 取出批次后、进入写事务之前，调用 `estimateCostUsd` 填充每条的 `estimatedCost`。目录未加载时先 `loadPricingCatalog()`（只读库），不发网络请求。
- **引入方式**：logger 用**动态 import** 引入定价模块。定价要从 SDK 读运行时渠道配置，而 SDK 静态引用了 logger，静态引入会成环（实测 logger 现有静态依赖 25 个文件，够不到 SDK 与 storage）。之后的子任务同样不得在 SDK 或 logger 里静态引入 `pricing/**`。
- **since 标记**：在**首次拿到可用目录**（首次成功加载或拉取）时写入 `{ sinceMs }`，已存在不改。拿到目录前落库的行都早于 `sinceMs`，读侧会重算，不会把 0 费用当成可信值（2026-10-03 修正：原定首次启动即写，会让拿到目录前约 2 分钟的调用按 0 费用被信任）。全局计数桶在这段时间的费用仍为 0，无法事后重算，属已知局限。
- **过渡期局限**：账本子任务修正渠道归属（R-A4）之前，Nexus 行的 `provider` 是服务端 id，无法识别为 `credits`，会走模型族回退按原厂价估算；R-A4 落地后的新行不受影响。

## 与既有代码的交界

- 删除 `MODEL_COSTS`、`ModelCostConfig`、`estimateCost`（`ai/intelligence-audit-logger.ts:129-146,300-305`），以及 `log()` 里的 `estimateCost(model)` 回退（`:310-313`）。全仓检查是否还有其他调用方，再删除。
- `intelligence-audit-logger-caller-period.test.ts:74-112` 的「gpt-4o 1000/1000 → 0.02」锚点按新口径更新：测试注入夹具目录，期望值由夹具单价推出。

## 实现后记录（2026-10-03）

- 精简目录实测 1.21 MB（不是预估的约 0.5 MB）：模型名与缓存单价约占 340 KB，去掉二者仍有 841 KiB。读回加校验 18 ms，按已定格式保留。
- 哈希对键排序后的序列化求值，不覆盖服务商顺序；只调换顺序能通过校验，可能影响同主机时的选择，影响很小。
- 新增的 `local-system-translation`（另一会话的系统翻译渠道）只能靠运行中的 provider manager 识别为本地；它若从 manager 消失，旧行会显示「未找到定价」，两种情况费用都是 0。
- 仍待真机：dev 实例内的真实网络拉取（离线冒烟已用真实全量目录做过：226 个服务商、8385 个模型，校验通过）。
