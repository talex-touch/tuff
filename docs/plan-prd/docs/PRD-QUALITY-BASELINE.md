# PRD 质量基线

> 更新时间：2026-06-17
> 定位：活跃 PRD 的最小质量约束。压缩前完整规则快照见 `./archive/PRD-QUALITY-BASELINE-pre-compression-2026-05-14.md`。

## 1. 适用范围

适用于：

- `docs/plan-prd/02-architecture`
- `docs/plan-prd/03-features`
- `docs/plan-prd/04-implementation`
- `docs/plan-prd/06-ecosystem`

活跃 PRD 指仍影响当前或未来 2 个版本行为、接口、架构、发布或质量门禁的文档。历史 PRD 必须标注 `Archived/Historical` 与替代入口。

## 2. 当前强口径

- 当前基线：`2.4.10`。
- `2.4.10` GitHub Release 与 Nexus release metadata sync 已完成；Windows acceptance evidence、release evidence 内容与公共 npm 子包补发仍按 TODO 跟踪，不把这些阻塞项视为全绿。当前质量主线转入 `2.4.11` 债务退场与 `2.5.0` AI scope 约束。
- `2.4.11` 必须关闭或显式降权剩余 legacy/compat/size 债务，并以 release checklist、质量门禁、release integrity 与 npm publish evidence 为本轮收口主线；按最新维护决策，Windows/macOS 真机人工回归不纳入本轮阻塞项，后移为平台专项。
- `2.5.0` AI Stable 只承诺文本 + OCR；Workflow/Skills/Automation 为 Beta；Assistant、多模态生成编辑、Nexus Scene runtime orchestration 为 Experimental 或后续。AI 已有 CoreApp Intelligence module、provider runtime、workflow service、agent/tool channels、OmniPanel Writing Tools 与 Assistant typed transport，但只有 packaged Electron 文本/OCR成功与失败路径证据补齐后才能宣称体验闭环。
- `2.5.3` 本地知识检索方向已锁定：SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 是增强项；MVP 不引入独立向量数据库服务。2026-06-17 CoreApp 已落地 documents/chunks SQLite SoT、FTS5 index/triggers、typed SDK、metadata filters、citation 与 token-budgeted Context Builder foundation。
- `2.5.4` ContextHygiene 与自动记忆治理方向已锁定：Session / Checkpoint / CompressionSnapshot / MemoryItem / ContextPackage 必须以本地 SQLite 为 SoT；新 session 不默认继承旧 session 原文，旧会话只允许通过相关性检索或用户显式继续意图注入。2026-06-17 CoreApp 已落地 CoreBox-only prepareTurn/saveMemory/deleteMemory foundation、context package explain log、secret memory rejection、tombstone-first delete 与 private turn redaction。
- `2.5.5` 本地模型运行时方向已锁定：不强依赖 Ollama，优先内置 GGUF / `llama.cpp` runtime；Ollama 仅作为可选兼容后端，模型权重不得进入安装包、同步载荷或普通日志。
- `2.5.8` ASR Provider Runtime 方向已锁定：本地 `whisper.cpp` + 云端 ASR provider 抽象；隐私内容不得默认上传云端，TTS 不进入该版本 Stable。
- App Data Plugins 与 Everything 收口已新增 Roadmap：新增 Browser Data、Obsidian、VSCode、macOS App Data、Epic 等数据源必须显式授权、只读优先、可清理索引、可见 degraded/unsupported reason；Windows Everything 必须明确 SDK/CLI 策略、路径授权过滤与真机 evidence。
- Provider / Scene 必须解耦：新增供应商进入 Provider registry，新增使用场景进入 Scene，不新增孤立 provider model。
- 质量入口：PR 使用 `pnpm quality:pr`，其中 lint 阶段只检查 PR 修改的 JS/TS/Vue 文件；`pnpm test:targeted` 的 Nexus sync route test 已指向当前 `apps/nexus/test/api/sync/sync-routes-410.test.ts` 路径；release/milestone 使用 `pnpm quality:release` 并保留全仓 lint；独立 OmniPanel Gate workflow 已于 2026-05-18 删除，不再作为 GitHub Actions 自动门禁；若既有失败阻断，必须记录失败项与最近路径替代验证。
- 当前质量状态：`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 已恢复完整 `fileProvider` 导出，`pnpm -C "apps/core-app" run typecheck:node` 已通过；2026-05-20 自动化审计未发现新的 P0 fixed fake-success，且本轮已收口 `touch-snipaste` shell capability、`touch-window-presets` 展示期 non-mutating permission check、Browser Data source-level diagnostics、Widget Runtime Safety 基线、CoreBox app launch immediate-hide handoff、MetaOverlay renderer action bridge、CoreApp secure-store local-secret hard-cut 与 Nexus retired intelligence endpoint HTTP `410` 合同测试；2026-05-21 focused tests 覆盖 Assistant 剪贴板图片翻译 typed event、推荐系统上下文信号、可选 AI embedding/rerank fail-open、壁纸状态归一化、TuffEx 基础组件与 Nexus storage governance telemetry；2026-05-22 Assistant 悬浮球/VoicePanel 可见入口、拖动持久化与空剪贴板图片恢复已有 dev 和 local unpacked packaged 证据；2026-05-25 UI/兼容/占位/架构审计继续确认无新增 P0 fixed fake-success，并把 legacy retained aliases、旧 snippets placeholder 插件、Nexus memory fallback 证据分层、preload debug `innerHTML`、dialog `v-html` 与 TuffEx visual smoke 纳入近期质量治理；2026-05-29 增量审计继续确认无新增 P0 fixed fake-success，Nexus/TuffEx composition demos 与 dashboard chart wrapper 提升 UI 完善度；2026-06-06 增量审计继续确认无新增 P0 fixed fake-success，CoreApp/TuffEx dialog trusted HTML boundary 与 Widget runtime sandbox evidence 已完成 focused 切片；2026-06-13 当前代码版本 root/CoreApp `2.4.11-beta.8`，本地 `HEAD=47787615b fix(tuffex): make style entry build idempotent`，`master` 相对 `origin/master` 领先 9 个提交。CLI publish 已补 focused publish evidence：过期 app JWT 交互式自动刷新、API key `plugin:read`/`plugin:publish` scopes preflight、`TUFF_NON_INTERACTIVE=1` fail-closed、以及 upload POST 与 probe 一致的 device headers。`2.4.11-beta.6` 发布后 Gate D strict 已通过并作为最近完整发布链路证据；Nexus 资产 sha256/signatureUrl 与 signature endpoint 缺口仍按 release integrity debt 记录；`quality:release` 仍保留全仓 lint/build，若既有失败阻断，必须记录失败项与最近路径替代验证；旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，不能再作为当前门禁或事实来源引用。
- 2026-06-13 工作区质量口径：提交仍必须按 related-only 组织；`touch-music` / `touch-image` 示例插件 starter 清理已完成，`touch-music` 不再依赖全量 `@talex-touch/tuffex/style.css`。当前下一批优先级先回到 `docs/plan-prd/04-implementation/Release-2.4.11-Closure-2026-06-13.md` 的最近路径验证、`quality:pr`、publish manifest preflight、`quality:release` 结果记录与 `git diff --check`，随后回到 UI 语义控件、Widget 扩展边界长尾、File write/store boundary 与 Browser Bookmarks official lifecycle。CLI publish auth preflight evidence 已补齐，后续只剩真实 npm publish/operator evidence。
- 2026-06-13 Nexus docs SEO/prerender 质量口径：docs 页面 metadata/OG/Twitter/canonical/alternate/robots/TechArticle JSON-LD 已抽到可测 helper 并形成最近路径覆盖；`no_prefix` 暂不切换为全站前缀策略，docs 过渡方案是显式 `/en/docs/**`、`/zh/docs/**` 页面路由 + 页内 locale 同步。prerender evidence helper 必须复用实际 route 枚举并验证真实 `content/docs`，避免 evidence 与生产清单分叉；localized `/en/docs`、`/zh/docs` 与稳定 docs API 是当前静态输出检查目标，unprefixed `/docs` 继续走 redirect/runtime 口径。已通过 focused prerender/SEO Vitest 与 scoped ESLint；不改变 `quality:pr` / `quality:release` 门禁。

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
- 业务层禁止新增 direct `fetch/axios`，统一走 `@talex-touch/utils/network` 或注入网络客户端。
- 旧 `/api/sync/*` 只允许迁移期只读，新增同步能力必须走 `/api/v1/sync/*` 及 keys/devices 配套接口。

### 4.3 Storage / Sync / Secret

- SQLite 是本地 SoT；JSON 只允许作为同步载荷格式，且必须是密文或引用。
- 禁止敏感信息明文进入 localStorage、普通 JSON、日志或同步 payload。
- `deviceId` 只能做设备标识或 AAD，不得作为密钥材料。
- Provider metadata 可普通存储；API key、secret、token、refresh token 必须进入 secure store、plugin secret capability 或 `authRef`。CoreApp secure store 只允许使用本机随机 root 密钥加密，禁止访问系统钥匙串 / Credential Locker / libsecret / Electron `safeStorage`；旧 `safe-storage` envelope 不再迁移解密，PRD 必须显式说明重新登录/重填 secret 影响。
- Sync 输出只允许 `payload_enc` / `payload_ref` 等密文引用；旧 `b64:` 只保留只读迁移语义。

### 4.4 平台与真实能力

- 生产路径不得返回固定假值成功、mock 支付 URL、伪成功空结果或可消费业务 payload。
- 不可用能力必须返回明确 status、`unavailable + reason`、`unsupported/degraded reason` 或 migration target。
- memory/local-only fallback 只能作为 dev smoke 或降级证据，必须在 API/UI/evidence 中显式标注来源；不得把 `source: memory` 计入生产完成证据。Nexus evidence source 统一枚举为 `live | d1 | r2 | local-only | memory | open`，生产完成 evidence 只接受 `live/d1/r2`。
- 平台能力仍必须有可见 degraded/unsupported reason 与 fail-closed 行为；Windows/macOS 真机人工回归当前后移为平台专项，不作为本轮 `2.4.11` release checklist 阻塞项。Linux 差异可 best-effort，但必须有用户可见 reason 与 smoke 记录。
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

- `2.5.0` Stable 证据只覆盖文本 + OCR，必须有 CoreBox AI Ask、OmniPanel Writing Tools 与 Nexus invoke 最近路径证据；CoreBox AI Ask 至少拆分为文本 `text.chat` 成功、剪贴板图片 `vision.ocr -> text.chat` 成功、未登录、provider unavailable、quota exhausted、model unsupported 六条固定 evidence item，不允许用单张泛化失败截图替代。
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
- Everything productionization 必须补 SDK/CLI 策略、registry PATH 探测、Windows 真机性能/evidence 与 fail-closed 诊断。
- Durable job history、跨 source retry/debounce、自动恢复动作未完成前，Settings recovery recommendation 只能作为只读建议，不得伪装为 durable scheduler。

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

| 变更类型 | 必须同步 |
| --- | --- |
| 行为/接口/架构变化 | `README` / `TODO` / `CHANGES` / `INDEX` 至少一处 |
| 目标或质量门禁变化 | 同步 Roadmap 与本文件 |
| 发布 gate、CI 自动门禁或 evidence 变化 | `TODO`、`CHANGES`、Roadmap、Quality Baseline；若涉及 Release manifest/asset 命名或 Nexus sync，还需同步更新链路规范与 workflow README |
| 包发布 workflow 触发路径、lockfile/catalog 口径变化 | `TODO`、`CHANGES`、Roadmap、Quality Baseline、`.github/workflows/README.md` |
| 历史事实归档 | `CHANGES` 或 archive，入口文档只保留索引 |

## 7. 关联入口

- PRD 主入口：`docs/plan-prd/README.md`
- 当前执行清单：`docs/plan-prd/TODO.md`
- 产品路线图：`docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 变更日志：`docs/plan-prd/01-project/CHANGES.md`
- 全局索引：`docs/INDEX.md`
