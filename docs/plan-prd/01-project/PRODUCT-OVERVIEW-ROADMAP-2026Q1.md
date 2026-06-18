# Tuff 产品总览与路线图

> 更新时间：2026-06-18
> 定位：产品目标与版本路线主入口。压缩前完整快照见 `./archive/PRODUCT-OVERVIEW-ROADMAP-2026Q1-pre-compression-2026-05-14.md`。

## 1. 产品定义

Tuff（原 TalexTouch）是一个 **Local-first + AI-native + Plugin-extensible** 的桌面指令中心。

核心价值：统一“搜索 + 执行 + 插件协同 + 智能能力”，减少跨应用操作成本。

交付边界：

- `apps/core-app`：桌面主产品，Electron + Vue，主要运行时与能力承载体。
- `apps/nexus`：文档与生态站点，承载开发者文档、API、发布与生态信息。
- `packages/*`：共享 SDK、类型、组件与工具。
- `plugins/*`：官方/示例插件能力集合。

## 2. 2026 上半年 North Star

| 目标 | 说明 | 当前口径 |
| --- | --- | --- |
| 架构目标 | 完成 SDK Hard-Cut，renderer/main/plugin 跨层调用统一走 typed transport / domain SDK | legacy/raw channel 继续收口；retained aliases 分批迁移 |
| 质量目标 | 建立稳定质量门禁，typecheck/lint/test/build 可复现、可追踪 | PR lint 已收敛为 changed-file lint；近期审计继续未发现新的生产路径 P0 fixed fake-success，dialog trusted HTML boundary 与 Widget runtime sandbox evidence 已完成 focused 切片。当前代码版本 root/CoreApp `2.4.12-beta.8`，本地 `HEAD=6b156fa31 fix(nexus): hide team credit pool for personal accounts`，且工作区存在大量未提交改动，必须按 related-only 拆分验证；剩余高信号风险按 `Roadmap-vNext-2026-06-18.md` 收敛为 R0 口径清理、R1 Release Integrity、R2 AI Stable、R3 Indexing Runtime、R4-R9 后续能力；2026-05-18 已删除独立 OmniPanel Gate workflow，OmniPanel scoped typecheck/lint/unit/build/smoke 不再作为 GitHub Actions 自动门禁；旧 compat registry / legacy allowlist / size allowlist 已退场 |
| 发布目标 | 打通 OIDC + RSA 官方构建信任链与 Nexus 自动同步闭环 | `build-and-release` 为桌面发版主线；`v2.4.10` GitHub Release 与 Nexus release metadata sync 已成功；当前代码版本已到 `2.4.12-beta.8`，但最近完整发布链路证据仍是 `v2.4.11-beta.6` GitHub prerelease、Nexus BETA latest sync 与发布后 Gate D strict；Nexus 资产 sha256/signatureUrl 与 signature endpoint 仍是 R1 Release Integrity debt；公共包发布不再作为独立 Roadmap / blocker / evidence 项，版本变更后以 GitHub 自动发版 workflow 结果为准 |
| 产品目标 | Flow / DivisionBox / Intelligence 核心能力闭环 | 当前主线转入 Roadmap vNext：R0 口径清理、R1 Release Integrity、R2 AI Stable、R3 Indexing Runtime；Flow / DivisionBox / Automation / Skills 不作为当前 Stable 完成项 |
| AI 目标 | CoreBox 成为 2.5.0 Stable 桌面 AI 主入口，OmniPanel/Workflow/Agent 进入 MVP/Beta 证据队列，AI Runtime 可观测、可恢复 | AI 已有 Intelligence module、provider runtime、workflow service、agent/tool channels、OmniPanel Writing Tools 与 Assistant typed transport；2026-06-17 已补 2.5.3/2.5.4 的 typed SDK、SQLite SoT、FTS5 LocalKnowledgeEngine、Context Builder、ContextHygiene P0 foundation 与稳定错误归一化，但体验闭环仍缺 packaged Electron CoreBox 文本/OCR成功、固定失败路径与 routing evidence；2.5.0 Stable 只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径，2.5.5 / 2.5.8 保持本地模型运行时与 ASR 的 PRD 锁方向，不抢 2.5.0 稳定化 |
| Provider 目标 | Nexus Provider registry + Scene 编排承载汇率、AI、翻译、图片/截图翻译 | 已有最小 runtime/API/Dashboard/ledger，后续补旧表退场、高级策略与 Nexus invoke 未登录/provider 不可用/quota 不足/model 不支持的可见证据 |
| 插件数据源目标 | 官方插件扩展本地 App 数据搜索，并把 Windows Everything 收口到可诊断、可回归、可受控发布 | 已新增 App Data Plugins 与 Everything Roadmap；当前第一优先级是 File write/store boundary 迁移，其次 Browser Bookmarks official `touch-browser-data` runtime source lifecycle，再补 Everything registry PATH、Windows App indexing、手动索引完成通知、Quicklinks feed/UI evidence |
| i18n / Catalog 目标 | 把 UI messages、transport messages、domain lexicon、plugin localized metadata 与 cloud catalog 分层治理，并开放给插件开发者 | 已新增 2.6.0 PRD；单位、币种、时区、能力标签、搜索别名等领域数据必须支持多语言，但走 canonical id + localized label/aliases 的 Domain Lexicon；cloud catalog 必须经 CatalogService 验签/hash/schema 校验后导入 SQLite |

