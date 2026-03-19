# Tuff 项目待办事项

> 从 PRD 文档提炼的执行清单（压缩版）
> 更新时间: 2026-03-19

---

## 🧭 单一口径矩阵（2.4.9）

| 主题 | 当前事实 | 下一动作 | 强制同步文档 |
| --- | --- | --- | --- |
| 版本主线 | 当前工作区基线为 `2.4.9-beta.4` | 推进 `Nexus 设备授权风控` | `TODO` / `README` / `INDEX` / `CHANGES` |
| Legacy/兼容/结构治理 | 已锁定统一实施 PRD（五工作包并行） | 按统一门禁执行收口，不再按 Phase 口径拆分决策 | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| 2.4.8 Gate | OmniPanel 稳定版 MVP 已完成（historical） | 保留历史验收证据，不再作为当前开发主线 | `TODO` / `README` / `INDEX` / `CHANGES` |
| v2.4.7 Gate | A/B/C/D/E 全部完成（D/E historical） | 保留 run/manifest/sha256 证据链 | `TODO` / `README` / `Roadmap` / `Release Checklist` / `Quality Baseline` / `INDEX` |
| Pilot Runtime | Node Server + Postgres/Redis + JWT Cookie 主路径 | 继续补齐稳定性与部署回归 | `TODO` / `README` / `Roadmap` / `Quality Baseline` / `INDEX` |

---

## 📚 文档盘点锚点（2026-03-17）

