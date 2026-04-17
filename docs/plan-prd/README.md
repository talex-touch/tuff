# Talex Touch - 项目文档中心

> 统一的项目文档入口（压缩版）
> 更新时间: 2026-04-17

## 快速入口

- [产品总览与路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)
- [项目待办（2 周主清单）](./TODO.md)
- [变更日志（近 30 天 + 历史归档）](./01-project/CHANGES.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [文档盘点与下一步路线（2026-03-17）](./docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md)
- [一次性完整修复总方案（统一实施 PRD）](./02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md)
- [Nexus 设备授权风控实施方案](./04-implementation/NexusDeviceAuthRiskControl-260316.md)
- [v2.4.7 发版收口清单（historical）](./01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md)
- [长期债务池](./docs/TODO-BACKLOG-LONG-TERM.md)

---

## 单一口径快照（2026-04-17）

- 当前工作区基线：`2.4.9-beta.4`。
- CoreApp 启动搜索卡顿治理已落地“平衡模式 + 双库隔离”：`database-aux.db` 分流非核心高频写、`DbWriteScheduler` QoS/熔断、索引热路径单写者化、启动期降载（120s）。
- 发布开关已就位：`TUFF_DB_AUX_ENABLED`、`TUFF_DB_QOS_ENABLED`、`TUFF_STARTUP_DEGRADE_ENABLED`，支持灰度与快速回滚。
- Legacy/兼容/结构治理已切换到“统一实施 PRD + 五工作包并行”口径（不再使用 Phase 1-3 决策叙事）。
- 治理基线：`legacy 81/184`、`raw channel 13/46`、超长文件（主线）`47`。
- `apps/core-app` 已完成“兼容债立即硬切”首轮并行治理：`window.$channel` 业务入口清零、legacy storage 事件协议清零、权限 `sdkapi` legacy 放行移除、更新/平台识别收敛为显式 `unsupported` 策略。
- 当前下一动作：`Nexus 设备授权风控`。
- `2.4.8` 主线：OmniPanel Gate 已完成（historical）。
- `v2.4.7` Gate：A/B/C/D/E 已完成（historical），不重发版。
- Pilot Runtime 主路径：Node Server + Postgres/Redis + JWT Cookie（Cloudflare 路径仅历史归档）。
- Pilot Chat 路由 V2：已接入渠道多模型发现、模型目录、路由组合、速度优先自动路由与评比指标采集（TTFT/总耗时/成功率）。
- Pilot 工具调用 V1：已落地统一 `run.audit` 工具生命周期、阻塞式审批票据 API、`datasource.websearch` 全局 provider 池（`SoSearch/SearXNG/Serper/Tavily + responses_builtin`）与前端 Tool 卡片聚合解析；新增 Intent 图像路由与 `image.generate` 工具闭环（legacy `stream/turns` 路由与 SDK legacy 出口已 hard-cut 下线）。
- Pilot 审批闭环：聊天端已支持审批票据自动轮询与自动续跑（approved 复用原 request 执行）；legacy 事件兼容分支默认关闭并提供环境开关回滚。
- Pilot 旧 UI 已硬切会话卡片流：`intent/routing/memory/websearch/thinking` 改为消息流卡片事件，状态不再走全局运行态条。
- Pilot 流式入口收敛：旧 UI 执行链路统一到 `POST /api/chat/sessions/:sessionId/stream`，legacy 事件仅告警忽略。
- Pilot 首页默认 DeepAgent：生产入口继续是 `apps/pilot/app/pages/index.vue`，前端主消费链收口到 legacy `$completion` 单链，不再并行扶正新 Pilot Workspace。
- Pilot 默认模式收敛：`pilotMode` 退回显式实验字段；首页默认不发送、不展示、不依赖它，`fromSeq + follow` 恢复链统一按真实可恢复事件推进。
- Pilot trace contract 收紧：`stream.started / stream.heartbeat / replay.* / run.metrics / done / error` 不再持久化到 trace，replay/follow/quota snapshot 会统一过滤历史 lifecycle 噪音。

---

## 当前主线（2 周）

1. P0：`Nexus 设备授权风控` Phase 0/1 验收闭环（证据、回滚、发布前检查单）。
2. P0：文档治理收尾（`TODO` 控制到 400 行内 + 第二批历史头标 + TL;DR 分层）。
3. P1：达成 `docs:guard` 升级前置（5 次零告警 + 2 周口径稳定）。
4. P1：推进 Wave A/B/C（三波次并行）并按波次同步 `CHANGES + TODO + 门禁命令`。

---

## 已完成主线（不重复开发）

- OmniPanel 稳定版 MVP（2.4.8 Gate）
  - 真实窗口 smoke CI、失败路径回归、触发与窗口行为稳定性回归已完成。
- v2.4.7 Gate D/E 历史闭环
  - Gate D 由 `workflow_dispatch(sync_tag=v2.4.7)` 完成回填；Gate E 按 historical done 关闭。
- 2.4.9 插件完善主线
  - 权限中心 Phase5（SQLite 主存储 + 迁移回退）
  - View Mode 安全闭环 + Phase4
  - CLI Phase1+2 完整迁移

---

## 未闭环能力（按优先级）

### P0

- Nexus 设备授权风控实施与验收闭环。

### P1

- Transport Wave A：MessagePort 高频通道迁移 + `sendSync` 清理。
- Pilot Wave B：存量 typecheck/lint 清理与渠道矩阵回归。
- 架构 Wave C：`plugin-module/search-core/file-provider` SRP 拆分。

### P2+

- AttachUIView 深化（Warm/Cold 分层、Score 模型、可视化调试）。
- Multi Attach View 并行视图能力。
- Widget Sandbox 扩展拦截与审计。

---

## 文档治理规则（本仓执行）

- 六主文档状态、日期、下一动作必须一致：
  - `docs/INDEX.md`
  - `docs/plan-prd/README.md`
  - `docs/plan-prd/TODO.md`
  - `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
  - `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- 每次文档改动后至少运行：
  - `pnpm docs:guard`
  - `pnpm docs:guard:strict`
- 历史事实优先进入 `CHANGES` 归档，不在入口文档重复叙事。

---

## 近 30 天重点变更索引

- Core App 性能诊断增强：`Clipboard` 慢路径新增 phase 级别分解、告警分级与原因码，并接入 `Perf summary`/`polling diagnostics` 聚合视图。
- Core App 性能链路降载：`file-index progress stream` 增加发送节流（latest-wins + 阶段优先），`Perf summary` 新增 `phaseAlertCode TopN` 聚合口径。
- `2.4.9-beta.4` 基线快照固化与 CI 证据回填。
- Pilot 合并升级 V2：`/` 统一入口、`/pilot` 兼容跳转、`Quota Auto` 自动路由与渠道评比。
- CLI Phase1+2：`tuff-cli` 主入口、`tuff-cli-core` 核心迁移、`unplugin` shim 兼容。
- Pilot Chat/Turn 新协议：`turns/stream/messages` 路由与会话级串行队列。
- 文档治理门禁：`docs:guard` / `docs:guard:strict`。

详见：[CHANGES](./01-project/CHANGES.md)

---

## 维护说明

- 本页只保留“当前主线 + 高价值入口 + 未闭环能力”。
- 长尾背景、历史细节、分阶段实现推演统一下沉到 `CHANGES` 与专题文档。
