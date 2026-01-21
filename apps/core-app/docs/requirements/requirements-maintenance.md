# 需求维护机制（Maintenance Workflow）

> 目标：定义新增需求的归档与同步流程，避免需求再次分散。

## 维护流程（标准步骤）

1. **登记来源**：将需求来源补充到 `requirements-sources.md`。  
2. **结构化抽取**：按模板填充字段并补充 `path:line` 证据。  
3. **去重与冲突**：检查是否与现有主题重复，必要时更新冲突清单。  
4. **分组与标签**：更新分组与标签清单。  
5. **现状对齐**：在对照表中标注完成度与证据路径。  
6. **依赖与顺序**：如影响顺序，更新执行顺序文档。  
7. **统一总表**：更新 `requirements-master.md` 的需求清单。  
8. **issues CSV**：创建或更新对应的 issues CSV 快照（状态唯一来源）。  

## 更新清单

- `apps/core-app/docs/requirements/requirements-sources.md`
- `apps/core-app/docs/requirements/requirements-template.md`
- `apps/core-app/docs/requirements/requirements-extract.md`
- `apps/core-app/docs/requirements/requirements-conflicts.md`
- `apps/core-app/docs/requirements/requirements-grouping.md`
- `apps/core-app/docs/requirements/requirements-coverage.md`
- `apps/core-app/docs/requirements/requirements-sequence.md`
- `apps/core-app/docs/requirements/requirements-master.md`
- `apps/core-app/issues/*.csv`

## 约束

- 状态权威来源仅限 issues CSV。  
- 所有引用必须是 `path:line`。  
- 每次变更需记录日期与变更点。  
