# PRD 质量基线

> 更新时间：2026-07-10
> 定位：活跃 PRD 的最小质量约束。

## 1. 适用范围

适用于：

- `docs/plan-prd/02-architecture`
- `docs/plan-prd/03-features`
- `docs/plan-prd/04-implementation`
- `docs/plan-prd/06-ecosystem`

活跃 PRD 指仍影响当前或未来 2 个版本行为、接口、架构、发布或质量门禁的文档。历史 PRD 必须标注 `Archived/Historical` 与替代入口。

## 2. 当前强口径

- 当前执行基线：root / CoreApp `2.4.13-beta.6`。历史 release 事实保留在 `../01-project/CHANGES.md` 与对应 Evidence Matrix；本文件只记录仍有效的质量边界。
- `2.4.10` GitHub Release 与 Nexus release metadata sync 已完成；release integrity 继续按 R1 跟踪，公共包发布不再作为独立 Roadmap / blocker / evidence 项。当前质量主线以 `Roadmap-vNext-2026-06-18.md` 为准。
- `2.4.11` 必须关闭或显式降权剩余 legacy/compat/size 债务，并以 release checklist、质量门禁与 R1 Release Integrity 为本轮收口主线；owner 已完成的平台人工验证不再作为 Roadmap 待办、平台后续或 blocker。
- `2.5.0` AI Stable 只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；OmniPanel Writing Tools 为 MVP/Beta，Workflow/Review Queue/Skills/Automation 为 Beta，Assistant、多模态生成编辑、Nexus Scene runtime orchestration 为 Experimental 或后续。AI 已有 CoreApp Intelligence module、provider runtime、workflow service、agent/tool channels、OmniPanel Writing Tools 与 Assistant typed transport，但只有 packaged Electron CoreBox 文本/OCR成功、固定失败路径与 routing evidence 补齐后才能宣称 Stable 体验闭环。
- Visible evidence 的 artifact/schema/tag/file 完整性与版本新鲜度是两个独立门禁：任何“当前版本 passed”声明必须使用 `visible:experience:verify --requireCurrentVersion`，并要求 manifest `baselineVersion` 精确匹配 `apps/core-app/package.json`。不带该 flag 的 13/13 结果只能描述 historical artifact snapshot，不能升级为当前 packaged runtime evidence。
- `2.5.3` 本地知识检索方向已锁定：SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 是增强项；MVP 不引入独立向量数据库服务。2026-06-17 CoreApp 已落地 documents/chunks SQLite SoT、FTS5 index/triggers、typed SDK、metadata filters、citation 与 token-budgeted Context Builder foundation。
- 2026-06-24 `LocalKnowledgeEngine` metadata filters 增强为支持 dotted nested path 与数组 scalar 包含匹配；ContextHygiene retrieval scope 已把 2.5.3 citation、document source、retrieval status 与 degraded reason 写入 `ContextPackage` item/package log metadata，并提供 metadata-only `contextListPackageLogs` typed SDK / CoreApp channel 读取入口，形成 2.5.3 -> 2.5.4 citation/explain 桥接；`contextListCheckpoints` typed SDK / CoreApp channel 已可按 session/type 读取 checkpoint boundary reason、context scope 与 metadata；`@talex-touch/tuff-intelligence` 镜像 SDK 与 Intelligence Audit 已可展示 trace package metadata 摘要、metadata-only explain drawer、included/excluded source detail、citation metadata 与 excluded/pruned/policy-blocked 证据，官方 `touch-intelligence` CoreBox AI Ask 已在调用前生成 ContextPackage metadata 并 fail-soft 保持原问答路径；只读 `contextEvaluateMemory` 已提供显式记忆候选的 MemoryPolicy 预览，覆盖 suggested/rejected/needs_review 且不写库，CoreBox AI Ask 仅在用户显式“记住 / remember”时消费该预览生成 metadata 摘要。2026-06-27 Intelligence Audit 已新增 host-side Memory Review 最小面板与 `contextListMemories` / `contextSetMemoryEnabled` typed SDK / CoreApp channel：手动输入候选、先策略评估、仅 `suggested` 且内容未变更时显式保存，saved list 只展示 normal / non-tombstoned memory，可禁用/重新启用，并可通过 `contextDeleteMemory` 写 tombstone 删除，`rejected` / `needs_review` fail-closed。该进展只扩展 SQLite/FTS/citation MVP、ContextPackage metadata 证据链、checkpoint metadata reader、CoreBox 最近路径、Audit explain drawer 最小外壳、记忆策略预览、最小手动确认入口与查看/禁用/删除/tombstone 小闭环，不代表 embeddings/rerank、本地模型、完整 explain drawer 产品化、完整 Memory 面板搜索/编辑或 2.5.4 自动长期记忆完成。
- `2.5.4` ContextHygiene 与自动记忆治理方向已锁定：Session / Checkpoint / CompressionSnapshot / MemoryItem / ContextPackage 必须以本地 SQLite 为 SoT；新 session 不默认继承旧 session 原文，旧会话只允许通过相关性检索或用户显式继续意图注入。2026-06-17 CoreApp 已落地 CoreBox-only prepareTurn/saveMemory/deleteMemory foundation、context package explain log、secret memory rejection、tombstone-first delete 与 private turn redaction。
- 2026-07-11 R9.2 P0/P1 closure 质量门禁：6 个子任务实现 `6/6`。host-owned assembler、final memory/tombstone revalidation、Memory Review 原子 replace+tombstone、CompressionSnapshot CAS/no-delete、Workflow run isolation、OmniPanel/Assistant light context，以及 CoreBox active widget 单次派发/latest-request-wins 均有 focused/controlled contract；isolated packaged Electron 已覆盖 CoreBox `new / retrieval` 与 Assistant `new / light`，且两条受控 Provider 路径均为单次调用。evidence manifest 必须继续区分 unit/controlled/packaged/real-profile 并扫描 raw prompt/response/turn/memory/secret；该时点 `real-profile`、OmniPanel/Workflow packaged 保持 open；Workflow 后续 closure 见下方 2026-07-12 context lifecycle evidence。workspace/project memory 缺稳定 scope identity 时继续 fail-closed，任何 `scopeRef` schema/data migration 仍需独立 preflight、rollback 与显式确认。任务入口为 `.trellis/tasks/07-10-r9-2-context-hygiene-p0-p1-closure/`。
- 2026-07-11 archived continuation follow-up：inactive/missing explicit continue 必须创建新 session id，优先受治理 CompressionSnapshot、仅在无 snapshot 时回退 secret-free legacy summary；旧 raw turns/Memory 不得跨边界。`ContextContinuationSummary` 只暴露 source id、reason、status 与 summary source metadata；blocked/missing 继续 current input 并标记 excluded/unavailable。当前只有 focused/controlled + plugin build evidence，不升级 packaged/real-profile 口径。
- 2026-07-12 tombstone explain follow-up：`memory-tombstoned` 必须在 Audit safe summary 中独立计数并映射本地化 reason；excluded item 只保留 sourceType/sourceId/reason/tokenEstimate。未知 reason 安全回退为机器字符串，不能误标或泄露 content。当前只有 focused summarizer/UI typecheck evidence，不升级 packaged/real-profile 口径。
- 2026-07-12 Workflow packaged runtime follow-up：renderer 发给 typed Intelligence SDK 的 `WorkflowDefinition` 必须可被 Electron structured-clone；不得把 Vue proxy 或其它不可 clone 值带入 transport。新建/内置派生 workflow 的 step ID 必须按 workflow scope 重生，并同步更新 model `previousStep` 引用，避免 `intelligence_workflow_steps.id` 全局主键冲突。focused 12 tests、web typecheck、lint、bundle/package 与 fresh-profile packaged terminal domain result 已通过；明确 provider-unavailable 不是 Provider 成功，也不升级 Workflow owner/scope context evidence。
- 2026-07-12 Workflow context lifecycle / packaged evidence follow-up：每个 run 必须拥有独立 `owner=workflow`、`scope=session` context session；首个 `text.chat` model step 使用 `mode=new` 建立确定的 per-run session，后续 model step 使用 `mode=continue` 复用它。禁止对未创建 session 直接 continue 后把 `continuation-session-missing` 当正常闭环，也禁止同一 run 的步骤漂移到多个 context session。focused orchestration 9 tests、node typecheck/lint、bundle/package、两次 visible controlled run 与 evidence manifest privacy scan passed；当前 packaged entrypoints 为 CoreBox/Assistant/Workflow，OmniPanel 与 real-profile 仍 open。
- 2026-07-13 OmniPanel packaged context evidence follow-up：visible built-in AI action 必须通过 host-owned `contextInvoke` 建立 `owner=omni-panel`、`mode=new`、`scope=light` ContextPackage，并保持每次用户 action 单次 Provider dispatch。isolated macOS arm64 package 已取得 1 session / 1 package log / 2 turns / 1 `/api/chat` / Ready result；focused OmniPanel 3 files / 38 tests 与 evidence verifier passed。manifest 当前 7 cases / 6 passed，packaged entrypoints 覆盖 CoreBox/Assistant/Workflow/OmniPanel，privacy scan passed；real-profile 仍 open。
- `2.5.5` 本地模型运行时方向已锁定：不强依赖 Ollama，优先内置 GGUF / `llama.cpp` runtime；Ollama 仅作为可选兼容后端，模型权重不得进入安装包、同步载荷或普通日志。
- `2.5.8` ASR Provider Runtime 方向已锁定：本地 `whisper.cpp` + 云端 ASR provider 抽象；隐私内容不得默认上传云端，TTS 不进入该版本 Stable。
- `2.6.0` i18n / Domain Lexicon / Cloud Catalog 收敛方向已锁定：UI messages、transport messages、domain lexicon、plugin localized metadata 与 cloud catalog 必须分层；单位、币种、时区、能力标签和搜索别名必须支持多语言但走 Domain Lexicon；CatalogService 下载数据必须验签/hash/schema 校验后导入 SQLite。
- App Data Plugins 与 Everything 收口已新增 Roadmap：新增 Browser Data、Obsidian、VSCode、macOS App Data、Epic 等数据源必须显式授权、只读优先、可清理索引、可见 degraded/unsupported reason；Windows Everything 必须明确 SDK/CLI 策略、路径授权过滤与运行证据。
- Provider / Scene 必须解耦：新增供应商进入 Provider registry，新增使用场景进入 Scene，不新增孤立 provider model。
- 质量入口：PR 使用 `pnpm quality:pr`，其中 lint 阶段只检查 PR 修改的 JS/TS/Vue 文件；`pnpm test:targeted` 的 Nexus sync route test 已指向当前 `apps/nexus/test/api/sync/sync-routes-410.test.ts` 路径；release/milestone 使用 `pnpm quality:release` 并保留全仓 lint；独立 OmniPanel Gate workflow 已于 2026-05-18 删除，不再作为 GitHub Actions 自动门禁；若既有失败阻断，必须记录失败项与最近路径替代验证。
- 当前质量状态：`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 已恢复完整 `fileProvider` 导出，`pnpm -C "apps/core-app" run typecheck:node` 已通过；近期自动化与增量审计未发现新的 P0 fixed fake-success，CoreApp/TuffEx dialog trusted HTML boundary 与 Widget runtime sandbox evidence 已完成 focused 切片。当前代码版本 root/CoreApp `2.4.13-beta.6`；本地 HEAD 以 Git 状态为准，避免把历史提交写成长期事实。当前工作区仍存在多主题未提交改动，必须按 related-only 拆分验证。CLI publish 已补 focused publish evidence：过期 app JWT 交互式自动刷新、API key `plugin:read`/`plugin:publish` scopes preflight、`TUFF_NON_INTERACTIVE=1` fail-closed、以及 upload POST 与 probe 一致的 device headers；公共包发布后续统一以版本变更后的 GitHub 自动发版 workflow 结果为准。`2.4.11-beta.6` 发布后 Gate D strict 已通过并作为最近完整发布链路证据；Nexus 资产 sha256/signatureUrl 与 signature endpoint 缺口仍按 R1 Release Integrity 记录；`2.4.11` release checklist 已有通过记录，但 R1 Release Integrity 未完成前不得宣称发布链路全闭环。旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，不能再作为当前门禁或事实来源引用。vNext 路线见 `../04-implementation/Roadmap-vNext-2026-06-18.md`。
- 2026-07-06 工作区质量口径：提交仍必须按 related-only 组织；当前 dirty worktree 至少包含 CoreApp auth、Nexus UI/account/design、packages/utils account helper 与 Trellis spec 变更，不能混成一个验证/提交批次。下一批优先级为当前 dirty worktree 拆分验证、Trellis bootstrap 收尾、R3 attach-only natural evidence、Nexus deployed preview evidence、R1 签名材料闭环。
- 2026-07-04 文档稳定性口径：当前事实以 `../TODO.md`、Roadmap、Evidence Matrix 与本文件共同约束；不在长期质量文档里固化本地 `HEAD`、dirty worktree 或临时环境状态。稳定性与架构代码优化的执行导航见 `../04-implementation/Stability-Architecture-Optimization-2026-07-04.md`。
- 2026-06-13 Nexus docs SEO/prerender 质量口径：docs 页面 metadata/OG/Twitter/canonical/alternate/robots/TechArticle JSON-LD 已抽到可测 helper 并形成最近路径覆盖；`no_prefix` 暂不切换为全站前缀策略，docs 过渡方案是显式 `/en/docs/**`、`/zh/docs/**` 页面路由 + 页内 locale 同步。prerender evidence helper 必须复用实际 route 枚举并验证真实 `content/docs`，避免 evidence 与生产清单分叉；localized `/en/docs`、`/zh/docs` 与稳定 docs API 是当前静态输出检查目标，unprefixed `/docs` 继续走 redirect/runtime 口径。已通过 focused prerender/SEO Vitest 与 scoped ESLint；不改变 `quality:pr` / `quality:release` 门禁。

## 2.1 定价与商业化质量口径

- 当前公开站只承诺 Pioneer 阶段 `0 元 / $0`，不得把旧订阅 PRD 中的 `FREE / PRO / PLUS / TEAM / ENTERPRISE` 写成正式价格；当前 pricing SoT 为 `../04-implementation/Pricing-SoT-2026-06-18.md`。
- 新增 pricing / credits / subscription 相关 PRD 必须明确：免费期边界、GA 后价格、AI credits 赠送与超额策略、Team seat 计费方式、Pioneer 保价范围、失败/降级体验。
- 在正式付费配置落地前，Nexus pricing table 缺配置只能显示未配置/免费阶段说明或 Pioneer 免费阶段，不得返回 mock 价格或伪成功购买入口。

## 3. 活跃 PRD 必须包含

1. **Final Goal / North Star**：至少 1 个业务目标 + 1 个工程目标，且可验证。
2. **Scope / Non-goals**：明确做什么、不做什么，避免范围膨胀。
3. **Quality Constraints**：类型安全、错误处理、性能预算、安全/数据约束、回归验证。
4. **Acceptance Criteria**：功能验收 + 质量验收 + 文档验收。
5. **Rollback / Compatibility**：失败回滚、旧接口/旧数据/旧行为影响与退场策略。

## 4. 必守质量规则

### 4.1 类型与跨层调用

- 不新增未类型化跨层通信。
- 优先 domain SDK / typed transport，禁止新增 raw event 字符串分发。
- 禁止新增 legacy transport/permission/channel import、旧 storage protocol、旧 SDK bypass 或伪成功兼容分支。
- 新增可表达为 `namespace/module/action` 的事件必须使用 typed builder。
- retained raw event 必须区分：生产 raw send violation 与 retained definition；迁移需走 canonical event + legacy alias registry + dual listen + hit evidence + hard-cut 条件。

### 4.2 Runtime / 网络 / i18n

- CoreApp `main/preload/renderer` 禁止新增裸 `console.*`、宽松 WebPreferences、裸 `ipcRenderer/ipcMain`、`window.touchChannel`。
- i18n 必须走 `useI18n` / `useLanguage` / `useI18nText`，禁止新增 `window.$t/window.$i18n`。
- 新增 UI 文案必须进入 message catalog；禁止把 `t(key, '中文 fallback')`、中文硬编码或双语三元表达式作为生产路径。
- 领域词汇、单位、币种、时区、能力标签和搜索别名必须走 Domain Lexicon 的 canonical id + localized label/aliases，不得在业务代码散写 locale branch。
- 插件 localized metadata 必须声明 default locale/value；插件读取语言、解析 localized value 或注册插件私有词库必须走 SDK facade。
- 业务层禁止新增 direct `fetch/axios`，统一走 `@talex-touch/utils/network` 或注入网络客户端。
- 旧 `/api/sync/*` 只允许迁移期只读，新增同步能力必须走 `/api/v1/sync/*` 及 keys/devices 配套接口。

### 4.3 Storage / Sync / Secret

- SQLite 是本地 SoT；JSON 只允许作为同步载荷格式，且必须是密文或引用。
- 禁止敏感信息明文进入 localStorage、普通 JSON、日志或同步 payload。
- `deviceId` 只能做设备标识或 AAD，不得作为密钥材料。
- Provider metadata 可普通存储；API key、secret、token、refresh token 必须进入 secure store、plugin secret capability 或 `authRef`。CoreApp secure store 只允许使用本机随机 root 密钥加密，禁止访问系统钥匙串 / Credential Locker / libsecret / Electron `safeStorage`；旧 `safe-storage` envelope 不再迁移解密，PRD 必须显式说明重新登录/重填 secret 影响。
- Sync 输出只允许 `payload_enc` / `payload_ref` 等密文引用；旧 `b64:` 只保留只读迁移语义。
- Cloud catalog 只能作为可校验下载载荷进入 CatalogService；导入后 SQLite 仍是本地 SoT，普通明文 JSON 不得作为业务 SoT，也不得复用 private sync 载荷通道。

### 4.4 平台与真实能力

- 生产路径不得返回固定假值成功、mock 支付 URL、伪成功空结果或可消费业务 payload。
- 不可用能力必须返回明确 status、`unavailable + reason`、`unsupported/degraded reason` 或 migration target。
- memory/local-only fallback 只能作为 dev smoke 或降级证据，必须在 API/UI/evidence 中显式标注来源；不得把 `source: memory` 计入生产完成证据。Nexus evidence source 统一枚举为 `live | d1 | r2 | local-only | memory | open`，生产完成 evidence 只接受 `live/d1/r2`；Nexus production governance 矩阵见 `../04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md`。
- 平台能力仍必须有可见 degraded/unsupported reason 与 fail-closed 行为；Linux 差异可 best-effort，但必须有用户可见 reason 与 smoke 记录；平台能力 smoke 为非阻塞回归矩阵，见 `../04-implementation/Evidence-Matrix-Platform-2026-06-18.md`。
- 新增 App Data 插件不得默认扫描敏感数据；浏览器历史、macOS Notes/Reminders/Calendar/Contacts、VSCode workspace、Obsidian vault 等必须有用户启用、索引范围、清理入口和错误降级说明；平台声明必须与 source-level availability 一致，不能把 Linux/Windows/macOS 差异写成全平台同等支持；不得把完整业务明文 dump 到普通 JSON、localStorage、日志或同步 payload。
- 动态执行能力必须有明确输入约束、sandbox/facade、审计或替换计划；PreviewSDK ability 必须声明 parser/sandbox/network/cache 依赖、输入长度、语法约束、是否网络/缓存/动态执行与替换计划。BasicExpression 已替换为小型 parser，单位公式已统一为静态转换核心；`new Function` 仅允许出现在 widget runtime sandbox 等已声明运行时边界中。

### 4.5 Milestone 质量口径

后续 release/milestone 需要新增或调整质量门槛时，必须同步 `TODO`、`CHANGES`、Roadmap 与本文件，并明确：

- 平台验证范围。
- 性能预算和验收脚本。
- 人工验证与自动校验的边界。
- 不接受模板占位、`N/A`、`TODO`、`TBD`、`-`、`待补`、`无` 作为有效结果。

### 4.6 启动与性能

- CoreApp 启动 critical path 不得新增非首屏必要的串行 await。
- renderer mount 前不得新增 plugin list、远程探测、extension load、telemetry hydrate、agent/workflow runtime、update cache hydrate、OCR/native watcher 等可后台化任务。
- 启动治理需采集：Electron ready → first window show、renderer script start → app mount、app mount → plugin list ready、all modules loaded → providers ready。
- SQLite 高频写必须具备单写者/物理分库/QoS/drop/backoff/latest-wins 等策略，禁止无上限重试灌队列。

### 4.7 SRP / Size

- 不再维护 size allowlist 作为唯一门禁；超长文件治理回到 code review、targeted refactor 与最近路径测试。
- 不再维护旧 `compatibility-debt-registry.csv`、`legacy-boundary-allowlist.json` 或 `large-file-boundary-allowlist.json` 作为 live SoT；若要恢复自动债务门禁，必须重新立项并同步脚本、清册和入口文档。
- 新增大文件或显著增长必须说明职责边界、拆分计划与验证命令。
- 已完成拆分的模块不得回潮：Clipboard、AppProvider、SearchCore、UpdateSystem、OmniPanel、Provider Registry、Tuffex FlipOverlay 等继续按最近路径测试防回归。

### 4.8 AI 稳定化与证据

- `2.5.0` Stable 证据只覆盖 CoreBox 文本 + 显式 OCR、Nexus invoke/provider routing 与固定失败路径；CoreBox AI Ask 至少拆分为文本 `text.chat` 成功、剪贴板/显式图片 `vision.ocr -> text.chat` 成功、未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied、Local/Ollama routing 八条 evidence item，不允许用单张泛化失败截图替代；OmniPanel Writing Tools、Workflow Use Model 与 Review Queue 只能作为 Beta evidence，不能反向替代 Stable evidence；固定矩阵见 `../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`。
- 未登录、provider 不可用、quota 不足、model/capability 不支持、网络失败必须返回明确错误和用户可见恢复建议，不得返回空结果或伪成功。
- Provider metadata chips 至少展示 capability/provider/model/latency/trace 中的可用字段；缺失字段必须有 pending/unavailable fallback，不能渲染空 footer。
- Provider secret、API key、prompt/response 明文不得进入普通配置、localStorage、日志或同步 JSON；审计默认只记录 trace/provider/model/latency/usage/success/errorCode。
- `2.5.3` / `2.5.4` / `2.5.5` / `2.5.8` 在当前稳定窗口只允许文档、schema 或小型 SDK 探索，不得把本地知识库、自动长期记忆、本地大模型、语音或多模态生成提前作为 `2.4.11` 或 `2.5.0 Stable` blocker。
- 已落地的 `2.5.3`/`2.5.4` CoreApp foundation 只计入 schema / typed SDK / focused service test 证据，不替代 `2.5.0` packaged Electron 文本/OCR成功与固定失败路径 evidence。
- ContextHygiene 必须可解释 prompt 组装来源；MemoryPolicy 必须在写入前拦截 API key、token、恢复码、口令等敏感内容，ContextPackage 日志默认只记录 source id、reason、token estimate 与 trace，不保存完整 prompt/response。Sensitive / secret turns 不得进入 FTS、embedding、context log 或可同步 payload；删除 memory 必须通过 tombstone 与 prepareTurn 二次过滤防止回灌；LangChain adapter 默认禁止外部 tracing/cache/remote vectorstore，除非经 Tuff 托管 adapter 脱敏、授权和审计。

### 4.9 App Data / Indexing Runtime

- File/App/Everything/Browser Data/Quicklinks source 必须通过 indexed source descriptor/admission 进入 runtime，不得新增绕过 Settings diagnostics 的私有扫描入口。
- File write/store boundary 迁移必须保持 SQLite/FTS/SearchIndex worker 真实语义不变；SDK 化优先抽取纯 mapping、reason、summary、config、progress/evidence policy。
- Browser Bookmarks/History 属于 high privacy source，默认 disabled/ask，必须由官方插件或受控 core bridge 在显式同意后读取；metadata-only `manifest.indexedSources` 不等于真实 runtime source 完成。
- Everything productionization 必须补 SDK/CLI 策略、registry PATH 探测、Windows 运行性能/evidence 与 fail-closed 诊断。
- Durable job history、跨 source retry/debounce、自动恢复动作未完成前，Settings recovery recommendation 只能作为只读建议，不得伪装为 durable scheduler。

### 4.10 i18n / Domain Lexicon / Cloud Catalog

- Locale core 必须统一 `zh-CN` / `en-US` 与短码 `zh` / `en` 的映射；新增语言前必须先补 fallback、coverage 与 QA 口径。
- `LocalizedText` / `LocalizedList` 必须支持 default 值与按 locale 解析；缺失翻译只能走显式 fallback chain，不得临时拼接中英文。
- 2026-06-24 已落地 R8 Phase 1/2 foundation：共享 Locale Core、`LocalizedText` / `LocalizedList` resolver、CoreApp 插件 manifest localized metadata loader 与运行态展示解析。
- 2026-07-13 已落地 R8 Phase 3 Domain Lexicon V1：带 `source=builtin` provenance 的只读 registry、53-entry 单位 baseline、跨语言 aliases、locale label 与 PreviewSDK/CoreApp/QuickOps 共享 conversion source。
- 2026-07-13 已落地 R8 Phase 4 Plugin SDK facade：`sdkapi 260713` main/renderer typed surface、verified context、`i18n.read` / `lexicon.read` / `lexicon.register` fail-closed、host namespace/provenance、原子 bounds、跨插件隔离与 disable/unload cleanup；CatalogService 与质量门禁仍未完成。
- Domain Lexicon entry 必须包含 stable id、domain/source provenance、version、labels、aliases 与 locale coverage；metadata 必须是 plain JSON，单位换算展示、解析和搜索召回必须消费同一 official registry。
- 插件 SDK 只能开放受控 facade，不暴露宿主内部 resolver、raw locale store 或未隔离 catalog 写入；plugin overlay 只驻留内存，不能覆盖 official 或跨 plugin 读取。
- CatalogService 必须覆盖 download、verify、schema validate、SQLite import、activate、rollback 与版本状态；校验失败不得污染 active catalog。

## 5. PRD 验收模板

```md
## 验收清单

- [ ] 功能验收：核心场景通过，失败路径可见
- [ ] 质量验收：typecheck/lint/test/build 通过，或记录既有失败项
- [ ] 性能验收：关键指标在预算范围内
- [ ] 安全验收：敏感数据、权限、同步载荷符合规则
- [ ] 文档验收：README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步
- [ ] 回滚验收：回滚开关、数据兼容或降级策略明确
```

## 6. 文档同步矩阵

| 变更类型                                            | 必须同步                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 行为/接口/架构变化                                  | `README` / `TODO` / `CHANGES` / `INDEX` 至少一处                                                                                      |
| 目标或质量门禁变化                                  | 同步 Roadmap 与本文件                                                                                                                 |
| 发布 gate、CI 自动门禁或 evidence 变化              | `TODO`、`CHANGES`、Roadmap、Quality Baseline；若涉及 Release manifest/asset 命名或 Nexus sync，还需同步更新链路规范与 workflow README |
| 包发布 workflow 触发路径、lockfile/catalog 口径变化 | `TODO`、`CHANGES`、Roadmap、Quality Baseline、`.github/workflows/README.md`                                                           |
| 历史事实归档                                        | `CHANGES` 或 archive，入口文档只保留索引                                                                                              |

## 7. 关联入口

- PRD 主入口：`docs/plan-prd/README.md`
- 当前执行清单：`docs/plan-prd/TODO.md`
- 产品路线图：`docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`
- 变更日志：`docs/plan-prd/01-project/CHANGES.md`
- 全局索引：`docs/INDEX.md`
