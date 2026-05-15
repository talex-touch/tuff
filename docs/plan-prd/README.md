# Talex Touch - 项目文档中心

> 更新时间：2026-05-14
> 定位：PRD / 规划主入口。历史长文已下沉到 `CHANGES` 与专题文档；当前执行项以 `TODO.md` 为准。

## 快速入口

- [项目待办（2 周主清单）](./TODO.md)
- [产品总览与路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)
- [变更日志（近 30 天 + 历史归档）](./01-project/CHANGES.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [长期债务池](./docs/TODO-BACKLOG-LONG-TERM.md)
- [文档盘点历史快照（2026-03-17）](./docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md)

## 当前单一口径

- 当前基线：`2.4.10-beta.22`。
- 当前主线：`2.4.10` 优先解决 Windows App 索引、Windows 应用启动体验、基础 legacy/compat 收口与 release evidence。
- 当前 release blocker：Windows 真机 acceptance evidence、search trace `200` 样本、clipboard stress `120000ms`、`windows:acceptance:verify` final gate、Nexus Release Evidence 写入。
- 下一版本门槛：`2.4.11` 前关闭或显式降权剩余 legacy/compat/size 债务；Windows/macOS 为 release-blocking，Linux 保持 documented best-effort。
- 质量现状：PR lint 已收敛为 changed-file lint；`file-provider.ts` 编译边界已恢复，CoreApp `typecheck:node` 已通过；`quality:release` 仍受 CoreApp 既有 lint debt 阻断；不得宣称全仓 release gate 已绿。
- 范围约束：`2.5.0` AI、Provider Registry 高级策略、SRP 大拆分可继续规划/小切片，但不得抢占正式 `2.4.10` Windows evidence gate。

## 当前主线（2 周）

1. 生成 Windows acceptance collection plan。
2. 采集 Windows case/manual/performance evidence。
3. 运行 `windows:acceptance:verify` final gate。
4. 写入 Nexus Release Evidence。
5. 继续收敛 `2.4.11` legacy/compat/size 清册，不新增 legacy/raw channel/旧 storage/旧 SDK bypass。

详见：[TODO](./TODO.md)。

## 未闭环能力

### P0 - 2.4.10

- Windows 真机 evidence 闭环：acceptance manifest、common app launch、copied app path、Everything target probe、update install、DivisionBox detached widget、time-aware recommendation、search trace 与 clipboard stress。
- Windows App 索引与启动体验：应用索引管理页、UWP/Store 诊断字段、Steam 最小 provider、`protocol` 启动白名单已进入实现态，仍需真机验收。
- FileProvider 编译边界：`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 已恢复 `fileProvider` 等价导出，仍需按发版节奏补文件搜索最近路径验证。
- Release Evidence：需要凭证/API key 写入 documentation review、platform matrix、CoreApp targeted tests 与 Windows 真机 evidence。

### P1 - 2.4.11

- Windows/macOS 阻塞级人工回归证据闭环。
- Linux best-effort smoke 与限制说明。
- AI 兼容占位成功响应退场。
- CLI token 与插件 provider secret storage 收口：文件权限缓解与 `usePluginSecret()` 迁移已推进，OS 级 credential backend 与 degraded health 仍待闭环。
- 插件 shell capability 诊断统一。
- Transport Wave A retained alias/hard-cut 继续推进。
- CoreApp 启动异步化真机 benchmark 与长尾补证。

### P2+

- Tuff 2.5.0 AI 桌面入口：CoreBox AI Ask、handoff session、Nexus invoke credits 扣减、CoreApp credits summary、Tuff-native Tool Kit foundation、Nexus docs prerender routes 与 OmniPanel Writing Tools MVP 已进入 dev 切片，后续 Workflow `Use Model`、完整 Review Queue 与 P0 模板。
- Nexus Provider Registry / Scene 编排：已具备 secure store、Scene run、Dashboard run、AI mirror、health/usage ledger 与最小策略路由，后续补旧 AI provider 表退场与高级策略。
- Native transport V1：补 macOS/Windows/Linux 真机 smoke 与打包依赖验证。
- AttachUIView、Multi Attach View、Widget Sandbox、Flow Transfer、DivisionBox 等进入长期债务池。

## 高价值专题入口

- [Legacy/兼容/结构治理统一实施 PRD](./02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md)
- [Tuff 2.5.0 AI 桌面入口收口 Plan PRD](./03-features/ai-2.5.0-plan-prd.md)
- [Nexus Provider 聚合与 Scene 编排 PRD](./02-architecture/nexus-provider-scene-aggregation-prd.md)
- [Intelligence 能力路由与 Provider 抽象](./02-architecture/intelligence-power-generic-api-prd.md)
- [跨平台兼容与占位实现深度复核报告](./report/cross-platform-compat-placeholder-deep-review-2026-05-13.md)
- [跨平台兼容与占位实现跟进报告](./report/cross-platform-compat-placeholder-followup-2026-05-14.md)
- [CoreApp 启动异步化与首屏卡顿分析](./report/coreapp-startup-async-blocking-analysis-2026-05-13.md)
- [Nexus 设备授权风控实施方案](./04-implementation/NexusDeviceAuthRiskControl-260316.md)
- [v2.4.7 发版收口清单（historical）](./01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md)

## 文档治理规则

- 入口文档只保留当前事实、下一动作与高价值导航；历史细节进入 `CHANGES` 或 archive。
- 行为/接口/架构改动至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同时同步 Roadmap 与 Quality Baseline。
- `TODO.md` 只承载 2 周主清单；长期事项进入 `TODO-BACKLOG-LONG-TERM.md`。
- `CHANGES.md` 只保留近 30 天；完整压缩前快照见 `01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`。
