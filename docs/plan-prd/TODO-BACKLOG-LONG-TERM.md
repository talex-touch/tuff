# TODO 长期债务池（Long-term Backlog）

> 更新时间：2026-11-23
> 说明：本文承接 `docs/plan-prd/TODO.md` 的非 2 周执行项。主 TODO 只保留当前 release window；本页只保留长尾债务与后续专题。

## A. 架构与质量债务

- [x] Transport Wave A：MessagePort 高频通道迁移、`sendSync` 清理与 retained raw event 分批 typed builder 迁移。（承接：[Transport Wave A](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-07/07-17-transport-wave-a/prd.md)，已归档任务记录）
- [x] Transport Wave A：legacy alias registry、legacy hit evidence 与双监听关闭条件。（承接：[Transport Legacy Cutover Evidence](https://github.com/talex-touch/tuff/blob/0ca5b37b8c4a8e177b6dc0ac06f30e51c5ea748e/.trellis/tasks/archive/2026-07/07-17-transport-legacy-cutover-evidence/prd.md)，已归档任务记录）
- [x] AI Wave B：`retired-ai-app` 已彻底移除并退役关闭（2026-11-17 核对确认 `apps/` 下已无该目录或残留包，无需继续清退其 typecheck/lint 债务）。
- [ ] AI Wave B：SSE 断线、鉴权与渠道矩阵集成回归补齐。
- [ ] SRP Wave C：`plugin-module`、`plugin`、`search-core`、`app-provider`、`file-provider` 大文件职责拆分。截至 2026-11-17：`file-provider.ts` 已由 4,073 行降至 **3,195 原始行 / 2,790 代码行**（Step 2 历史迁移下沉已落地，`indexRowStore` / `subtree-persist` 已抽离，余 Step 1 588 行构造器、Step 3 分库路由收敛及 Step 4 四角色拆分 + `F1–F3`，见 [`file-provider-architecture-refactoring-analysis-2026-10-18.md`](../engineering/reports/file-provider-architecture-refactoring-analysis-2026-10-18.md)）；同步纳入 `.github/module-size-ratchet.json` 止血的巨石模块包括 `app-provider.ts`（4,582 原始行 / 3,878 代码行）、`plugin.ts`（3,854 原始行 / 3,244 代码行）、`plugin-module.ts`（3,568 原始行 / 3,322 代码行，新增棘轮）与 `search-core.ts`（2,850 原始行 / 2,405 代码行，自 ~1,880 回涨，新增棘轮）。
- [x] Runtime Safety：动态执行边界治理已闭环（2026-10-18）。C1 已彻底剥离 mathjs 死依赖；CoreBox 算式采用手写有限深度 SafeMathParser（无 eval/Function，限深 32、限长 240），单位换算采用纯静态代数算子字典；widget runtime sandbox 采用严格 CSP、词法 AST 阻断、原型与构造器 Proxy 封禁。
- [ ] Storage：配置域 SQLite SoT 主迁移已默认启用（`0029_app_config_sot.sql` 与 `ApplicationConfigRepository` 默认使用 `'sqlite'`），仅剩 `TALEX_CONFIG_STORAGE_BACKEND=legacy` 与 `TALEX_CONFIG_LEGACY_MIRROR` 双写镜像在稳定版覆盖确认后的退场窗口及单测清理。
- [ ] Quality：`quality:release` 已于 2026-09-13（见 [`release-gate-and-worktree-closeout-2026-09-13.md`](../engineering/reports/release-gate-and-worktree-closeout-2026-09-13.md)，历史基线 `55da5867d` / `da19acba8`）5/5 段通过并已在 `.github/workflows/build-and-release.yml` 强制执行；2026-11-23 已通过 PR `#2252`（`2ee7b2f9d`）补齐 `apps/tuff-analyse/package.json` 包级 `lint`/`lint:fix` 脚本并清理 `.github/workflows/ci.yml` 中关于 `docs_verify`（#1254）的过时注释，同步完成并关闭破坏性 Dependabot 升级 `#2184`（`@electron/asar` `4.3.2`）、`#2180`（`objc2` `=0.6.5`）与 `#2178`（`vue-router` `^5.5.0`，PR `#2256`，`82f4decad`）；当前精确残余工程债务仅剩 `apps/core-app/eslint.config.mjs` 对 `src/renderer/**/*.{ts,mts,tsx,vue}` 与 `**/*.{ts,mts,tsx}` 设 `@typescript-eslint/no-explicit-any: 'warn'`（及 `**/*.{ts,mts,tsx,js,mjs,cjs}` `@typescript-eslint/no-unused-vars: 'warn'`）与根 `scripts/lint.mjs` `--max-warnings=0` 的口径对齐。
- [x] Composer：深色普通主题下权限弹层确认提示对比度已修（2026-10-18）。`HomePermissionMenu.vue` 将小字颜色混合至正文色，真实深色像素采样对比度达到 5.44:1，浅色达到 6.41:1，均达标 WCAG AA 4.5:1。
- [x] TuffEx：TxSwitch 移除 `.tuff-switch__track` 的 `transition: all`（2026-10-18）。仅对 `box-shadow` 保留过渡，thumb 填充移至 `::before` 仅淡出透明度；真实浏览器测量弹层收起后 16ms 立即为 `hidden`，消除 250~500ms 残影；对应 Nexus 文档已同步。
- [ ] Quality：`coreapp-packaged-tool-confirmation-acceptance.ts` 的旧选择器已修（2026-10-18），完整 packaged 重跑仍待运行窗口。权限胶囊改用实际 `.HomePermissionMenu-Chip` 与精确 `data-mode=review`，不以“不危险”冒充审查模式；模型菜单按实际来源 tab、provider/model 标记选择，读取直接标签以排除动画 ghost。验收脚本 33 项、权限及模型组件 42 项通过；真实浏览器以生产 `submitControlledTurn` 配合实际权限组件验证 review 可发送、off 拒绝且不增加发送计数，gateway 为受控夹具，未宣称真实工具宿主或签名包通过。
- [x] Composer：顶栏模型胶囊 label-in-name 已修（2026-10-18）。`HomeTopBar.vue` 将 `aria-label` 设为 `home.model · modelName`，完全包含可见模型名称。
- [x] CoreApp：渠道页键盘监听泄漏已修（2026-10-18）。`useKeyboardNavigation` 在 KeepAlive 停用时解绑、恢复时幂等绑定，只有配置回调的按键才阻止默认行为。真实浏览器加载当前组合函数与 Vue KeepAlive：修前离页后 Space 被吞且 ArrowDown 仍触发导航；修后两页按钮均可用 Space 激活，离页 ArrowDown 不触发，返回后单次触发，输入框方向键保持原生行为。此为真实组件生命周期 smoke，不是签名安装包验收。
- [x] TuffEx：高对比主题下 TxSearchInput 双重焦点框已修（2026-10-18）。高对比下将单一外框 outline 赋给 `.tx-search-input.is-focused` 并消除内部 input 的全局 `box-shadow`；真实浏览器实测证实双重矩形焦点消除，仅保留单一高对比焦点环；对应 Nexus 文档已同步。
- [x] Composer：Agent profile 分叉改为 child-only override（2026-10-18）。`WorkspaceForkRequest.profileId` 经主进程校验后只写子会话 settings；HomePage 不再先配置源会话。真实 SQLite 回归验证子配置、父 settings/revision/messages 不变，以及非法锚点拒绝后完整数据库无变化；相关 30 项回归和渲染层类型检查通过。未在用户正式会话创建分支，不代表签名包验收完成。
- [x] CoreApp / TuffEx：UnoCSS 白名单剥离与图标按需 classGlyph 渲染已落地（2026-10-18）。`apps/core-app/uno.config.ts` 已彻底剥离全量 `ICON_CATALOG_CLASSES` safelist 及模块依赖；TxIcon 接入 `classGlyph` 优先解析 SVG 路径，`IntelligenceProviderHeader`、`ProviderList`、`IntelligenceItem`、`IntelligenceChannelsPage`、`AuditBreakdownCard` 与 `TxIconPicker` 局部提供 `provideIconPickerGlyphs()`；IconPicker 接入 AI/品牌/图标分块懒加载与 12 种形状；30 项图标单测及真实浏览器实测（78 个 AI 矢量图标完整渲染、首屏无闪烁）通过。
- [x] CoreApp：对话框组件统一收敛（2026-11-23，PR `#2253`，`ea7851079`）。已彻底移除 4 个历史对话框包装副本（`TBlowDialog.vue`、`TBottomDialog.vue`、`TPopperDialog.vue`、`TouchTip.vue`）及其 `components.d.ts` 自动导入项并直连 `@talex-touch/tuffex/dialog`；同步完成 TuffEx 对话框生命周期/定时器清理与引用计数背景虚化加固（`createBlowBackgroundBlur`），修复 `dialog-mention.ts` 外部 `clearAll()`/`unregister(id)` 幂等卸载与 `atomicKey` 释放。`packages/tuffex` 327 files / 3,699 tests 与 CoreApp 对话框套件 12 files / 76 tests 通过（单测与构建验证，不替代打包 Electron 实测）。（来源：2026-10-17 #2120 旁路问题审计）
- [x] TuffEx / PR #2120：琉光材质与旁路问题收口（2026-10-17/18 已通过 `154c61b48` / `20860d02b` 合入主线，TuffEx 已推进至 `0.9.4`）。
- [x] TuffEx / CoreApp：TxIconPicker 模块化与图标分块资产已合入当前主工程（2026-10-18）。已合并 `catalog-ai/brand/emoji/icon`、12 种形状与 `glyphs.ts`，CoreApp 局部提供 `provideIconPickerGlyphs()`，30 项组件单测与真实浏览器渲染通过。
- [ ] TuffEx / UIKit / Home AI UI 对齐演进（2026-11-23 同步）：坚持“先以 CoreApp 真实生产 UI 为视觉、结构与交互基准升级组件库，严禁将生产 UI 降级迁向占位壳”原则。**第一阶段**（PR `#2226` / `#2227`）已完成 `@talex-touch/tuffex` 与 `@talex-touch/intelligence-uikit` 生产级组件对齐；**第二阶段**（2026-11-23，PR `#2261`，`b4cc1d762`）已完成无生产 UI 降级收敛——升级 `TxAiContextMeter` / `TxAiRunStatus` / `TxAiMessageRail`，删除重复的 `HomeContextMeter` 与 `HomeRunStatus` 改由 `HomeRunDock` 直接复用 `@talex-touch/intelligence-uikit`，`HomeMessageRail.vue` 从 `279 -> 62` 行，`HomePage.vue` 从 `1,943 -> 1,162` 行（`-40.2%`），`TuffAIComposer.vue` 与既有生产体验完整保留；剩余 `HomePage.vue <= 800` 行进一步收敛保持开放（详见 [`omp-runtime-and-tern-gui-integration-analysis-2026-11-01.md`](../engineering/reports/omp-runtime-and-tern-gui-integration-analysis-2026-11-01.md)）。

## B. 插件与 View 生态

- [ ] View Mode：`plugin-core` 结构拆分，保持兼容，不引入破坏性接口。
- [ ] View Mode：生命周期与安全矩阵回归持续补样本。
- [ ] AttachUIView：Warm/Cold 分层、Score 模型、可视化调试工具。
- [ ] Multi Attach View：并行视图容器与布局切换能力。
- [x] Widget Sandbox：clipboard/history/location/postMessage/worker 扩展拦截已落地并验证。`widget-sandbox-policy.ts` 对全部扩展 API 实施沙箱化或阻断，单测 12/12 通过。
- [x] Widget Sandbox：调用限额与审计记录已落地并验证。固定窗口（10s / 120次）超额熔断，脱敏审计日志最大 2048 条已受控运行，单测 12/12 通过。
- [x] Plugin Capability：`touch-workspace-scripts` 用户 shell 命令已纳入统一 capability/permission/audit/unsupported reason 模型。受控 generation token、只读与执行权限分离、不合规路径与伪造执行已被封锁，主进程 capability 聚焦单测 24/24 通过。
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

- [ ] Build Signature：OIDC + RSA 门禁已接入候选（2026-10-18），待真实 GitHub Actions 签发与验签。平台构建器对最终包生成固定版本的 GitHub OIDC provenance，发布组装校验仓库、工作流、源 SHA、issuer、SLSA predicate 和 hosted runner；既有 RSA sidecar/嵌入证明/客户端 pinned key 不变。`actionlint`/ShellCheck 通过，实际 shell gate 对匹配 SHA 通过、错误 SHA 和空包集合拒绝。旧无 OIDC 的恢复产物不豁免；未触发发布，未声称 hosted OIDC 验收通过。
- [ ] Nexus 支付多渠道 provider 抽象与回调联调。
- [ ] TuffEx：源码包构建/测试/审计与 Nexus 展示门禁持续收敛。
- [ ] Terminal：后续评估 Ghostty/libghostty Web/WASM 引擎接入 `TxTerminal`，重新核对上游能力、维护风险和终端兼容性。本轮仅交付 xterm.js 与 PTY，不嵌入原生 Ghostty 窗口，不添加 Ghostty 依赖或空实现。
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
