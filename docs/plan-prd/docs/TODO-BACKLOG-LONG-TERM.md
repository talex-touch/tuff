# TODO 长期债务池（Long-term Backlog）

> 更新时间：2026-05-15
> 说明：本文承接 `docs/plan-prd/TODO.md` 的非 2 周执行项。主 TODO 只保留当前 release window；本页只保留长尾债务与后续专题。

## A. 架构与质量债务

- [ ] Transport Wave A：MessagePort 高频通道迁移、`sendSync` 清理与 retained raw event 分批 typed builder 迁移。
- [ ] Transport Wave A：legacy alias registry 进入 hard-cut 窗口前，补 legacy hit evidence 与双监听关闭条件。
- [ ] AI Wave B：`retired-ai-app` 存量 typecheck/lint 债务逐批清理。
- [ ] AI Wave B：SSE 断线、鉴权与渠道矩阵集成回归补齐。
- [ ] SRP Wave C：`plugin-module`、`search-core`、`file-provider` 大文件职责拆分。
- [ ] Storage：配置域 SQLite SoT 迁移与 fallback 回归补齐。
- [ ] Quality：`quality:release` 被既有 lint debt 阻断的项分批清退或显式降权。

## B. 插件与 View 生态

- [ ] View Mode：`plugin-core` 结构拆分，保持兼容，不引入破坏性接口。
- [ ] View Mode：生命周期与安全矩阵回归持续补样本。
- [ ] AttachUIView：Warm/Cold 分层、Score 模型、可视化调试工具。
- [ ] Multi Attach View：并行视图容器与布局切换能力。
- [ ] Widget Sandbox：clipboard/history/location/postMessage/worker 扩展拦截。
- [ ] Widget Sandbox：调用限额与审计记录。

## C. 产品能力闭环

- [ ] Flow Transfer：审计日志与失败原因记录。
- [ ] Flow Transfer：sender/receiver 测试插件与开发文档补齐。
- [ ] DivisionBox：prepare/attach/detach 生命周期语义文档深化。
- [ ] Intelligence Agents：Workflow 编辑器、完整 Review Queue、记忆系统治理与高级协作能力。
- [ ] AI：strict 错误码端到端回归（HTTP status + SSE payload）。
- [ ] AI：`/api/chat/sessions/:sessionId/stream` 反向代理持续分块 smoke。
- [ ] AI：`AIAPP_STRICT_MODE_UNAVAILABLE` 告警阈值与 7 天趋势看板。
- [ ] Intelligence：`video.generate` 真实 Provider 运行时与端到端成功路径。

## D. 发布与生态

- [ ] Build Signature：OIDC + RSA 签名信任链增强（`>=2.5.0`）。
- [ ] Nexus 支付多渠道 provider 抽象与回调联调。
- [ ] TuffEx：构建与 docs:build 门禁持续收敛。
- [ ] `@talex-touch/unplugin-export-plugin` CLI shim 在 `2.5.0` 退场。
- [ ] 插件发布：package policy/security scan 与真实 `.tpex` 上传端到端证据。

## E. 文档治理持续项

- [ ] 文档治理自动门禁重建评估：若需要恢复 `docs:guard` / compat registry / legacy allowlist / size allowlist，先重新立项并落地脚本、清册与入口文档同步。
- [ ] 历史 PRD 分批加 `Status: Archived/Historical` 头标与替代入口。
- [ ] 长专题文档持续执行 `TL;DR + deep-dive` 分层模板。
- [ ] `CHANGES.md` 只保留近 30 天；历史按月归档。
- [ ] `docs/engineering` 计划/报告只保留索引与仍有效证据，历史内容归档。

## 历史完成索引

- AI 附件慢链路与 Admin 设置合并已完成：附件投递按 `id > https url > base64`，`/admin/*` 成为管理主入口。
- AI 路由 V2 与工具调用链路已完成：`/api/chat/sessions/:sessionId/stream` 为唯一执行入口，`run.audit`、审批票据、Websearch provider 池与图像意图闭环已落地。
- AI 旧 UI 会话卡片化与单流主链合并已完成：运行态卡片进入消息流，`fromSeq + follow` 按真实可恢复事件推进。
- Intelligence 多模态配置、Websearch 聚合和模型组能力治理已完成；未实现项仅保留 `video.generate` 真实运行时。
- 2.4.8 OmniPanel Gate、v2.4.7 Gate A/B/C/D/E、2.4.9 插件完善主线均为 historical done。

## 关联入口

- 当前主清单：`docs/plan-prd/TODO.md`
- 变更记录：`docs/plan-prd/01-project/CHANGES.md`
- PRD 主入口：`docs/plan-prd/README.md`
- 质量基线：`docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
