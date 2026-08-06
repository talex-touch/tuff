# 智能边界测试既有失败（actor-boundary 行为漂移）

**交接任务**：主会话在修 mock 陈旧问题时剥出的 HEAD 既有失败，归属 intelligence 权限/边界流（并行会话活跃面），非 pi 工具链流引入。

## 现状（2026-08-06）

`npx vitest run src/main/modules/ai` 12 failed / 3 files：

- `intelligence-agent-session-host-boundary.test.ts` — **与 HEAD 逐字节一致仍失败**（决定性证据）：多个 `expected { ok: false, …(1) } to deeply equal { ok: false, …(1) }`（错误码或 payload 形状漂移）
- `intelligence-workflow-host-boundary.test.ts` — 同类深比较失败
- `intelligence-invoke-actor-boundary.test.ts` — 深比较失败 + 1 个 5000ms 超时

## 已排除

- mock 陈旧已由 fefd7 系列提交修复（importOriginal + Proxy 事件桩），4/7 套件恢复绿
- pi 工具链/附件/重试修复链路（cd018f946 等）与此无关：失败在其改动前的 HEAD 即存在

## 验收

- [ ] 三套件绿或按新契约更新断言（需查明 ok:false 里 code 从什么变成了什么、由哪次提交引入、是回归还是有意契约变更）
- [ ] 超时的那条查明挂点（疑 handler 注册后未 resolve）