## 2.1 当前定价口径

- 公开站当前只承诺 Pioneer 阶段全量开放，价格为 `0 元 / $0`。
- `FREE / PRO / PLUS / TEAM / ENTERPRISE` 仍是权限与套餐分层，不代表正式价格、credits 单价或团队席位价已确定。
- 当前 pricing SoT 为 `../04-implementation/Pricing-SoT-2026-06-18.md`；GA 后价格、AI credits 赠送/超额策略、Team seat 计费方式与 Pioneer 保价范围未决，不得把付费价格写成已发布。

## 3. 当前版本路线

### 2.4.10 - 稳定基线

**目标**：作为当前稳定基线，承接已完成的 Windows App 搜索/启动体验、基础 legacy/compat 收口与发版准备。

**已纳入基线**：

- Windows App 索引与启动体验。
- FileProvider 编译边界恢复：`file-provider.ts` 已恢复等价导出，`typecheck:node` 已通过。
- 基础 legacy/compat 收口与 release 准备口径。
- `v2.4.10` GitHub Release 已发布，Windows setup、macOS app zip、Linux AppImage/deb、更新 YAML、builder debug 与 manifest 资产已上传；Nexus release metadata sync 已成功。

**非目标**：

- 不把 `v2.4.10` release workflow 成功等同于全量 release gate 全绿；release integrity 继续按 R1 跟踪，公共包发布后续以版本变更后的 GitHub 自动发版 workflow 结果为准。
- 不把 `2.5.0` AI、Provider 高级策略、SRP 大拆分回填为 `2.4.10` 工作。

### 2.4.11 - 债务退场与发布收口

**目标**：关闭或显式降权剩余 legacy/compat/size 债务，收口 release checklist、质量门禁与 R1 Release Integrity；公共包发布不再作为独立 Roadmap / blocker / evidence 项。

**必须解决**：

- `2.4.11` release checklist：最近路径验证、`quality:pr`、publish manifest preflight、`quality:release` 结果记录与 `git diff --check`；publish manifest preflight 只作为 CI hygiene。
- Release integrity debt：Nexus assets `sha256`、`signatureUrl` 与 signature endpoint 真实发布链路收口。
- AI 兼容占位成功响应退场。
- CLI token OS 级 credential backend 收口；当前仅完成 POSIX `0700/0600` 权限缓解与 Windows ACL warning。
- 插件 provider secret storage 收口；`touch-translation` 已迁入 `usePluginSecret()`，仍需 secure-store 系统 backend 与 degraded health evidence。
- 插件 shell capability 诊断统一；`touch-snipaste`、`touch-window-presets`、`touch-browser-data`、`touch-quick-actions` 已有首批 fail-closed/source diagnostics 证据，下一步改为复核剩余 shell/OS capability surface。
- 动态执行边界治理：PreviewSDK 算式/单位换算已收口，widget runtime sandbox 继续进入审计/回归清单。
- Transport Wave A retained alias/hard-cut 后续批次。
- CoreApp 启动异步化真实设备 benchmark；CoreBox app launch handoff 已先补 immediate hide，避免慢启动期间 launcher 可见卡死。

