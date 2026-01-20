---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 整理 config storage（SQLite/JSON 同步）上下文与需求
complexity: medium
planning_method: builtin
created_at: 2026-01-20T18:55:06+08:00
---

# Plan: 配置存储 SQLite/JSON 同步 - 上下文与需求整理

🎯 任务概述
当前仓库存在配置存储的 SQLite 与 JSON 双体系，需要先明确现状与目标范围。
本计划用于系统化收集上下文、梳理需求边界，并形成可执行的后续工作输入。

📋 执行计划
1. 读取现有计划与历史记录，提炼已有决策、未决问题与假设前提。
2. 盘点当前主进程配置存储实现与入口（读/写/订阅/广播），明确 JSON 存储路径与生命周期。
3. 盘点 SQLite 配置表结构与写入点，确认与 JSON 的字段范围重叠情况。
4. 梳理调用链与使用方（renderer、插件、核心模块），识别同步触发点与一致性要求。
5. 明确需求口径：同步方向、时序/冲突策略、迁移/回滚、兼容性与可观测性指标。
6. 输出需求清单与风险清单，并形成后续实现/测试的验收标准草案。

✅ 已决事项
- 本阶段仅做上下文与需求整理，目标是形成后续工作输入（来源: `plan/2026-01-20_18-55-03-context-requirements.md:14`）

❓ 未决问题
- 同步方向、时序/冲突策略、迁移/回滚方式仍需明确（来源: `plan/2026-01-20_18-55-03-context-requirements.md:21`）

🧩 假设前提
- 当前存在 SQLite 与 JSON 双配置存储并需统一梳理（来源: `plan/2026-01-20_18-55-03-context-requirements.md:13`）

⚠️ 风险与注意事项
- SQLite/JSON 双写或迁移策略不清晰可能引入数据不一致与回滚困难。
- 配置存储被多处依赖，改动需评估启动流程、IPC 通道与热更新行为。
- 需避免在 renderer 侧引入 main-only 依赖（Electron/Node）。

📎 参考
- `plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md:10`
- `apps/core-app/src/main/modules/storage/index.ts:84`
- `apps/core-app/src/main/db/schema.ts:279`
- `packages/utils/common/storage/index.ts:1`
- `packages/utils/renderer/storage/index.ts:1`
