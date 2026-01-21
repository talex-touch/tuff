# 需求来源清单（Requirements Sources Index）

> 目标：把分散在仓库各处的需求输入汇总为统一入口，作为后续“需求总表”和执行顺序编排的来源索引。
> 适用范围：talex-touch monorepo（含 apps/core-app）。

## 核心来源（必须纳入）

1. `plan/`（仓库根目录）
   - 类型：执行计划（plan）
   - 说明：所有 /prompts:plan 生成的计划文档。
   - 使用方式：读取 `plan/*.md`，提取任务目标、步骤、风险、参考路径。

2. `apps/core-app/plan/`
   - 类型：core-app 本地计划快照
   - 说明：针对 core-app 的局部计划产物。
   - 使用方式：与根目录 plan 同步纳入抽取范围。

3. `docs/plan-prd/`
   - 类型：PRD / 设计与实现计划
   - 说明：功能需求、范围、实现建议与里程碑。
   - 使用方式：重点抽取“目标/非目标/验收标准/风险/范围边界”。

4. `issues/`
   - 类型：任务边界快照（CSV）
   - 说明：可协作维护的任务状态源，包含验收口径与 review 要求。
   - 使用方式：以 CSV 为权威状态，抽取任务边界与状态。

5. `docs/engineering/monorepo-standards.md`
   - 类型：工程规范
   - 说明：约束/流程/命名规范等工程层面的硬性要求。
   - 使用方式：作为“跨需求约束”归档，关联到所有受影响需求。

6. `AGENTS.md`
   - 类型：执行约束与工作流规范
   - 说明：AI/自动化执行规则，包含风险操作确认、语言规范、工具优先级等。
   - 使用方式：作为需求执行的全局约束，必须关联到所有任务。

## core-app 私有文档入口（已确认）

- `apps/core-app/README.md`：核心应用说明与入口摘要。
- `apps/core-app/docs/compatibility-legacy-scan*.md`：兼容性扫描与分析结论。
- `apps/core-app/docs/script-native-bridge.md`：脚本与原生桥接说明。
- `apps/core-app/src/main/modules/analytics/README.md`：分析模块说明。
- `apps/core-app/src/main/modules/ai/README.md`：AI 模块说明。
- `apps/core-app/src/main/modules/ai/capability-testers/README.md`：能力测试说明。
- `apps/core-app/src/main/modules/box-tool/search-engine/README.md`：搜索引擎说明。
- `apps/core-app/src/main/modules/download/README.md`：下载模块说明。
- `apps/core-app/src/renderer/src/modules/storage/README.md`：存储模块说明。
- `apps/core-app/src/renderer/src/assets/docs/protocol.md`：协议说明。
- `apps/core-app/src/renderer/src/assets/docs/license.md`：许可说明。

## 补充来源（按需纳入）

- `docs/`（仓库根目录其他文档）
  - 说明：可能包含架构、平台差异、专项说明（例如第三方集成）。
  - 使用方式：出现相关需求时按主题纳入抽取范围。

## 非典型入口（观察项）

- `.spec-workflow/`、`.workflow/`、`.kiro/`、`.serena/` 等目录
  - 说明：多为流程/工具产物；默认不视为需求来源，但需要在发现需求线索时回溯。

## 维护说明

- 新增需求来源时，必须更新本清单并标注用途与抽取范围。
- 任何需求抽取都应引用来源路径（`path:line`），确保可追溯与可审计。
- 最后更新：2026-01-21
