# 整体代码优化梳理（2026-04-17）

## 目标

基于当前工作区、现有规划文档与近期未提交改动，梳理 Tuff monorepo 的真实优化重点，避免继续用“全仓大重构”这种高风险方式推进。

## 当前结论

- 这套代码当前不缺“再造一版架构”，缺的是把几个已经暴露出来的高耦合热点按职责拆开，并把质量门禁真正压到这些热点上。
- 近期改动方向整体正确：
  - `.github/workflows/build-and-release.yml` 已补齐 `beta/snapshot` 的 prerelease 语义判断。
  - `apps/core-app/src/main/modules/system/active-app.ts` 已对 macOS 自动化权限缺失做短暂退避，能减少错误日志风暴。
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts` 已把 `search-logger` 改成惰性获取，降低搜索链路耦合。
- 但当前仍有 3 类结构性问题没有收口：超长模块、构建配置多事实源、主进程日志与 legacy 兼容尾巴。

## 热点与证据

### 1. 超长核心模块仍是主要维护成本来源

当前几个热点文件已经明显超出“单一职责”范围：

| 文件 | 行数 | 主要耦合内容 |
| --- | ---: | --- |
| `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` | 4031 | 文件索引、监听、增量刷新、内容解析、图标/打开器处理、过滤与搜索 |
| `apps/core-app/src/main/modules/plugin/plugin-module.ts` | 3654 | widget 预编译、问题归一、dev watcher、插件生命周期、权限问题同步 |
| `apps/core-app/src/main/modules/clipboard.ts` | 3178 | 剪贴板采集、识别、分发、性能统计、状态广播 |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 2434 | provider 管理、缓存、健康度、trace、维护任务、搜索编排 |
| `apps/core-app/src/main/modules/update/UpdateService.ts` | 2436 | 更新源、任务调度、下载/安装、状态管理 |
| `apps/nexus/server/utils/tuffIntelligenceLabService.ts` | 3656 | Intelligence 管理端聚合读写与转换逻辑 |
| `apps/pilot/server/utils/pilot-tool-gateway.ts` | 2163 | websearch、媒体工具、审批、审计、fallback、格式适配 |
| `apps/pilot/app/composables/usePilotChatPage.ts` | 2121 | SSE 消费、seq/replay、状态机、卡片投影、legacy 忽略分支 |
| `packages/tuff-intelligence/src/adapters/deepagent-engine.ts` | 2137 | 消息构造、附件适配、SSE 解析、错误映射、transport fallback |

这类文件的共同问题不是“太长”本身，而是：

- 状态、IO、协议转换、监控埋点写在同一个文件里。
- 很难补最小回归测试，只能依赖集成验证。
- 每次改一个子能力，都会扩大 review 面和回归面。

### 2. 构建链路仍有多事实源

桌面构建相关配置目前至少分散在三处：

- `apps/core-app/scripts/build-target.js`
- `apps/core-app/scripts/ensure-platform-modules.js`
- `apps/core-app/electron-builder.yml`

当前 worktree 已新增一批运行时依赖闭包校验与资源同步逻辑，这是正确方向；但模块清单仍在多个文件重复维护。结果是：

- 新增/删除一个运行时依赖时，需要改多处，容易漂移。
- `build-target.js` 已经承担构建、校验、产物巡检、资源补齐多重职责，继续堆逻辑会失控。
- release 语义、extraResources、运行时依赖闭包之间还没有单一事实源。

### 3. 主进程日志治理还没有完成

主进程生产代码里仍有大量 `console.*`：

- `apps/core-app/src/main/modules/flow-bus/*`
- `apps/core-app/src/main/modules/division-box/*`
- `apps/core-app/src/main/modules/download/*`
- `apps/core-app/src/main/modules/update/*`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`

这会带来两个直接问题：

- 调试输出与正式日志体系混用，线上排障时噪声过大。
- 性能链路和错误链路缺少统一字段，后续做聚合或分级很难稳定。

### 4. legacy 收口已进入尾段，但尾段最容易反复

当前文档口径已经明确：主线目标不是继续扩展 legacy，而是完成 hard-cut。但 renderer / storage / 部分适配层仍保留兼容分支，例如：

- `packages/utils/renderer/storage/storage-subscription.ts`
- `packages/utils/renderer/storage/base-storage.ts`
- `apps/pilot/app/composables/usePilotChatPage.ts`

这些兼容层现在的问题不是“存在”，而是缺少统一退场顺序。没有退场顺序时，兼容代码会永久停留在热路径。

## 怎么优化

### P0. 先收敛“构建链路单一事实源”

这是当前最值得先做的工程优化，因为影响范围大、收益直接，而且不需要动业务语义。

建议顺序：

1. 抽一份 `runtime-module-manifest`，统一描述：
   - 打包前必须同步到 app `node_modules` 的根模块；
   - 必须作为 `resources/node_modules` 存在的模块；
   - 需要递归校验闭包的根模块。
2. `build-target.js` 与 `ensure-platform-modules.js` 只消费 manifest，不再各自维护名单。
3. 下一步再考虑把 `electron-builder.yml` 的 `extraResources` 切到生成式配置；不要在本轮把 YAML、build script、release workflow 一次性混改。

处理原则：

- 先消除重复来源，再谈更激进的构建链改造。
- 不要把 post-build repair 当长期方案，installer 打包链仍要以前置输入正确为准。

### P1. 按工作包拆分超长模块，不做全仓式重构

推荐拆分顺序：

1. `file-provider.ts`
   - 拆为 `watcher / incremental-index / content-extractor / query-service / opener-adapter`
   - 保留一个薄 orchestration 层
2. `search-core.ts`
   - 把 `provider health/refractory`、`cache/trace`、`maintenance` 拆出独立服务
   - 搜索编排层只保留 query parse + provider dispatch + result merge
3. `pilot-tool-gateway.ts`
   - 拆 `websearch`、`image/audio`、`approval/audit`
   - 当前文件已经像一个“工具平台内核”，继续堆功能会迅速失控
4. `usePilotChatPage.ts`
   - 拆 `stream parser`、`seq/replay projector`、`ui state actions`
   - 页面 composable 不应同时承担协议解释器和页面状态机

处理原则：

- 只做 SRP 拆分，不顺手改协议。
- 拆分后的每个子模块都要能有最小单测，而不是继续依赖页面级或集成级验证。

### P1. 把主进程日志统一收回 logger 体系

建议以模块组推进，不要一次性扫全仓：

1. `flow-bus`
2. `division-box`
3. `download`
4. `update`
5. `file-provider`

处理方式：

- 保留必要的 `warn/error`，把过程性 `console.log` 收敛到 `ModuleLogger` 或现有 logger 工具。
- 日志字段统一包含最小上下文：`module/action/sessionId|taskId|providerId`。
- dev-only 调试日志必须可开关，不要默认污染主进程输出。

### P2. 给 legacy 退场补“顺序”而不是只补“扫描”

当前 guard 已经有了，但“先退谁、后退谁”还不够明确。建议：

1. 先清 renderer storage 旧事件兼容层。
2. 再清 Pilot UI 中仅用于旧事件忽略/兼容的热路径逻辑。
3. 最后再回到 packages/utils 做对外入口收敛。

这样做的原因很简单：先清消费方，才能避免 SDK/transport 层永远背兼容包袱。

## 怎么处理

建议按 3 个工作包推进，而不是按目录推进：

### 工作包 A：Build / Release Tooling

- 目标：构建依赖清单单一事实源，release 语义与运行时闭包校验保持一致。
- 交付：
  - runtime manifest
  - `build-target.js` / `ensure-platform-modules.js` 收敛
  - 构建回归命令固定

### 工作包 B：Core Search / File / Plugin

- 目标：拆掉 `core-app` 中最重的运行时文件，降低搜索和插件链路回归面。
- 交付：
  - `file-provider` SRP 拆分
  - `search-core` provider health / maintenance 抽离
  - `plugin-module` 的 widget / issue / watcher 职责分段

### 工作包 C：Pilot Runtime / UI Projection

- 目标：把 Pilot 的协议解释、工具网关、页面状态分层。
- 交付：
  - `pilot-tool-gateway` 子模块化
  - `usePilotChatPage` 降为页面编排层
  - `deepagent-engine` 降为协议/适配核心，不再继续吸收 UI 与工具语义

## 最小验证建议

每个工作包都不要只跑全量门禁，优先固定最贴近改动的命令：

- 构建链：对应 target 的 `build-target` smoke + 运行时依赖校验
- Core 搜索链：定向 `vitest` + `typecheck:node`
- Pilot：定向 `vitest` + `typecheck`
- 文档/治理：`pnpm docs:guard`

## 不建议现在做的事

- 不建议以“统一重写”方式处理 `core-app`、`pilot`、`nexus`。
- 不建议把 legacy 清理、模块拆分、协议调整放在同一批改动里。
- 不建议继续在超长文件里叠更多 feature flag、fallback、compat patch。

## 一句话判断

当前最合理的处理方式不是“全面重构”，而是先用构建链单一事实源 + 超长模块 SRP 拆分 + logger/legacy 收口，持续把高耦合热点压回到可测试、可 review、可回滚的边界里。
