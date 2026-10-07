# TODO 长期债务池（Long-term Backlog）

> 更新时间：2026-10-02
> 说明：本文承接 `docs/plan-prd/TODO.md` 的非 2 周执行项。主 TODO 只保留当前 release window；本页只保留长尾债务与后续专题。

## A. 架构与质量债务

- [x] Transport Wave A：MessagePort 高频通道迁移、`sendSync` 清理与 retained raw event 分批 typed builder 迁移。（承接：[Transport Wave A](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-07/07-17-transport-wave-a/prd.md)，已归档任务记录）
- [x] Transport Wave A：legacy alias registry、legacy hit evidence 与双监听关闭条件。（承接：[Transport Legacy Cutover Evidence](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-07/07-17-transport-legacy-cutover-evidence/prd.md)，已归档任务记录）
- [ ] AI Wave B：`retired-ai-app` 存量 typecheck/lint 债务逐批清理。
- [ ] AI Wave B：SSE 断线、鉴权与渠道矩阵集成回归补齐。
- [ ] SRP Wave C：`plugin-module`、`search-core`、`file-provider` 大文件职责拆分。
- [ ] Runtime Safety：动态执行边界治理，优先评估算式 evaluator、单位公式 evaluator 与 widget runtime sandbox 的替换、审计和回归策略。
- [ ] Storage：配置域 SQLite SoT 迁移与 fallback 回归补齐。
- [ ] Quality：`quality:release` 被既有 lint debt 阻断的项分批清退或显式降权。
- [ ] Composer：深色（非高对比）主题下，权限弹层「完全允许」第一次点击后出现的确认提示（11px，`--shell-danger` 叠在 danger-soft 行底上）对比度约 4.1:1，低于 WCAG AA 小字的 4.5:1。浅色约 4.6:1，两种高对比主题都达标。（`HomePermissionMenu.vue`；来源：2026-10-06 composer 改版验收）
- [ ] TuffEx：TxSwitch 的 `.tuff-switch__track` 和 `__thumb` 用的是 `transition: all 0.25s`，`visibility` 也会参与过渡。开关放在会收起的锚点弹层里时，弹层的 clip 已经是 hidden，开关还会多显示约 250–500ms，留下残影（在 composer 的「管理智能体」视图里可以复现）。改为只过渡具体属性，并同步 Nexus 文档。（来源：2026-10-06 composer 改版验收）
- [ ] Quality：`apps/core-app/scripts/coreapp-packaged-tool-confirmation-acceptance.ts` 及其测试仍在用 composer 改版删掉的选择器（`.HomePermissionMenu-Pill`、`.is-info`、ComposerChip 的 `tx-text-transformer` 层），其中模型菜单的选择器在改版前就已对不上。这份脚本不在 CI 里，下次跑打包验收前要先更新。（来源：2026-10-06 composer 改版验收）
- [ ] Composer：顶栏模型胶囊（`HomeTopBar.vue`）的可访问名称是「选择模型与推理强度」，不包含可见的模型名，不满足 label-in-name。（来源：2026-10-06 composer 改版验收）
- [ ] CoreApp：「智能 · 模型渠道」设置页（`IntelligenceChannelsPage` 的 `useKeyboardNavigation`）在 document 上挂了 keydown，会对 Space 和方向键调用 `preventDefault`。页面被 KeepAlive 缓存后监听不会卸载，切到别的页面后 Space 不能激活按钮、方向键也失效，要整页重载才恢复。模型弹层的设置键会直接进入这个页面。（来源：2026-10-06 composer 改版验收）
- [ ] TuffEx：高对比主题下，获得焦点的 TxSearchInput 同时显示圆角外框和输入元素自身的矩形焦点框，形成双重焦点框。（来源：2026-10-06 composer 改版验收）
- [ ] Composer：从有历史的对话里选 Agent profile 时，`selectAgentProfile`（`HomePage.vue`）会先把 profileId 写进源对话会话（mode 仍为 chat），再 fork。这是因为 Main 的 fork 只替换 mode；结果是源会话留下持久化的副作用，而且这段逻辑没有单测。（来源：2026-10-06 composer 改版验收）

## B. 插件与 View 生态

- [ ] View Mode：`plugin-core` 结构拆分，保持兼容，不引入破坏性接口。
- [ ] View Mode：生命周期与安全矩阵回归持续补样本。
- [ ] AttachUIView：Warm/Cold 分层、Score 模型、可视化调试工具。
- [ ] Multi Attach View：并行视图容器与布局切换能力。
- [ ] Widget Sandbox：clipboard/history/location/postMessage/worker 扩展拦截。
- [ ] Widget Sandbox：调用限额与审计记录。
- [ ] Plugin Capability：`touch-workspace-scripts` 用户 shell 命令纳入统一 capability/permission/audit/unsupported reason 模型。

## C. 产品能力闭环