### 2.5.0 - AI 桌面入口收口

**目标**：让 CoreBox 成为 2.5.0 Stable 可验收的桌面 AI 主入口，并把 OmniPanel / Workflow / Agent 能力保留在 MVP/Beta 证据队列；Nexus 首页公开叙事继续收敛为“本地优先的桌面 Agent 指令中心”。

**Agent 叙事同步口径**：

- 首页可表达的核心能力为模型路由、桌面上下文与 Agent 工具执行；它们必须分别对应 provider/model/scene metadata、剪贴板/选区/OCR/活动应用上下文 evidence、内置工具/MCP/插件执行 evidence。
- 全键盘、文件搜索、本地 SoT、插件 SDK 与 Nexus 生态属于既有产品方向，继续按 CoreBox、Search Provider / Indexing Runtime、Plugin SDK 与 release integrity 主线补证。
- CDP 浏览器控制、可视化交互、Token 节省、Skills、Computer Use、MiniApp、ACP、自动化与沙箱只作为 Beta/Experimental 或后续能力预告，不进入 2.5.0 Stable 已交付承诺。

**Stable**：

- CoreBox AI Ask `text.chat` 成功路径。
- CoreBox 显式 `vision.ocr -> text.chat` 成功路径。
- 默认 Nexus AI provider / 登录态 invoke。
- Local/Ollama 首选 provider routing，不访问 disabled Nexus provider。
- 未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied 的固定失败路径。
- provider/model/latency/trace metadata chips 与安全审计字段。

**Beta**：

- OmniPanel Writing Tools MVP：翻译、摘要、改写、解释、纠错、代码解释/Review、copy/retry/replace clipboard 二次确认。
- Desktop Context Capsule：剪贴板、选中文本、OCR 结果、活动应用/窗口状态摘要等非敏感上下文。
- Workflow `Use Model` 节点。
- Review Queue。
- Skills Pack / Background Automations 与 AI 联动。
- 剪贴板整理、会议纪要、文本批处理 P0 模板。
- Agent 工具执行：内置工具、MCP 与插件能力的受控调用、失败恢复与 audit evidence。
- CDP 浏览器控制、可视化交互与 Token 节省策略。

**Experimental / 2.5.x 后续**：

- Assistant 悬浮球/语音唤醒。
- 多 Agent 长任务面板。
- image/audio/video 生成编辑。
- Nexus Scene runtime 全量 orchestration。
- Computer Use、MiniApp、ACP、自动化编排、沙箱隔离与深层桌面 UI/轨迹/通知上下文。

**当前证据缺口**：

- CoreBox AI Ask 文本与 OCR 场景仍需要 packaged Electron success/failure UI evidence；固定验收矩阵见 `../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`。
- Nexus invoke / provider routing 需要覆盖未登录、provider 不可用、quota 不足、model 不支持、Local/Ollama 首选不访问 disabled Nexus 的明确错误与 provider metadata chips。
- OmniPanel Writing Tools 已有 dev 切片，但属于 MVP/Beta，需要真实 provider-backed 运行、copy/retry/replace clipboard 与失败恢复证据，不能替代 Stable 文本/OCR evidence。
- 模型路由需要可见 scene/provider/model 绑定、fallback、latency/token/trace chips 与错误路径证据。
- 桌面上下文需要证明首批输入只读取已授权或显式传入的数据，并展示 degraded/unsupported reason；前台、焦点、屏幕、UI、轨迹、工作区与通知仍是后续扩展。
- Agent 工具执行需要内置工具、MCP、插件能力的 permission gate、audit trail、失败恢复和 packaged UI evidence；CDP/视觉交互/Token 节省不能只停留在 copy。
- OmniPanel Writing Tools、Workflow/Review Queue/Skills/Automation 保持 MVP/Beta；Assistant、语音、多模态生成保持 Experimental，不进入当前稳定化承诺。

