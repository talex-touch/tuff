# Docs & Process 质量分析

## 文档完整性与落地性
- `docs/INDEX.md:15` 记录多份未完成或未发现文档（`plan-prd/06-ecosystem/*`、`view-mode-prd` 等）  
  **影响**：需求落地路径不透明，后续研发缺少统一依据。

- `docs/engineering/todo.md:1` 明确存在工程 TODO 清单  
  **建议**：引入 owner 与截止日期，避免长期堆积。

## PRD/TODO 对齐风险
- `docs/plan-prd/04-implementation/config-storage-unification.md:66/67/73/83/97` 多处 `TBD/pending`  
  **影响**：核心配置与同步策略未收敛，导致实现无法稳定推进。  
  **建议**：与代码侧 owner 对齐后更新 PRD 状态，并补充迁移策略。

- `docs/plan-prd/next-edit/需求汇总-PRD状态梳理-下载链路统一-SDK优先-文档落地.md:6/12`  
  明确强调 PRD/TODO 状态需要与代码同步  
  **建议**：建立“代码变更→PRD/TODO 同步” checklist。

## 需求执行清单散落
- `docs/plan-prd/README.md:17` 指向 `docs/plan-prd/TODO.md`  
  **建议**：将高优先级需求与代码 TODO 关联（路径 + line）以便追踪。

## 结论
当前文档体系中 “计划/状态/实现” 的同步仍偏人工，建议建立轻量化门禁（PR 模板或 CI 校验）来保证状态一致性。
