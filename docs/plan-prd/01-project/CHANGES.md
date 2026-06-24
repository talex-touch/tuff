# 变更日志

> 更新时间：2026-06-24
> 定位：只保留 6 月当前阶段的高信号变更索引。6 月以前流水记录已从文档树移除，可从 Git 历史追溯。

## 2026-06-24

### coreapp: close assistant floating ball visible evidence

- `assistant-floating-ball-entry` visible surface 标记为 `passed`，绑定 packaged Assistant floating ball probe JSON 与 Settings / visible / drag persist / Voice Panel screenshots。
- 悬浮球位置保存增加立即落盘入口，避免拖动后重启丢失位置；packaged probe 已覆盖 220/220 -> 316/292 拖动、重启后位置持久化。
- Voice Panel opened 事件改为窗口广播路径，避免点击悬浮球打开面板时被 renderer 回包阻塞；证据截图展示 `翻译剪贴板图片` 与 `截图并翻译` 入口。
- `assistant-screenshot-translate` 仍保持 pending：下一步继续采 packaged clipboard image translate、screenshot translate、pin window、provider unavailable 与 screenshot permission/unsupported failure evidence。

### r7: fail-close Nexus governance evidence sources

- Governance report evidence 拆开 preview / production authenticated cockpit，并统一使用 `live` / `d1` / `r2` / `local-only` / `memory` / `open` source 语义。
- Storage smoke 只有真实 R2 write/read/delete 且 `evidenceSource=r2` 才晋级 `r2`；browser notification、本地 storage smoke、dry-run / consumed provider quota smoke 不晋级 production evidence。
- Notification live-send 只有 credential-backed external `sent` 且 `evidenceSource=live` 才晋级 `live`；D1 readiness 已接入 `d1-production` report evidence，缺 binding / migration / backfill / index 时保持 open blocker。
- Governance report API 记录 `governance.operator_cockpit.viewed` 低敏审计，包含 environment / format / deployment id source，作为 production / preview browser evidence 的辅助索引而非替代证据。
- Direct invoke provider quota 校验改为按 capability channel 在 dispatch 前阻断，channel-specific exhausted quota 不进入模型调用、不扣 credits、不写 provider request 伪证据；R7 仍保持 partial，等待真实 production / preview 采证。

### r8: land locale core and plugin localized manifest foundation

- `packages/utils/i18n` 新增共享 Locale Core：规范 `zh-CN` / `en-US` 与短码 `zh` / `en` 映射，并提供显式 fallback chain。
- 新增 `LocalizedText` / `LocalizedList` 纯 resolver；CoreApp main i18n helper 与 `$i18n:key` resolver 已复用共享 locale normalize。
- CoreApp 插件 loader 支持 localized `displayName` / `description` / feature name-desc-keywords / permission reasons，运行时保留稳定 `manifest.name` 作为插件 ID，并在插件列表、详情与安装权限确认展示解析后的本地化文本。
- Focused 验证：`packages/utils` i18n 单测、CoreApp plugin loader 单测、官方插件 manifest boundary、CoreApp node typecheck 与 scoped ESLint 已通过；Domain Lexicon、Plugin SDK facade、CatalogService 与质量门禁仍按 R8 后续 phase 推进。

### r9: strengthen local knowledge metadata retrieval