### 2.5.3 - 本地知识检索与上下文构建

**目标**：把本地文档、网页摘录、插件知识与桌面上下文转换为可检索知识，由 Context Builder 只把最相关片段送入模型上下文。

**方向**：

- SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项。
- MVP 覆盖 `documents` / `chunks` schema、FTS5 召回、metadata 过滤、citation 与上下文拼接；2026-06-17 CoreApp 已落地 SQLite documents/chunks、FTS5 index/triggers、typed SDK、LocalKnowledgeEngine search/buildContext、degraded reason 与 focused tests。
- 不把上传即 embedding 即 vector db 作为 MVP，不在第一版引入 Tantivy/HNSW 独立索引。
- 检索能力独立于 2.5.5 本地模型 runtime，可服务 Nexus / 云端 / 本地模型。

### 2.5.4 - ContextHygiene 与自动记忆治理

**目标**：把 TuffIntelligence ContextHygiene 抽成上下文治理层，让用户可以随时提问，但系统不会默认继承无限长历史；新会话有 checkpoint 边界，旧会话只在相关时检索召回，稳定事实通过 MemoryPolicy 沉淀为可查看、可禁用、可删除的记忆。

**方向**：

- Session Boundary / Checkpoint 优先：长时间未活跃、显式新话题、手动新会话、任务切换与 token overflow 都可创建边界。
- 默认轻上下文：新 session 不注入旧 session 原文；用户显式“继续刚才”时才优先召回旧摘要。
- 自动压缩必须结构化：保留目标、决策、约束、产物、未完成事项和记忆候选，不保存普通流水账摘要作为唯一依据。
- Memory 分层治理：区分临时上下文、会话摘要、任务记忆、用户偏好、知识记忆与敏感记忆；敏感信息默认不进入普通记忆。
- ContextPackage 可解释：每段被注入的历史、记忆或检索片段都要带来源、reason 与 token 预算。
- P0 rollout 收窄为 CoreBox-only、feature flag、deterministic scope、SQLite session/turn/checkpoint/package log/tombstone、token budget prune 与 explain metadata；结构化压缩和 Memory suggested flow 后移 P1。
- Sensitive / secret turns 不得进入 FTS、embedding、context log 或可同步 payload；删除 memory 必须 tombstone 并在 prepareTurn 二次过滤，防止旧 summary/cache/sync 回灌；2026-06-17 CoreApp 已落地 CoreBox-only prepareTurn/saveMemory/deleteMemory foundation、package explain metadata、secret memory rejection、memory tombstone 与 private turn redaction。
- LangChain 只作为执行/编排层，Tuff-owned SQLite Session / Checkpoint / Memory 模型仍是业务 SoT，外部 tracing/cache/vectorstore 默认禁用。

### 2.5.5 - 本地开源模型运行时

**目标**：把本地开源大模型升级为 Tuff Intelligence 的一等运行方向，用户可在本机下载、管理并运行轻量模型，文本能力优先本地执行并可回退云端 provider。

**方向**：

- 不强依赖 Ollama；Ollama 只作为已安装用户的可选兼容后端。
- 优先内置 GGUF / `llama.cpp` runtime；模型权重按需下载到用户数据目录，不进入安装包。
- Runtime 管理覆盖模型目录、下载/删除、加载/停止、健康状态、失败原因与流式输出。
- 首批只承诺文本能力：`text.chat`、翻译、摘要、改写、代码解释/Review；多模态生成编辑不进入 2.5.5 Stable。
- 新增接口继续走 typed transport / domain SDK，并复用现有 Provider / Capability / Audit / Workflow 路由。
- 不实现本地知识库索引、Context Builder、ContextHygiene、ASR 或 TTS；这些分别归属 2.5.3、2.5.4 与 2.5.8。

### App Data Plugins 与 Everything 收口 - 官方数据源插件路线

**目标**：让 CoreBox 从“应用 + 文件 + 插件功能”扩展到“用户显式授权的本地 App 数据”，并把 Windows Everything 文件搜索从已接入推进到生产化收口。

**方向**：

