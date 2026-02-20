# PRD 最终目标与质量约束基线

> 更新时间：2026-02-19  
> 适用范围：`docs/plan-prd/02-architecture`、`docs/plan-prd/03-features`、`docs/plan-prd/04-implementation`、`docs/plan-prd/06-ecosystem`

## 1. 目的

统一活跃 PRD 的编写与验收标准，避免“有方案无目标、有实现无质量门禁”。  
从本文件生效后，新增或继续推进的 PRD 均应满足下述最小结构。

## 2. 每个活跃 PRD 必须包含的章节（MUST）

1. **最终目标（Final Goal / North Star）**
   - 以可测量结果表达，而不是泛化描述；
   - 至少给出 1 个业务目标 + 1 个工程目标。

2. **范围与非目标（Scope / Non-goals）**
   - 明确本期做什么、不做什么；
   - 防止需求膨胀与任务漂移。

3. **质量约束（Quality Constraints）**
   - 至少包含：类型安全、错误处理、性能预算、回归验证。

4. **验收标准（Acceptance Criteria）**
   - 以可验证结果描述；
   - 建议“功能验收 + 质量验收 + 文档验收”三段式。

5. **回滚与兼容策略（Rollback / Compatibility）**
   - 失败时如何退回；
   - 对旧接口、旧数据、旧行为影响说明。

## 3. PRD 质量约束最小集合（MUST）

### 3.1 类型与调用约束
- 不得新增未类型化的跨层通信。
- 优先复用 domain SDK，禁止新增 raw event 字符串分发。

### 3.2 可靠性约束
- 关键路径需有显式错误处理与用户可见反馈。
- 对异步流程必须定义超时与失败回退。

### 3.3 性能约束
- 为关键路径提供预算（如启动、搜索响应、任务执行耗时）。
- 避免在主线程引入长时间同步阻塞。

### 3.4 安全与数据约束
- 遵守 Storage/Sync 规则：SQLite 本地 SoT，JSON 仅同步载荷。
- 禁止敏感信息明文落地到 localStorage/JSON/日志。

### 3.5 文档约束
- PRD 状态变化（进行中/完成/归档）必须同步 `README.md` 与 `TODO.md`。
- 对外行为变化必须同步 Nexus 对应开发文档。

## 4. 验收执行模板（建议复制到 PRD）

```md
## 验收清单
- [ ] 功能验收：核心功能按场景通过
- [ ] 质量验收：typecheck/lint/test 通过（或明确既有失败项）
- [ ] 性能验收：关键指标在预算范围内
- [ ] 安全验收：敏感数据与权限路径符合规则
- [ ] 文档验收：README/PRD/TODO/Nexus docs 已同步
```

## 5. 与现有文档的关系

- 产品层目标与节奏：`docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 项目索引与未闭环能力：`docs/plan-prd/README.md`
- 执行任务清单：`docs/plan-prd/TODO.md`
- 变更归档：`docs/plan-prd/01-project/CHANGES.md`
