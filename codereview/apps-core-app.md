# apps/core-app 质量分析

## 概览与正向发现
- **生命周期管理较完整**：`ModuleManager` 在 `loadModule` 中提供构造失败处理 + 生命周期回滚（`module-manager.ts:313-444`），并在 `runLifecyclePhase` 中统一上报 telemetry（`module-manager.ts:572-624`）。  
  **结论**：核心模块生命周期治理属于正向实践，可作为其他模块统一模板。

## 关键问题与风险

### 1) 未完成与 TODO（功能性）
- Agent 市场安装/卸载未实现（`agent-market.service.ts:391/428`）
- plugin-core API 未实现（`renderer/modules/channel/plugin-core/index.ts:2`）
- Search engine 性能与索引刷新 TODO（`search-core.ts:225/1360`）
- 文件搜索 Phase2/向量检索 TODO（`file-provider.ts:849/3283`）
- Extension unload TODO（`extension-loader.ts:34`）
- Intelligence 统计数据 TODO（`IntelligenceChannels.vue:16`，`IntelligenceCapabilities.vue:20-21`，`IntelligencePrompts.vue:17`）

### 2) “Not implemented” 路径（运行时失败风险）
- `base-provider.ts` 多个能力默认 `not implemented`（`418/425/432/439/446/457/464/471/482/489/496/507`）  
  **风险**：UI/调用链若未做 capability gating，会产生运行时异常。
- `local-provider.ts:68` streaming 未实现  
- `intelligence-sdk.ts:607` capability type 未实现  
- `download/migrations.ts:432` checksum removal 未实现（SQLite 限制）

### 3) 生产日志噪声
主进程多个模块使用 `console.log`（非统一日志系统）：  
`flow-bus/*`、`division-box/*`、`download/*`、`update/*`、`search-logger.ts`、`plugin-resolver.ts` 等（示例：`flow-bus/module.ts:72`、`division-box/window-pool.ts:77`、`update-system.ts:256`）。

### 4) 类型安全缺口
- `@ts-ignore`/`@ts-expect-error` 分布在 renderer 与 preload（如 `FlatMarkdown.vue:39/41/55/58`、`mousetrap-record.ts:55/192/194/200`、`preload/index.ts:120/122`）  
  **风险**：长期累积会压缩类型可靠性边界。
- `as any` 仍在 renderer 端存在（`WidgetFrame.vue:240`、`widget-registry.ts:160`、`useAuth.ts:188` 等）

## 可抽离/可优化建议（满足 3+ 证据）
1. **Intelligence 统计读取抽象**  
   证据：`IntelligenceChannels.vue:16`、`IntelligenceCapabilities.vue:20-21`、`IntelligencePrompts.vue:17`  
   **建议**：抽 `useIntelligenceStats`，统一数据来源/空态/缓存。

2. **主进程日志统一治理**  
   证据：`flow-bus/*`、`division-box/*`、`download/*` 多处 `console.log`  
   **建议**：统一为 ModuleLogger + env gating，集中控制输出级别。

3. **Search engine 性能治理路径**  
   证据：`search-core.ts:225/1360` + `file-provider.ts:849/3283`  
   **建议**：建立 provider 熔断/缓存刷新机制，形成可配置策略。

## 测试与覆盖
已存在测试：  
`module-manager.test.ts`、`plugin.test.ts`、`migration-manager.test.ts`、`permission-guard.test.ts`、`clipboard-tagging.test.ts`、`startup-analytics.test.ts` 等。  
**缺口**：Search engine / File provider / Extension loader / Agent market 相关模块缺少针对性测试。

## 建议优先级
- **P1**：补齐 Agent install/remove、plugin-core API、search index 刷新
- **P2**：统一日志与类型约束；补关键模块测试