- 先建立统一数据源/索引诊断基线：source health、permissionState、lastIndexedAt、itemCount、lastError、disable/clear/rebuild 语义。
- Browser Data 优先真实浏览器书签/历史索引；现有 `touch-browser-bookmarks` 自有收藏保留为 manual/pinned 数据源，不伪装成浏览器真实数据。
- Obsidian 插件覆盖 vault、Markdown heading/tag/frontmatter/backlink 与 `obsidian://` 打开。
- VSCode 插件覆盖本地 extensions 与 recent workspaces/projects；Marketplace 搜索不进入首版。
- macOS App Data 先调研 Notes/Reminders/Calendar/Contacts 的权限与本地只读可行性；无法给出授权/降级 reason 时不接入。
- Epic 插件先澄清 Epic 指向；若是 Unreal 本地项目，优先 `.uproject` 与最近项目。
- Everything 收口明确 SDK vs CLI 策略、路径授权过滤与 diagnostic evidence；平台差异能力必须有可见 degraded/unsupported reason 与 fail-closed 行为。
- 非目标：不包含更新系统 Nexus Hard-Cut；不做跨 App 写回、账号同步或未授权扫描。

**Indexing Runtime V1 当前批次状态（2026-05-30）**：

已落地：

- SDK 合同：`IndexedSource*`、source admission、task eligibility、watch root routing、Search Provider descriptor/config/manifest resolver、Quicklinks / Browser Bookmarks / Browser History / System Settings descriptor templates。
- Core runtime：`IndexingRuntime`、`ScanScheduler`、`WatchEventRouter`、`ReconcileScheduler` / `ReconcileEngine`、`IndexingRootPolicy`、`SearchIndexStoreAdapter`、diagnostics typed transport 与 Settings maintenance SDK。
- Source adapters：App/File/Everything 已接入统一 diagnostics 与 runtime lifecycle；Everything path filtering 改读 runtime root policy；Browser Bookmarks 已有 disabled-by-default high-privacy skeleton，只有显式 provider enable 后才读取 scanner。
- File provider 拆分：watch delta queue、write plan/insert/update/delete、flush retry/runtime/snapshot/buffer、worker scheduler、worker persist mapper、post-write side-effect、progress ETA/stream 已抽成通用 primitive 或薄适配。
- Settings / Provider：Settings 已展示 source diagnostics、provider enable/order、source-to-provider link；插件 `manifest.searchProviders` 和 `search.root-results` 权限校验已接入，仓库 push 插件已补显式 provider。

未闭环：

- FileProvider 内部 SQLite/FTS 真实写入、scan worker、index worker flush trace、scan_progress/integrity reset 调度仍未完全迁到 runtime task/store 边界。
- Browser Bookmarks 仍是 CoreApp skeleton + scanner 样板，真正 indexed source、watch root 注册、persistent rebuild、clear/disable UI 仍需迁到官方 `touch-browser-data` 插件并受用户同意约束。
- Browser History、Quicklinks、System Settings、Obsidian、VSCode 目前只有 SDK descriptor/admission 或计划，尚未实现完整 source lifecycle。
- Everything SDK/CLI 最终策略、registry PATH 探测、Windows 运行性能/evidence 仍未闭环。
- Durable job history、跨 source retry/debounce、source health 用户恢复动作、真实平台手工回归仍需补证。

下一批执行顺序：

1. UI semantic cleanup：继续收主路径 `div/span @click`、图标按钮、列表项与插件 player controls 的语义/focus/keyboard 细节，mask/backdrop `@click.self` 保持分层处理。
2. Sample plugin cleanup：`touch-music` 迁到 TuffEx `base.css` + 子路径组件导入，清理 Vite starter asset；`touch-image` 移除 starter favicon；`touch-translation` 同步 storage 注释事实。
3. CLI publish evidence：补过期 app JWT 交互刷新、API key publish 与 `TUFF_NON_INTERACTIVE=1` fail-closed 证据，并评估 upload POST 是否应携带 device headers。
4. File write/store boundary：继续把 FileProvider 写入、progress、integrity reset 收敛到 runtime store/task，不改变 SQLite/FTS/SearchIndex worker 的真实语义。
5. Browser Bookmarks official lifecycle：把 metadata-only `manifest.indexedSources` 接到官方 `touch-browser-data` runtime source 注册、显式 consent、watch root、persistent rebuild 与 clear/disable UI。
6. Everything 与 Windows App evidence：补 registry PATH 探测、Windows 运行性能、手动文件索引完成通知与 fail-closed 诊断验收。