- 全仓 Markdown：`396`；`docs`：`146`；`docs/plan-prd`：`110`。
- 子域分布：`03-features 32`、`docs 20`、`04-implementation 17`、`01-project 12`、`05-archive 11`、`02-architecture 8`、`06-ecosystem 4`。
- 统一口径文档：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`。

---

## 🔧 当前执行清单（2 周）

### A. 文档治理（本轮）

- [x] 六主文档日期统一到 `2026-03-16`。
- [x] 六主文档“下一动作”统一为 `Nexus 设备授权风控`。
- [x] `CHANGES` 完成“近 30 天主文件 + 历史月度归档”拆分。
- [x] `README/INDEX` 入口压缩为高价值快照。
- [x] Phase 0：新增 `legacy:guard`（冻结新增 `legacy` 分支与 `channel.send('x:y')` raw event）。
- [x] Phase 0：建立 `scripts/legacy-boundary-allowlist.json`，存量兼容债务全部附 `expiresVersion=2.5.0`。
- [x] 统一治理 SoT：新增 `docs/plan-prd/docs/compatibility-debt-registry.csv`（固定字段与 owner/expires/test_case）。
- [x] 统一治理门禁：新增 `pnpm compat:registry:guard` + `pnpm size:guard`，并并入 `pnpm legacy:guard`。
- [x] 统一主线验收入口：新增 `pnpm quality:gate` 聚合命令（`legacy/network/test:targeted/typecheck/docs`）。
- [x] 超长文件冻结：新增 `scripts/large-file-boundary-allowlist.json`（主线基线 `47` 个）。
- [x] 主线隔离：root workspace 与 root lint 默认仅覆盖 `core-app/nexus/pilot/packages/plugins`。
- [x] Sync 兼容壳行为固化：补充 `/api/sync/pull|push` 返回 410 的自动化测试断言。
- [x] 债务扫描口径显式化：主线改为显式白名单 + 漏扫报错 + `scanScope` 摘要输出。
- [x] 超长文件防漂移：`--write-baseline` 禁止自动上调，新增 `growthExceptions` 显式豁免机制。
- [ ] `TODO` 主文件压缩到 400 行以内并稳定维护。
- [ ] 第二批历史文档统一加“历史/待重写”头标。

### B. Nexus 风控主线（下一开发动作）

- [ ] Phase 0：补齐设备授权风控验收证据（含回滚演练记录）。
- [ ] Phase 1：完成速率限制、冷却窗口、审计日志落地。
- [ ] Phase 1：补齐风控告警策略与责任人值守说明。
- [ ] 输出最小可复现门禁命令与发布前检查单。

### C. 文档门禁节奏

- [x] `docs:guard` 已在 CI 以 report-only 运行。
- [ ] 连续 5 次 `docs:guard` 零告警（升级 strict 前置条件之一）。
- [ ] 连续 2 周无“状态回退/口径漂移”冲突。
- [ ] 达成条件后将 CI 从 report-only 升级为 strict 阻塞。

### D. 本轮回滚预案（2026-03-16 Findings 修复）

- 回滚触发条件：
  - `apps/nexus` 在 Sentry server config 加载路径上出现异常（启动失败或配置未生效）。
  - `compat:registry:guard` 出现非预期 coverage 回退。
- 回滚步骤（提交粒度）：
  - 文件名回滚：`apps/nexus/sentry.server.config.ts` 按需恢复到异常旧名路径，仅用于应急回退验证。
  - 清册回滚：恢复本轮清理的两条 registry 行（`apps/pilot/shims-compat.d.ts`、`apps/nexus/i18n.config.ts`）。
  - 脚本回滚：撤销 `check-compatibility-debt-registry.mjs` 中 `registry-only domain` 改动。
- 回滚后必跑：
  - `pnpm compat:registry:guard`
  - `pnpm legacy:guard`
  - `pnpm quality:gate`

### E. Transport Legacy 清退清单（启动项，目标 v2.5.0）

- 清单文档：`docs/plan-prd/docs/TRANSPORT-LEGACY-RETIREMENT-CHECKLIST-2026-03.md`
- [x] 第一轮入口收口完成：`legacy-transport-import` 从 `4 files / 4 hits` 降到 `0 files / 0 hits`。
- 现状说明：
  - 兼容符号仍通过 `@talex-touch/utils/transport` 统一入口转出（保留兼容，不再直连 `transport/legacy` 路径）。
- 统一替换策略：
  - 对外入口优先 `@talex-touch/utils/transport` typed SDK，不新增 legacy 导出。
  - legacy 仅保留读兼容和 warn-and-forward，不再承载新能力。
- 执行顺序（单链路）：
  - [x] `packages/utils/plugin/preload.ts` 与 `packages/utils/renderer/storage/base-storage.ts`（内部调用侧）。
  - [x] `apps/core-app/.../widget-registry.ts`（renderer 暴露面）。
  - [x] `packages/utils/index.ts`（统一出口重导向）。
  - [ ] `v2.5.0` 前移除 transport 中 legacy 兼容符号对外转出（破坏性变更窗口）。
- 验收口径：
  - [x] `legacy-transport-import` = `0 files / 0 hits`。
  - `pnpm quality:gate` 全绿且无新增兼容债务。

### F. Pilot 附件慢链路治理 + CMS 设置合并（2026-03-16）

- [x] 新旧链路统一附件投递策略：`id > https url > base64`（并发=3，快速失败错误码透出）。
- [x] `pilot stream` 与 `legacy executor` 接入统一解析器，并补充 `attachment.resolve.start/end` 与 `attachment.delivery.summary` 埋点。
- [x] `/api/chat/sessions/:sessionId/uploads` 支持 `multipart/form-data`，兼容保留 `contentBase64`。
- [x] 新增 `GET /api/chat/attachments/capability`，Pilot/legacy 输入框共用探测能力。
- [x] 新增聚合后台设置接口：`GET/POST /api/admin/settings`。
- [x] 新增 Admin 页面：`/admin/system/channels`、`/admin/system/storage`（列表 + 添加/编辑弹框），`/cms/*` 退化为 Legacy 跳转层。
- [x] App 管理进一步拆页：`model-groups / route-combos / routing-policy / routing-metrics` 独立入口；`pilot-settings` 退化为总览跳转页。
- [x] Channels 升级为多模型配置：每渠道维护模型列表、默认模型与启用模型列表。
- [x] 左侧导航滚动修复并精简系统管理入口（默认隐藏 `角色管理 / 菜单管理 / 字典项`）。
- [x] 管理配置 SoT 保持 `pilot_admin_settings`；密钥字段脱敏展示、写入加密、空值不覆写。
- [x] 自动部署口径澄清并固化：`commit != deploy`，仅 `push master` 命中 workflow 且 webhook secrets + 1Panel webhook 健康时自动触发；保留 `ssh home` 手动兜底路径。
- [x] SSE 前端兼容层补齐：`event/session_id/[DONE]` 统一映射到 `type/sessionId/done`，支持 `turn.*` 全链路事件消费。
- [x] `turn.failed` 错误可见性修复：消息区强制追加 assistant 失败消息，底部保留诊断详情（`code/status_code/request_id`）。
- [x] CMS 收口补丁：`/admin/*` 作为管理主入口，`/cms/*` 统一跳转到对应 `/admin/*`。
- [x] `/cms` 防御性修复：browser-only API 增加客户端守卫，`router.back()` 增加无历史栈 fallback。

### G. Pilot 合并升级 V2（2026-03-17）

- [x] 统一执行链路：`/api/aigc/executor`、`/api/v1/chat/sessions/*`、`/api/chat/sessions/*` 接入路由解析与指标采集。
- [x] 新增渠道评比指标：记录 `queueWaitMs/ttftMs/totalDurationMs/success/errorCode/finishReason/channel+model/routeCombo`。
- [x] 新增渠道熔断状态机：按失败阈值摘除，冷却后半开探测恢复。
- [x] 新增模型目录与路由组合后台接口：`models/route-combos/channel-models/sync/routing-metrics/runtime-models`。
- [x] 前端 gptview 切换为运行时模型目录驱动，支持 `internet/thinking` 开关透传。
- [x] 兼容入口收口：`/pilot` 保留兼容跳转到 `/`。
- [x] 接入真实 LangGraph Local Server 运行图：`createPilotRuntime` 已支持 `langgraph-local` 主引擎执行，启动失败/空流自动回退 deepagent。

### H. Pilot 工具调用提示 + 数据源抓取 V1（2026-03-18）

- [x] 新增 `PilotToolGateway` 与 `websearch` connector 三段接口（`search/fetch/extract`），形成统一工具执行入口。
- [x] 新增 `datasource.websearch` 配置并并入 Admin settings 聚合接口。
- [x] 新增 `tool-approvals` 审批票据存储与 `GET/POST` API，支持 `pending/approved/rejected` 生命周期。
- [x] `executor` 输出标准 `run.audit` 工具事件，已移除 `status_updated(calling/result)` 工具兼容映射。
- [x] `v1 chat stream` 透传 `run.audit/status_updated`，高风险审批命中后进入阻塞等待（`turn.approval_required`）。
- [x] 前端统一解析 `run.audit` 工具事件（`status_updated` 仅保留通用流状态），新增 Tool 卡片视图（含来源链接与审批上下文）。
- [x] Intent 混合识别（`/image|/img` 显式命令 + 规则 + nano 分类兜底）落地，默认 nano 未配置时跟随主模型。
- [x] 路由策略扩展：`intentNanoModelId/intentRouteComboId/imageGenerationModelId/imageRouteComboId` 与 `allowImageGeneration` 已接入配置与运行时模型输出。
- [x] 新增 `image.generate` 工具并接入新旧两条会话链路短路执行（命中图像意图时直接返回 Markdown 图片 + Tool 卡片审计事件）。
- [x] 增加“审批通过后自动续跑”前端交互：命中 `turn.approval_required` 后自动轮询审批票据，`approved` 时复用原 `request_id` 自动续跑，`rejected/timeout` 明确失败收口。
- [x] Legacy Phase 2（工具提示链路）收口：`$completion` 默认关闭 legacy `completion/verbose/status_updated(tool)` 兼容分支，统一以 `turn.* + run.audit` 为主链路；保留环境开关回滚。
- [x] 增补回归测试：覆盖 `request_id` 复用分支与审批 `approved/rejected/timeout` 状态映射，确保自动续跑与失败收口可持续回归。

### I. Pilot 严格模式 + 可感知差异 + 提示词升级（2026-03-19）

- [x] `pilotMode=true` 时禁降级：`executor` 与 `chat stream` 均在 LangGraph 不可用场景返回 `PILOT_STRICT_MODE_UNAVAILABLE`。
- [x] `createPilotRuntime` 支持 `strictPilotMode/allowDeepAgentFallback`，严格模式下禁用 fallback adapter。
- [x] 顶部 `PILOT` 可视化落地：主聊天 header + 状态栏均可识别 Pilot 模式。
- [x] 新增 ThisAi Prompt Builder：运行时系统提示词统一从 builder 注入 `name/ip/ua` 与安全约束。
- [x] websearch 增强：保留“意图优先 + 启发式兜底”，并在 datasource 未配置时回退 Responses 内置检索。
- [x] 审计可观测性增强：补齐 `memory.context` / `websearch.decision` / connector 来源，避免“命中无感”。
- [ ] 回归补充：补齐 `executor/stream` 端到端 strict 错误码回归用例（含 HTTP status 与 SSE payload 断言）。
- [ ] 线上观测：新增 `PILOT_STRICT_MODE_UNAVAILABLE` 告警阈值和 7 天趋势看板。

### J. Pilot 旧 UI 会话卡片化硬切（2026-03-19）

- [x] 旧 UI 执行器仅走 `POST /api/chat/sessions/:sessionId/stream`，不再依赖 `v1 turns/stream`。
- [x] 运行态事件统一卡片化：`intent/routing/memory/websearch/thinking` 全部落入会话消息流并持久化回放。
- [x] `thinking.delta -> thinking.final` 采用同一卡片增量拼接，完整文本可视化展示。
- [x] legacy 事件 `turn.* / status_updated / completion / verbose / session_bound` 不再驱动 UI 状态，仅告警忽略。
- [x] 管理端渠道 `adapter` 固定 `openai`，移除 `legacy` 可编辑入口。

---

## 📚 文档债务池（第二轮 + 第三轮摘要）

### 已处理

- [x] `OMNIPANEL-FEATURE-HUB-PRD`：标记为 historical done（2.4.8 Gate）。
- [x] `PILOT-NEXUS-OAUTH-CLI-TEST-PLAN`：改为“已落地 vs 未启动”结构。
- [x] `TUFFCLI-INVENTORY`：切换为 `tuff-cli` 主入口口径。
- [x] `NEXUS-SUBSCRIPTION-PRD` 与 `NEXUS-PLUGIN-COMMUNITY-PRD`：加历史降权头标。
- [x] 新增长期债务池文档：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`。

### 剩余

- [ ] Telemetry/Search/Transport/DivisionBox 四个长文档改造为 TL;DR 分层模板。
- [ ] `04-implementation` 目录继续清点 Draft 文档并标注有效状态。
- [ ] 抽样复核主入口链接可达性（归档后不得断链）。

---

## 🌊 分波次债务推进（W2-W4）

- [ ] Wave A（Transport）：MessagePort 高频通道迁移 + `sendSync` 清理。
- [ ] Wave B（Pilot）：存量 typecheck/lint 清理 + SSE/鉴权矩阵回归。
- [ ] Wave C（架构质量）：`plugin-module/search-core/file-provider` SRP 拆分。
- [ ] 每波固定产出：`CHANGES` 证据 + `TODO` 状态 + 可复现门禁命令集。

---

## ✅ 历史收口状态（仅保留事实）

- [x] `2.4.8 OmniPanel Gate`：已完成，保留 historical 记录。
- [x] `v2.4.7 Gate D`：历史资产回填已完成（run `23091014958`）。
- [x] `v2.4.7 Gate E`：按 historical done 关闭，不重发版。
- [x] `2.4.9-beta.4`：发布基线与 CI 证据已固化。
- [x] CLI Phase1+2：迁移完成，`2.4.x` shim 保留、`2.5.0` 退场。
- [x] Pilot Chat/Turn 协议硬切：`/api/v1/chat/sessions/:sessionId/{turns,stream,messages}` 已落地，SSE 尾段 title + 队列运行态回传完成；历史 `pilot_quota_history.value` 已完成 base64 -> JSON 迁移并统一 JSON 读写。

---

## 🔗 长期债务入口

- 长期与跨版本事项见：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

---

## 📊 任务统计

| 统计项 | 数值 |
| --- | --- |
| 已完成 (`- [x]`) | 46 |
| 未完成 (`- [ ]`) | 16 |
| 总计 | 62 |
| 完成率 | 74% |

> 统计时间: 2026-03-17（按本文件实时 checkbox 计数）。

---

## 🎯 下一步（锁定）

1. 完成 `Nexus 设备授权风控` Phase 0/1 文档化与验收闭环。
2. 在本轮文档压缩完成后，继续推进风控实现与回归。
3. `docs:guard` 连续零告警后，再升级 strict 阻塞策略。
