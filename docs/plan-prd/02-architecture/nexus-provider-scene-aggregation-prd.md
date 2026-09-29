# PRD: Nexus Provider 聚合与 Scene 编排重构

> 状态：Implemented / Production DDL Pending
> 更新时间：2026-09-28

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
- Provider Registry 已成为唯一 Provider 事实源；旧 `intelligence_providers` runtime、镜像桥与旧 CRUD/同步接口已删除。
- Provider 显式声明 `metadata.adapterKey`，默认模型必须属于模型列表；Scene binding 持久化所选模型。
- Generic invoke/stream、管理台 Chat、Docs Assistant 与 DashScope ASR 均从 Scene + Registry 解析渠道。
- system scope 对已登录用户开放并统一扣 Credits；user scope 限 owner；workspace scope 未有权威身份时关闭失败。
- composed capability 链式编排：`vision.ocr -> text.translate -> overlay.render`。
- `provider_usage_ledger`、`provider_health_checks`、Scene readiness/degraded reason 与安全串行 fallback 已落地。

## 4. 剩余运维闭环

- 生产 D1 在备份与 Registry/Scene/credential readiness 门禁通过后，使用受保护脚本单独删除旧 `intelligence_providers` 表；应用启动不执行破坏性 DDL。
- 对生产聚合上游执行一次真实 text.chat、text.translate、vision.ocr 与 audio.transcribe 验收及 Credits 对账。
- success rate、quota、dynamic pricingRef 等高级自动策略不属于本次范围；Nexus 仅保留 Scene priority + 安全串行 fallback。

## 5. Scope / Non-goals

### Scope

- Provider registry、Capability、Scene、Binding、Strategy、Metering、Health、Usage Ledger。
- 汇率、AI、文本翻译、图片/截图翻译场景逐步迁移。
- CoreApp 使用登录态 Scene runtime API 消费能力。

### Non-goals

- 不在 Nexus 内实现加权、随机、并发、成本或延迟负载均衡；聚合上游自行处理其内部负载。
- 不改变当前 Nexus Credits 价格与支付策略。
- 不把 `overlay.render` 变成云端能力；它保持本地 capability。
- 不在应用启动时自动删除生产 D1 旧表。

## 6. 质量约束

- 密钥只允许 secure store / `authRef`，禁止普通 metadata 明文保存。
- Provider check / Scene run 不保存敏感原文。
- 新增 runtime API 必须返回明确 unavailable/degraded reason，不得伪成功。
- Dashboard/API 变更需最近路径 typecheck/test。
- 文档同步：README、TODO、CHANGES、INDEX、Roadmap、Quality Baseline 保持入口一致。

## 7. 验收清单

- [x] Provider registry 支持新增/编辑/禁用/删除 provider 与 capability。
- [x] Scene 支持 binding model、priority、fallback、dry-run、execute 与 degraded readiness。
- [x] Secret 只进入 secure store / `authRef`，不进入普通 metadata 或日志。
- [x] AI、汇率、文本翻译、图片/截图翻译与 ASR 进入 Registry + Scene 路由。
- [x] Health / Usage ledger 可查询 latency、稳定 error、degraded reason 与 usage metadata。
- [x] 旧 AI Provider runtime、镜像桥、旧 CRUD/同步接口退场；生产 DROP 由单独受保护脚本执行。
- [ ] 生产聚合上游真实调用与 Credits 对账完成。

## 8. 关联入口

- 当前执行清单：`../TODO.md`
- 产品路线图：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- AI 2.5 PRD：`../03-features/ai-2.5.0-plan-prd.md`
- 变更日志：`../01-project/CHANGES.md`