建议提交批次：

1. `feat(utils): formalize indexed source and search provider sdk`
2. `feat(core-app): add indexing runtime diagnostics and provider settings`
3. `refactor(core-app): migrate file indexing primitives toward runtime`
4. `feat(core-app): add browser bookmarks indexed-source skeleton`
5. `docs(search): sync indexing runtime roadmap and nexus api docs`

### 2.5.8 - ASR Provider Runtime

**目标**：把语音转文字抽成独立 ASR Provider Runtime，支持本地 `whisper.cpp` 与云端 ASR provider，并让用户按隐私、准确率、成本和设备性能选择策略。

**方向**：

- Stable 覆盖音频文件转写、provider 抽象、本地 `whisper.cpp`、云端 provider、统一 transcript result。
- 用户策略为 `local-only`、`cloud-only`、`auto`；隐私内容必须允许强制本地，不能默认上传云端。
- streaming transcription、VAD 断句、会议长音频与 faster-whisper 作为 Beta / Experimental。
- TTS、语音唤醒、Assistant 悬浮球默认入口不进入 2.5.8 Stable。

### 2.6.0 - i18n / Domain Lexicon / Cloud Catalog 收敛

**目标**：把现有写死中英文、中文 fallback、双语三元表达式和散落单位别名收敛为一套可验证、可扩展、可开放给插件开发者的多语言数据与 catalog 体系。

**方向**：

- UI messages 只承载界面文案；transport messages 只传 key 与 params；单位、币种、时区、能力标签、搜索别名等进入 Domain Lexicon。
- Domain Lexicon 使用 canonical id + localized label/aliases；解析可匹配多语言 alias，展示按当前 locale label 输出。
- 插件开发者通过 SDK facade 读取 locale、解析 `LocalizedText`、查询内置词库，并注册 plugin-scoped lexicon，不直接读 `window.$t/window.$i18n`。
- Cloud Catalog 统一由 CatalogService 下载、验签/hash、schema 校验、导入 SQLite、激活与回滚；JSON 只作为下载载荷，不作为本地业务 SoT。
- 首批落 locale core、LocalizedText/LocalizedList、单位 registry、插件 localized metadata 合同与 catalog baseline；不把全量翻译债务一次性阻塞在 2.6.0。

## 4. 质量与安全路线

- Storage：SQLite 为本地 SoT；JSON 只作为密文同步载荷或引用。
- Secret：API key、token、refresh token、provider secret 不得进入普通 JSON/localStorage/log；文件权限缓解只能作为过渡，最终应进入系统 credential backend 或明确 degraded health。
- Sync：新增同步能力走 `/api/v1/sync/*` 及 keys/devices 配套接口。
- Transport：新增事件优先 typed builder；retained raw event 必须有 alias registry、dual listen、hit evidence 与 hard-cut 条件。
- Runtime：生产路径不得返回固定假值成功或可消费占位 payload。
- i18n：新增 UI 文案必须进入 message catalog，不得用中文 fallback、硬编码双语三元表达式或直接访问 `window.$t/window.$i18n` 作为生产路径。
- Domain Lexicon：单位、币种、时区、能力标签、搜索别名等领域词汇必须声明 locale coverage、canonical id、localized label/aliases 与来源；不能散写 locale branch。
- Catalog：云端下载数据必须签名/hash/schema 校验后导入 SQLite，并提供版本激活与回滚；不得把明文 JSON 当作本地业务 SoT 或混用 private sync 通道。
- Platform：生产路径必须有可见 degraded/unsupported reason 与 fail-closed 行为；Linux best-effort 必须有可见 reason。
- CI/CD：GitHub Actions `uses:` 依赖保持 Node 24-compatible major；业务 Node runtime 继续固定 `22.16.0+`；独立 OmniPanel Gate workflow 已删除，不再作为 push/PR/manual 自动门禁；包级 publish workflow 的 path filter 必须覆盖对应 package manifest、publish 脚本、`pnpm-lock.yaml` 与 workspace catalog，避免依赖规格修复漏跑发布流水线。