- `LocalKnowledgeEngine` 的 metadata filters 支持 dotted nested path 与数组包含匹配，检索和 Context Builder 继续保留 FTS5 / SQLite / citation 主路径，不引入 embeddings 或 vector DB。
- `KnowledgeSearchInput.metadata` 注释补明确切匹配语义：顶层 key、嵌套 path、数组 scalar 包含；便于 2.5.4 ContextHygiene 消费更细粒度 retrieval/citation 来源。
- ContextHygiene retrieval scope 现在把 2.5.3 `citation`、document id、source type/uri、retrieval status 与 degraded reason 写入 `ContextPackage.items[].metadata`，并把 retrieval summary 写入 package log metadata，补上 2.5.3 -> 2.5.4 的 citation/explain 桥接。
- 新增 metadata-only `contextListPackageLogs` / `contextListCheckpoints` typed SDK / CoreApp channel，可按 session / trace 读取 package log source id、reason、token estimate、citation/status/degraded metadata，并按 session/type 读取 checkpoint boundary reason/context scope/metadata，不返回 prompt/turn content，为后续 explain drawer 提供真实读取入口。
- `@talex-touch/tuff-intelligence` 镜像 SDK 已补齐 knowledge/context typed events 与 `contextListPackageLogs` / `contextListCheckpoints`，CoreApp Intelligence Audit 日志展开区可按 trace 懒加载 context package metadata-only 摘要，并按 session 显示 checkpoint boundary type/reason/scope/metadata keys，不展示 prompt/turn content。
- 官方 `touch-intelligence` CoreBox AI Ask 在 text.chat / vision.ocr 调用前 fail-soft 调用 `contextPrepareTurn`，把 ContextPackage 安全摘要写入 invoke metadata、widget payload 与 item meta；ContextPackage 内容不回灌 prompt，ContextHygiene 不可用时继续原 AI Ask 流程。
- ContextHygiene 新增只读 `contextEvaluateMemory` typed SDK / CoreApp channel，可对显式记忆候选返回 `suggested` / `rejected` / `needs_review`，并在写入前拦截 secret、sensitive review 与用户 opt-out；官方 `touch-intelligence` CoreBox AI Ask 仅在用户显式“记住 / remember”时 fail-soft 生成 memory policy 摘要并写入 metadata/widget payload，该入口不写 SQLite、不自动保存长期记忆。
- Focused `intelligence-local-knowledge-engine`、`intelligence-context-hygiene`、utils / tuff-intelligence transport SDK 与官方插件 tests 已通过；R9.1/R9.2 仍需继续补完整 explain drawer、OmniPanel/Workflow/Assistant 最近路径与更多真实数据 evidence。

### touch-music: reduce player control semantic debt

- `IconButton` 与 `PlayPause` 从 `div role="button"` 收为原生 `button`，补齐 click emit、`aria-label` / `aria-pressed` 与默认 button 样式 reset。
- Footer 播放控制、全屏歌词控制、搜索结果关闭条与歌词入口改为可聚焦语义按钮，减少 `span/div @click` 债务。
- `FooterFunction` 播放模式切换从模板内赋值改为显式 handler，并保持本地状态与 `musicManager.playManager.playType` 同步；focused ESLint、Vite production build 与 `git diff --check` 已通过。

### touch-translation: gate result copy through plugin clipboard SDK

- `TranslationCard` 复制翻译结果从 `navigator.clipboard.writeText` 改为 `useClipboard().writeText`，复制动作回到插件 Clipboard SDK / permission gate。
- 新增 `TranslationCard.clipboard.test.ts`，覆盖 SDK 可用时写入与 SDK unavailable 时 fail-closed、不回退浏览器原生 clipboard。
- Focused `vitest`、ESLint、`vue-tsc --noEmit` 与 `git diff --check` 已通过；UnoCSS web font fetch 在测试中只出现外部字体超时警告，不影响测试结果。

### touch-emoji-symbols: tighten clipboard copy fail-closed boundary

- Emoji / symbol copy action 继续走插件 `clipboard.writeText`，并在 `clipboard.write` permission SDK 缺失、请求异常、用户拒绝时返回明确 blocked reason。
- Clipboard SDK 缺失或写入异常时返回 `clipboard-unavailable` / `clipboard-write-failed`，不落入静默失败或原生剪贴板回退。
- Focused `node --test` 覆盖 denied、permission SDK unavailable、clipboard SDK unavailable、permission request failed、clipboard write failed 与 granted success；静态扫描确认未使用 `navigator.clipboard`。

### touch-snippets: fail closed on clipboard read/write boundaries

- `readClipboardText` 修正为检查 `permissionResult.granted`，clipboard.read 被拒、permission SDK 缺失或 clipboard SDK 缺失时不再继续读取剪贴板。
- `writeClipboardText` 增加 clipboard SDK 缺失与写入异常的显式 blocked reason；导入剪贴板片段包在读取失败时返回 blocked，不再把空内容送进 import path。
- Focused `node --test` 覆盖 clipboard.read denied 不触发读取、read/write SDK unavailable 与 write failure；静态扫描确认未使用 `navigator.clipboard`。

### touch-dev-utils: tighten copy action clipboard boundary

