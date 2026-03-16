# Tuff 项目待办事项

> 从 PRD 文档提炼的执行清单（压缩版）
> 更新时间: 2026-03-16

---

## 🧭 单一口径矩阵（2.4.9）

| 主题 | 当前事实 | 下一动作 | 强制同步文档 |
| --- | --- | --- | --- |
| 版本主线 | 当前工作区基线为 `2.4.9-beta.4` | 推进 `Nexus 设备授权风控` | `TODO` / `README` / `INDEX` / `CHANGES` |
| 2.4.8 Gate | OmniPanel 稳定版 MVP 已完成（historical） | 保留历史验收证据，不再作为当前开发主线 | `TODO` / `README` / `INDEX` / `CHANGES` |
| v2.4.7 Gate | A/B/C/D/E 全部完成（D/E historical） | 保留 run/manifest/sha256 证据链 | `TODO` / `README` / `Roadmap` / `Release Checklist` / `Quality Baseline` / `INDEX` |
| Pilot Runtime | Node Server + Postgres/Redis + JWT Cookie 主路径 | 继续补齐稳定性与部署回归 | `TODO` / `README` / `Roadmap` / `Quality Baseline` / `INDEX` |

---

## 🔧 当前执行清单（2 周）

### A. 文档治理（本轮）

- [x] 六主文档日期统一到 `2026-03-16`。
- [x] 六主文档“下一动作”统一为 `Nexus 设备授权风控`。
- [x] `CHANGES` 完成“近 30 天主文件 + 历史月度归档”拆分。
- [x] `README/INDEX` 入口压缩为高价值快照。
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
| 已完成 (`- [x]`) | 16 |
| 未完成 (`- [ ]`) | 16 |
| 总计 | 32 |
| 完成率 | 50% |

> 统计时间: 2026-03-16（按本文件实时 checkbox 计数）。

---

## 🎯 下一步（锁定）

1. 完成 `Nexus 设备授权风控` Phase 0/1 文档化与验收闭环。
2. 在本轮文档压缩完成后，继续推进风控实现与回归。
3. `docs:guard` 连续零告警后，再升级 strict 阻塞策略。
