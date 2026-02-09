# 全仓质量扫描总览 (2026-02-04)

## 扫描范围
- 覆盖：`apps/`、`packages/`、`plugins/`、`docs/`、`scripts/`、`.github/`
- 排除：`node_modules/`、`dist/`、`build/`、`coverage/`、`.git/`、`.cache/`、`reports/`、`shots/`、`.venv/`

## 方法
- 全仓模式检索：`TODO/FIXME/XXX/HACK/WIP/TBD/NOT_IMPLEMENTED`、`@ts-ignore/@ts-expect-error`、`as any`、`console.log`
- 关键模块抽样阅读：`apps/core-app/src/main/core/module-manager.ts` 生命周期流程与回滚

## 关键指标（去重统计）
- 显式 TODO/XXX/TBD：**44 条**（含 code + docs + plan/process）
- “not implemented”/未实现路径：**≥18 处**（含 runtime throws + docs）
- `@ts-ignore/@ts-expect-error`：**32 处**
- `as any`：**高密度分布**（utils/transport、tuffex components、nexus server utils、plugins）
- `console.log`：**主进程模块大量存在**（FlowBus/DivisionBox/Download/Update 等）

## Top 10 风险清单（严格优先级）
1. **P1** - AI runtime capability 默认抛 `not implemented`，若 capability gating 不一致会触发运行时失败（`apps/core-app/src/main/modules/ai/runtime/base-provider.ts:418/425/432/439/446/457/464/471/482/489/496/507`；`apps/core-app/src/main/modules/ai/intelligence-sdk.ts:607`；`apps/core-app/src/main/modules/ai/providers/local-provider.ts:68`）
2. **P1** - Agent 市场 install/remove 未实现，功能可见但不可用（`apps/core-app/src/main/service/agent-market.service.ts:391/428`）
3. **P1** - Search engine provider refractory TODO + index refresh TODO，性能/一致性风险（`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:225/1360`）
4. **P1** - File provider Phase2/embeddings TODO，Windows Everything SDK 与向量检索路径未落地（`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:849/3283`）
5. **P1** - plugin-core API 未实现，影响插件 API 完整度（`apps/core-app/src/renderer/src/modules/channel/plugin-core/index.ts:2`）
6. **P2** - Extension unload 未实现，长期运行存在资源残留风险（`apps/core-app/src/main/modules/extension-loader.ts:34`）
7. **P2** - Intelligence 页面统计数据全是 TODO，UI 出现“假数据/占位逻辑”（`apps/core-app/src/renderer/src/components/intelligence/*.vue:16-21`）
8. **P2** - 生产模块大量 `console.log`，日志体系未统一分级/开关（`apps/core-app/src/main/modules/flow-bus/*`、`division-box/*`、`download/*`、`update/*`）
9. **P2** - `as any` 与 `@ts-ignore` 分布广，类型安全与维护成本持续上升（`packages/utils/*`、`packages/tuffex/*`、`apps/nexus/server/*`）
10. **P2** - CI 对部分包默认关闭 lint/test/typecheck（`package-tuffex-ci.yml:25-27`；`package-utils-ci.yml:23-25`），根脚本缺 test

## 高收益低成本清单
- 抽取 Intelligence 统计读取为 composable/service（见 `codereview/apps-core-app.md`）
- 主进程日志统一为 ModuleLogger + env gating（FlowBus/DivisionBox/Download/Update）
- 统一 `globalThis` 访问为 typed runtime accessor（`packages/utils/renderer/hooks/use-channel.ts` 等）
- 为 `apps/nexus` 补最小测试入口（API/utils 快速覆盖）

## 可抽离/可复用建议（满足 3+ 证据）
- Intelligence 统计读取：`IntelligenceChannels.vue`/`IntelligenceCapabilities.vue`/`IntelligencePrompts.vue` 三处重复 TODO → 抽 `useIntelligenceStats` 或统一 service
- Global channel 访问：`packages/utils/renderer/hooks/use-channel.ts`、`packages/utils/intelligence/client.ts`、`packages/utils/transport/sdk/plugin-transport.ts` 多处 `globalThis as any` → 抽 typed accessor
- 模块生命周期日志：`flow-bus/*`、`division-box/*`、`update/*` 多处 `console.log` → 统一 ModuleLogger + 级别开关

## 报告索引
- `codereview/todo-backlog.md`
- `codereview/tooling-and-config.md`
- `codereview/docs-and-process.md`
- `codereview/apps-core-app.md`
- `codereview/apps-nexus.md`
- `codereview/packages-*.md`
- `codereview/plugins-*.md`
