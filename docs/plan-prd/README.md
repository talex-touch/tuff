# Talex Touch - 项目文档中心

> 统一的项目文档入口（压缩版）
> 更新时间: 2026-05-10

## 快速入口

- [产品总览与路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)
- [项目待办（2 周主清单）](./TODO.md)
- [变更日志（近 30 天 + 历史归档）](./01-project/CHANGES.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [文档盘点历史快照（2026-03-17）](./docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md)
- [一次性完整修复总方案（统一实施 PRD）](./02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md)
- [Nexus 设备授权风控实施方案](./04-implementation/NexusDeviceAuthRiskControl-260316.md)
- [Nexus Provider 聚合与 Scene 编排重构 PRD](./02-architecture/nexus-provider-scene-aggregation-prd.md)
- [跨平台兼容与占位实现审计报告（2026-05-10）](./report/cross-platform-compat-placeholder-audit-2026-05-10.md)
- [v2.4.7 发版收口清单（historical）](./01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md)
- [长期债务池](./docs/TODO-BACKLOG-LONG-TERM.md)

---

## 单一口径快照（2026-05-09）

- 当前工作区基线：`2.4.10-beta.18`。
- 当前主线：`2.4.10` 优先解决 Windows App 索引、Windows 应用启动体验与基础 legacy/compat 收口。
- 下一版本门槛：`2.4.11` 必须关闭剩余未闭环项；清册内 legacy/compat/size 债务退场目标统一前移到 `2.4.11`。
- Nexus 设备授权风控 Phase 1 已落地：设备码申请频控、连续 reject/cancel 冷却、request/approve/reject/cancel/revoke/trust/untrust 审计日志、长期授权后端时间窗与可信设备显式白名单已接入。
- Nexus Provider 聚合与 Scene 编排进入架构蓝图：后续汇率、AI 大模型、文本翻译、图片/截图翻译统一进入 Provider registry，Scene 按 capability 自由组合与路由。
- Nexus Provider Registry 已接入 D1 密文 secure store 与腾讯云机器翻译 `text.translate` live check；生产需配置 `PROVIDER_REGISTRY_SECURE_STORE_KEY`，首版仍不包含 Scene runtime、图片翻译和 Metering ledger。
- Tuff 2.5.0 AI 板块已锁定 Plan PRD：定位为桌面 AI 入口收口版本，优先收口 CoreBox / OmniPanel 的用户可感知 AI 场景；Stable 只承诺文本 + OCR，Workflow / Pilot 联动进入 Beta，Assistant、多模态生成与 Nexus Scene runtime 编排列为 Experimental / 2.5.x 后续。
- CoreApp 启动搜索卡顿治理已落地“平衡模式 + 双库隔离”：`database-aux.db` 分流非核心高频写、`DbWriteScheduler` QoS/熔断、索引热路径单写者化、启动期降载（120s）；CoreBox 可见期间会短时压低后台 polling lane 频率/并发，减少搜索交互窗口内的后台争用。
- 搜索索引服务已切到“平台原生快速层 + 自建索引增强层”口径：Windows Everything、macOS Spotlight/mdfind、Linux locate/Tracker/Baloo 负责首帧候选，自建 FileProvider 负责 FTS、内容解析、语义和后台修正；搜索 payload 禁止内联 base64 图标/缩略图，大资源通过 `tfile://`/本地路径懒加载。
- 发布开关已就位：`TUFF_DB_AUX_ENABLED`、`TUFF_DB_QOS_ENABLED`、`TUFF_STARTUP_DEGRADE_ENABLED`，支持灰度与快速回滚。
- Legacy/兼容/结构治理已切换到“统一实施 PRD + 五工作包并行”口径（不再使用 Phase 1-3 决策叙事）。
- 治理基线：`legacy 81/184`、`raw channel 13/46`、超长文件（主线）`47`。
- 跨平台兼容审计（2026-05-10）：CoreApp 平台能力已具备显式 degraded/unsupported 合同；真实风险集中在 Windows/macOS 人工证据、Linux best-effort 记录、Pilot 假值接口/支付 mock、插件 localStorage 路径持久化、retained `defineRawEvent` 统计口径与超长多职责模块。
- `apps/core-app` 已完成“兼容债立即硬切”首轮并行治理：`window.$channel` 业务入口清零、legacy storage 事件协议清零、权限 `sdkapi` legacy 放行移除、更新/平台识别收敛为显式 `unsupported` 策略。
- CoreApp Sync payload 已从旧 `b64:` Base64 载荷升级为 main 侧 AES-GCM `enc:v1` 真密文；`payload_enc/payload_ref` wire shape 保持不变，`meta_plain` 仅保留非业务元数据，旧 `b64:` 只作为迁移读取 fallback。
- Nexus Release Evidence API 继续作为平台回归、文档门禁与阻塞矩阵采集入口；CI 写入使用 `release:evidence` API key。
- 当前下一动作：`2.4.10 Windows App 索引 + 基础 legacy/compat 收口`；Linux best-effort 口径复核继续作为非阻塞记录。
- `2.4.11` 前置口径：关闭或降权 CoreApp 剩余 legacy/compat 债务，补齐 Windows/macOS release-blocking 回归证据；Linux 保留 documented best-effort，不作为 `2.4.10` blocker。
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

1. P0：Windows App 索引与启动体验收口（Start Menu、UWP、registry uninstall、`launchArgs/workingDirectory`、真实 Windows 设备验证）。
2. P0：基础 legacy/compat 收口（清册退场目标统一为 `2.4.11`，禁止新增 legacy/raw channel/旧 storage/旧 SDK bypass）。
3. P1：文档治理收尾（TODO 按版本分层、第二批历史头标 + TL;DR 分层）。
4. P1：`Nexus 设备授权风控` 保留实施文档与验收入口，Phase 1 主体已完成。

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

### P0（2.4.10）

- 2.4.10 Windows App 索引与基础 legacy/compat 收口。

### P1（2.4.11 必须解决）

- Windows/macOS 阻塞级人工回归证据闭环。
- Linux documented best-effort smoke 与限制说明。
- Release Evidence 写入凭证/CI 证据闭环。
- `legacy/compat/size` 清册中过期到 `2.4.11` 的条目关闭或显式降权。
- Transport Wave A：MessagePort 高频通道迁移 + `sendSync` 清理。
- Pilot Wave B：存量 typecheck/lint 清理与渠道矩阵回归。
- 架构 Wave C：`plugin-module/search-core/file-provider` SRP 拆分。

### P2+

- AttachUIView 深化（Warm/Cold 分层、Score 模型、可视化调试）。
- Multi Attach View 并行视图能力。
- Widget Sandbox 扩展拦截与审计。
- Nexus Provider 聚合与 Scene 编排（Provider registry、Capability、Scene、Strategy、Metering）；Provider registry 已有 D1 密文 `authRef` 凭证绑定与腾讯云 `text.translate` check，后续继续补汇率、AI 大模型、图片/截图翻译与 Scene runtime。
- Tuff 2.5.0 AI 桌面入口收口：PRD 已锁定版本定位与验收口径；后续实现不得扩大到全量多模态、Assistant 默认启用或 Nexus Scene runtime 编排。

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
- `2.4.10-beta.18` 当前基线与 Windows App 索引回归推进。
- Pilot 合并升级 V2：`/` 统一入口、`/pilot` 兼容跳转、`Quota Auto` 自动路由与渠道评比。
- CLI Phase1+2：`tuff-cli` 主入口、`tuff-cli-core` 核心迁移、`unplugin` shim 兼容。
- Pilot Chat/Turn 新协议：`turns/stream/messages` 路由与会话级串行队列。
- 文档治理门禁：`docs:guard` / `docs:guard:strict`；2026-03-17 文档盘点仅保留历史统计口径，当前路线以本页、`TODO` 与 `CHANGES` 为准。

详见：[CHANGES](./01-project/CHANGES.md)

---

## 维护说明

- 本页只保留“当前主线 + 高价值入口 + 未闭环能力”。
- 长尾背景、历史细节、分阶段实现推演统一下沉到 `CHANGES` 与专题文档。
