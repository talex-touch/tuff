---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: Config storage SQLite/JSON sync strategy (implementation plan)
complexity: complex
planning_method: builtin
created_at: 2026-01-20T18:47:35+08:00
---

# Plan: Config Storage Strategy (SQLite + JSON)

🎯 任务概述  
在既有 JSON 配置体系的基础上，引入 SQLite 作为本地高频读写与结构化查询的主存储；  
需要跨设备同步的配置继续以 JSON 为主源，并通过可控的双写/迁移策略保证一致性与可回滚性。

📋 执行计划  
1. 盘点配置项与读写路径  
   - 罗列 `StorageList` 所有 key 与读写入口，标注来源（main/renderer/plugin）。  
   - 输出“配置项清单表”：key、默认值、访问频率、敏感性、是否需同步。  
2. 分类与策略决策  
   - `local-only`：默认 SQLite；`sync-needed`：默认 JSON；`dual`：迁移/灰度期双写。  
   - 明确读优先级：SQLite 优先（缺失回退 JSON），或 JSON 优先（仅 cache SQLite）。  
3. 统一访问层设计  
   - 在 `StorageModule` 内新增 `ConfigRepository`（或子类）统一 `get/save/subscribe`。  
   - 保留 legacy IPC 与 JSON 文件格式，避免破坏既有 API。  
4. 迁移与回滚  
   - 启动时对 `sqlite` 类 key 执行一次性 JSON→SQLite 导入。  
   - 为每个 key 增加 `migrationStamp`，支持回滚到 JSON 主源。  
5. 同步与一致性  
   - `sync-needed` 维持 JSON 主源，SQLite 可作为 cache（可选）。  
   - 冲突策略：main 内写入强一致，跨窗口按版本号比较，保留现有规则。  
6. 观测与测试  
   - 记录 SQLite 写入失败/慢写入日志；补迁移/回退/冲突测试。  
   - 选择 1–2 个低风险 key 扩大 pilot，再逐步扩大范围。  
7. 文档与进度更新  
   - 补齐 `plan` 与 `docs/plan-prd` 中的策略与完成度标记。  

✅ 方案决策  
- JSON 保持“同步主源”，SQLite 作为“本地高频主存储”。  
- 迁移采用“启动导入 + 缺失回退 + 双写灰度”的方式。  
- 先扩大 `SQLITE_PILOT_CONFIGS`，验证后再批量扩展。  

⚠️ 风险与注意事项  
- 双写策略不清晰可能引入数据漂移，需要明确读写优先级。  
- 迁移过程中回退策略必须可执行，否则影响稳定性。  
- 高频读写场景需关注性能与锁竞争。  

📎 参考  
- `apps/core-app/src/main/modules/storage/index.ts`  
- `apps/core-app/src/main/db/schema.ts`  
- `packages/utils/renderer/storage/base-storage.ts`  
- `packages/utils/plugin/sdk/storage.ts`  