- [ ] Flow Transfer：审计日志与失败原因记录。
- [ ] Flow Transfer：sender/receiver 测试插件与开发文档补齐。
- [ ] DivisionBox：prepare/attach/detach 生命周期语义文档深化。
- [ ] Intelligence Agents：Workflow 编辑器、完整 Review Queue、记忆系统治理与高级协作能力。
- [x] AI：strict 错误码端到端回归（SSE `code/message/reason/recovery` 覆盖 pre/post-delta；HTTP status/body 覆盖 auth、invalid、quota、provider、network 与 unknown，并保留 CoreApp network policy）。
- [x] AI：`/api/admin/intelligence-agent/session/stream` 持续分块 smoke 曾覆盖首帧在 graph 完成前可读、后续帧有序及唯一 done；historical `/api/chat/sessions/:sessionId/stream` 在当前仓库不存在，不再把缺失路由记为已交付。（2026-10-02 已退役：该入口与后台 Agent 运行时一并删除，见 CHANGES 2026-10-02。）
- [x] AI：selected-days canonical `errorCode` distribution API 曾补齐，current/legacy Agent audit 中的 explicit code 与 message-only failure 都会归一化且不返回 raw stack/message；historical `AIAPP_STRICT_MODE_UNAVAILABLE` 在当前仓库没有 producer，不再作为有效指标。（2026-10-02 已退役：分析页 AI 面板、该接口与 `listRuntimeAudits()` 一并删除，见 CHANGES 2026-10-02。）剩余的 Dashboard 可视化与告警阈值随之关闭。
- [ ] Intelligence：`video.generate` 当前并非“仅缺真实 Provider runtime”——capability enum/alias、payload/result、typed SDK domain、provider adapter、异步 job 状态/取消/产物合同、UI 与成功路径均不存在。实现前先确定 provider 与异步生命周期，禁止先暴露会稳定返回 unsupported 的空 SDK。
- [x] AI：移除 default Nexus `audio.tts` 假能力与首选 binding，并迁移已存 stale 配置；真实 OpenAI/SiliconFlow TTS 继续可用，Nexus 待 server runtime 成功路径落地后再广告。

## D. 发布与生态

- [ ] Build Signature：OIDC + RSA 签名信任链增强（`>=2.5.0`）。
- [ ] Nexus 支付多渠道 provider 抽象与回调联调。
- [ ] TuffEx：源码包构建/测试/审计与 Nexus 展示门禁持续收敛。
- [x] `@talex-touch/unplugin-export-plugin` CLI shim 已退场；仅保留 Vite/Webpack/Rollup/Esbuild/Nuxt 集成，`tuff` 为唯一 CLI。
- [ ] 插件发布：package policy/security scan 与真实 `.tpex` 上传端到端证据。

## E. 文档治理持续项

- [ ] 文档治理自动门禁重建评估：若需要恢复 `docs:guard` / compat registry / legacy allowlist / size allowlist，先重新立项并落地脚本、清册与入口文档同步。
- [ ] 历史 PRD 分批加 `Status: Archived/Historical` 头标与替代入口。
- [ ] 长专题文档持续执行 `TL;DR + deep-dive` 分层模板。
- [ ] `CHANGES.md` 只保留近 30 天；历史按月归档。
- [ ] `docs/engineering` 计划/报告只保留索引与仍有效证据，历史内容归档。

## 历史完成索引

- AI 附件慢链路与 Admin 设置合并已完成：附件投递按 `id > https url > base64`，`/admin/*` 成为管理主入口。
- AI 路由历史记录已按当时实现校正：仓库不存在 `/api/chat/sessions/:sessionId/stream`；Dashboard Agent 当时唯一的流式执行入口为 `/api/admin/intelligence-agent/session/stream`，运行 trace 通过 `/api/admin/intelligence-agent/session/trace` 按 `fromSeq` 查询。（2026-10-02 已退役：该入口与后台 Agent 运行时一并删除，见 CHANGES 2026-10-02。）
- Dashboard Agent UI 曾直接消费 live SSE；历史恢复通过 trace GET 的 `fromSeq + limit` 分页读取，没有 `follow` 参数。页面已于 2026-10-01 删除，运行时与接口于 2026-10-02 删除。
- Intelligence 多模态配置、Websearch 聚合和模型组能力治理已有基础实现；剩余项还包括 Agent Workflow/Review Queue/记忆治理、strict-mode 运维看板与 `video.generate` 真实运行时，不再使用“仅剩 video”结论。
- 2.4.8 OmniPanel Gate、v2.4.7 Gate A/B/C/D/E、2.4.9 插件完善主线均为 historical done。

## 关联入口

- 当前主清单：`docs/plan-prd/TODO.md`
- 变更记录：`docs/plan-prd/01-project/CHANGES.md`
- PRD 主入口：`docs/plan-prd/README.md`
- 质量基线：`docs/plan-prd/PRD-QUALITY-BASELINE.md`
