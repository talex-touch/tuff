# Talex Touch - 项目文档中心

> 更新时间：2026-06-14
> 定位：PRD / 规划主入口。历史长文已下沉到 `CHANGES` 与专题文档；当前执行项以 `TODO.md` 为准。

## 快速入口

- [项目待办（2 周主清单）](./TODO.md)
- [CoreApp 性能基线与优化执行计划](./04-implementation/performance/CoreAppPerformanceBaseline-2026-05-28.md)
- [Indexing Runtime V1 统一搜索源计划](./03-features/search/INDEXING-RUNTIME-V1-PLAN.md)
- [产品总览与路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)
- [变更日志（近 30 天 + 历史归档）](./01-project/CHANGES.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [长期债务池](./docs/TODO-BACKLOG-LONG-TERM.md)
- [文档盘点历史快照（2026-03-17）](./docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md)

## 当前单一口径

- 当前基线：`2.4.10`（GitHub Release 与 Nexus release metadata sync 已成功）；当前代码版本已到 `2.4.11-beta.8`，当前本地 `HEAD=47787615b fix(tuffex): make style entry build idempotent` 且 `master` 相对 `origin/master` 领先 9 个提交；`2.4.11-beta.6` 发布后 Gate D strict 复核通过的证据仍作为最近完整发布链路记录；Nexus 资产 sha256/signatureUrl 与 signature endpoint 缺口仍按 release integrity debt 跟踪。
- 当前主线：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，并把 release checklist、质量门禁、release integrity 与 npm publish evidence 收口为单一口径；按最新维护决策，Windows/macOS 真机人工回归不纳入本轮阻塞项，相关平台专项证据后移。CoreBox app launch handoff 已补 immediate hide，避免慢启动期间 launcher 可见卡死；AI compat 生产退役端点已钉住 HTTP `410` 与迁移目标，不再返回可消费占位 payload。
- 下一版本门槛：`2.5.0` AI 桌面入口收口，Stable 只承诺文本 + OCR，Workflow/Skills/Automation 保持 Beta。
- 质量现状：PR lint 已收敛为 changed-file lint；`file-provider.ts` 编译边界已恢复（完整 `fileProvider` 导出），当前临时 master 已在干净依赖 worktree 通过 `pnpm quality:pr`（changed-file lint、`test:targeted`、CoreApp node/web typecheck）；2026-05-20 自动化审计未发现新的 P0 fixed fake-success，本轮已补 CoreBox app launch immediate-hide、MetaOverlay renderer action bridge、CoreApp secure-store `safeStorage` 优先后端与 Nexus retired intelligence endpoint 410 合同测试；2026-05-22 已继续推进 Assistant 剪贴板图片翻译 typed event、`smoke:assistant` 悬浮球/VoicePanel 可见入口 smoke、推荐上下文来源开关、可选 AI embedding/rerank fail-open 测试、壁纸个性化、设置页资产兼容提示、统一网络/代理高级设置入口、TuffEx 基础组件文档覆盖与 Nexus storage/upload lifecycle governance telemetry 与 telemetry-to-governance analytics 写入链路；2026-05-25 已完成 Nexus Data Governance / Provider Registry admin hydration 与 i18n 稳定化，并通过 focused governance test、file-scoped ESLint、`git diff --check` 与 `pnpm nexus:build`；同日 `v2.4.11-beta.4` 三端 release workflow、GitHub Release、Nexus BETA latest 与 Cloudflare Pages `tuff` 生产部署均已恢复；同日 UI/兼容/占位/架构审计未发现新的 P0 fixed fake-success，但把 legacy retained aliases、旧 snippets placeholder 插件、Nexus memory fallback 证据分层、preload debug `innerHTML`、dialog `v-html` 与 TuffEx visual smoke 标为后续高信号治理项；2026-05-26 已将 preload debug panel 运行时日志改为 `createElement` + `textContent` 安全渲染，并清理同段 debug console 噪音；2026-05-29 增量审计继续未发现新的 P0 fixed fake-success，确认 Nexus/TuffEx 组合 demo 与 dashboard chart wrapper 改善 UI 完善度；同日已按五个小切片落地 legacy alias telemetry/hard-cut 判定记录、旧 snippets hidden/deprecated/replacedBy 退场、Nexus evidence source enum/UI 分层、dialog message 文本/可信 HTML 分流，以及 TuffEx composition visual smoke 脚本；同日 post-slice 复核继续确认无新增 P0 fixed fake-success；同日 `v2.4.11-beta.6` 发布成功并通过发布后 Gate D strict 复核，本地提交态 notes 已补齐，release manifest validator 与当前 workflow 资产命名对齐，Nexus sync 已修正 manifest redirect、metadata YAML 跳过与全 tag sha256 backfill；2026-05-31 增量审计继续未发现新的生产路径 P0 fixed fake-success，确认 TuffEx Tabs 动态子项修复方向正确，TuffEx 已补组件子路径 exports、局部 `style.css` 生成、`audit:exports` 与 CoreApp 受控注册按需加载，同时将 SharedPluginDetailReadme 默认未 sanitize、UI preference 直接 localStorage、旧式 `div/span @click` 与 cloud preset public placeholder 标为下一批 P1 治理点；2026-06-01 TuffEx composition visual smoke 已在 Nexus/Chrome CDP 环境采集 30/30 通过截图/JSON evidence，作为 focused evidence 记录且不改变 `quality:pr` / `quality:release` 门禁；Windows App indexing / Everything registry PATH 探测 / CoreBox function key hardening / 手动文件索引完成通知仍需 Windows 真机 evidence；Data Governance 本地 Wrangler/Miniflare 认证浏览器证据已补到 cockpit 可见，但生产/preview 认证 operator evidence、live send、live object storage、production D1 migration/backfill 与真实 provider quota 仍未闭环；`touch-browser-bookmarks` 与 `touch-browser-data` 外链打开已纳入 `network.internet` capability 口径，展示期只做 non-mutating permission check，执行期 request/block；`touch-snipaste` shell capability、`touch-window-presets` 展示期权限请求、Browser Data source-level diagnostics、widget runtime sandbox、裸 console 与 SRP 大文件仍是优先治理点；`quality:release` 仍按全仓 lint/build 另行收口，需记录最近路径替代验证；旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，治理以 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工清单为准；npm 公共子包发布仍因 `NPM_TOKEN` 无法 publish `@talex-touch` scope 阻塞。
- 范围约束：`2.5.0` AI、Provider Registry 高级策略、SRP 大拆分可继续规划/小切片，但不得抢占 `2.4.11` 稳定化与债务退场主线。
- 当前工作区口径：2026-06-13 `touch-music` / `touch-image` 已完成 starter asset、模板 README 与过时入口残留清理；`touch-music` 已从全量 `@talex-touch/tuffex/style.css` 收敛到 `base.css` + 组件子路径样式；新增 `docs/plan-prd/04-implementation/Release-2.4.11-Closure-2026-06-13.md` 作为本轮 0 + 1 收口清单。下一步先跑最近路径验证、`quality:pr`、publish manifest preflight 与 `git diff --check`，再处理 release integrity / npm publish 真实证据。
- 2026-06-13 Plugin widget surface follow-up：widget manager 缓存注册命中已避免重复预编译读取/运行时编译，renderer registry 以 `widgetId + hash` 幂等跳过重复注册；`interaction.forceMax` 明确为显式最大高度合同，普通 widget 不再按类型默认强制最大高度，官方全高 widget 已在 manifest 显式声明并补 focused tests。
- 2026-06-13 Nexus docs SEO/prerender 当前口径：docs catch-all 已补完整 metadata/OG/Twitter/canonical/alternate/robots/TechArticle JSON-LD，并把 SEO head 抽到可测 helper；`no_prefix` 暂不切全站策略，docs 通过显式 `/en/docs/**`、`/zh/docs/**` 路由与页内 locale 同步完成过渡。prerender evidence helper 复用实际 route 枚举并验证真实 `content/docs` 根索引、developer quickstart、components index、guide start 与稳定 docs API；Worker bundle 静态路由期望已对齐 localized docs 输出；focused prerender/SEO Vitest 与 scoped ESLint 已通过。该切片不改变 `quality:pr` / `quality:release` 门禁，只作为 docs render/SEO 最近路径证据。
- 2026-06-02 UI/兼容/占位复核：新增自动化增量审计报告，继续未发现生产路径 P0 fixed fake-success；当前新增高信号点是 TuffEx `base.css` + 子路径 `style.css` + on-demand style plugin 必须同时覆盖 dev/prod 构建证据，README/Nexus docs 旧 `style.css` 推荐示例需降级为 legacy full-style 用法。TuffEx dist 当前存在 `base.css` 9554 bytes 与 `components.css` 313566 bytes，但本轮 shell 缺 `pnpm`/`corepack` 且 Node 为 Codex `v24.14.0`，无法把 `audit:exports` / `audit:size` 写成已通过；`git diff --check` 通过。
- 2026-06-02 UI/安全实现切片：已收口 shared Markdown 默认 sanitize、Update release notes safe renderer、preload loading overlay DOM 构建、CoreApp 非敏感 UI preference facade、首批语义控件、Nexus local marker/privacy preference 口径与 cloud preset `not-shipped` unavailable contract。新增 focused tests，但当前 Codex Node `v24.14.0` 与 Rollup optional native module 签名问题阻塞 Vitest，需在 Volta Node `22.16.0` + `pnpm@10.32.1` 补跑。
- 2026-06-03 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；确认 Markdown sanitizer、preload overlay DOM 构建、cloud preset fail-closed、TuffEx README 按需推荐已进入实现切片，但 Nexus content docs 仍残留旧 `@talex-touch/tuffex/style.css` 示例。当前 shell 仍只有 Codex Node `v24.14.0` 且无 `pnpm`/`corepack`，TuffEx build/audit/typecheck、Nexus build/visual smoke、CoreApp web typecheck 与 `intelligence-uikit` typecheck 必须在标准开发环境补跑。
- 2026-06-04/05 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；Nexus TuffEx public docs 推荐用法已同步为 `base.css` + 组件子路径 + 局部 `style.css`，full `style.css` 只保留为迁移期兼容示例；Nexus release notes `notesHtml` 已接共享 `sanitizeMarkdownHtml()`。2026-06-05 使用临时 ad-hoc Node `22.16.0` + pnpm `10.32.1` 补齐 TuffEx `build` / `audit:exports` / `audit:size` / `audit:types`、Nexus `typecheck` / `build` 与 PreviewSDK focused test；Nexus visual smoke 因无 CDP 浏览器服务与 3200 dev/preview server 未执行。剩余高信号点是 CoreApp/TuffEx dialog HTML boundary、Widget runtime sandbox evidence 与 Windows/macOS 真机 evidence。
- 2026-06-06 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；确认上一条已推送代码基线与远端同步，默认 automation shell 仍是 Codex Node `v24.14.0` 且无裸 `pnpm/corepack`，但 `/tmp/talex-touch-node22-adhoc` 仍有 Node `22.16.0` + pnpm `10.32.1` 临时验证入口。本轮静态分层确认 escaped highlight / safe Markdown / AI answer escape 不应误判为假实现；CoreApp/TuffEx dialog trusted HTML boundary 与 Widget runtime sandbox evidence 已完成 focused 切片，后续优先收主路径语义控件与 Windows/macOS 真机 evidence。
- 2026-06-07 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；当时确认 `HEAD=686ec013e`、root/CoreApp `2.4.11-beta.7`、`@talex-touch/tuff-cli@0.0.7`。`tuffcli publish` 现已补齐 focused evidence：过期 app JWT 会在交互式 publish 里自动走 browser OAuth device flow 刷新，API key 会在上传前预检 `plugin:read` + `plugin:publish` scopes，`TUFF_NON_INTERACTIVE=1` 继续 fail-closed；上传 POST 也已与 publisher probe 对齐携带 device headers，方便统一设备归因与审计。`touch-music` / `touch-image` starter asset 清理已在 2026-06-13 落地，UI 下一步回到语义控件与平台真机 evidence。
- AI 现实口径：AI 已有 Intelligence module、provider runtime、workflow service、agent/tool channels、OmniPanel Writing Tools 与 Assistant typed transport，但仍缺 packaged Electron 文本/OCR成功与失败路径证据，不能标记为体验闭环。`2.5.3` 本地知识检索、`2.5.5` 本地模型 runtime、`2.5.8` ASR 只保持 PRD 锁方向，当前稳定窗口不提前实现。

## 当前 Goal / Progress Snapshot

- 当前 goal：继续把 Search Provider / Indexed Source / Indexing Runtime 收敛为可开放 SDK 的统一抽象，优先保证 provider enable/order、插件 provider 权限、root results push gate、source diagnostics、progress ETA 与维护动作在 Settings/CoreBox 中同一口径展示。
- 已落地进度：Search Provider SDK 边界、插件 provider manifest policy、`search.root-results` 权限 gate、Settings provider enable/order、source-to-provider link、File progress ETA diagnostics、Browser Bookmarks consent-gated skeleton 与 Quicklinks linked provider enablement 已进入当前基线。
- 当前第一批剩余：已推送代码基线与远端同步；CoreApp/TuffEx dialog trusted HTML boundary 与 Widget runtime sandbox evidence 已完成 focused 切片，`touch-music` / `touch-image` 示例插件 starter 遗留物也已清理。下一步不再围绕脏代码切片收口，而是先完成 `2.4.11` release checklist、质量门禁与 publish/release integrity evidence；Windows/macOS 真机人工回归不作为本轮阻塞。随后回到主路径 UI 语义控件、File write/store boundary、`scan_progress` / integrity reset durable job history、Browser Bookmarks 官方 `touch-browser-data` 插件 owned runtime source、Quicklinks 官方插件持久 feed + clear/rebuild UI 与 Everything SDK/CLI 最终策略。
- 提交策略：继续按 related-only 小批提交；HTML boundary、Widget runtime、UI 语义控件、File write boundary、Browser Bookmarks/Quicklinks 不得混成同一个提交。

## 当前主线（2 周）

1. 继续收敛 `2.4.11` legacy/compat/size 债务，不新增 legacy/raw channel/旧 storage/旧 SDK bypass；旧自动清册不再作为 live SoT。
2. 聚焦插件 shell capability、动态执行边界、secret backend 与 SRP 小切片，不再做泛化 placeholder 扫描。
3. 收口 `2.4.11` release checklist、`quality:pr` / `quality:release` 证据、release integrity debt 与 npm publish preflight；Windows/macOS 真机人工回归不纳入本轮阻塞项。
4. 已推送代码基线与远端同步；CoreApp/TuffEx dialog trusted HTML boundary、Widget runtime sandbox evidence 与 CLI publish auth preflight evidence 已完成 focused 切片，`touch-music` / `touch-image` 示例插件清理已完成，后续优先推进主路径 UI 语义控件与 File write/store boundary。
5. 回到 P1-APP-DATA 第一优先级：File write/store boundary 迁移，其次 Browser Bookmarks 从 CoreApp skeleton 走向官方 `touch-browser-data` runtime source lifecycle。
6. 推进 `2.5.0` AI 桌面入口证据小切片，但 Stable 范围保持文本 + OCR，优先补 CoreBox AI Ask、OmniPanel Writing Tools、Nexus invoke 失败路径与 packaged Electron UI evidence。
7. 按 2026-06-01/2026-06-02 UI/兼容/占位自动化增量审计继续推进 Indexing Runtime 写入边界迁移与剩余 UI 语义债务；Windows App indexing / Everything registry PATH 等真机证据进入后续平台专项，不阻塞本轮 `2.4.11` 收口。Markdown/HTML 渲染边界、Nexus device identity/localStorage 口径、首批 UI 语义切片与 cloud preset unavailable contract 已完成首轮收口，TuffEx Tabs/visual smoke 已于 2026-06-01 补 30/30 focused evidence。

详见：[TODO](./TODO.md)。

## 未闭环能力

### P0 - 2.4.11

- `2.4.11` release checklist、质量门禁与 release integrity / npm publish evidence 闭环。
- Windows/macOS 真机人工回归与 Linux best-effort smoke 进入后续平台专项，不作为本轮 `2.4.11` 阻塞项。
- AI 兼容占位成功响应退场：当前 live tree 已无历史 `retired-ai-app` 路径；Nexus `intelligence-lab/*` 与旧 orchestrator 入口返回 `410` 与迁移目标，仍按 TODO 继续防止新增生产 fake-success。
- CLI token 与插件 provider secret storage 收口：文件权限缓解与 `usePluginSecret()` 迁移已推进；CoreApp secure-store 已优先 Electron `safeStorage`，Credential Locker/libsecret 与遗留 secret evidence 仍待闭环。
- 插件 shell/OS/network capability 诊断统一：`touch-browser-bookmarks` 与 `touch-browser-data` 已完成 `network.internet` 展示期 metadata 与执行期 request/block。
- Transport Wave A retained alias/hard-cut 继续推进。
- CoreApp 启动异步化真机 benchmark 与长尾补证；2026-05-28 已新增性能基线执行计划，先采集启动、CoreBox、runtime 与 build/package 数据，不改变 release gate。
- 公共 npm 子包补发：`@talex-touch/tuffex@0.3.7` 发布阻断已通过 lockfile/publish manifest 等价验证解除；`@talex-touch/tuff-cli@0.0.7` 已补 publish 旧 token 刷新、API key scope preflight、非交互 fail-closed 与 upload device headers evidence，仍需具备 `@talex-touch` publish 权限的 `NPM_TOKEN` 才能完成实际补发；其余公共子包补发继续按同一发布链路口径推进。

### P1+

- CoreApp 统一网络/代理设置已接入高级设置，走 typed Network SDK 配置系统代理/直连/自定义代理、timeout/retry/cooldown；后续仍需真实代理连通 evidence 与 secure credential 编辑入口。
- Tuff 2.5.0 AI 桌面入口：CoreBox AI Ask、handoff session、Nexus invoke credits 扣减、CoreApp credits summary、Tuff-native Tool Kit foundation、Nexus docs prerender routes、OmniPanel Writing Tools MVP、Workflow service 与 agent/tool channels 已进入 dev 切片；下一步优先补文本/OCR success、auth/provider/quota/model unsupported failure、provider metadata chips 与 packaged Electron UI evidence。Workflow/Skills/Automation 保持 Beta，Assistant/语音/多模态生成保持 Experimental。
- Tuff 2.5.3 本地知识检索：方向已锁定为 SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项，不把向量数据库作为 MVP 第一优先级。
- Tuff 2.5.4 ContextHygiene 与自动记忆治理：方向已锁定为 Session Boundary / Checkpoint / Rolling Summary / MemoryPolicy / ContextPackage，默认轻上下文，新会话不继承旧 session 原文，旧会话只在相关时检索召回。
- Tuff 2.5.5 本地开源模型运行时：方向已锁定为“不强依赖 Ollama，优先内置 GGUF / llama.cpp runtime”；Ollama 仅作为可选兼容后端，模型权重按需下载到用户数据目录，不进入应用安装包。
- Tuff 2.5.8 ASR Provider Runtime：方向已锁定为本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto` 策略；TTS 不进入该版本 Stable。
- App Data Plugins 与 Everything 收口：新增 Roadmap、Raycast/uTools 常用能力差距矩阵与 Indexing Runtime V1 统一搜索源计划，Calculator 显式入口、`touch-snippets` date/time/uuid/clipboard 首批 placeholders、`touch-emoji-symbols` 首版 emoji/symbol 搜索复制已落地；Browser Data 已有 source-level diagnostics 与书签 URL 打开 `network.internet` gate，后续聚焦统一 source health、历史扫描、写索引、disable/clear/rebuild UI、Everything/App Launcher evidence、Quicklinks、Context Actions，以及 Windows Everything SDK/CLI 策略、路径授权过滤与真机 evidence；Nexus SDK 插件开发任务流文档已落地，TuffEx 场景化 demo、基础组件与 per-component docs 首批覆盖已完成，后续继续深化真实使用场景；不包含更新系统 Nexus Hard-Cut。
- Nexus Provider Registry / Scene 编排：已具备 secure store、Scene run、Dashboard run、AI mirror、health/usage ledger、Provider capability adapter readiness 与最小策略路由；Provider 列表会标出声明能力是否有可执行 Scene adapter，后续补旧 AI provider 表退场与高级策略。
- Nexus docs render/SEO：docs catch-all 当前覆盖 title/description、OG/Twitter、canonical、localized alternate、robots 与 TechArticle JSON-LD；prerender evidence 已钉住 localized docs navigation anchors 和稳定 docs API。后续只剩生产/preview 抓取或 visual smoke 条件恢复，不把 unprefixed `/docs` 静态输出作为目标。
- Nexus Data Governance / Analytics：治理事件/config、`/api/dashboard/governance/analytics`、Data Governance cockpit、访问/搜索/signup/plugin analytics、上传 retry/problem attempts、通知健康/channel-test/delivery evidence、存储策略/告警、local/memory storage smoke evidence、Provider usage/quota、operations summary、secure credential reference 与 object storage executor 已形成当前基线；direct invoke quota 与 Provider Registry quota admin 已并入同一治理口径；2026-05-25 已补 admin hydration / locale reconciliation / i18n 字典稳定化，并用本地 Wrangler Pages runtime + Miniflare D1 seeded admin 取得认证 Data Governance cockpit 浏览器证据。Storage sizing、smoke 与告警响应见 `04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md`，Notification channel/live-send 证据流程见 `04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md`，详细历史与文件级变更以 `01-project/CHANGES.md` 为准。
- Nexus Data Governance 当前缺口：仍需生产/preview 认证 operator evidence、真实凭据/live send、直接 SMTP socket 或托管 relay、Web Push 生产 VAPID/relay、R2/S3/OSS live storage、生产 D1 migration/backfill、真实 provider quota fail-closed 与更深运营大屏。
- Native transport V1：补 macOS/Windows/Linux 真机 smoke 与打包依赖验证。
- AttachUIView、Multi Attach View、Widget Sandbox、Flow Transfer、DivisionBox 等进入长期债务池。

## 高价值专题入口

- [Legacy/兼容/结构治理统一实施 PRD](./02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md)
- [Tuff 2.5.0 AI 桌面入口收口 Plan PRD](./03-features/ai-2.5.0-plan-prd.md)
- [Tuff 2.5.3 本地知识检索 PRD](./03-features/ai-2.5.3-local-knowledge-retrieval-prd.md)
- [Tuff 2.5.4 ContextHygiene 与自动记忆治理 PRD](./03-features/ai-2.5.4-context-hygiene-memory-prd.md)
- [Tuff 2.5.5 本地开源模型运行时 PRD](./03-features/ai-2.5.5-local-model-runtime-prd.md)
- [Tuff 2.5.8 ASR Provider Runtime PRD](./03-features/ai-2.5.8-asr-provider-runtime-prd.md)
- [CloudShare 插件内容包发布 PRD](./03-features/cloudshare-plugin-content-prd.md)
- [App Data Plugins 与 Everything 收口 Roadmap](./03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md)
- [Indexing Runtime V1 统一搜索源计划](./03-features/search/INDEXING-RUNTIME-V1-PLAN.md)
- [Raycast / uTools 常用能力差距矩阵](./03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md)
- [Raycast / Alfred / uTools 竞品分析执行路线](./03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md)
- [2.4.11 当前收口目标与执行顺序](./04-implementation/ActiveGoalClosure-2026-05-23.md)
- [Active goal / branch cleanup snapshot](./04-implementation/ActiveGoalBranchCleanup-2026-05-23.md)
- [Nexus Provider 聚合与 Scene 编排 PRD](./02-architecture/nexus-provider-scene-aggregation-prd.md)
- [Nexus Data Governance 当前进度快照](./01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md)
- [Nexus Storage Governance Runbook](./04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md)
- [Nexus Notification Governance Runbook](./04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md)
- [Nexus Intelligence Provider 旧表退场实施计划](./04-implementation/NexusIntelligenceProviderRetirement-2026-05-16.md)
- [Intelligence 能力路由与 Provider 抽象](./02-architecture/intelligence-power-generic-api-prd.md)
- [跨平台兼容与占位实现深度复核报告](./report/cross-platform-compat-placeholder-deep-review-2026-05-13.md)
- [跨平台兼容与占位实现跟进报告](./report/cross-platform-compat-placeholder-followup-2026-05-14.md)
- [跨平台兼容、占位实现与治理口径总结](./report/cross-platform-compat-placeholder-summary-2026-05-15.md)
- [跨平台兼容、占位实现与架构健壮性深度审计](./report/cross-platform-compat-placeholder-deep-audit-2026-05-16.md)
- [跨平台兼容、占位实现与架构健壮性增量审计](./report/cross-platform-compat-placeholder-incremental-audit-2026-05-19.md)
- [跨平台兼容、占位实现与架构健壮性自动化审计](./report/cross-platform-compat-placeholder-automation-audit-2026-05-20.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-25.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-29.md)
- [UI/兼容/占位与架构健壮性后续复核](./report/cross-platform-compat-placeholder-ui-architecture-post-slice-review-2026-05-29.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性自动化增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-30.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-31.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-01.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-02.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-03.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-04.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-06.md)
- [跨平台兼容、占位实现、UI 适配与架构健壮性增量审计](./report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-07.md)
- [CoreApp 性能基线与优化执行计划](./04-implementation/performance/CoreAppPerformanceBaseline-2026-05-28.md)
- [CoreApp 启动异步化与首屏卡顿分析](./report/coreapp-startup-async-blocking-analysis-2026-05-13.md)
- [Nexus 设备授权风控实施方案](./04-implementation/NexusDeviceAuthRiskControl-260316.md)
- [v2.4.7 发版收口清单（historical）](./01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md)

## 文档治理规则

- 入口文档只保留当前事实、下一动作与高价值导航；历史细节进入 `CHANGES` 或 archive。
- 行为/接口/架构改动至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同时同步 Roadmap 与 Quality Baseline。
- `TODO.md` 只承载 2 周主清单；长期事项进入 `TODO-BACKLOG-LONG-TERM.md`。
- `CHANGES.md` 只保留近 30 天；完整压缩前快照见 `01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`。