- 开发工具复制 action 的 permission gate 从 boolean 结果升级为 `{ granted, reason }`，permission SDK 缺失、用户拒绝或请求异常时返回明确 blocked reason。
- Clipboard SDK 缺失或写入异常时返回 `clipboard-unavailable` / `clipboard-write-failed`，不落入静默失败或原生剪贴板回退。
- 新增 `index.test.cjs` 与 `pnpm -C plugins/touch-dev-utils test`，覆盖 permission SDK unavailable、clipboard SDK unavailable、write failure 与 granted success；scoped ESLint 已通过。

### touch-text-tools: tighten copy action clipboard boundary

- 文本工具复制 action 的 permission gate 从 boolean 结果升级为 `{ granted, reason }`，permission SDK 缺失、用户拒绝或请求异常时返回明确 blocked reason。
- Clipboard SDK 缺失或写入异常时返回 `clipboard-unavailable` / `clipboard-write-failed`，不落入静默失败或原生剪贴板回退。
- 新增 `index.test.cjs` 与插件本地 `package.json` test script，覆盖 permission SDK unavailable、permission request failed、clipboard SDK unavailable、write failure 与 granted success。

### touch-quickops: mark stateful cleanup flow payloads

- QuickOps safe Flow 动作 payload 增加 `statefulRuntime` 标记，便于 CoreApp runtime 明确识别状态型 QuickOps 动作。
- `stop-*` / `reset-*` 清理型动作额外标记 `cleanup: true`；`pause` / `resume` / `lap` 保持状态动作但不误标为 cleanup。
- 插件自测覆盖 payload / item meta 标记、敏感 query 不进入 dispatch payload、Flow SDK unavailable fail-closed；`pnpm -C plugins/touch-quickops test` 与 `git diff --check` 已通过。

### touch-quickops: expose screen-clean visual contract marker

- `quickops.clean-screen` 与 `quickops.stop-clean-screen` 插件 item 增加 `visualContract.id = quickops-screen-clean-visual`，与 CoreApp visual evidence checklist 对齐。
- marker 只作为低敏 UI/evidence routing contract，不新增 runtime dispatch payload、不伪造 visual evidence，也不绕过 start clean-screen 的 confirmation requirement。
- 插件自测覆盖 stop clean-screen safe Flow 与 start clean-screen confirmation-required 两条路径；QuickOps focused `node --test` 已通过。

### touch-quickops: expose Pomodoro default template contract

- QuickOps settings summary 从 diagnostics 默认值生成只读 `pomodoroTemplates` contract，暴露默认 focus/break 模板的 `focusMs`、`breakMs`、`cycles` 与 `state=read-only`。
- `pomodoroAdvancedLoopState` 明确标记为 `pending-host-capability`，不在插件侧伪造高级循环 runtime 或绕过 host policy。
- 插件自测覆盖 settings meta 中的 Pomodoro 默认模板 contract；QuickOps focused `node --test` 已通过。

### tuffex: make TxNavBar action zones semantic

- `TxNavBar` 左/右 action zone 从 clickable `div` 收为原生 `button`，补齐 `aria-label`、disabled 与键盘/focus 语义。
- 默认 back 行为继续同时发出 `back` 与 `click-left`；空 left/right slot 保持 disabled，不产生空点击事件。
- Focused `nav-bar.test.ts` 覆盖默认返回、自定义 slot、空 action zone 和 disabled 边界；TuffEx focused Vitest、ESLint、静态 clickable-div 扫描与 `git diff --check` 已通过。

### tuffex: make TxTabItem semantic

- `TxTabItem` 根节点从 `div role="button"` 收为原生 `button type="button"`，移除手写 tabindex / Enter 处理并使用原生 disabled 语义。
- 保留既有 class / fake-background 视觉合同，补 button reset 样式，避免默认边框、字体或背景影响 Tabs 现有外观。
- Focused `tabs.test.ts` 覆盖 tab item button 语义、disabled 属性和禁用 tab 不切换；TuffEx focused Vitest、ESLint、静态 clickable-div 扫描与 `git diff --check` 已通过。

### tuffex: make TxBlockLine link rows semantic

- `TxBlockLine` 非 link 模式保留普通展示 `div`，不再携带 `role="button"` / tabindex；link 模式改为原生 `button type="button"`。
- 保留既有 class / fake-background 视觉合同，补 button reset 样式，避免默认按钮边框、字体或背景影响 group-block 外观。
- Focused `group-block.test.ts` 覆盖普通行无交互语义、link 行 button 语义与 click emit；TuffEx focused Vitest、ESLint、静态 clickable-div 扫描与 `git diff --check` 已通过。

