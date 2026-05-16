# PRD: Nexus Provider 聚合与 Scene 编排重构

> 状态：Architecture PRD / Partial Implementation
> 更新时间：2026-05-14
> 完整快照：`./archive/nexus-provider-scene-aggregation-prd.full-2026-05-14.md`

## 1. 最终目标

Nexus 升级为统一 Provider 聚合中心：Provider 独立声明 `Capability`，Scene 按具体使用场景组合 capability、路由策略、计量与审计。

目标是避免为每个场景维护孤立供应商模型，让汇率、AI 大模型、文本翻译、图片/截图翻译等能力统一进入 Provider registry。

## 2. 核心原则

- Provider 与 Scene 解耦：新增供应商进入 Provider registry，新增使用场景进入 Scene。
- Provider 只保存结构化 metadata 与 `authRef`；API key / secret 留在 secure store。
- Scene runtime 输出统一包含 output、usage、trace、ledger/audit metadata。
- Usage Ledger / Audit Trace 不保存原始截图、图片、完整 prompt 或完整模型响应。
- CoreApp 调用优先通过登录态 runtime API / SDK，不新增 raw channel。

## 3. 当前已落地

- Provider registry 基础 API 与 Dashboard Admin 配置面。
- D1 密文 secure store 与 `authRef`。
- Provider capability create/update/delete API。
- Scene dry-run / execute 面板。
- Dashboard Admin 默认 seed：系统级本地 `custom-local-overlay` provider 与 `corebox.screenshot.translate` Scene。
- 腾讯云 `text.translate` check 与图片翻译最小 adapter。
- 汇率 `fx.rate.latest` / `fx.convert` Scene adapter，CoreBox 汇率预览与 `/api/exchange/*` Scene 优先链路。
- Intelligence provider mirror 到通用 Provider Registry，能力归一为 `chat.completion` / `text.summarize` / `vision.ocr`。
- Provider Registry check 对 AI mirror 执行 `chat.completion` / `vision.ocr` 探活并写入 health 历史。
- OpenAI-compatible AI mirror 默认 `vision.ocr` adapter。
- composed capability 链式编排：`vision.ocr -> text.translate -> overlay.render`。
- `provider_usage_ledger` 与 `provider_health_checks` 查询视图。
- 最小策略路由：`priority/manual`、`least_cost`、`lowest_latency`、`balanced`。

## 4. 未闭环

- 旧 `intelligence_providers` 表退场已补实施计划：`../04-implementation/NexusIntelligenceProviderRetirement-2026-05-16.md`。仍需按 Phase 0/1 采集 dry-run/execute evidence，再推进 registry-primary reads 与最终删除窗口。
- user-scope AI mirror OCR 自动绑定策略。
- success rate、quota、dynamic pricingRef 成本估算等高级策略。
- 真实 provider 端到端验证与生产配置检查。
- 细化 Scene 级 metering/audit policy 与 Dashboard 可观测性。

## 5. Scope / Non-goals

### Scope

- Provider registry、Capability、Scene、Binding、Strategy、Metering、Health、Usage Ledger。
- 汇率、AI、文本翻译、图片/截图翻译场景逐步迁移。
- CoreApp 使用登录态 Scene runtime API 消费能力。

### Non-goals

- 不重写 Intelligence runtime。
- 不改变当前 Nexus 线上计费策略。
- 不把 `overlay.render` 绑定为云端能力；它可以是本地 capability。
- 不在 `2.4.10` 阶段抢占 Windows release evidence gate。

## 6. 质量约束

- 密钥只允许 secure store / `authRef`，禁止普通 metadata 明文保存。
- Provider check / Scene run 不保存敏感原文。
- 新增 runtime API 必须返回明确 unavailable/degraded reason，不得伪成功。
- Dashboard/API 变更需最近路径 typecheck/test。
- 文档同步：README、TODO、CHANGES、INDEX、Roadmap、Quality Baseline 保持入口一致。

## 7. 验收清单

- [ ] Provider registry 支持新增/编辑/禁用/删除 provider 与 capability。
- [ ] Scene 支持 binding、strategy、dry-run、execute。
- [ ] Secret 不进入普通 DB metadata 或日志。
- [ ] AI mirror、汇率、文本翻译、图片/截图翻译至少各有一条可复核路径。
- [ ] Health / Usage ledger 可查询 latency、error、degraded reason 与 usage metadata。
- [ ] 旧 AI provider 表退场方案明确，含迁移与回滚。
- [ ] 最近路径 typecheck/test 通过或记录既有失败项。

## 8. 关联入口

- 当前执行清单：`../TODO.md`
- 产品路线图：`../01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- AI 2.5 PRD：`../03-features/ai-2.5.0-plan-prd.md`
- 变更日志：`../01-project/CHANGES.md`
