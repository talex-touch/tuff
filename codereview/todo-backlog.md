# TODO Backlog（显式标记 + 未实现路径）

> 说明：本清单来源于全仓关键字扫描与抽样阅读。显式 TODO/XXX/TBD 标记已去重；“not implemented” 作为隐性未完成路径单列。

## A. 核心代码 TODO（按优先级）

- **[P1|M]** `apps/core-app/src/main/service/agent-market.service.ts:391`  
  **标记**：`// TODO: Actually download and install the agent`  
  **影响**：Agent 安装流程对外可见但未落地，功能“假可用”。  
  **建议**：实现下载/校验/安装；至少添加错误提示与可用性 gating。

- **[P1|M]** `apps/core-app/src/main/service/agent-market.service.ts:428`  
  **标记**：`// TODO: Actually remove the agent`  
  **影响**：卸载路径缺失，导致残留数据或 UI 状态不一致。  
  **建议**：补齐卸载 + 清理 + 回滚策略。

- **[P1|M]** `apps/core-app/src/renderer/src/modules/channel/plugin-core/index.ts:2`  
  **标记**：`// TODO: Implement plugin-core API when needed`  
  **影响**：插件 API 不完整，第三方依赖时风险高。  
  **建议**：尽早定义最小 API 与 deprecate 策略。

- **[P1|M]** `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:225`  
  **标记**：`// TODO refractory - this provider costs a lot of time`  
  **影响**：性能退化热点已知但未治理。  
  **建议**：引入 provider 级别的限流/熔断/缓存策略。

- **[P1|M]** `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1360`  
  **标记**：`// TODO: The logic for refreshing indexes or caches should be handled`  
  **影响**：索引/缓存刷新逻辑缺失，数据可能长期过期。  
  **建议**：明确刷新触发点（手动/定时/事件）并补测试。

- **[P1|L]** `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:849`  
  **标记**：`// TODO: Phase 2 将使用 Everything SDK 替代`  
  **影响**：Windows 文件搜索路径仍依赖当前实现，性能与一致性不稳定。  
  **建议**：明确 Phase 2 时间线与 SDK 接入策略。

- **[P2|M]** `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:3283`  
  **标记**：`// TODO: hook into embeddings table when vector storage is ready`  
  **影响**：向量检索未接入，语义搜索能力受限。  
  **建议**：与向量存储表结构同步，设计增量同步策略。

- **[P2|M]** `apps/core-app/src/main/modules/extension-loader.ts:34`  
  **标记**：`// TODO: Implement extension unloading if necessary`  
  **影响**：扩展卸载路径缺失，可能导致资源残留/内存泄漏。  
  **建议**：至少提供 dev 模式卸载与清理钩子。

- **[P2|S]** `apps/core-app/src/renderer/src/components/intelligence/IntelligenceChannels.vue:16`  
  **标记**：`// TODO: 实际从数据存储获取`  
  **影响**：统计 UI 可能展示假数据。  
  **建议**：抽 composable，统一读取/缓存/空态策略。

- **[P2|S]** `apps/core-app/src/renderer/src/components/intelligence/IntelligenceCapabilities.vue:20`  
  **标记**：`// TODO: 实际从数据存储获取`  
  **影响**：统计 UI 可能展示假数据。  
  **建议**：同上（与 Channels/Prompts 合并处理）。

- **[P2|S]** `apps/core-app/src/renderer/src/components/intelligence/IntelligenceCapabilities.vue:21`  
  **标记**：`// TODO: 每小时平均调用次数`  
  **影响**：指标缺失，分析面板价值不足。  
  **建议**：引入聚合统计或时序数据源。

- **[P2|S]** `apps/core-app/src/renderer/src/components/intelligence/IntelligencePrompts.vue:17`  
  **标记**：`// TODO: 从存储中获取实际数据`  
  **影响**：统计 UI 可能展示假数据。  
  **建议**：同上（统一抽象）。