### tuffex: make TxFileUploader drop zone semantic

- `TxFileUploader` drop zone 从 `div role="button"` / `div @click` 收为原生 `button type="button"`，内部 browse 文案改为视觉 `span`，避免嵌套按钮。
- Disabled 状态使用原生 `disabled` 阻断 browse activation，并保留 existing drop / drag / file list class contract。
- Focused `file-uploader.test.ts` 覆盖 drop zone button 语义、disabled browse 阻断与文件 add/remove；TuffEx focused Vitest、ESLint、静态 clickable-div 扫描与 `git diff --check` 已通过。

### tuffex: make TxSegmentedSlider segments semantic

- `TxSegmentedSlider` segment 从 `div role="button"` / 手写 Enter-Space 处理收为原生 `button type="button"`，使用原生 disabled 与键盘激活语义。
- 保留 segment/dot/label class contract，补 button reset 样式，避免默认按钮边框、背景或字体影响现有滑块视觉。
- Focused `segmented-slider.test.ts` 覆盖 segment button 语义、active/completed 状态、disabled 阻断与 click emit；TuffEx focused Vitest、ESLint、静态 clickable-div 扫描与 `git diff --check` 已通过。

### tuffex: make TxCollapseItem header semantic

- `TxCollapseItem` header 从 `div role="button"` / 手写 Enter-Space 处理收为原生 `button type="button"`，使用原生 disabled 与键盘激活语义。
- 保留 header / arrow / content class contract，补 button reset 样式，避免默认按钮边框、宽度或字体影响 collapse 外观。
- Focused `collapse.test.ts` 覆盖 header button 语义、aria-expanded / aria-controls、多面板和 accordion toggle、disabled 阻断；TuffEx focused Vitest、ESLint、静态 clickable-div 扫描与 `git diff --check` 已通过。

### tuffex: clean TxCardItem default non-interactive semantics

- `TxCardItem` 默认不再给非 clickable 卡片设置 `role="button"` / `tabindex="-1"`，避免展示型卡片被辅助技术识别为按钮。
- clickable 模式继续支持调用方显式传入 role，并保留当前容器型 click/Enter 行为，避免破坏 right slot 内嵌按钮等既有用法。
- Focused `card-item.test.ts` 覆盖默认非交互语义、clickable 显式 role、disabled 阻断与现有 slot/avatar 渲染；TuffEx focused Vitest 与 ESLint 已通过。

### nexus: close provider migration evidence dry-run

- `provider-migration-evidence` visible surface 标记为 `passed`，绑定 Nexus local-only dry-run migration summary artifact。
- Evidence 覆盖 migration summary、planning readiness、migrated/skipped/failed counts、`migration_dry_run_only` / `migration_not_executed` blockers 与 secret redaction。
- 明确 dry-run evidence 不声明 registry-primary runtime readiness；`provider-registry-observability`、Assistant 与 Workflow broader surfaces 仍 pending。

### docs: plan R8/R9 next-stage batches

- 新增 `R8-R9-Next-Stage-Execution-Plan-2026-06-24.md`，把 R8 i18n / Domain Lexicon / Catalog 2.6.0 与 R9 AI 2.5.x 后续能力拆成 next-stage 分批计划。
- R8 推荐先做 audit baseline、Locale Core、`LocalizedText` / `LocalizedList` 与插件 manifest localized metadata，再推进 Domain Lexicon、Plugin SDK facade、CatalogService 与质量门禁。
- R9 推荐先做 2.5.3 Local Knowledge Retrieval 与 2.5.4 ContextHygiene，再推进 2.5.5 Local Model Runtime 和 2.5.8 ASR Provider Runtime；这些批次不抢当前 R1/R2/R3 稳定化窗口。

### r3: add durable indexing task audit fields

- Indexed source task history 增加 `durationMs`、`reason`、`trigger`、`attempt`、`errorCode`、`errorMessage` 等低敏审计字段，scan/watch/reconcile/reset builder 与 runtime 写入统一填充。
- 生产路径继续复用 `SqliteIndexingTaskStateStore` / `indexed_source_task_state` 持久化 recent task history，并对白名单字段做 sanitize / clone，避免未知持久 JSON 透传到 diagnostics。
- Settings indexing source diagnostics task chip 展示 duration / trigger / reason / attempt / code；focused utils/CoreApp/renderer tests 已覆盖。该切片不新增 SQLite schema、不迁移 FTS ownership、不改 `scan_progress` source scope，packaged Settings evidence 仍待补。

