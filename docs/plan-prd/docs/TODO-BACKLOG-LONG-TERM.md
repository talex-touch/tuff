# TODO 长期债务池（Long-term Backlog）

> 更新时间: 2026-03-16
> 说明: 本文承接 `docs/plan-prd/TODO.md` 长尾事项，避免主清单过载。

## A. 架构与质量债务

- [ ] Wave A（Transport）: MessagePort 高频通道迁移与 `sendSync` 清理。
- [ ] Wave A（Transport）: 兼容层降权与 `transport/legacy` 使用面持续收敛。
- [ ] Wave B（Pilot）: `apps/pilot` 存量 typecheck/lint 逐批清理。
- [ ] Wave B（Pilot）: SSE 断线、鉴权与渠道矩阵集成回归补齐。
- [ ] Wave C（SRP）: `plugin-module` 大文件职责拆分。
- [ ] Wave C（SRP）: `search-core` 与 `file-provider` 继续拆分。
- [ ] Storage: 配置域 SQLite SoT 迁移与 fallback 回归补齐。

## B. 插件与 View 生态

- [ ] View Mode: `plugin-core` 结构拆分（保持兼容，不引入破坏性接口）。
- [ ] View Mode: 生命周期与安全矩阵回归持续补样本。
- [ ] AttachUIView: Warm/Cold 分层、Score 模型、可视化调试工具。
- [ ] Multi Attach View: 并行视图容器与布局切换能力。
- [ ] Widget Sandbox: clipboard/history/location/postMessage/worker 扩展拦截。
- [ ] Widget Sandbox: 调用限额与审计记录。

## C. 产品能力闭环

- [ ] Flow Transfer: 审计日志与失败原因记录。
- [ ] Flow Transfer: sender/receiver 测试插件与开发文档补齐。
- [ ] DivisionBox: prepare/attach/detach 生命周期语义文档深化。
- [ ] Intelligence Agents: Workflow 编辑器与高级协作能力。
- [ ] Intelligence Agents: 记忆系统治理与回归补齐。

## D. 发布与生态

- [ ] Build Signature: OIDC + RSA 签名信任链增强（`>=2.5.0`）。
- [ ] Nexus 支付多渠道 provider 抽象与回调联调。
- [ ] TuffEx: 构建与 docs:build 门禁持续收敛。
- [ ] `@talex-touch/unplugin-export-plugin` CLI shim 在 `2.5.0` 退场。

## E. 文档治理持续项

- [ ] `docs:guard` 升级 strict 阻塞前置条件达成（连续 N 次零告警）。
- [ ] 历史 PRD 分批加“历史/待重写”头标与替代入口。
- [ ] 长专题文档持续执行“TL;DR + deep-dive”分层模板。

## 关联入口

- 当前主清单：`docs/plan-prd/TODO.md`
- 变更记录：`docs/plan-prd/01-project/CHANGES.md`
- 质量基线：`docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