## 5. 当前状态快照

- 当前基线：`2.4.10`。
- `2.4.10` 已作为当前稳定基线；GitHub Release 与 Nexus release metadata sync 已成功；当前代码版本 root/CoreApp `2.4.12-beta.8`；公共包发布不再作为独立 Roadmap / blocker / evidence 项，版本变更后以 GitHub 自动发版 workflow 结果为准；当前主线按 Roadmap vNext 收口 R0 口径清理、R1 Release Integrity、R2 AI Stable 与 R3 Indexing Runtime。
- FileProvider 编译边界已恢复且 CoreApp `typecheck:node` 已通过；`2.4.11` release checklist 已有通过记录，但 R1 Release Integrity 未完成前，不得宣称发布链路全闭环。
- 2026-05-22 兼容性/占位实现增量审计未发现新的 P0 假成功；`touch-snipaste`、`touch-window-presets`、Browser Data source diagnostics 与 `touch-quick-actions` 已有 live-tree hardening 证据，`2.4.11` 后续聚焦 Credential Locker/libsecret、widget runtime sandbox regression、裸 console、示例插件调试噪声、SRP 小切片与 release checklist。
- 2026-05-25 UI/兼容/占位/架构审计继续未发现新的 P0 fixed fake-success；2026-05-26 已完成 preload debug DOM 文本化与同段 debug console 清理；2026-05-29 增量审计确认 Nexus/TuffEx 组合 demo 与 dashboard chart wrapper 改善 UI 完善度，同日已完成 legacy retained aliases hit telemetry/hard-cut 判定记录、`touch-text-snippets` / `touch-code-snippets` hidden/deprecated/replacedBy 退场、Nexus `source: memory` evidence source 分层、dialog message 文本/可信 HTML 分流与 TuffEx docs visual smoke 脚本；同日 post-slice 复核确认 UI 方向应继续走专业工具高密度可扫描路线；`v2.4.11-beta.6` 发布成功并通过发布后 Gate D strict 复核，2026-06-13 代码版本已到 `v2.4.11-beta.8`，CLI publish 旧 token 刷新体验已补。当前仍缺完整 release cycle legacy hit=0 观察，以及 Nexus 资产 signatureUrl / signature endpoint 收口；visual smoke 先作为 focused evidence，不改变 `quality:pr` / `quality:release` 门禁。平台人工验证已由 owner 完成，不再作为 Roadmap blocker。
- 2026-06-13 Nexus docs SEO/prerender 收口为过渡方案：全站 i18n 仍保持 `no_prefix`，docs 显式生成 `/en/docs/**`、`/zh/docs/**` 并在页面内同步 locale；真实 docs 根索引已补齐，SEO head/canonical/alternate/robots/OG/Twitter/TechArticle JSON-LD 与 localized prerender evidence 均有 focused Vitest 覆盖，不改变 `quality:pr` / `quality:release` 门禁。
- CoreApp 启动异步化 P0/P1/P2/P3 代码切片已推进，剩余真实设备 benchmark 与长尾补证。
- App Data Plugins 与 Everything 已新增专题 Roadmap，近期不进入更新系统 Nexus Hard-Cut 范围；Browser Data、Obsidian、VSCode、macOS App Data、Epic 与 Everything 生产化收口按插件/搜索主线推进。
- 2.6.0 i18n / Domain Lexicon / Cloud Catalog 已新增专题 PRD；当前为规划与质量约束口径，后续实现不得把单位等领域词汇塞回普通 UI locale，也不得把云端 catalog 作为明文 JSON 本地 SoT。
- Nexus Provider Registry / Scene 已具备最小运行链路，后续继续补旧 AI provider 表退场、user-scope OCR 绑定策略、success rate/配额/dynamic pricingRef。

## 6. 关联入口

- 当前执行清单：`../TODO.md`
- PRD 主入口：`../README.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- 变更日志：`./CHANGES.md`
- 全局索引：`../../INDEX.md`