### r3: add read-only search index migration preflight

- 新增 `search:index-migration:preflight` CLI 与纯 report builder，用 `PRAGMA query_only = ON` 只读检查真实 SQLite profile，不执行 schema/data migration，也不清理 FTS 或 `scan_progress`。
- Preflight report 覆盖 required tables、`scan_progress` path-only/source-scoped shape、blank/invalid progress rows、legacy `file_fts`、`search_index` FTS5 shadow tables、provider row parity、keyword/meta orphan 与 meta coverage，并新增 `migrationDryRun` plan 输出 approval/blocker、预计影响 rows、rollback 与 verification。
- CLI 支持 `--output <report.json>` 生成可附到迁移审批的只读 evidence artifact；focused tests 覆盖 path-only、blocked、clean source-scoped、unsafe rows report 与文件落盘。该切片只提供 SQLite/FTS durable ownership 与 `scan_progress` source-scoped migration 前置证据，不代表真实迁移已执行。

### r3: make scan_progress runtime source-scope compatible

- 新增 `scan-progress-schema` helper，运行期检测 `scan_progress` 是否存在 `source_id`，避免在真实 schema migration 前硬编码 path-only 假设。
- FileProvider scan progress 读取、runtime reset cleanup 与 SearchIndex worker upsert 在 source-scoped 表上按 `file-provider` + path 隔离读写；旧 `scan_progress(path primary key, last_scanned)` 表继续走现有 path-only Drizzle 逻辑。
- Focused tests 使用真实临时 SQLite 覆盖 source-scoped read/delete/upsert isolation；该切片不创建/迁移 `scan_progress` schema，不执行数据 backfill。

### r3: add controlled scan_progress source-scope migration helper

- `planScanProgressSourceScopeMigration()` 只读输出 `scan_progress` source-scoped migration 的 approval、schema/data rewrite、blocker、rollback 与 verification 信息。
- `runScanProgressSourceScopeMigration()` 仅在显式调用时执行 path-only -> `PRIMARY KEY(source_id, path)` 迁移，使用 staging table、`BEGIN IMMEDIATE`、`scan_progress_path_only_backup` 与 path index。
- Focused tests 使用真实临时 SQLite 覆盖旧 DB 迁移、新 DB 初始化、unsafe rows blocked 与 post-migration source-scoped shape；该 helper 尚未接入生产 DB migrations，也未执行真实 profile 迁移。

### coreapp: close omnipanel writing tools visible evidence

- `omnipanel-writing-tools` visible surface 标记为 `passed`，绑定 packaged OmniPanel writing tools screenshots。
- Evidence 覆盖 selected-text context / recovery hint、5 个 writing actions、AI result preview metadata、Retry / Copy / Replace Clipboard 与 replace confirmation。
- strict visible gate 仍因 Assistant / Workflow / Provider broader surfaces pending 失败，但不再列出 `omnipanel-writing-tools`。

### assistant: land screenshot translate MVP code path

- Assistant typed events、VoicePanel 双入口、cursor-display screenshot -> image translate -> pin window 主流程与 focused tests 已落地。
- 当前状态仍是 code-partial：packaged clipboard image translate、screenshot translate、pin window source/target、provider unavailable 与 screenshot permission/unsupported failure evidence 尚未闭环。
- `assistant-screenshot-translate` surface 继续保持 pending，不能仅凭 focused tests 或代码路径标记 visible evidence passed。

### coreapp: close app-index workbench visible evidence

- `app-index-workbench` visible surface 标记为 `passed`，绑定 `app-index-workbench-summary-2026-06-24.*`、`app-index-workbench-filtered-empty-2026-06-24.*`、probe JSON 与 diagnostic JSON。
- 新增 packaged App Index workbench probe，使用 isolated userData、真实 Settings -> File Index -> App Index Manager UI、typed appIndex transport 与 isolated SQLite fallback 覆盖 UWP/Store、Steam、shortcut、protocol、AppRef、path source filters。
- 诊断证据覆盖 found / unchecked / disabled / attention 状态，`app-index:diagnostic:verify` 通过；strict visible gate 仍因 Assistant / Workflow / Provider broader surfaces pending 失败，但不再列出 `app-index-workbench`。