- **[P1|M]** `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:203`  
  **标记**：`// TODO: Integrate with actual search engine (TuffSearchEngine)`  
  **影响**：Agent 结果可能失真或不可用。  
  **建议**：补接真实引擎或显式禁用该能力。

- **[P2|M]** `apps/core-app/src/main/modules/ai/agents/builtin/search-agent.ts:232`  
  **标记**：`// TODO: Integrate with IntelligenceSDK for semantic search`  
  **影响**：语义搜索能力缺失。  
  **建议**：与 IntelligenceSDK 能力门控同步。

- **[P3|L]** `apps/core-app/src/main/modules/plugin/plugin-installer.ts:19`  
  **标记**：`// TODO(@talex-touch): Integrate more advanced verification methods like TouchID here later`  
  **影响**：安全增强未落地。  
  **建议**：先补签名校验与 UI 提示，TouchID 可排后。

## B. “Not Implemented” 运行时未实现路径

- **[P1|M]** `apps/core-app/src/main/modules/ai/providers/local-provider.ts:68`  
  `throw new Error('[LocalProvider] Streaming not implemented')`  
  **建议**：capability gating 或实现最小 streaming shim。

- **[P1|M]** `apps/core-app/src/main/modules/ai/runtime/base-provider.ts:418/425/432/439/446/457/464/471/482/489/496/507`  
  `Vision/Audio/RAG/Agent` 多个能力默认 `not implemented`  
  **建议**：在 UI/调用链中强制 capability check；为常见 provider 提供替代路径。

- **[P2|S]** `apps/core-app/src/main/modules/ai/intelligence-sdk.ts:607`  
  `Capability type ... not implemented`  
  **建议**：补充 capability 列表校验与错误兜底。

- **[P2|S]** `apps/core-app/src/main/modules/download/migrations.ts:432`  
  `Checksum field removal not implemented (SQLite limitation)`  
  **建议**：说明迁移策略与替代方案（保留字段或 soft-delete）。

- **[P3|S]** `apps/core-app/src/main/modules/download/MIGRATION_GUIDE.md:193`  
  `Rollback not implemented`  
  **建议**：至少提供“不支持回滚”警示与风险提示。

## C. Docs/Plan/Process TODO / TBD

- `docs/plan-prd/04-implementation/config-storage-unification.md:66/67/73/83/97`  
  多处 `TBD`/`pending`（APP_SETTING、SHORTCUT_SETTING、MARKET_SOURCES、Plugin 配置等）  
  **建议**：收敛 Owner/截止时间并同步到代码实现优先级。

- `docs/plan-prd/03-features/plugin/plugin-market-provider-frontend-plan.md:141`  
  `git/zip 先落地 TODO（后续扩展 hook）`  
  **建议**：补最小可用的 git/zip 下载流程或标记为明确不支持。

- `docs/plan-prd/next-edit/需求汇总-PRD状态梳理-下载链路统一-SDK优先-文档落地.md:6/12`  
  文档状态与 TODO 需持续对齐  
  **建议**：建立 PRD 与代码变更的同步门禁。

- `docs/engineering/todo.md:1`  
  “工作 TODO 清单”  
  **建议**：建立分级与 owner 标记，定期归档。

- `docs/INDEX.md:15/39`  
  记录“待完成/未发现”的文档列表  
  **建议**：与 doc 负责人确认哪些为弃用/延期/必须补齐。

## D. 说明性/引用型 TODO（非直接任务）

- `docs/code-audit-2026-01-31.md:4`  
  作为检索说明引用 `TODO/FIXME`（非任务）

- `.github/docs/contribution/CONTRIBUTING_zh.md:60`  
  使用 `XXX` 作为示例（非任务）

- `issues/2026-01-20_18-52-09-config-storage-sqlite-json-sync.csv:7`  
  文档同步记录中包含 TODO 字样（非任务）
