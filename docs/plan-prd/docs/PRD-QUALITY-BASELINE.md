# PRD 最终目标与质量约束基线

> 更新时间：2026-05-13
> 适用范围：`docs/plan-prd/02-architecture`、`docs/plan-prd/03-features`、`docs/plan-prd/04-implementation`、`docs/plan-prd/06-ecosystem`

## 1. 目的

统一活跃 PRD 的编写与验收标准，避免“有方案无目标、有实现无质量门禁”。  
从本文件生效后，新增或继续推进的 PRD 均应满足下述最小结构。

## 1.1 文档治理执行锚点（2026-04-26）

- 文档盘点历史快照参考：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`；当前优先级路线以六主文档、`TODO` 与 `CHANGES` 为准。
- 主线动作必须同步六文档：`INDEX / README / TODO / CHANGES / Roadmap / Quality Baseline`。
- 当前主线动作为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`；但正式 gate 的立即动作已收紧为 Windows 真机 evidence 闭环：先生成 acceptance collection plan，再补 case/manual/performance evidence，随后跑 `windows:acceptance:verify` final gate 并写入 Nexus Release Evidence；`Nexus 设备授权风控` 保留实施文档与历史入口，Phase 1 频控/冷却/审计/长期授权时间窗/可信设备白名单已完成，非当前主线。
- 2026-05-12 跨平台兼容与占位实现复核已新增：`docs/plan-prd/report/cross-platform-compat-placeholder-review-2026-05-12.md`；`2026-05-10` 审计保留为历史基线，当前 PRD 必须继续区分真实 unavailable、开发 mock 与生产假值成功，并把 Windows/macOS 真机 evidence、CLI token storage、retained raw definition 与 `compat-file=5` 作为后续收口口径。
- 2026-05-13 执行顺序补充：`2.4.10` 正式 gate 前不得把 `2.5.0` AI/workflow、Provider Registry 高级策略、retained raw definition 后续迁移或 SRP 大拆分扩大为当前 release blocker；这些事项保留在 `2.4.11` / `2.5.0` 后续，当前只允许围绕 Windows 真机采证、性能采样、Release Evidence 与必要 bugfix 推进。
- 2026-05-13 CoreApp 启动异步化缺口已归档：专项报告 `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md` 确认当前启动仍受 main modules 串行 `await`、Database/Extension/Intelligence 等非首屏任务进入 critical path、Search provider 启动后集中抢资源，以及 renderer mount 前等待 storage/plugin store 影响；该项不升级为当前 `2.4.10` release blocker，后续按 P0/P1/P2/P3 分层治理并补 benchmark 证据。
- 2026-05-13 跨平台兼容与占位实现深度复核已归档：`docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md` 确认 CoreApp 平台能力、sync 密文载荷、Linux unsupported reason 与 transport boundary 当前稳定；`2.4.11` 必须继续收口 AI 兼容占位成功响应、CLI token 明文 JSON、插件 provider secret 普通 storage、插件 shell capability 诊断与生产样式大文件 SRP。
- 2026-05-11 架构治理切片已新增并收紧：transport guard 独立输出 raw send / retained raw definition / typed candidate，当前三段 typed candidate 为 `0`，retained raw definition 当前上限为 `265`；AI stat 与 mock payment 假成功路径已门控；插件图片历史路径不得继续长期写 renderer `localStorage`；`clipboard.ts` 已拆出 capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline，并降到 `1143` 行清退 size exception；`recommendation-engine.ts`、`search-core.ts`、`app-provider.ts`、`update-system.ts` 与 `omni-panel/index.ts` 已拆出纯 utility/helper 并退出 grown list，CoreApp 当前不在 grown list；`app-provider.ts` 已拆出 path helper 与 source scanner facade，growth exception cap 收紧到 `3306`；`deepagent-engine.ts` 已拆出 input builders，growth exception cap 收紧到 `1792`；`app-provider.test.ts` 已拆出测试 harness 并退出 grown list；`packages/intelligence-uikit/src/playground/App.vue` 已拆出 state composable 并降到阈值以下；`sdk-compat.ts` 已硬切为 `sdkapi-hard-cut-gate.ts`，AI `aiapp-compat-*` 已硬切为领域服务命名；Tuffex `TxFlipOverlay.vue` 已拆出 stack helper 并清退 size exception；registry 当前 `36` 条、`compat-file=5`；重构期 质量入口已统一，`lint/lint:fix` 只负责 ESLint 与 intelligence check，架构债务由 `quality:pr` / `quality:release` 承载。
- 2026-05-11 Nexus Intelligence provider 已镜像到 Provider Registry；Provider metadata 不保存明文 API key，密钥只通过 secure store `authRef` 绑定；dashboard list/sync/model list/probe/admin chat/docs assistant/lab runtime 已统一经 bridge 合并读取旧表与 registry mirror，Provider Registry check 已可对 AI mirror 执行 `chat.completion` / `vision.ocr` 探活并写入 health 历史，OpenAI-compatible AI mirror 已可通过 Scene 默认 adapter 执行 `vision.ocr`；Dashboard Admin Provider Registry 已补系统级本地 `overlay.render` provider 与 `corebox.screenshot.translate` Scene 的幂等 seed 入口，且不会把 user-scope AI mirror OCR 自动绑入 system Scene；旧表退场、user-scope AI mirror OCR 绑定策略与高级策略仍是后续门禁。
- 2026-05-12 CI/CD warning 迁移已建立：GitHub Actions JavaScript Action `uses:` 依赖统一到 Node 24-compatible major baseline，项目业务 Node runtime 继续保持 `22.16.0`；后续 CI warning 收口不得通过 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` 或长期 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 绕过。
- 2026-05-13 beta CI readiness 复核：`2.4.10-beta.22` 准备用于避开已存在的 `v2.4.10-beta.21` tag；Widget/CLI 最新修复与兼容性复核记录已合入，OmniPanel Gate、Utils Package CI 与 macOS beta build 准备结果延续有效，transport boundary retained raw definition 当前扫描上限为 `265`，typed migration candidate 保持 `0`；完整 `quality:pr` 仍被 `retired-ai-app` 既有 lint 债务阻断，不得宣称全仓 PR gate 已绿。
- 文档治理不再使用脚本强校验；行为/接口/架构变化仍必须按 AGENTS.md 同步活跃入口文档。

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
- 兼容边界统一迁移到 ESLint：禁止新增 `channel.send('x:y')`、legacy transport/permission/channel import、旧 storage protocol、旧 SDK bypass 或伪成功兼容分支；确需例外只能通过明确 scoped ESLint override 承载并说明退场原因。
- runtime console / runtime boundary 统一迁移到 ESLint：CoreApp `main/preload/renderer` 新增裸 `console.*`、宽松 WebPreferences、裸 `ipcRenderer/ipcMain`、raw IPC event string、`window.touchChannel`、`window.$t/window.$i18n` 与旧 `/api/sync/*` 均视为质量回退。
- 网络边界统一由 ESLint 承担：业务层禁止新增 direct `fetch/axios`，统一走 `@talex-touch/utils/network` 或明确注入的网络客户端。
- 不再维护 compatibility registry / legacy allowlist / size allowlist；文件行数治理回到 code review 与普通 SRP 重构任务，发布质量入口以 `quality:pr` / `quality:release` 为准。
- Widget production gate: packaged plugins must ship precompiled widget artifacts in `widgets/.compiled/` with `build.widgets` manifest metadata; packaged CoreApp must not rely on startup runtime widget compilation unless an explicit debug fallback is enabled.
- CoreApp 硬切补充门禁：业务层 `window.$channel` 调用、legacy storage 旧协议（`storage:get/save/reload/save-sync/saveall`）与 legacy `sdkapi` 放行路径必须保持为 `0`；占位能力必须返回真实状态或显式 `unavailable + reason`，禁止固定假值“成功”。
- CoreApp `2.4.11` 前置门禁：清册中的 `2.4.11` 兼容债务必须关闭或显式降权；Windows/macOS 回归为 release-blocking，Linux 仅作为 documented best-effort 与非阻塞 smoke。
- Windows Everything 目标验收门禁：`windows:capability:verify --requireEverythingTargets` 必须同时复核基础 Everything 查询成功、目标 probe 命中、`matchCount` 为正，且至少一条 sample 文本包含目标关键词；禁止仅凭手工填写的 `found=true` 或不匹配样本通过。
- Windows App Index 诊断验收门禁：`app-index:diagnostic:verify --requireQueryHit` 必须用 `stages.*.targetHit`、目标 `itemId`、`matchCount` 与 matches 重新证明 query hit；未运行 stage 不得携带命中或 matches，未命中 target 的 stage 不得携带 matches；input target、diagnosis target、manual suggested fields、app launch/icon/displayName 字段与 reindex path 必须指向同一个目标 App，成功 reindex 在存在 app 实体字段时必须对齐 app path/launchTarget/appIdentity/bundleId，UWP/Store 样本必须记录 `identityKind/bundleId/appIdentity/launchKind/launchTarget/displayNameSource/iconPresent`，Steam 样本必须记录 `bundleId=steam:<appid>` 与 `launchKind=protocol`，禁止只凭手工填写的 `matchedStages`、reusable caseId、输入名称或 reindex status 通过。
- Windows common app launch 手工证据门禁：每个目标 App 的 Markdown 必须填写 observed display name、icon evidence、observed launch target、CoreBox hidden evidence、search query 与截图/录屏；布尔项全 true 但缺少这些 Evidence label 仍不得通过最终 acceptance。
- Windows common app launch 结构化门禁：`--requireCommonAppLaunchDetails` 必须同时复核 manifest 中每个目标的 `searchQuery / observedDisplayName / iconEvidence / observedLaunchTarget / coreBoxHiddenEvidence` 非空；禁止仅靠布尔项或泛截图通过聊天应用/Codex/Apple Music 等常见 App 启动验收。
- 复制 app path / 应用索引管理验收门禁：`windows-copied-app-path-index` 不得只依赖 app-index diagnostic caseId；运行时 `addAppByPath()` 必须把用户触发添加写成 `entrySource=manual / entryEnabled=1` 本地启动区条目；设置页应用索引管理必须复用 `settingsSdk.appIndex.*`，不得新增并行 transport event 或独立 DB 表；添加 `.exe/.lnk/.appref-ms`、UWP shell path/裸 AppID 或 Steam protocol 后必须无需重启即可 reindex/diagnose 并再次搜索命中；最终 Windows acceptance 必须启用 `--requireCopiedAppPathManualChecks`、`--requireCompletedManualEvidence` 与 app-index `--requireManagedEntry`，并归档复制源、normalized app path、add-to-local-launch-area action、本地启动区条目、App Index diagnostic evidence、reindex 后 search query、indexed search result 与 indexed result launch evidence；manifest 结构化字段也必须复核这些值非空；manual evidence Markdown 必须 checklist 全勾选且模板要求的 Evidence 关键字段全部为非占位实际证据值。
- DivisionBox / 分时推荐手工证据门禁：`--requireCompletedManualEvidence` 下不得接受泛化 `Logs` 替代关键事实；DivisionBox detached widget 必须归档 observed/expected pluginId、detached URL 中的真实 plugin `source` 与 provider `providerSource`、`detachedPayload` itemId/query 与 no-fallback 日志摘录；`--requireDivisionBoxDetachedWidgetManualChecks` 还必须在 manifest 结构化字段中复核 observed session pluginId 与 URL `source` 等于真实 feature pluginId，且 `providerSource=plugin-features`；time-aware recommendation 必须归档 `timeSlot/dayOfWeek` cache key、早/午 top item/provider source/recommendation source、frequent comparison item/provider source/recommendation source 与 recommendation trace 摘录，`--requireTimeAwareRecommendationManualChecks` 还必须在 manifest 结构化字段中复核早/午 timeSlot 不同、dayOfWeek 合法、top recommendation 不同、早/午 recommendation source 为 `time-based` 且频率对照 source 为 `frequent`。
- Windows 更新证据门禁：`update:diagnostic:verify --requireInstalledVersionMatchesTarget` 不得只接受 `installedVersion.matchesExpected=true`；必须同时复核 installed target 与 `downloadReadyVersion` / cached release tag 一致，且 installedVersion current/expected 不能是空白字符串，cached release channel 与 settings 一致，matching asset platform/arch/size 与 runtime target 一致，避免跨版本、空白版本或跨平台资产 evidence 假通过；`windows-auto-installer-handoff` evidence 必须带非空 `downloadTaskId` 证明来源是自动下载任务；manual evidence 必须归档 update diagnostic evidence、installer path/mode、UAC prompt、app exit、installer exit、installed version、app relaunch 与 failure rollback evidence；manifest 结构化字段也必须复核这些值非空；运行时自动 installer handoff 还必须同时满足自动下载任务标记、`autoInstallDownloadedUpdates=true` 与 Windows 平台，禁止绕过用户高级设置。
- Windows acceptance 占位门禁：common app launch、复制 app path、Windows update install、DivisionBox detached widget 与 time-aware recommendation 的 manifest 结构化必填字符串字段、manual `evidencePath`，以及 Markdown manual evidence 的 `## Evidence` 必填 label，都必须填写真实证据值；`<...>`、`N/A` / `NA` / `none` / `TODO` / `TBD` / `-` / `待补` / `无` 一律按缺失处理，禁止用生成模板占位或“暂不适用”文本绕过最终 gate。
- Windows 性能证据门禁：`search-trace-stats/v1` 必须通过 paired/session/sample/slow counter、slowRatio 与 percentile 单调性内部一致性复算，`clipboard-stress-summary/v1` 必须包含有效 clipboard 采样且 scheduler sample count 不得超过 count，scheduler delay 与 duration 指标不得倒挂；禁止仅靠手工填写 `gate.passed=true` 或阈值字段通过 acceptance。真机采证应优先使用 `windows:acceptance:template -- --writeCollectionPlan` 生成的 collection plan，确保 case evidence、capability evidence 采集命令、实际 evidence path verifier、性能采样、manual evidence 与最终 recommended gate 使用同一份 manifest 口径。
- 2.4.10 Windows 发版门禁：当前版本不得只凭本地 unit test、macOS 代跑或手工口头确认放行；必须在 Windows 真机提交并通过最终 acceptance manifest 强门禁，至少包括 Windows required cases、common app launch、copied app path、update install、DivisionBox detached widget、time-aware recommendation、search trace `200` 样本、clipboard stress `120000ms` 压测和 Nexus Release Evidence 写入。缺少真实 Windows evidence、性能样本或 Release Evidence 写入时，结论只能是 blocked。
- Nexus Provider / Scene 类 PRD 必须保持 Provider 与 Scene 解耦：新增供应商只进入 Provider registry，新增使用场景只进入 Scene，不允许新增孤立 provider model 或绕过 typed transport/domain SDK。
- 2.5.0 AI 类 PRD 必须保持桌面入口收口边界：Stable 能力只承诺文本 + OCR；Workflow / AI 联动必须标为 Beta；Assistant、多模态生成编辑与 Nexus Scene runtime orchestration 必须标为 Experimental 或 2.5.x 后续，禁止作为 2.5.0 稳定承诺。
- 假值治理门禁：生产 API / dashboard / runtime 不得默认返回 Mock CPU、固定磁盘/内存、mock 支付 URL、伪成功空结果；开发 mock 必须由显式环境变量或配置开关启用，关闭时返回明确错误码与 reason。
- 兼容占位响应门禁：退役、豁免或未实现接口不得以 HTTP 2xx + 可消费业务 payload 冒充真实数据；必须使用明确 status、`unavailable + reason`、`exempted: true` 或 migration target，并保证前端不把占位内容当作真实业务结果。
- 插件 secret storage 门禁：插件 provider 的 `apiKey`、`secretKey`、token、refresh token 等不得进入普通 plugin storage 文件；普通配置只保留 provider metadata，密钥必须进入 plugin secret capability、secure store 或等价加密引用。
- 插件命令 capability 门禁：插件侧平台命令、PowerShell、AppleScript、workspace shell 等能力必须声明 platform、permission、command source、unsupported/degraded reason 与审计字段；高风险 shell 字符串优先替换为参数化 `execFile` 或 `safe-shell`。
- Transport 统计门禁：文档和测试必须区分 raw send violation 与 retained raw event definition；新增符合 `namespace/module/action` 结构的事件必须使用 typed builder；当前三段 migration candidate 必须保持 `0`，下载迁移 push events 以 `DownloadEvents.migration.progress/result` 为 typed registry SoT。
- CI/CD Action runtime 门禁：`.github/workflows` 中 JavaScript Actions 必须使用 Node 24-compatible major；保留项目业务 `node-version: 22.16.0`，禁止把 Actions runtime warning 迁移处理成业务 Node 版本升级。
- SRP/size 收敛要求：超长模块后续通过 code review、targeted refactor 与最近路径测试控制回潮；`clipboard.ts` 已拆出 capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline，并降到 `1143` 行；Tuffex `TxFlipOverlay.vue` stack helper 切片已把组件降到 `1194` 行并清退 size exception；Nexus `provider-registry.vue` 已拆出 admin composable 并降到 `999` 行，`provider-registry.api.test.ts` 已拆出测试 helper 并降到 `951` 行；CoreApp Windows acceptance verifier 已拆出 command requirements、case/performance evidence spec 与 manifest test helper，`windows-acceptance-manifest-verifier.ts` 降到 `1136` 行，`windows-acceptance-manifest-verifier.test.ts` 降到 `1156` 行；`recommendation-engine.ts` 已拆出 `recommendation-utils.ts` 并降到 `1869` 行；`search-core.ts` 已拆出 `search-core-utils.ts` 并降到 `2475` 行；`app-provider.test.ts` 已拆出 `app-provider-test-harness.ts` 并降到 `1400` 行；`app-provider.ts` 已拆出 `app-provider-path-utils.ts` 与 `app-provider-source-scanner.ts` 并降到 `3305` 行，growth exception cap 收紧到 `3306`；`deepagent-engine.ts` 已拆出 `deepagent-input.ts` 并降到 `1791` 行，growth exception cap 收紧到 `1792`；`update-system.ts` 已拆出 `update-asset-utils.ts` 并降到 `1610` 行；`omni-panel/index.ts` 已拆出 `omni-panel-builtin-features.ts` 并降到 `1845` 行；`packages/intelligence-uikit/src/playground/App.vue` 已拆出 `usePlaygroundState.ts` 并降到 `919` 行；Nexus `useSignIn.ts` 已拆出 `sign-in-redirect-utils.ts` 并降到 `1538` 行，`assistant.post.ts` 已拆出 `requestAuditMeta.ts` 并降到 `1762` 行，`tuffIntelligenceLabService.ts` 已拆出 `tuffIntelligenceLabTools.ts` 并降到 `3408` 行，`telemetryStore.ts` 已拆出 `telemetrySanitizer.ts` 并降到 `1502` 行，`en.ts/zh.ts` 已拆出 legal shard 并低于 exception cap；当前 `newOversizedFiles=0`、`grownOversizedFiles=0`、`cleanupCandidates=0`，后续治理聚焦剩余业务闭环与 Windows 真机 evidence。

### 3.2 可靠性约束
- 关键路径需有显式错误处理与用户可见反馈。
- 对异步流程必须定义超时与失败回退。
- AI 路由链路必须具备可观测指标（至少含 `queue wait`、`TTFT`、`total duration`、`success/error`），并支持熔断恢复策略。
- 启动高峰期涉及 SQLite 高频写入的链路，必须满足“单写者或物理分库隔离 + QoS 优先级 + 可降级策略（drop/backoff/latest-wins）”至少两项，禁止无上限重试灌队列。
- 启动异步化改造验收必须至少采集 Electron ready → first window show、renderer script start → app mount、app mount → plugin list ready、all modules loaded → providers ready 四段耗时；Database aux migration、Search provider ready 与 renderer storage hydration 必须能区分 critical 与 background。

### 3.3 性能约束
- 为关键路径提供预算（如启动、搜索响应、任务执行耗时）。
- 避免在主线程引入长时间同步阻塞。
- CoreApp 启动 critical path 不得新增非首屏必要的串行 await；renderer mount 前不得新增 plugin list、远程探测、extension load、telemetry hydrate、agent/workflow runtime、update cache hydrate、OCR/native watcher 等可后台化任务。新增启动期任务必须说明是否 critical、预期耗时、超时/降级策略和 benchmark 采样方式。
- 文件索引/搜索 worker 的诊断状态采样不得破坏 idle shutdown 语义：metrics pending/timeout 期间必须保持 worker 存活，采样结束后再重新进入完整 idle window。
- 对启动期性能治理，必须至少输出以下指标：队列分级深度、标签等待时间、drop 数、熔断状态、`SQLITE_BUSY` 比例、event-loop lag 分布。

### 3.4 安全与数据约束
- 遵守 Storage/Sync 规则：SQLite 本地 SoT，JSON 仅同步载荷。
- 禁止敏感信息明文落地到 localStorage/JSON/日志。
- AI Provider 配置中，provider metadata 可进入普通配置，API Key / secret 必须进入 secure-store 或以 `authRef` 表示；审计默认不得保存完整 prompt / response。
- 插件侧本地文件路径历史、图片路径、token、key 等敏感元数据不得长期保存在 renderer `localStorage`；必须使用插件 storage SDK、SQLite SoT 或加密引用，并提供清理策略。
- CoreApp secure-store 不再调用系统安全存储 / Keychain，必须统一使用本机随机 `local-secret` root 密钥派生用途密钥并写入本地密文 envelope，禁止写入明文 token/key/seed。
- `deviceId` 只能作为设备标识或可选 AAD，不得作为密钥材料；local secret 损坏或丢失且已有本地密文时必须进入 `unavailable`，不得静默生成新 secret 覆盖旧数据。
- Sync 输出仍必须只包含 `payload_enc` / `payload_ref` 等密文引用，旧 `b64:` 仅保留只读迁移语义并触发重写，禁止重新引入明文业务 JSON 同步。

### 3.5 文档约束
- PRD 状态变化（进行中/完成/归档）必须同步 `README.md` 与 `TODO.md`。
- 对外行为变化必须同步 Nexus 对应开发文档。
- 推荐统一验收入口：PR 使用 `pnpm quality:pr`（lint + targeted tests + CoreApp typecheck）；release/milestone 使用 `pnpm quality:release`（lint + typecheck:all + targeted tests + CoreApp build）。

## 4. 项目质量审查优化计划（2026-05-12 复核）

本节用于承接 `docs/plan-prd/report/cross-platform-compat-placeholder-audit-2026-05-10.md`、`docs/plan-prd/report/cross-platform-compat-placeholder-review-2026-05-12.md` 与 `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md` 的审查结论，把跨平台兼容、占位/假实现、transport 收口、安全凭据与 SRP 拆分转成后续迭代的质量门禁。

### 4.1 分阶段治理顺序

| 阶段 | 目标 | 验收要求 |
| --- | --- | --- |
| Phase 0 | `2.4.10` 收口，只补 Windows 真机证据，不扩大兼容层 | 先生成 Windows acceptance collection plan，再完成 Windows App 索引、更新安装、DivisionBox detached widget、复制 app path、search trace `200` 样本、clipboard stress `120000ms` 与 Nexus Release Evidence 留证；macOS/Linux 不因本阶段降级或新增兼容分支 |
| Phase 1 | `2.4.11` blocker 清零 | `compat-file=5` 退场评估、AI 兼容占位响应退场、retained raw definition 高频路径迁移、CLI token storage 安全收口、插件 provider secret storage、插件命令能力统一 degraded/unsupported 诊断与 Linux best-effort 证据归档必须完成或显式降权 |
| Phase 2 | Transport / SDK 收口 | 区分生产 raw send violation 与 retained `defineRawEvent` definition；优先收口 CoreBox、terminal、auth、sync、opener 等高频/高敏路径 |
| Phase 3 | SRP 结构拆分 | 优先拆分 `clipboard.ts`、`search-core.ts`、`plugin.ts/plugin-module`、`app-provider.ts`；每次拆分保持外部契约兼容并补最近路径测试 |

切片执行状态（2026-05-13）：Phase 1 中 AI stat 假值、mock payment 默认成功与 `plugins/touch-image` localStorage 历史持久化已先行收口；当前 release blocker 收敛为 Windows/macOS 真机 evidence，`compat-file=5`、AI 兼容占位成功响应、retained raw definition 高频路径、CLI token storage、插件 provider secret storage 与插件命令能力统一诊断保留为 `2.4.11` 治理余量。Phase 2 指标口径已在 transport boundary test 固化，当前三段 retained typed candidates 已迁移清零，retained raw definition 上限为 `265`；Phase 3 已完成 `clipboard.ts` capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline 行为等价切片，并拆出 `recommendation-engine.ts` 纯 utility、`search-core.ts` 纯 helper、`app-provider.ts` path helper 与 source scanner facade、`deepagent-engine.ts` input builders、`update-system.ts` asset helper、`omni-panel/index.ts` builtin definitions、`app-provider.test.ts` harness 与 `intelligence-uikit` playground state；guard 已调整为重构期分层策略，历史 size debt 先报告，changed/release strict 继续防回潮。

### 4.2 审查门禁

**文档/治理类变更至少执行：**
- `git diff --check`
- 人工复核活跃入口文档是否同步（README / TODO / CHANGES / INDEX / Roadmap / Quality Baseline 中至少对应项）

**兼容/运行时边界相关代码变更至少追加：**
- `pnpm lint`
- 最近路径 typecheck / lint / vitest，若环境缺依赖必须记录阻塞原因

**涉及 storage / sync / secret / payment / AI provider 的变更必须额外确认：**
- 不新增业务明文 JSON 同步或落盘。
- 不把 `deviceId`、本地路径、token、key、prompt/response 原文当作普通配置持久化。
- 开发 mock 必须显式开关启用，生产关闭时返回真实状态或 `unavailable + reason`。

### 4.3 阻塞与非阻塞判定

**Release-blocking：**
- 生产 API、dashboard 或 runtime 默认返回假成功、固定资源数据、mock 支付 URL、空结果伪成功。
- 兼容豁免、未实现或退役 API 返回 HTTP 2xx 且 payload 可被调用方当作真实业务数据消费。
- 敏感信息或敏感元数据明文进入 renderer `localStorage`、业务 JSON、日志或同步 payload。
- 新增 raw event 字符串分发、未登记兼容债、旧 `/api/sync/*` 新依赖、旧 storage protocol 新依赖。
- Windows/macOS 主线验收缺少 release-blocking 证据，且无明确降权记录。

**Documented best-effort / non-blocking：**
- Linux `xdotool`、desktop environment、权限模型或发行版差异导致的不可用，但必须有用户可见 reason 与 smoke 记录。
- macOS Automation/Accessibility、Windows foreground/PowerShell/Everything 等平台依赖不可用，但必须返回 degraded/unsupported 合同，不得伪成功。
- 超长模块 SRP 拆分不得用大爆炸式重构阻塞主线；按小任务推进，并在 size/ESLint compatibility boundary rules 或 TODO 中保留责任边界。

## 5. 验收执行模板（建议复制到 PRD）

```md
## 验收清单
- [ ] 功能验收：核心功能按场景通过
- [ ] 质量验收：typecheck/lint/test 通过（或明确既有失败项）
- [ ] 性能验收：关键指标在预算范围内
- [ ] 安全验收：敏感数据与权限路径符合规则
- [ ] 文档验收：README/PRD/TODO/Nexus docs 已同步
```

## 6. 与现有文档的关系

- 产品层目标与节奏：`docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 项目索引与未闭环能力：`docs/plan-prd/README.md`
- 执行任务清单：`docs/plan-prd/TODO.md`
- 变更归档：`docs/plan-prd/01-project/CHANGES.md`

## 7. 项目质量执行记录（示例）

### 7.1 Nexus 组件文档迁移（2026-02-21）

**统计口径**
- 源文档：`packages/tuffex/docs/components/*.md`（不含 `index.md`）。
- 目标文档：`apps/nexus/content/docs/dev/components/*.(zh|en).mdc`（不含 `index.*.mdc`）。
- 状态来源：组件文档 Frontmatter 中的 `syncStatus`、`verified`。

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 源组件总数 | 95 | 基线 |
| Nexus 双语覆盖（zh+en 同时存在） | 104/104 | 100%（含扩展项） |
| `syncStatus: migrated`（zh/en） | 104/104 | 已完成 |
| `verified: true` | 1/104 | 仅 `button` 已验证 |
| 扩展项 | 9 | `foundations`、`flat-*`、`base-*`、`error/guide-state` |

**已解决**
- 迁移覆盖：源组件缺失为 0，双语成对齐全。
- 缺口补齐：`code-editor`、`flip-overlay` 中英文文档已新增并纳入索引。
- 扩展项已识别：9 个扩展文档已被纳入清单管理。

**待解决（未验收）**
- 验证覆盖率过低：`verified` 仅 1/104。
- 联调清单未闭环：入口/看板/双语一致性/新增项验证/扩展项核对/导航检索/lint/收口确认仍待执行。

### 7.2 发布链路收敛（2026-02-25）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 桌面发版主线 | `build-and-release.yml` | 已统一 |
| 失败构建创建 Release | 禁止 | 已收敛 |
| Nexus Release 同步 | 自动（tag push） | 已上线 |
| CLI 四包 npm 发布 | 自动（版本变化触发） | 已上线 |
| Nexus 官网部署 | Cloudflare Pages 平台侧 Git 自动部署 | 已上线 |

**质量约束落地**
- 发布 workflow 必须幂等，重复执行不得产生重复 release 资产记录。
- npm 自动发布链路在 registry 已存在同版本时必须转为“已发布成功”语义，禁止把重复版本冲突直接上浮为 release-blocking 失败。
- Package CI 必须能在 clean runner 内自洽构建内部 workspace-only 依赖；跨 job 的 `needs` 只表达顺序，不得依赖上游 job 产出的本地 `dist` 残留。
- beta / snapshot tag 创建的 GitHub Release 必须保持 pre-release 语义，不得误标为稳定版。
- `build-and-release` 的手动 `release_type=beta` 与 `v*-beta*` tag 必须走 beta/pre-release 分支；CoreApp beta build 必须保留 `BETA` runtime metadata，并可复用 snapshot packaging policy。
- Release 同步前必须存在 `notes/update_<version>.zh.md` 与 `.en.md`；缺失时不得宣称 Nexus release notes 已闭环。
- 执行 PR 代码的 workflow 不得使用 `pull_request_target` 写权限；主 PR CI 必须使用只读 `pull_request`，高权限 release / label / release-drafter workflow 只处理仓库受控事件。
- 预发布不得覆盖 npm 默认安装通道（`next` 与 `latest` 分离）。
- 发布后需同步 Nexus 可观测入口（release 或 update news）。

### 7.3 Intelligence Agent 一次切换（2026-02-25）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| Core IPC 命名空间 | `intelligence:agent:*` | 已切换 |
| Nexus Admin API | `/api/admin/intelligence-agent/*` | 已切换 |
| 旧入口 | `/api/admin/intelligence-lab/*` | 返回 `410` |
| Prompt Schema | `promptRegistry + promptBindings` | Core/Nexus 对齐 |
| Trace 合约版本 | `contractVersion = 3` | 已升级 |

**质量约束落地**
- 高频会话链路必须包含 `SSE stream.heartbeat / pause / recoverable / history / trace` 的显式契约能力（其中 heartbeat 通过流内事件提供，不再单独开放 API）。
- Prompt 渲染来源必须优先走 registry binding，缺失时允许回退并记录可迁移默认值。
- 高风险工具调用必须走审批票据，不得绕过 `high/critical` 审批门禁。

### 7.4 v2.4.7 发版门禁跟踪（2026-03-14）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 版本基线 | 历史 `v2.4.7` 发布窗口已满足；当前工作区为 `2.4.9-beta.4` | 作为历史 Gate 记录，不再阻塞当前主线 |
| 发布链路 | `build-and-release` + Nexus release + CLI npm 自动发布 | 已完成 |
| 质量门禁 | lint/typecheck 阻塞项已清零（C1~C4） | 已完成 |
| 发布资产结构 | notes/notesHtml `{ zh, en }` + assets manifest + sha256 | Gate D 已完成（run `23091014958`）；`signature` 对 `v2.4.7` 按历史豁免 |
| tag 发布动作 | `v2.4.7` | 历史已执行（tag 存在，release 已 published，latest 命中） |

**质量约束落地**
- 发布前必须完成 Gate C（阻塞级 lint/typecheck 清零或豁免清单显式备案）。
- 发布资产必须满足多语言结构约束（`notes`/`notesHtml` 仅 `zh|en`）。
- 发布执行以 `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` 作为单一追踪入口，避免口径分叉。
- Gate D/E 统一预检命令：`node scripts/check-release-gates.mjs --tag v2.4.7 --stage gate-d|gate-e --base-url https://tuff.tagzxia.com`。
- Gate D 收口证据：GitHub Actions `Build and Release` run `23091014958`（`workflow_dispatch + sync_tag=v2.4.7`）成功。
- 历史豁免边界：`v2.4.7` 允许 `signature` 缺口豁免；`>=2.4.8` 必须恢复 `manifest + sha256 + signatureUrl` 严格门禁。

### 7.5 AI × Intelligence（2026-03-07）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 新应用 | `retired-ai-app`（Nuxt Node Server + Postgres/Redis） | 已创建并作为主路径运行 |
| Runtime 收口 | `packages/tuff-intelligence`（protocol/runtime/registry/policy/store） | 已落地 |
| 流式 API | `POST /api/chat/sessions/:sessionId/stream`（2026-03-17 从 `/api/aiapp/*` 硬切） | 已上线 |
| 事件契约 | `assistant.delta/final`、`run.metrics`、`session.paused`、`error`、`done` | 已实现 |
| 补播机制 | `fromSeq` trace replay + checkpoint | 已实现（基础版） |
| 校验 | `retired-ai-app` lint/typecheck/build | 已通过 |

**质量约束落地**
- 长对话必须具备 pause/resume 语义，断线场景不得“吞消息”。
- SSE 必须提供 keepalive 与显式结束事件（`done`），避免前端状态悬挂。
- 所有 Intelligence 核心类型与 Runtime 实现统一来源为 `@talex-touch/tuff-intelligence`，禁止新增 `@talex-touch/utils/intelligence*` 外部依赖。

### 7.6 Network 套件全仓硬切（2026-03-12）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 统一入口 | `@talex-touch/utils/network`（request/file/guard） | 已落地 |
| 覆盖范围 | `apps/core-app + apps/nexus + retired-ai-app + packages + plugins` | 已收口 |
| 业务层 direct `fetch/axios` | 0（network 套件内部除外） | 已达标 |
| root 门禁 | `pnpm run ESLint network-boundary rules`（全仓） | 已硬禁 |
| ESLint 规则 | `no-restricted-imports(axios)` + `no-restricted-syntax(fetch)` | 已补齐关键 workspace |

**质量约束落地**
- Renderer（Electron）网络请求必须通过 Main 网关或统一 NetworkSDK，不允许直连扩散。
- 本地文件读取统一走 network file API（`readText/readBinary/toTfileUrl`），避免分散路径解析策略。
- 任意 workspace 新增 direct `fetch/axios` 视为门禁失败（CI fail），不得以临时 ESLint override 作为长期方案。

### 7.7 2.4.9 插件完善主线（2026-03-15）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 权限中心 Phase 5 | SQLite 主存储 + JSON 一次性迁移 + 失败只读回退 | 已完成 |
| 安装权限确认 | `always/session/deny` 三分支 | 已完成 |
| View Mode 安全闭环 | 协议/path/hash/dev-prod 边界用例补齐 | 已完成 |
| CLI 收口 | `tuff` 主入口 + `tuff validate` + 兼容入口提示 | 已完成 |
| 校验门禁 | `typecheck:node`/`typecheck:web`/定向 vitest/CLI smoke | 已通过 |

**质量约束落地**
- 安装失败路径必须可见（拒绝授权、异常、超时均不得 silent failure）。
- 事件/类型变更仅允许可选字段追加，禁止破坏既有语义与兼容性。
- `@talex-touch/tuff-cli` 为命令主入口，旧入口仅兼容 shim + deprecation，不承载新命令逻辑。
- 下一动作已统一为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，不再把 CLI 分包迁移视为待办主线。

### 7.8 Nexus 设备授权风控文档化（2026-03-16）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 正式实施文档 | `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` | 已入库 |
| 文档结构 | 目标 / 范围与非目标 / 分期 / 验收 / 回滚 / 风险与豁免边界 | 已对齐 |
| 六主文档口径 | `Nexus 设备授权风控` 保留实施入口，当前主线已切换到 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，剩余项进入 `2.4.11` 必解清单 | 已降权 |
| CLI 兼容策略 | `2.4.x` 保留 shim，`2.4.11` 退场 | 已固化 |

**质量约束落地**
- 风控策略调整必须同时更新实施文档与 `CHANGES`，形成同日证据闭环。
- 豁免必须具备责任人、时间窗和原因，不允许全局无限期豁免。
- 文档治理不再使用 report-only/strict 脚本门禁，改为变更时人工复核活跃入口文档一致性。

### 7.9 CoreApp 2.4.10 / 2.4.11 前置治理（2026-05-08）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 当前主线 | `2.4.10 Windows App 索引 + 基础 legacy/compat 收口` | 已锁定 |
| Legacy 清理 | channel/fallback/placeholder blocker 已关闭；数据迁移项降权为 `core-app-migration-exception` | Guarded |
| Windows 回归 | 搜索、应用扫描/UWP、托盘、更新、插件权限、安装卸载、退出释放 | Release-blocking |
| macOS 回归 | 权限引导、OmniPanel Accessibility、native-share、托盘/dock、更新、插件权限、退出释放 | Release-blocking |
| Linux 回归 | `xdotool` / desktop environment 限制说明 + smoke | Best-effort / non-blocking |

**质量约束落地**
- 新增能力不得通过 legacy 分支、raw channel、旧 storage protocol 或旧 SDK bypass 承载。
- `apps/core-app/scripts` 与 `retired-ai-app/scripts` 必须纳入 legacy/compat 显式扫描；不得用 scope exemption 掩盖脚本债务。
- 数据迁移例外必须保持 one-shot / marker-gated / read-once，不得重新成为业务写入 SoT。
- Windows/macOS 阻塞级回归必须在 `CHANGES + TODO` 留证；Linux 失败必须记录限制原因，但不阻塞 `2.4.11`。
- `Nexus 设备授权风控` 保留实施文档，不得从历史记录中删除。

### 7.10 Nexus Provider 聚合与 Scene 编排 PRD（2026-05-09）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 权威 PRD | `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` | 已入库 |
| 核心模型 | `Provider / Capability / Scene / Strategy / Metering` | 已固定 |
| 首版范围 | 汇率、AI 大模型、文本翻译、图片/截图翻译 | 已定义 |
| 迁移映射 | `exchangeRateService`、Nexus dashboard AI providers、CoreBox 划词/截图翻译、图片 pin window | 已列入 |
| 安全边界 | Provider credential 只保存 `authRef`；usage/audit 不保存原始内容 | 已固化 |

**质量约束落地**
- 新增供应商必须注册到 Provider registry，不允许为截图翻译、划词翻译、图片翻译、汇率或 AI Chat 新建孤立供应商模型。
- Scene 只声明业务意图、capability path、strategy、meteringPolicy 与 auditPolicy；不得硬编码供应商价格、密钥、endpoint 或特殊鉴权逻辑。
- Provider adapter 只做标准 capability payload 与供应商 API 的协议转换，并标准化错误码、usage、latency 与 providerRequestId。
- Metering / Audit 必须记录 fallback trail、usage、错误码与 degraded reason，但不得保存原始截图、图片、完整 prompt、完整翻译文本或模型响应。
- 后续实现变更必须同步 `README / TODO / CHANGES / INDEX / Roadmap / Quality Baseline` 至少对应入口，并补最近路径 typecheck/test/documentation review 证据。

### 7.10.1 Tuff 2.5.0 AI 桌面入口收口 PRD（2026-05-10）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 权威 PRD | `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` | 已入库 |
| 版本定位 | 桌面 AI 入口收口 | 已锁定 |
| 主入口 | CoreBox / OmniPanel | 已定义 |
| 首个落地切片 | CoreBox AI Ask `text.chat` + 剪贴板图片 `vision.ocr -> text.chat` | 已接入 |
| Stable 能力 | 文本 + OCR、OmniPanel Writing Tools、Workflow `Use Model`、Review Queue | 已收窄 |
| P0 模板 | 剪贴板整理、会议纪要/摘要、文本批处理 | 已列入 |
| Beta 能力 | Tuff Intents / Action Manifest、Skills Pack、Background Automations、AI 高级 Chat / DeepAgent 联动 | 已定义 |
| Experimental 能力 | Assistant、多 Agent 长任务面板、多模态生成编辑、Nexus Scene runtime orchestration | 已降级 |
| 安全边界 | API Key / secret 使用 secure-store 或 `authRef`；审计不保存完整 prompt / response | 已固化 |

**质量约束落地**
- 2.5.0 AI 实现不得新增 raw event 字符串分发，必须复用 `intelligence.invoke()` 与 typed transport/domain SDK。
- Provider 普通配置只允许保存 metadata、enabled、models、baseUrl、priority 等非敏感字段；BYOK secret 必须迁移到 secure-store 或 `authRef`。
- CoreBox / OmniPanel AI 入口必须有用户可见错误原因，provider 不可用、quota 不足、权限拒绝与模型不支持不得 silent failure。
- CoreBox AI Ask 调用 `text.chat` / `vision.ocr` 时必须带 `caller / entry / featureId / requestId / inputKinds / capabilityId` 等审计 metadata，复制回答继续要求 `clipboard.write`；不得把完整 prompt / response 写入插件 storage、普通 JSON 或日志。
- OmniPanel Writing Tools 必须默认进入预览/确认流程，替换剪贴板、写文件或调用插件动作不得由模型输出直接执行。
- Workflow `Use Model` 节点必须支持文本输入、结构化输出、失败重试与 trace/audit 记录；模板不得内嵌 provider secret、明文 API Key 或不可审计脚本。
- Review Queue 必须记录来源、traceId、风险等级、确认动作与失败原因；高风险副作用必须走审批票据。
- Tuff Intents / Action Manifest 只能描述动作合同，不得携带 provider secret、用户原文或敏感上下文；Workflow 编排引用 actionId，不复制动作实现。
- Stable 只承诺 `text.chat`、`text.translate`、`text.summarize`、`text.rewrite`、`code.explain`、`code.review`、`vision.ocr`；未完成 runtime adapter 的多模态能力不得宣传为稳定可用。
- Nexus Provider / Scene 在 2.5.0 只作为架构约束，不作为稳定执行链路；Scene runtime 编排进入后续 2.5.x。

### 7.11 AI 路由 V2（2026-03-17）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 执行入口 | `/api/chat/sessions/*`（`/api/aigc/executor` 与 `/api/v1/chat/sessions/:sessionId/{stream,turns}` 已 hard-cut 下线） | 已统一接入 |
| 路由策略 | `Quota Auto` 速度优先 + 探索流量 | 已落地 |
| 评比指标 | `queueWaitMs/ttftMs/totalDurationMs/success/errorCode/finishReason` | 已落库 |
| 熔断恢复 | 失败阈值 + 冷却 + 半开探测 | 已落地 |
| 运行时模型目录 | `/api/runtime/models` 驱动前端模型选择 | 已落地 |

**质量约束落地**
- 路由决策必须可解释：需输出 `selectionSource + selectionReason + routeComboId`。
- 模型开关必须可控：`internet`、`thinking` 均需透传至后端执行链路。
- 路由异常必须自动回退：LangGraph Local Server 不可用时回退 deepagent，不得阻断主对话链路。

### 7.12 Core Main 生命周期止血（2026-03-23）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 启动链路 | 必需模块失败即 fail-fast，`ALL_MODULES_LOADED` 仅在全链路成功后触发 | 已收口 |
| 退出链路 | 运行时 `process.exit(0)` 已从主退出路径移除（close/tray） | 已收口 |
| EventBus 契约 | `once` 消费生效，`emit/emitAsync` 支持 handler 级异常隔离，新增诊断 | 已收口 |
| IPC 稳定性 | `dialog:open-file` 重复注册收敛为单注册点 | 已收口 |
| 回归门禁 | 定向 vitest（19 tests）+ `typecheck:node` | 已通过 |

**质量约束落地**
- 任何主进程业务退出路径不得直接 `process.exit(0)`，必须统一通过 `app.quit()` 与模块卸载流程。
- 启动健康态必须以“模块加载 + TouchApp 初始化完成”为前置，不允许发送虚假 `ALL_MODULES_LOADED`。
- 事件总线必须保证“单 handler 失败不影响其他 handler”与 `once` 监听器一次性语义。
- 关停流程必须可等待（`emitAsync` + `unloadAll`），并可观测 `app-quit` 上下文下的资源清理。

### 7.12 Core Main 生命周期收口与去耦首轮（2026-03-23）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 关停超时保险 | `before-quit` 新增默认 `8s` timeout guard，超时/异常后继续退出 | 已收口 |
| 卸载观测 | `ModuleUnloadObservation` 记录 `reason/appClosing/duration/failedCount` | 已落地 |
| 运行时上下文 | 生命周期统一注入 `ctx.runtime`（`MainRuntimeContext`） | 已落地 |
| 全局耦合守卫 | `$app` 直接读取限制已迁入 CoreApp ESLint runtime boundary rules | 已落地 |
| 结构治理首轮 | plugin/file/update 完成首轮服务拆分，外部契约保持不变 | 已落地 |
| 回归子集 | Core main 定向测试 + `typecheck:node` + ESLint runtime boundary rules | 已通过 |

**质量约束落地**
- 主进程退出流程必须具备“可等待 + 可超时脱困”双保险，禁止因单个 `before-quit` handler 阻塞导致无法退出。
- 生命周期观测必须包含可回归字段（`reason/appClosing/duration/failedCount`），用于“启停循环”稳定性对比。
- 新模块默认通过 `ctx.runtime` 获取依赖，不得新增 `globalThis.$app` 读取点；存量兼容仅允许过渡期一次性告警。
- 结构拆分必须保持外部 event 名称与 payload 兼容，且每次拆分补齐 direct tests，不以集成测试单点兜底。

### 7.13 脚本治理去重首轮（2026-03-23）

**现状指标**
| 项目 | 结果 | 结论 |
| --- | --- | --- |
| 历史 guard 公共库 | `scripts/lib/scan-config.mjs`、`file-scan.mjs`、`version-utils.mjs` 曾承载扫描复用；当前 guard 脚本已退场 | historical |
| 网络边界入口 | direct `fetch/axios` 限制已迁入 ESLint | 已落地 |
| CoreApp 网络边界 | 改为 ESLint 统一约束，删除重复 guard 实现 | 已收口 |
| 构建脚本拆分 | `build-target/postprocess-mac.js` 从主脚本抽离 | 已落地 |

**质量约束落地**
- 可表达为静态代码约束的边界必须优先进入 ESLint，避免维护重复扫描脚本。
- 同类质量规则仅允许一个实现来源；workspace 侧优先复用各自 ESLint 配置与 root lint 入口。
- 大体量编排脚本必须按“编排层 + 平台实现层”拆分，降低单文件风险与回归成本。
- 桌面打包链路必须校验 `PACKAGED_RUNTIME_MODULES` 完整运行时依赖闭包真实进入产物可解析路径（`app.asar` 或 `resources/node_modules`）；当前基线含 `ms`、`@sentry/electron` 及其 Sentry/OpenTelemetry 闭包、`require-in-the-middle`、`module-details-from-path`，以及 `@langchain/core` 当前已知高风险缺包 `p-retry`、`retry`、`langsmith`、`mustache`、`camelcase`、`decamelize`、`ansi-styles`、`@cfworker/json-schema`，再加上 `compressing -> tar-stream -> readable-stream` 当前已知缺包 `process-nextick-args`、`core-util-is`、`inherits`、`string_decoder`、`util-deprecate`、`once`、`wrappy` 与 `typed-array-buffer` 相关辅助包，禁止产出“可安装但主进程启动即崩”的坏包。
- CoreApp runtime dependency 打包链路只能从 `apps/core-app/scripts/build-target/runtime-modules.js` 的 runtime module manifest / closure helper 获取 root 清单、平台 native 清单与传递依赖闭包；`ensure-runtime-modules`、`ensure-platform-modules`、`afterPack` 与 packaged verifier 禁止再各自实现模块发现/闭包递归。
- Runtime dependency 回归必须覆盖 pnpm hoisted dependency、包内局部 transitive dependency、optional 缺失跳过、workspace native root 复制与 workspace transitive 跳过边界；当前 smoke contract 为 `apps/core-app/src/main/core/runtime-modules.contract.test.ts`。
- 对于被标记为 `resources/node_modules` 或因 asar 缺包被 promoted 到 `resources/node_modules` 的运行时根模块，构建阶段必须递归同步并校验其传递依赖闭包位于同一 resources 可解析路径；闭包包含必需 `peerDependencies`，但跳过 `peerDependenciesMeta.optional` 标记的可选 peer，不能只检查根模块是否存在。
- 对于 `app.asar` 内保留运行时加载的第三方包，也必须校验其传递依赖闭包完整；当前基线至少覆盖 `@vue/compiler-sfc` 及其 Vue compiler 闭包，以及 `@sentry/electron -> @opentelemetry/sdk-trace-base -> @opentelemetry/resources` 这类主进程启动期依赖链。
- 单实例链路只能在 bootstrap 入口注册一次 `second-instance` 监听；业务模块统一消费应用事件总线，且任何“聚焦/恢复窗口”动作都必须先做 BrowserWindow 活体校验，禁止把重复启动事件直接绑定到可能已销毁的窗口对象上。
- `webcontent` 插件安装与加载都必须校验本地 UI 入口文件完整性：hash-route 场景至少要求 `index.html`，显式 HTML 路径要求对应文件存在；若同目录保留原始 `.tpex` 包，允许一次性自愈缺失文件，但失败时必须转为受控 issue/失败态，不能把 `ERR_FILE_NOT_FOUND` 留到运行时再暴露。