### coreapp: close browser login recovery visible evidence

- `browser-login-recovery` visible surface 标记为 `passed`，绑定 `login-browser-open-failure.png/json` 与 `login-timeout-or-network-failure.png/json`。
- 新增 packaged login recovery probe，覆盖 browser-open failure waiting session、manual login URL / short code copy action、timeout retry 文案与 network failure copy JSON。
- `useAuth` 登录恢复状态机补齐 callback resolve 时清理 countdown interval、retry reopen 失败进入 failed 状态。

### docs: stage remaining execution batches

- `TODO.md` 新增分批执行计划，把 30min 侦察批、2-5h R2 surface、半天批、R3 durable 设计批与高风险 migration 设计批拆开，明确每批交付物和文档落点。
- `TODO-AI.md` 新增 R2 visible gate 执行梯队，按 `browser-login-recovery`、`app-index-workbench`、Provider / OmniPanel / Assistant surfaces、长链路 surfaces 排序，并写明每个 surface 的关账条件。
- `TODO-R3.md` 新增 durable job history 最小设计，限定在 runtime task/job history 与 Settings diagnostics evidence，不进入 SQLite/FTS ownership 或 `scan_progress` schema migration 实现。

### corebox: add tool-only app search source aliases

- App Index 增加 tool-only source/alias catalog，先覆盖开发工具、IM、设计工具三类以及 Photoshop、Codex、VSCode、飞书、微信、Telegram 高频工具。
- CoreBox app 搜索将 `im`、`design`、`ps`、`codex` 归入稳定 alias 命中，并在结果 metadata 中暴露 `toolSources` 与更准确的 `alias` match source。
- Indexed Source diagnostics 增加 `app-provider:tool-sources` evidence，便于确认工具 source/alias catalog 的覆盖范围和版本。

### docs: draft OmniPanel and assistant next PRD

- 新增 `docs/plan-prd/03-features/omnipanel-assistant-next-prd.md`，梳理 OmniPanel、悬浮助手、桌面烟花、性能优化与截图翻译逐步引入的下一版本 PRD。
- 新增 `.spec-workflow/specs/omnipanel-assistant-next/requirements.md`，按 spec workflow 记录 EARS 风格需求与非功能约束。
- 同步 `docs/plan-prd/README.md` 与 `docs/INDEX.md` 高价值专题入口。

## 2026-06-22

### nexus: harden privacy export and account deletion flow

- 隐私数据导出改为 `privacy_export_jobs` 异步任务，Dashboard 创建 job 后轮询状态，成功后通过下载端点取得 JSON 附件。
- 账号注销改为 30 天冷静期：提交后进入 `deletion_pending`，普通会话、App Token 与 API Key 访问被拒绝，30 天内真实登录会自动恢复为 `active`。
- 注销确认新增服务端条款阅读会话，前端弹出详细条款与确认短语，后端强制校验至少阅读 30 秒且 session 只能使用一次。

### release: bind real R1 gate-e evidence

- 对 `v2.4.12-beta.8` 执行 GitHub Release、Nexus release/latest/assets/download/signature endpoint 与 CoreApp signature verifier 复采。
- 证据落到 `docs/engineering/reports/release-integrity-2026-06-22/`，并同步 R1 Evidence Matrix。
- 当前真实链路结论：Nexus metadata/latest/assets/download 已通；GitHub manifest 存在；Gate E 仍被 `.sig/.asc` sidecar、manifest `signature` 字段、Nexus `signatureUrl/signatureKey` 与 signing public key 缺失阻塞。

### tuffex: stabilize select dynamic dropdown behavior

- `TuffSelect` 支持直接 `options` 数据源、loading / empty 状态与自定义 option/loading/empty slot。
- `TuffSelect` 增加多选标签返显、标签移除、自助创建、分组选项、自定义 footer 与 error / warning 状态。
- Select 选中反显改为基于 props options 与 slot item registry 的统一 label map，slot item 卸载时注销，避免动态选项旧状态残留。
- 下拉 spacing 收敛为 content / option padding，动画 duration 默认缩短并支持透传 animation。
- `TxBaseAnchor` 在 reference / content 尺寸变化时同步刷新 floating 位置与轮廓尺寸。
- disabled Select 触发器统一整块 `not-allowed` 光标，避免只有边缘显示禁用光标。

## 2026-06-21

### nexus: standardize provider registry admin workspace

