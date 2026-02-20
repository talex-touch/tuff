# TuffIntelligence 落地待办（全可用 + 高可用）

> 范围：core-app / nexus / cloudflare
> 
> 原则：命名统一为 TuffIntelligence / intelligence，不新增 ai 前缀能力入口；所有已注册能力必须可执行，不允许占位返回。

## 1. 本轮已落地

- 已提供 `intelligence-lab` 单消息编排入口，用户只需发送一条消息，系统自动完成计划、执行、反思、回访。
- 已提供 `intelligence-lab` 全链路 stream 事件（plan/execute/approval/reflection/follow-up/metrics/assistant delta/done）。
- 已接入管理员分析视图 intelligence 指标：成功率、回退率、恢复率、审批命中率、stream 覆盖率、tool 失败分布、recent runs。
- 已收口权限标识为 `intelligence.basic` / `intelligence.agents` / `intelligence.admin`。
- 已移除运行时类型中的 AISDK 兼容别名，核心类型统一为 `Intelligence*`。

## 2. 仍需完成（按优先级）

## P0（发布前必须完成）

- [ ] 在 core-app + nexus 做一次端到端演练：
  - [ ] 无 provider 可用时错误提示可理解。
  - [ ] provider 主路径失败后 fallback 生效，且 metrics 统计准确。
  - [ ] 审批拒绝/通过路径都能闭环回写并反映在 stream。
- [ ] 为高风险工具增加更细粒度审批策略（按工具类别 + 参数特征）。
- [ ] 增加幂等保障检查：同 `callId/sessionId/actionId` 重放不产生重复副作用。
- [ ] 断链即暂停全链路验收：
  - [ ] SSE 断连后会话状态写入 `paused_disconnect`，用户可基于会话标识直接恢复（无 token）。
  - [ ] `heartbeat` 超时（30s）可自动暂停，且写入 checkpoint。
  - [ ] 用户返回后 `recoverable` 接口可提示恢复，并支持 `resume` 续跑。
  - [ ] `trace` 支持 `fromSeq` 续播，事件 `seq` 不可回退或缺口。

## P1（灰度期完成）

- [ ] 会话恢复增强：snapshot + action log 恢复到最近一致状态并补发缺失 trace。
- [ ] 多实例并发控制增强：lease 心跳、过期接管、防双写冲突告警。
- [ ] 失败预算与熔断策略：按 provider/tool 维度做熔断窗口和自动恢复。
- [ ] Cloudflare Worker runtime 约束治理：
  - [ ] step-batch 调度拆分，避免长链路单请求堆积。
  - [ ] 多工具并发阈值配置化（默认串行，按环境开关受控并发）。
  - [ ] 断链恢复路径压测（1000 次）并输出恢复率与丢失率报告。

## P2（收口阶段完成）

- [ ] 文档全量替换旧命名（manifest / permission / architecture / guide）。
- [ ] 将 landing/演示区中旧 `Ai*` 命名逐步替换为 `Intelligence*`。
- [ ] 增加发布门禁：
  - [ ] `pnpm intelligence:check`
  - [ ] 命名扫描（阻止新增 `ai.basic|ai.advanced|ai.agents`）
  - [ ] stream 覆盖率下限校验

## 3. SLO 与观测建议

- 可用性：端到端成功率 >= 99.9%（灰度稳定窗口）。
- 恢复率：发生 fallback/retry 的运行中，恢复成功率 >= 95%。
- 审批安全：高风险动作审批命中率 = 100%。
- stream 覆盖率：编排运行事件流覆盖率 >= 99%。
- 断链暂停率：`disconnectPauseRate` 可观测，且 `resumeSuccessRate >= 99%`。
- checkpoint 丢失率：`checkpointLossRate = 0`（恢复后事件连续）。

## 4. KV 部署与绑定清单（必查）

> KV 仅用于协调与缓存，不作为 SoT。SoT 仍是 SQLite（本地）/D1（云端）。

1) 创建命名空间（prod + preview）

```bash
npx wrangler kv namespace create TUFF_INTELLIGENCE_RUNTIME
npx wrangler kv namespace create TUFF_INTELLIGENCE_RUNTIME --preview
```

2) 回填配置

- 在 `wrangler.toml` 中填写 `[[kv_namespaces]]` 与 `[[env.preview.kv_namespaces]]` 的真实 `id/preview_id`。
- 在 `apps/nexus/types/cloudflare-env.d.ts` 保持 `TUFF_INTELLIGENCE_RUNTIME?: KVNamespace`。

3) 控制台绑定校验

- KV 管理入口：<https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces>
- Pages 绑定入口：<https://dash.cloudflare.com/?to=/:account/pages>

4) 上线前检查

- [ ] preview/prod 绑定名均为 `TUFF_INTELLIGENCE_RUNTIME`
- [ ] preview/prod 指向不同 namespace
- [ ] 关键路径日志包含 `sessionId/traceId/leaseId`