- 服务渠道页改为 TuffEx 统计卡、标准 `TxDataTable` 列表与 `TxDrawer` 添加/编辑抽屉。
- Provider、能力与 Scene 统一为 list CRUD 工作台，用量与健康记录改为只读表格。
- 创建服务渠道改为「服务大类 -> adapter」二级选择，并补齐 AI / Exchange / Screenshot / Translation 分类模板与 OpenAI Responses adapter。
- 补齐服务渠道相关中英文 i18n，将中文界面的 Provider / Scene / dry-run / adapter 等混排文案收敛为中文术语。

### nexus: merge AI credits into user management

- Dashboard 工作台与 Intelligence 管理页移除独立 AI 积分入口，旧积分路由改为跳转到账号/用户管理。
- 用户管理编辑抽屉新增所选用户积分摘要、最近流水与管理员增减积分操作。
- 新增管理员用户积分 GET/PATCH API，积分调整写入 credit ledger 与 admin audit，并限制减少额度不能低于已用积分。

### nexus: expose account details in settings

- `dashboard/account` 新增「详情信息」Tab，按行展示账号 ID、邮箱、角色、语言偏好、创建时间与最近更新，并支持点击复制 ID / 邮箱。
- `/api/user/me` 补充 `status`、`createdAt`、`updatedAt`，其中 `updatedAt` 来自现有用户/凭据/OAuth/Passkey 记录的只读聚合。

### docs: clean reports and evidence

- 删除 6 月以前的 reports / audits / historical snapshots / pre-compression archives。
- 将 6 月 evidence 中的 `raw`、`logs`、`user-data` 等运行态产物移出仓库文档树，保留到本地忽略目录 `.doc.local/docs-evidence/`。
- 更新 `.gitignore`，阻止 `docs/engineering/reports/**` 下的 Chromium profile、GPUCache、Cookies、SQLite DB、`.key`、logs 与 raw 产物进入提交。
- `docs` 目录体积从约 `111M` 降到约 `11M`；`docs/engineering/reports` 从约 `102M` 降到约 `2.2M`。

### corebox: keep text search independent from stale clipboard images

- 普通文本搜索默认不携带 stale clipboard image input。
- 空查询、插件/AI send-mode 或显式 `includeClipboardImage=true` 仍可带图片输入。
- no-result 空态保留 retry 与 File Index settings action，并在空态 DOM 落地后触发布局刷新。
- 代码侧验证通过 focused CoreBox tests、CoreApp typecheck 与 `build:unpack`。
- 2026-06-22 R2D packaged 复采通过本机 Apple Development 签名绕过 macOS 启动阻断，并修复普通 `core-box` 可见搜索态 resize 链路；`corebox-search-states` 已取得 idle、searching/warm-up 与 no-result retry/File Index settings 可接受截图。该 surface 仍保持 pending，因为 isolated packaged profile 无 result rows，source/status/reason pills 仍缺真实可见样本，采集期间 app scanner 报 `spawn EBADF`。
- 2026-06-22 R2I packaged 复采关闭 `corebox-search-states`：`set-query` 会强制触发搜索并在 accept 后派发布局刷新，CoreBox manager 会在内部 `_show=true` 但 BrowserWindow 实际 hidden 时重试 show；真实 `screenshot` 查询让窗口从 `720x56` resize 到 `720x242`，并采到 source/status/reason pills 无重叠的可见截图。
- 2026-06-22 R3 非 schema runtime-store 小切片完成：FileProvider incremental DB persist、FTS write/delete 与 index worker flush 现在统一进入 indexed source runtime/store evidence；未触碰 `scan_progress` schema migration。

### ai: pass CoreBox AI Ask packaged stable surface

- `AI-STABLE-01/02/03/04/05/06/07/08` 已绑定独立 packaged probe JSON + PNG artifacts。
- CoreBox AI Ask packaged surface 已标记 `passed`。
- 已覆盖 text.chat success、OCR handoff、logged-out、provider unavailable、quota exhausted、model/capability unsupported、copy failure visible、Local/Ollama routing。
- global strict visible gate 仍按预期失败，剩余 search/app-index/login/OmniPanel/Assistant/Workflow/Provider broader surfaces pending。

### startup: bind packaged startup evidence

- packaged hot startup benchmark：10/10 passed，Startup health P50 `552ms`，P95 `810ms`，0 WARN / 0 ERROR。
- packaged cold startup benchmark：10/10 passed，Startup health P50 `572ms`，P95 `615ms`，0 WARN / 0 ERROR。
- startup first-screen evidence 证明 Settings/onboarding 首屏可用，Startup health summary 可达。

### roadmap: current execution handoff

- 当前 SoT 统一到 `Roadmap-vNext-2026-06-18.md`、`Current-Execution-Plan-2026-06-17.md`、`TODO.md`、`TODO-AI.md`、`TODO-R3.md`。
- R1 Release Integrity 仍需真实 GitHub Release ↔ Nexus endpoint/signature matrix。
- R2 AI Stable CoreBox AI Ask 已通过，global visible gate 仍 pending。
- R3 仍按约 `70%`，剩余 runtime-store migration、source-scoped `scan_progress`、durable scheduler evidence。
- Nexus 性能线单独收敛到 `TODO-nexus.md`，不与 CoreApp / AI / R3 dirty files 混批。

### release: advance R1 integrity chain

- GitHub update provider 保留 artifact `.sig` 到 `DownloadAsset.signatureUrl`。
- Nexus release asset metadata 增加 `signatureKey` / `signatureUrl`，只暴露真实记录的 signature endpoint 或 GitHub HTTPS signature URL。
- Nexus signature endpoint 改为读取记录的 `signatureKey`，避免凭 `${fileKey}.sig` 猜测导致 metadata 指向 404。
- 新增 `Evidence-Matrix-Release-Integrity-2026-06-21.md` 记录 focused matrix；Gate E 仍等待真实 GitHub Release ↔ Nexus endpoint/download/signature 运行证据。

### nexus: refine global search surface

- Nexus 全局搜索从 header 搜索按钮 FLIP/GSAP 展开到最终命令面板。
- 空查询默认展示热点入口，并在底部显示快捷键提示与 `Powered by Tuff Intelligence.`。
- `TxCommandPalette` 增加 empty/footer slots 与 overlay/panel class props，用于业务侧克制扩展。

### nexus: align dashboard activity and device status

- Dashboard overview 下层活动流 / 设备状态与上层趋势卡片统一 `8/4` 栅格比例，修正两层卡片竖向对齐。
- 设备状态卡增加平台 brand icon，并优先展示最近访问 IP 与归属地。
- `auth_devices` 增加最近访问 IP / Geo 字段，设备 upsert 时记录真实请求来源；活动流合并最近登录与设备访问，避免有设备记录但活动流空置。

### nexus: update team invitation flow

- `dashboard/team` 将激活码兑换收敛为顶部按钮 + 弹窗，个人团队状态区隐藏角色与已激活席位。
- 团队邀请从公开邀请码输入改为按邮箱或用户 ID 定向发送；个人团队页展示收到的团队邀请。
- 接受团队邀请改为 `/team/join?invitation=...` 详情页，并在加入前强制 Passkey 二次验证。

### nexus: sync privacy settings through account API

- `dashboard/privacy` 的隐私偏好改为账号级服务端设置，不再使用浏览器 localStorage 作为 SoT。
- 新增 `/api/dashboard/privacy-settings` GET/PATCH，用于同步使用分析、崩溃报告、详细使用数据与个性化推荐偏好。
- `auth_users` 增加隐私偏好列并通过 schema hydration 自动补齐，页面文案调整为账号同步语义。

### nexus: normalize credits display

- credits 额度改为整数 credits 积分单位，Free 周期额度为 1000，认证后为 5000；团队池按旧比例放大到整数 credits 口径。
- 用户侧 credits 页面不再展示剩余或总 credits，只展示消耗百分比、消耗 credits 积分与单条流水消耗。
- 认证提升文案只说明会提升额度，不暴露具体提升后的额度数值。

### nexus: fix login history accuracy

- 登录历史将网页登录记录为 `web` 来源，避免密码登录被误标为 App。
- OAuth / Magic Link 成功登录补充写入历史，Passkey 登录去掉二段式 token 消费造成的重复成功记录。
- `/api/login-history` 仅返回脱敏 IP，Dashboard 登录历史与活动流统一展示 `ipMasked`。

## 当前文档入口

- Roadmap：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 当前计划：`../TODO.md`
- AI：`../TODO-AI.md`
- R3：`../TODO-R3.md`
- Nexus：`../TODO-nexus.md`
- Evidence Matrix：`../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`
