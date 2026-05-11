# Tuff 项目待办事项

> 从 PRD 文档提炼的执行清单（压缩版）
> 更新时间: 2026-05-11

---

## 🧭 单一口径矩阵（2.4.10 -> 2.4.11）

| 主题 | 当前事实 | 下一动作 | 强制同步文档 |
| --- | --- | --- | --- |
| 版本主线 | 当前工作区基线为 `2.4.10-beta.18` | `2.4.10` 优先解决 Windows App 索引与基础 legacy/compat；剩余未闭环项进入 `2.4.11` 必解清单 | `TODO` / `README` / `INDEX` / `CHANGES` |
| 2.4.10 Windows 发版 gate | 功能实现与本地 verifier 已进入收口态；缺口集中在 Windows 真机 evidence、性能采样与 Release Evidence 写入 | 在 Windows 真机补齐 acceptance manifest 强门禁、常见 App 启动、复制 app path、本地启动区索引、Everything target probe、自动安装更新、DivisionBox detached widget、分时推荐、search trace `200` 样本、clipboard stress `120000ms` 压测，并写入 Nexus Release Evidence；任一项缺失均阻塞当前版本发版 | `TODO` / `README` / `INDEX` / `CHANGES` / `Quality Baseline` |
| Windows App 索引 | Start Menu、UWP、registry uninstall 与 `launchArgs/workingDirectory` 已有回归覆盖，但仍缺真实 Windows 设备体验证据 | `2.4.10` 完成微信/Codex/Apple Music 等真实应用搜索与启动验证，并记录失败证据 | `TODO` / `README` / `INDEX` / `CHANGES` |
| Legacy/兼容/结构治理 | 已锁定统一实施 PRD（五工作包并行），清册退场目标统一前移到 `2.4.11` | 清册中的 `2.4.11` 项必须关闭或显式降权，不再新增 legacy 分支/raw channel/旧 storage protocol/旧 SDK bypass | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| CoreApp 平台适配 | `2.4.11` 前 Windows/macOS 为 release-blocking；Linux 保留 documented best-effort | Windows/macOS 完成阻塞级人工回归；Linux 仅记录 `xdotool` / desktop environment 限制与非阻塞 smoke | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| Native transport / 截图 | Rust/xcap screenshot addon 已作为首个能力落地；`NativeEvents` 已扩展为 `capabilities`、`screenshot`、`file-index`、`file`、`media` 五域，默认以 `tfile`/metadata 传输大资源；CoreApp `NativeCapabilitiesModule` 已桥接 fileProvider/Everything status、文件 stat/open/reveal/tfile、图片媒体 metadata/thumbnail；插件侧强制 `window.capture` / `fs.index` / `fs.read` / `media.read` 权限 | 补 macOS 屏幕录制授权、Windows 多屏、Linux X11/Wayland best-effort 真机 smoke；后续 OCR/前台窗口/Clipboard 是否收敛到 `native:*:*` 仍需按能力成熟度分批决策 | `TODO` / `README` / `CHANGES` |
| 跨平台/假实现审计 | 2026-05-10 已新增独立报告，确认 CoreApp 平台能力合同方向正确；生产 raw send 直连未见新增命中；2026-05-11 当前三段 retained raw event candidate 已清零，retained raw definition 按测试口径冻结为 `<=264` | `2.4.11` 前继续关闭 P0 假值成功路径，拆分 retained non-conforming event 保留理由，并推进 SRP 拆分 | `report` / `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| 架构治理切片 | Transport guard 已拆出 raw send / retained raw definition / typed candidate 指标；Pilot stat 假值与 mock 支付默认成功已收口；touch-image 历史已迁到 plugin storage SDK；`system:permission:*` / `omni-panel:feature:*` 已无损迁到 typed builder；`clipboard.ts` capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline 已迁出并降到 `1143` 行、清退 size exception；`recommendation-engine.ts` 已拆出纯 utility 并低于 exception cap；`search-core.ts` 已拆出纯 helper 并低于 exception cap；`app-provider.ts` 已拆出 path helper 与 source scanner facade 并降到 `3305` 行、growth exception cap 收紧到 `3306`；`deepagent-engine.ts` 已拆出 input builders 并降到 `1791` 行、growth exception cap 收紧到 `1792`；`update-system.ts` 已拆出 update asset utility 并低于 baseline；`omni-panel/index.ts` 已拆出 builtin definitions 并低于 exception cap；`sdk-compat.ts` 与 Pilot `pilot-compat-*` 已完成物理命名 hard-cut；Tuffex `TxFlipOverlay.vue` 已拆出 stack helper并清退 size exception；Nexus Provider Registry 页面/API 测试、CoreApp Windows acceptance verifier/test、AppProvider test harness、`intelligence-uikit` playground、Nexus `useSignIn.ts`、docs assistant API、Intelligence Lab tools、telemetry sanitizer 与 locale legal shard 已完成 SRP 拆分并退出 grown list，CoreApp 当前不在 grown list，`newOversizedFiles=0`，`grownOversizedFiles=0`，`cleanupCandidates=0`；registry 当前 `36` 条、`compat-file=5`；重构期 guard 已分层，lint 不再串全量架构债务，`size:guard:strict` 保留 release 红线 | 下一步转入剩余业务闭环与 Windows 真机 evidence，不再有新增/增长超长文件阻塞 | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| 2.5.0 AI 板块 | Plan PRD 已锁定为“桌面 AI 入口收口版本”，CoreBox AI Ask 最小 Stable 切片已接入 `text.chat` 与剪贴板图片 `vision.ocr -> text.chat`，CoreBox / OmniPanel 是主入口，Workflow 是主要执行载体，Pilot 是增强能力来源，Nexus Provider/Scene 作为后续架构约束 | 继续拆分 OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue、Desktop Context Capsule 与 3 个 P0 模板；不得扩大到全量多模态或 Scene runtime 编排 | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| Nexus Provider Registry | `authRef` 已接 D1 密文 secure store，Dashboard 可绑定腾讯云 `secret_pair`，`providers/:id/check` 可执行腾讯云机器翻译 `text.translate` live check，Provider capability 已支持独立 create/update/delete API，Provider 编辑面板新增/更新/删除 capability 已走独立 API 而非整体替换，Scene 卡片可 dry-run/execute 当前绑定并可深编辑 Scene policy 与 binding constraints，Dashboard Admin Provider Registry 加载时已可幂等 seed 系统级 `custom-local-overlay` provider、`corebox.screenshot.translate` Scene 与缺失的 system binding；CoreApp OmniPanel 划词翻译、CoreBox 剪贴板图片 direct 截图翻译及置顶窗口、CoreBox 汇率预览以及 `/api/exchange/latest` / `/api/exchange/convert` 已接普通登录态 Scene runtime API；汇率 `fx.rate.latest/fx.convert` 已有 Scene adapter；Intelligence provider 创建/更新/删除已同步维护 Provider Registry 镜像，能力归一为 `chat.completion` / `text.summarize` / `vision.ocr`，API key 只写 `provider_secure_store`，dashboard list/sync/model list/probe/admin chat/docs assistant/lab runtime 已经由 bridge 合并读取旧表与 registry-only 镜像，Provider Registry check 已可对 AI mirror 执行 `chat.completion` / `vision.ocr` 探活并写入 health 历史；OpenAI-compatible AI mirror 已有默认 `vision.ocr` adapter；composed capability 链式编排已支持 `vision.ocr -> text.translate -> overlay.render` 输出传递，置顶窗口可消费本地 `overlay.render` 客户端 overlay payload；Scene run 已写入 `provider_usage_ledger` 安全元数据并可在 Dashboard Usage 视图查询；Provider check 已写入 `provider_health_checks` 并可在 Dashboard Health 视图查询 latency/error/degraded reason；Scene strategy 已最小参与路由，覆盖 `priority/manual`、`least_cost`、`lowest_latency` 与 `balanced` | 补旧 `intelligence_providers` 表退场方案、user-scope AI mirror OCR 自动绑定策略，以及 success rate、配额、动态 pricingRef 成本估算等高级策略；生产必须配置 `PROVIDER_REGISTRY_SECURE_STORE_KEY` | `TODO` / `README` / `CHANGES` / Provider Scene PRD |
| 2.4.8 Gate | OmniPanel 稳定版 MVP 已完成（historical） | 保留历史验收证据，不再作为当前开发主线 | `TODO` / `README` / `INDEX` / `CHANGES` |
| v2.4.7 Gate | A/B/C/D/E 全部完成（D/E historical） | 保留 run/manifest/sha256 证据链 | `TODO` / `README` / `Roadmap` / `Release Checklist` / `Quality Baseline` / `INDEX` |
| Pilot Runtime | Node Server + Postgres/Redis + JWT Cookie 主路径；首页默认 DeepAgent，legacy `$completion` 已收口为唯一前端主消费链 | 继续补齐 SSE 反向代理部署烟测与矩阵回归 | `TODO` / `README` / `Roadmap` / `Quality Baseline` / `INDEX` |

---

## 📚 文档盘点锚点（2026-03-17）

- 全仓 Markdown：`396`；`docs`：`146`；`docs/plan-prd`：`110`。
- 子域分布：`03-features 32`、`docs 20`、`04-implementation 17`、`01-project 12`、`05-archive 11`、`02-architecture 8`、`06-ecosystem 4`。
- 历史盘点锚点：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`；当前执行路线以本文件与 `CHANGES` 为准。

---

## 🔧 当前执行清单（2 周）

### 剩余工作区提交拆分清单（2026-05-11）

> 目标：在大量并行改动中保持提交粒度清晰；每批提交前必须先跑对应 targeted tests，避免把仍在进行中的文件混入已完成批次。

#### 已提交批次

- [x] `feat(core): add corebox image translation scene flow`
  - 已验证：`scene-client.test.ts`、`image-translate.test.ts`、`image-translate-pin-window.test.ts`。
- [x] `feat(core): support update auto installer handoff`
  - 已验证：`update-system.test.ts`、`update-action-controller.test.ts`、`update-diagnostic-evidence.test.ts`。
- [x] `perf(core): shutdown idle search workers`
  - 已验证：scan/index/reconcile/icon/thumbnail/search-index worker idle shutdown targeted tests。
- [x] `fix(core): tune corebox recommendation ranking`
  - 已验证：recommendation engine、tuff sorter、search trace stats targeted tests。
- [x] `feat(core): add screenshot system action`
  - 已验证：`system-actions-provider.test.ts`。

#### 可优先提交（验证后）

- [x] Clipboard module split：
  - 范围：`apps/core-app/src/main/modules/clipboard.ts`、`apps/core-app/src/main/modules/clipboard/clipboard-autopaste-automation*`、`clipboard-capture-freshness*`、`clipboard-history-persistence*`、`clipboard-image-persistence*`、`clipboard-transport-handlers*`、`clipboard-polling-policy*`、`clipboard-native-watcher*`、`clipboard-meta-persistence*`、`clipboard-stage-b-enrichment*`、`clipboard-capture-pipeline*`、`clipboard-request-normalizer.ts`。
  - 结果：`clipboard.ts` 已降到 `1143` 行并清退 size exception；外部事件名、payload、action result 与 DB schema 保持兼容。
  - 已验证：Clipboard 定向测试 `11 files / 37 tests`、CoreApp node typecheck、定向 ESLint、`size:guard --changed` 与 `size:guard --report`。
- [ ] Nexus Intelligence provider dot-route hard-cut：
  - 范围：`apps/nexus/server/api/dashboard/intelligence/providers/**`、`intelligence-route-compat` middleware 删除、`migrate.post.ts` 与相关测试。
  - 下一步：先跑 intelligence provider/migration targeted tests，再与 Provider Registry 已提交批次保持边界清晰。
- [ ] SDK hard-cut / plugin legacy channel：
  - 范围：`apps/core-app/src/main/modules/plugin/*`、`sdkapi-hard-cut-gate.ts`、`packages/utils/plugin/index.ts`、`plugins/clipboard-history` raw channel 脚本、`scripts/legacy-boundary-allowlist.json`。
  - 下一步：跑 plugin-loader / sdkapi / legacy guard / compat registry 后再提交；这是架构性批次，不要混入 UI 或 docs 迁移。
- [ ] Guard/size/lint 分层与脚本：
  - 范围：root `package.json`、`scripts/check-large-file-boundaries.mjs`、`scripts/run-eslint-changed.mjs`、size/legacy allowlist。
  - 下一步：确认 `pnpm size:guard:changed`、`pnpm compat:registry:guard`、`pnpm legacy:guard` 的期望口径，再独立提交。
- [ ] Tuffex FlipOverlay SRP：
  - 范围：`TxFlipOverlay.vue`、`flip-overlay-stack.ts`、size allowlist/registry 清理。
  - 下一步：跑 tuffex 相关测试或最小组件测试后提交。

#### 需先修复或拆分

- [ ] `packages/intelligence-uikit` 新包：
  - 范围：`packages/intelligence-uikit/**`、`pnpm-lock.yaml` 中对应 importer、必要 root/package 配置。
  - 下一步：先跑该包 exports/components/pilot mapping tests；`pnpm-lock.yaml` 不能混入其它功能批次。
- [ ] `docs/engineering` 归档迁移：
  - 范围：根目录 `codereview/`、`issues/`、`plan/`、`reports/` 删除与 `docs/engineering/**` 新增、`docs/INDEX.md` / `docs/engineering/todo.md` / `docs/engineering/ARCHIVE.md` 同步。
  - 下一步：需要确认这是预期目录迁移；提交前检查路径引用不再指向旧根目录。

#### 需进一步归类确认

- [ ] Nexus request/auth/UI 小改：
  - 范围：`apps/nexus/app/components/**`、`pages/**`、`composables/useCurrentUserApi.ts`、`useSignIn.ts`、OAuth/watermark/docs feedback 等多处小改。
  - 下一步：按“request util 迁移”“页面调用点更新”“auth/stepup 行为”“docs feedback/watermark”再拆，不建议整包提交。

### CoreApp 兼容治理（当前进行中）

- [x] P0 Runtime Accessor / Sync IPC / Active Legacy Bridge hard-cut 主体完成。
- [x] P1 secure-store dedupe 收口到 `src/main/utils/secure-store.ts`。
- [x] P1 renderer update runtime 调用方迁移到 update SDK 薄运行时层，runtime 页面不再依赖 `useApplicationUpgrade`。
- [x] P2 fake prompt / DivisionBox settings 假入口清理完成。
- [x] P2 production `src` 下 demo/test/doc 文件物理删除，并清理 `components.d.ts` 悬空声明。
- [x] Renderer storage bootstrap warning 收口：
  - CoreApp renderer startup 改为 typed `initializeRendererStorage(transport)` 单路径，不再传入 retired storage channel 或触发 Vue setup 外 `inject()` warning。
  - Main storage 启动期预热 `StorageList.ACCOUNT`，renderer account hydration 使用 non-persist analyze，避免冷启动读取后立即回写同一快照。
- [x] CoreApp compatibility 验收阻塞解除：
  - `pnpm -C "apps/core-app" run typecheck` 已通过。
  - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard.transport.test.ts" "src/main/modules/omni-panel/index.test.ts" "src/main/channel/common.test.ts"` 已通过（`3 files / 17 tests`）。
  - `rg` 回归扫描确认 runtime 口径仅保留 bootstrap `genTouchApp()`，`sendSync(` / `resolveRuntimeChannel(` / `legacy-toggle` / placeholder demo 命中已清零。
- [x] Windows Everything 搜索收口：
  - Everything provider 支持搜索取消、CLI CSV 稳健解析、多词查询透传、SDK 目录结果元数据保留。
  - SearchCore 明确 `@everything` / `@file` 路由语义，并修复同文本不同输入复用缓存的问题。
  - Everything 搜索结果图标预热已补轻量背压：app task 活跃时跳过可选提取，icon worker 预热并发限制为 4，等待空闲最长 250ms，避免快速输入时堆积后台 worker。
  - FileProvider worker 状态快照已补 1 秒 TTL 与 in-flight 去重，设置页/仪表盘短时间重复或并发刷新不会重复向 scan/index/reconcile/icon/thumbnail/search-index worker 拉取 metrics。
  - FileProvider 任务型 worker 已补空闲回收：scan/index/reconcile/icon/thumbnail worker 在任务和 metrics 清空后延迟 60 秒终止，下次任务按需重启；`SearchIndexWorkerClient` 也会在空闲后退出，但保留 `dbPath` 并在下一次写入前自动重新 init，维持 single-writer 写入语义；scan/index/reconcile/icon/thumbnail/search-index 的 `getStatus()` metrics pending 窗口已补回归，避免诊断采样与 idle shutdown 互相抢占。
  - Settings Everything 页新增 `everything-diagnostic-evidence` 复制/保存入口，记录 backend、health、fallbackChain、backendAttemptErrors、errorCode 与 lastBackendError；`everything:diagnostic:verify` 可离线复核 ready/enabled/available/backend/health/version/esPath/fallbackChain/caseId 门禁，并校验 `verdict` / suggested fields 与 `status` 一致，且 `hasBackendAttemptErrors` 必须与实际 backendAttemptErrors 对齐，backendAttemptErrors 必须来自 fallback chain 且错误文本非空，供 Windows 真机回归补证使用；Everything 目标查询命中由 Windows capability evidence target probe 归档，`--requireEverythingTargets` 还会要求基础 Everything 查询返回结果、目标 probe 命中并至少有一条样本文本包含目标关键词。
  - Windows App 索引补齐 ClickOnce `.appref-ms` 入口：Start Menu 扫描、实时变更、复制路径加入应用索引与执行 `addAppByPath()` 均走 app 索引链路。
  - 已补 targeted regression：Everything provider 与 SearchCore baseline。
- [x] 搜索索引服务性能治理 V1：
  - FileProvider 明确拆为平台原生快速候选层与自建索引增强层；macOS 新增 Spotlight/mdfind fast provider，Linux 以 locate/Tracker/Baloo 探测接入，Windows 保持 Everything。
  - CoreBox 首帧搜索不等待 usage/pinned/completion/semantic；后处理通过 enrichment update 异步推送。
  - macOS fresh app scan 不再跑 `mdls` 或生成 base64 图标，`mdls` 进入 maintenance lane 后台修正；搜索 payload 图标/缩略图改为 `tfile://`/路径懒加载。
- [x] Clipboard 插件预览链路收口：
  - Clipboard SDK `history.onDidChange()` 对旧版 plugin transport stream 同步抛错做 non-fatal 降级。
  - clipboard-history 详情页优先解析 `meta.image_original_url` / `getHistoryImageUrl(id)`，原图不可用时显式展示缩略图降级状态。
- [x] Clipboard 自动粘贴失败诊断收口：
  - `copyAndPaste` / `applyToActiveApp` 失败结果保留 message/code，插件 UI 不再只显示泛化失败。
  - 主进程自动粘贴失败日志只记录安全元数据；macOS System Events 权限错误映射为可读授权提示。
- [x] Clipboard AutoPaste freshness 机制重构：
  - AutoPaste 从历史 `createdAt/timestamp` 推断切换为主进程捕获事件资格：`native-watch` / `background-poll` / `visible-poll` 才可授予 `autoPasteEligible`。
  - `COREBOX_WINDOW_SHOWN` 补扫统一标记为 `corebox-show-baseline`，只更新历史/标签/搜索上下文，不再把旧剪贴板当作 5s 内新复制自动填入。
  - Transport 扩展 `captureSource / observedAt / freshnessBaseAt / autoPasteEligible` 可选字段，旧插件只读历史字段不受影响。
- [x] Widget 编译链路生产稳定化：
  - `.vue/.ts/.tsx/.js/.cjs` widget processor 统一走懒加载 `transformWidgetSource()`，生产包显式解析 `resources/node_modules/@esbuild/*` / `app.asar.unpacked` 中的真实 esbuild 二进制。
  - Runtime module manifest 把 `esbuild` 标为 resources 依赖，并声明 macOS/Linux/Windows x64/arm64 的 `@esbuild/*` 平台包；打包后缺失或不可执行二进制直接 fail-fast。
  - `WidgetManager` 保持已编译缓存优先，新增 `widgetId + hash` 短期失败缓存、结构化 issue meta 与 `plugin:widget:failed` 广播，CoreBox `WidgetFrame` 可见展示加载中、未注册、编译失败、渲染失败状态。
- [x] Intelligence workflow / app-index 本地回归补强：
  - `workflow` shared SDK 与主进程 handler 已接通，`intelligence-module -> workflow service -> deepagent orchestration` 闭环可用；内置剪贴板整理模板改为 prompt step，避免不存在的 `deepagent.workflow` agent id 让默认模板即刻失败。
  - `tuff-intelligence-runtime` 的 tool trace / approval 现在会携带 `toolSource / approvalContext / contextSources`，方便 workflow 与 MCP 工具审批回放。
  - 定向回归已补：`common.test`、`intelligence-sdk.test`、`intelligence-deepagent-orchestration.test`、`transport-domain-sdks.test`、`search-processing-service.test`。
- [x] Workflow Editor 默认 Agent ID hard-cut：
  - 新建 agent step、保存空 `agentId` 兜底与页面 placeholder 统一从历史 `deepagent.workflow` 切到真实已注册 `builtin.workflow-agent`。
  - 已补 `useWorkflowEditor.test.ts`，固定默认步骤与保存 payload 不再回退旧 ID。
  - 保存期不再对被用户清空的 agent step 静默回填默认 agent；改为 `agent_required` 校验错误，与后端 workflow step hard-cut 保持一致。
- [x] Agent API typed transport hard-cut：
  - `AgentsEvents.api` 与 task push 事件从历史 raw 名称硬切到 `agents:api:*` / `agents:push:*`，主进程注册与 renderer SDK 共用 typed event 对象。
  - 已补 `transport-domain-sdks.test.ts` event name 断言，防止回退到 `agents:list-all` / `agents:task-started` 等旧 raw 名称。
- [x] Native screenshot V1 与 native transport 首切：
  - `packages/tuff-native` 新增 Rust/NAPI-RS `xcap` 截图 addon，输出 PNG buffer，并通过 `@talex-touch/tuff-native/screenshot` 暴露 support/list/capture contract。
  - `packages/utils` 新增 `NativeEvents.screenshot` typed 事件与 `createNativeSdk()`，事件名固定为 `native:screenshot:get-support`、`native:screenshot:list-displays`、`native:screenshot:capture`。
  - CoreApp 新增 `NativeCapabilitiesModule` / `NativeScreenshotService`，统一处理 Electron 全局 DIP 坐标、native physical crop、`native/screenshots` 短期临时文件、可选剪贴板写入与插件 `window.capture` 权限。
  - CoreBox SystemActionsProvider 新增“截图并复制”内置动作，捕获当前光标所在显示器并写入剪贴板。
- [x] Native transport V1 协议扩展：
  - `NativeEvents` 扩展 `native:capabilities:*`、`native:file-index:*`、`native:file:*`、`native:media:*`，保留 screenshot 事件名不变，并在 `createNativeSdk()` 下暴露 `capabilities/fileIndex/file/media` 子 SDK。
  - 新增统一 `NativeCapabilityStatus` / `NativeResourceRef` / `NativeOperationResult` 类型；截图、缩略图、媒体封面等大资源默认走短期 `tfile://` 引用，`data-url` 仅作为显式小范围输出。
  - CoreApp `NativeCapabilitiesModule` 复用现有 `fileProvider` / `everythingProvider` / `tempFileService` / thumbnail worker；V1 不重写文件索引、不迁移 OCR/Clipboard、不做媒体转码。
  - 插件权限映射补齐 `native:screenshot:* -> window.capture`、`native:file-index:* -> fs.index`、`native:file:* -> fs.read`、`native:media:* -> media.read`。
- [x] Workflow SDK typed event 收口：
  - `workflowList/get/save/delete/run/history` 保持 `intelligence:workflow:*` 对外事件名，但内部定义从 `defineRawEvent` 切到 typed builder。
  - 已补 `transport-domain-sdks.test.ts` 的 `namespace/module/action` 断言，固定 Workflow SDK 不再依赖 raw event 构造。
- [x] Agent session/tool SDK typed event 收口：
  - `agentSession*`、`agentPlan/Execute/Reflect` 与 `agentTool*` 保持 `intelligence:agent:*` 对外事件名，但内部定义从 `defineRawEvent` 切到 typed builder。
  - 已补 `agentSessionSubscribe` 与 `agentToolApprove` 的 typed event metadata 断言，继续压缩 agent 链路 raw event 依赖。
- [x] Intelligence main handler typed event 收口：
  - 主进程 `intelligence:agent:*` / `intelligence:workflow:*` handler 注册事件保持对外名称不变，内部构造从 `defineRawEvent` 切到 typed builder。
  - 与 renderer/shared SDK 事件对象语义对齐，避免 main/renderer 两侧重新分叉成 raw event 定义。
- [x] Intelligence API event hard-cut：
  - `invoke/chatLangChain/testProvider/testCapability/fetchModels/audit/stats/quota/reloadConfig` 从旧两段 `intelligence:*` raw event 硬切为 `intelligence:api:*` typed event。
  - CoreApp main handler、旁路 service、`packages/utils` SDK 与 `packages/tuff-intelligence` SDK 已共用同一命名口径，运行代码中旧两段 API 字符串清零。
  - `@talex-touch/tuff-intelligence` 自有 transport builder 不再导出 `defineRawEvent`，builder 测试也不再证明 `intelligence:invoke` 两段协议可用；Nexus Intelligence 事件清单同步改为 `intelligence:api:*` typed SDK 口径。
  - `createIntelligenceClient()` 与插件 `intelligence` SDK 不再暴露 deprecated `chat` alias，聊天能力只保留 `chatLangChain()` / `invoke('text.chat', ...)` 主路径。
- [x] Tuff Intelligence trace replay hard-cut：
  - `tuff-intelligence-runtime` 不再为缺失 `seq` 的 pre-v3 trace 自动合成 replay 序号，`queryTrace(fromSeq)` 只返回具备真实 `seq` 的 v3 trace event。
  - 新增 trace 事件继续基于当前最大真实 `seq` 单调递增；已移除对应 legacy registry / allowlist 项，防止旧 trace 回填重新进入 agent replay 主链路。
- [x] Nexus SDK 官网入口 hard-cut：
  - 首页 SDK marquee 与全局功能搜索不再展示 `Channel SDK / useChannel()`，IPC 推荐入口只保留 `TuffTransport / useTuffTransport()`。
  - API 总索引 quick start 删除 `useChannel()` 初始化；独立 Channel 文档已改为 retired 迁移映射页，不再提供 `useChannel()` / `usePluginRendererChannel()` quick start 或可复制教程。
- [x] Nexus locale route hard-cut：
  - `app.vue` 移除 `/en/*`、`/zh/*` 旧语言前缀静默重写 watcher，官网路由不再自动把旧 locale prefix 改写为无前缀路径。
  - locale 初始化继续只接受 profile / cookie / browser / manual 来源，避免 route prefix 成为第二套语言来源。
- [x] Nexus app-auth sign-in-token hard-cut：
  - 桌面登录 token 签发主入口固定为 `/api/app-auth/sign-in-token`，签发逻辑抽到 `server/utils/appAuthToken.ts` 复用。
  - 旧 `/api/auth/sign-in-token` 不再转发签发逻辑，改为 `410 AUTH_SIGN_IN_TOKEN_RETIRED` 并返回替代路径。
  - 已补 `app-auth` 主入口签发/短期 token 拒绝测试与旧 auth 路径 410 测试。
- [x] Nexus API 文档 hard-cut 口径收敛：
  - `transport`、`transport-internals`、`channel` 与 `clipboard` 中“旧 API 仍可用 / legacy handler 仍保留 / 与旧 Channel 并行兼容”的公开推荐语已改为 retired / historical migration reference。
  - Clipboard 文档明确插件代码必须走 SDK / typed transport，历史 `clipboard:*` raw channel 名称仅保留为迁移审阅材料，不再作为受支持扩展面。
  - Transport 迁移示例已从“双轨渐进迁移”硬切为一次性替换到 typed TuffTransport，不再展示 `channel.send()` 与 `transport.send()` 并行示例。
- [x] Manifest permissions 旧数组格式 hard-cut：
  - `parseManifestPermissions()` 与插件 manifest 类型不再接受 `permissions: string[]` 并静默当作 required 权限，当前唯一支持结构为 `{ required, optional }`。
  - 已补 `permission-status.test.ts`，固定 pre-object permission arrays 被忽略，避免旧 manifest 形态绕过当前声明结构。
- [x] Analytics 启动指标旧事件 hard-cut：
  - `AppEvents.analytics.getCurrent/getHistory/getSummary/report`、settings SDK 同名包装与主进程 handler 下线，启动性能摘要统一进入 `analytics.getSnapshot` 的 `metrics.startup`。
  - 设置 About 页不再调用旧 summary 事件；`packages/utils/transport/events/app.ts` 对应 registry / allowlist 项已移除。
- [x] Workflow / Everything web typecheck 阻塞解除：
  - `useWorkflowEditor.test.ts` 保存 payload 断言显式收窄为 `WorkflowDefinition`，继续固定空 agent step 保存时回填 `builtin.workflow-agent`。
  - `setting-everything-state.test.ts` fixture 补齐当前 `EverythingStatusResponse.backendAttemptErrors` 契约，`typecheck:web` 恢复通过；Clipboard macOS 旧格式注释已改为中性 wording 并移除清册项。
- [x] Workflow Editor 混合 step 契约补强：
  - 从已有 workflow 映射回草稿时，缺失 `agentId` 的 agent step 统一显示当前 `builtin.workflow-agent`，与新建/保存路径一致。
  - 补齐 prompt + tool 混排保存测试，固定 prompt step 不回填 agent、tool step 保留 `toolId/toolSource/input`，避免多类型 workflow 被 agent 默认值污染。
- [x] Workflow Service step hard-cut：
  - `IntelligenceWorkflowService` 不再把未知 step kind 静默降级为 prompt；仅允许 `prompt/tool/agent`，非法 kind 保存/运行 inline workflow 时直接失败。
  - workflow/tool step 的 `toolSource` 仅允许 `builtin/mcp`，非 tool step 会清理 `toolId/toolSource`，避免脏兼容字段进入存储与执行链路。
  - tool/agent step 现在保存期强制校验 `toolId` / `agentId`，避免无效 workflow 进入数据库后才在执行期失败。
  - workflow run step 归一化同步拒绝未知 kind 与缺失 `toolId` 的 tool run step，避免恢复/审批/历史记录链路重新降级为 prompt。
  - DB hydrate 定义/运行记录读取路径复用同一 normalizer，历史脏行不会绕过保存期 hard-cut 重新进入 editor / run resume。
- [x] DivisionBox actor 测试清册噪声清理：
  - `ipc.actor.test.ts` 的旧 `pluginId` fixture 命名改为中性 `ignored-plugin-field`，保留“corebox actor 不从 pluginId 误推断插件”的行为断言。
  - 移除对应 legacy allowlist / compatibility registry 行，`legacy-keyword` 降至 `58 files / 172 hits`。
- [x] CoreApp retired 入口测试命名清理：
  - CommonChannel / Clipboard / OmniPanel / PluginLoader / Update channel 测试中用于断言旧入口已退役或 sdkapi 阻断的 `legacy` 命名改为 `retired` / `below-floor`。
  - 移除 5 条 stale legacy allowlist / compatibility registry 行，`legacy-keyword` 降至 `53 files / 167 hits`。
- [x] Pilot auth retired 入口测试命名清理：
  - `auth.test.ts` 中旧 header/cookie/bearer fixture 从 `legacy_*` 改为 `retired_*`，继续固定这些直传身份输入不会绕过设备访客身份。
  - 移除对应 stale registry 行，减少 legacy keyword 清册噪声。
- [x] Pilot workspace/replay fixture 命名清理：
  - Pilot workspace-only 组件注释从 legacy chat surface 改为 current chat surface，不再把当前首页主消费面描述成旧链路。
  - `pilot-stream-replay.test.ts` 与 `quota-conversation-snapshot.test.ts` 的样例 payload 从 `legacy` 改为 `retired`，断言语义不变。
  - 移除对应 5 条 stale registry 行，继续压缩 legacy keyword 清册噪声。
- [x] Pilot channel model sync fixture 命名清理：
  - `pilot-channel-model-sync.test.ts` 中预置模型样例从 `legacy-model` 改为 `retired-model`，继续固定“已有渠道模型保留 + 新发现模型追加”的同步契约。
  - 移除对应 stale registry 行，避免测试样例名继续占用 legacy keyword 清册。
- [x] Pilot system message fixture 命名清理：
  - `pilot-system-message-response.test.ts` 中 historical system row 场景从 legacy 命名改为 historical 命名，继续固定 trace projection 覆盖与无 trace 保留历史消息两条契约。
  - 移除对应 stale registry 行。
- [x] Pilot tool gateway fixture 命名清理：
  - `pilot-tool-gateway.test.ts` 中 unsupported adapter 与 provider-backed websearch 的非分支关键样例从 legacy 改为 retired 命名，继续固定失败分支与 gateway connector 调用契约。
  - `legacy-gateway` provider id 仍是生产分支 key，测试和 registry 保留该命中，等待后续实现层 hard-cut。
- [x] Pilot capability meta 测试命名清理：
  - `pilot-capability-meta.shared.test.ts` 中测试文案与无效 route combo 样例从 legacy 命名改为历史/retired 口径，继续固定显式 capabilities 优先于历史字段回填的契约。
  - 生产 `pilot-capability-meta.ts` 的历史字段回填仍登记为真实待 hard-cut 债务。
- [x] Pilot routing config 测试命名清理：
  - `pilot-admin-routing-config.capabilities.test.ts` 与 `pilot-admin-routing-config.test.ts` 的旧字段回填测试改为历史字段口径，样例值从 legacy 改为 historical。
  - 继续覆盖 `intentNanoModelId` / `intentRouteComboId` 等历史兼容字段的迁移行为；生产实现债务仍单独登记。
- [x] Pilot routing resolver intent 测试命名清理：
  - `pilot-routing-resolver.intent.test.ts` 中 scenePolicies 优先级与缺失回退测试改为 historical route 口径，继续固定当前路由选择行为。
  - 生产历史 route fallback 债务仍由 routing config/resolver 实现登记跟踪。
- [x] Pilot admin side nav 用户可见文案清理：
  - `AdminSideNav.vue` 中 `Legacy CMS 已下线` 改为 `历史 CMS 已下线`，避免后台 UI 继续暴露 legacy 口径。
  - 移除对应 stale registry 行。
- [x] Pilot workspace chat 注释口径清理：
  - `usePilotChatPage.ts` 顶部注释从 legacy `$completion` 改为 current `$completion`，避免把当前首页主消费链路误写为旧链路。
  - 文件内 `status_updated` / error 兼容分支仍是真实待 hard-cut 债务，registry 行保留并改为精准说明。
- [x] Pilot history meta 注释清理：
  - `history/index.ts` 中无效 meta 兜底注释从 legacy meta 改为 historical meta，运行时解析行为不变。
  - 移除对应 stale registry 行。
- [x] Pilot system message production 变量命名清理：
  - `pilot-system-message-response.ts` 中保留持久化可见 system message 的局部集合从 legacy 命名改为 persisted visible 命名，消息投影与合并行为不变。
  - 同步移除 `history/index.ts` 的 stale legacy allowlist 行，保持清册与上一轮清理结果一致。
- [x] Utils CoreBox DSL icon 注释口径清理：
  - `TuffMeta.icon` TSDoc 从 legacy icon identifier 改为当前 icon identifier，保留轻量 class name 透传语义与接口字段不变。
- [x] CoreApp/Nexus Vue I18n 清册说明校准：
  - `apps/core-app/src/renderer/src/modules/lang/i18n.ts` 与 `apps/nexus/app/i18n.config.ts` 的 `legacy: false` 均为 Vue I18n composition-mode 正式 API，不是项目兼容分支；registry 行已改为框架 API 例外说明。
- [x] CoreApp analytics 搜索文档口径清理：
  - `analytics/README.md` 与 `docs/analytics-data-prd.md` 的搜索性能接入说明从 legacy 搜索改为 current layered fast/deferred provider timing 口径，运行时代码不变。
- [x] Pilot datasource gateway 非分支 legacy 噪声清理：
  - `pilot-admin-datasource-config.ts` 注释与测试标题/样例域名/env key 改为 historical/retired 口径；`legacy-gateway` provider id 作为真实生产分支 key 保留。
  - allowlist maxCount 从 production `5 -> 2`、test `8 -> 2` 收紧，registry 行改为明确 branch-key 债务说明。
- [x] Pilot capability historical field 内部命名清理：
  - `resolvePilotCapabilities` / `resolvePilotModelCapabilities` / `normalizeCapabilitiesForm` 的内部参数从 legacy 命名改为 historicalFields，保留 `allowWebsearch` 等历史字段回填契约不变。
  - 移除 `pilot-admin-routing-config.ts`、`usePilotRoutingAdmin.ts`、`pilot-capability-meta.ts` 对应 legacy-keyword registry 行。
- [x] Pilot quota history payload 局部命名清理：
  - `quota-history-store.ts` 中 base64 历史 payload 迁移的局部变量从 legacy 改为 historicalPayload，JSON 迁移行为不变。
  - 移除对应 legacy-keyword allowlist / compatibility registry 行。
- [x] CoreApp download migration guide wording 清理：
  - `download/MIGRATION_GUIDE.md` 的用户可读说明从 Legacy download 改为 historical download，强调旧导入已移出运行时路径。
- [x] CoreApp plugin runtime repair 诊断命名清理：
  - `plugin-runtime-repair` 的旧 widget shared import drift 检测 code/test wording 从 legacy 改为 retired，仍继续扫描 `../shared/translation-shared.cjs` 漂移输入。
  - 移除 runtime repair 实现与测试对应 legacy-keyword allowlist / compatibility registry 行。
- [x] Packages test tsconfig 注释口径清理：
  - `packages/test/tsconfig.json` 的 TypeScript 模板注释从 legacy experimental decorators 改为 TypeScript experimental decorators，不改变编译配置。
- [x] Pilot channel removed adapter hard-cut：
  - `pilot-admin-channel-config.ts` 不再把旧 adapter 输入值静默归一为 `openai`；未知 adapter 会作为 invalid channel 被拒绝保存/加载，并在 rejected channels 中标记 `adapter`。
  - 移除对应 legacy allowlist / compatibility registry 行。
  - `legacy-keyword` 官方统计降至 `7 files / 10 hits`。
- [x] Pilot stream status event hard-cut：
  - `createTitleSseResponse()` 不再发送 `status_updated` 状态事件，标题流只输出 completion chunks + `[DONE]`。
  - `usePilotChatPage.ts` 删除 `status_updated` 与 `error + TOOL_APPROVAL_REQUIRED` 旧事件兼容分支，审批等待只走当前 `turn.approval_required` 事件。
  - 移除对应 legacy allowlist / compatibility registry 行。
  - `legacy-keyword` 官方统计降至 `6 files / 9 hits`。
- [x] Tuffex DataTable sorting accessibility baseline：
  - `TxDataTable` 的可排序表头补齐 `scope="col"`、`tabindex`、`aria-sort` 与 Enter/Space 键盘触发，鼠标与键盘排序共用同一当前排序状态。
  - 补充 DataTable 回归测试，固定可排序表头的键盘入口与 `aria-sort` 状态切换。
  - Nexus 双语组件文档与 Tuffex 组件文档同步记录排序交互契约。
- [x] Tuffex FlatSelect 契约补证：
  - `TxFlatSelect` 补齐 combobox/listbox/option ARIA 语义，触发器与面板状态通过 `aria-expanded` / `aria-hidden` 对齐。
  - 新增 `flat-select.test.ts` 固定 placeholder、选中 label、enabled/disabled 选择、键盘跳过 disabled item 与 ARIA 状态。
  - Nexus 双语 FlatSelect 文档同步记录交互契约。
- [x] Tuffex Rating readonly hard-cut 与契约补证：
  - `TxRating` 的 `readonly` 从“仅不发事件”硬切为 display-only，星级按钮禁用且不再提供交互入口。
  - 补齐 radiogroup/radio ARIA 状态，并新增 `rating.test.ts` 固定 click、半星精度、disabled/readonly 阻断与 text slot。
  - Nexus 双语 Rating 文档与 Tuffex docs 同步记录 readonly/display-only 与可访问性契约。
- [x] Tuffex Progress/ProgressBar 契约补证：
  - 新增 `progress-bar.test.ts` 固定 percentage clamp、ARIA `progressbar` 状态、不确定进度、complete 事件周期与 segments 归一化。
  - 新增 `progress.test.ts` 固定 `TuffProgress` 对 percentage/status/strokeWidth/format/showText/indeterminate 的当前 wrapper 透传契约。
  - Tuffex Progress 文档从“兼容封装”硬切为当前轻量入口描述，Nexus 双语 Progress 文档同步补齐交互契约。
- [x] Tuffex Alert icon 修复与契约补证：
  - `TxAlert` leading icon 改为真实使用共享 `TxIcon` 渲染器，关闭按钮图标改为内置 `close`，不再依赖不存在的动态组件名。
  - 新增 `alert.test.ts` 固定 type/title/message/icon、title/default slot、showIcon/closable 开关与 close 事件。
  - Nexus 双语 Alert 文档与 Tuffex docs 同步记录 `role="alert"`、`TxIcon` 与 close 交互契约。
- [x] Tuffex Badge 文档 hard-cut 与契约补证：
  - 新增 `badge.test.ts` 固定 value/variant、default slot 内容替换、dot 模式隐藏文本与 custom color CSS 变量。
  - Badge 文档从“包裹目标元素定位角标”硬切为当前内联 pill/dot 组件契约，避免公开不存在的定位能力。
  - Nexus 双语 Badge 文档同步记录 slot 替换内容、dot 隐藏文本的真实行为。
- [x] Tuffex StatusBadge 契约补证：
  - 新增 `status-badge.test.ts` 固定 text/size/explicit status、statusKey 映射、显式 status 优先级、OS icon/osOnly、自定义 icon 与 click 事件。
  - Nexus 双语 StatusBadge Lite API 补齐 `statusKey/icon/os/osOnly` 与 click 交互契约。
  - Tuffex StatusBadge 文档同步记录 statusKey 映射、平台图标与 `osOnly` 真实行为。
- [x] Tuffex Avatar/AvatarGroup 契约补证：
  - 新增 `avatar.test.ts` 固定 name initials、custom colors、image error fallback、slot/icon/name 优先级、custom size、clickable 事件与 AvatarGroup max/size/overlap。
  - Nexus 双语 Avatar 文档补齐 fallback 优先级、图片错误回退、自定义 size 类型与 AvatarGroup size/max 注入契约。
  - Tuffex Avatar docs 同步修正 size 类型，记录 AvatarGroup `+N` 行为。
- [x] Tuffex Tag 契约补证：
  - 新增 `tag.test.ts` 固定 label/icon/default size/style vars、default slot 替换、click/close 事件、close 不冒泡以及 disabled 阻断。
  - Nexus 双语 Tag Lite API 修正默认 `size='sm'`，补齐 `icon/background/border/closable/disabled`。
  - Tuffex Tag docs 同步记录 `role="status"`、slot 替换与 close/click 交互契约。
- [x] Tuffex Input clear hard-cut 与契约补证：
  - `TxInput` 清空控件改为可键盘聚焦的 button，并在 disabled/readonly 状态下同时隐藏入口与阻断 exposed `clear()`。
  - 新增 `input.test.ts` 固定 text/number/textarea attrs、clear、disabled/readonly guard 与 prefix/suffix slot 优先级。
  - Nexus 双语 Input 文档与 Tuffex docs 同步补齐 `number` emit、icon props、exposes、attrs 透传与 clear 交互契约。
- [x] Tuffex Pagination first/last hard-cut 与契约补证：
  - `TxPagination` 的 `showFirstLast` 从文档/类型占位补齐为真实首末页跳转按钮，边界页同步禁用首/上一页或下一页/末页。
  - 新增 `pagination.test.ts` 固定总页数计算、页码 emit、越界阻断、首末页控制、边界禁用与 info slot。
  - Nexus 双语 Pagination 文档与 Tuffex docs 同步补齐 `totalPages/prevIcon/nextIcon`、events、slot 与 ARIA 交互契约。
- [x] Tuffex Breadcrumb 当前页/禁用项 hard-cut 与契约补证：
  - `TxBreadcrumb` 最后一项固定为当前页非链接元素，即使传入 `href` 也只暴露 `aria-current="page"`；`disabled` 项同步非交互并带 `aria-disabled`。
  - 新增 `breadcrumb.test.ts` 固定导航语义、图标/分隔符、当前页非链接、无 href 点击事件与 disabled 阻断。
  - Nexus 双语 Breadcrumb 文档与 Tuffex docs 同步补齐 item contract、events、当前页与 disabled 交互契约。
- [x] Tuffex Collapse 键盘/ARIA 契约补证：
  - `TxCollapseItem` 标题补齐 `role="button"`、`tabindex`、`aria-expanded`、`aria-controls` 与 Enter/Space 键盘切换，disabled 面板同步 `aria-disabled` 并阻断键鼠切换。
  - 新增 `collapse.test.ts` 固定多选/手风琴 emit、键盘切换、disabled 阻断与内容区域关联。
  - Nexus 双语 Collapse 文档与 Tuffex docs 同步补齐 Collapse/Item props、events 与键盘可访问性契约。
- [x] Tuffex Steps 顺序索引与键盘契约补证：
  - `TxStep` 未传 `step` 时按子项顺序自动使用 `0` 起始索引，修复官网示例无 `step` 时无法识别 active/completed 的问题；最后一步不再渲染连接线。
  - `TxStep` 可点击头部补齐 `role="button"`、`tabindex`、`aria-current="step"` 与 Enter/Space 切换，disabled/clickable=false 会阻断交互。
  - 新增 `steps.test.ts` 固定顺序索引、显式 string step、首尾连接线、键鼠切换与禁用态；Nexus/Tuffex 文档同步补齐 Steps/Step 契约。
- [x] Tuffex Timeline active dot 与语义契约补证：
  - `TxTimeline` 补齐 `role="list"`，`TxTimelineItem` 补齐 `role="listitem"`，事件流具备基础列表语义。
  - 修复 `active` 只作用在 item class、未作用到 dot active class 的偏差，当前事件节点圆点现在会真实高亮。
  - 新增 `timeline.test.ts` 固定默认/横向布局、列表语义、title/time/slot/icon/color 渲染与 active item/dot 状态；Nexus/Tuffex 文档同步记录契约。
- [x] Tuffex Toast 可访问性与计时器契约补证：
  - `TxToastHost` 关闭按钮补齐 `aria-label="Dismiss notification"`，host 通知区域语义由测试固定。
  - `toast()` 自动关闭计时器从 `window.setTimeout` 硬切为 `globalThis.setTimeout`，避免非浏览器上下文直接崩溃。
  - 新增 `toast.test.ts` 固定 id 替换、自动关闭、持久 toast、dismiss/clear 与 Host 渲染/关闭按钮契约；Nexus/Tuffex 文档同步记录 `id/duration` 与可访问性行为。
- [x] Tuffex Icon colorful 来源与 builtin path 契约补证：
  - `TxIcon` 修复 `close/search/star` 内置 SVG path 损坏问题，并让 `icon.colorful=true` 与组件 `colorful` prop 一样保留 SVG 原色。
  - 新增 `icon.test.ts` 固定 name shorthand、builtin/class/emoji/empty/loading/error、fileProtocol 解析、SVG mask/colorful 与 `TxStatusIcon` 状态角标契约。
  - Nexus 双语 Icon 文档与 Tuffex docs 同步补齐 `urlResolver/svgFetcher`、`TxStatusIcon` 与 SVG colorful 渲染规则。
- [x] Tuffex Dialog ARIA id 与 TouchTip dialog 语义 hard-cut：
  - `TxBottomDialog` 的标题/描述 ARIA 关联从固定 id 改为实例级 id，避免多对话框时 `aria-labelledby/describedby` 冲突。
  - `TxTouchTip` 的 `role="dialog"` / `aria-modal` / label/description 关联移动到实际聚焦容器，外层只保留遮罩布局。
  - 新增 `dialog.test.ts` 固定 BottomDialog/TouchTip ARIA 关联、ESC 关闭、焦点恢复、按钮返回 true/false 的关闭契约；Nexus/Tuffex 文档同步修正“focus trap”为真实焦点行为。
- [x] Tuffex Drawer ARIA 与焦点恢复契约补证：
  - `TxDrawer` 补齐实例级 `aria-labelledby` 标题关联，打开时 nextTick 聚焦抽屉根节点，隐藏或卸载时恢复打开前焦点。
  - 新增 `drawer.test.ts` 固定 dialog 语义、方向/宽度/slot、open 事件与聚焦、关闭按钮/遮罩/Escape、关闭开关、焦点恢复与自定义 z-index。
  - Nexus 双语 Drawer 文档与 Tuffex docs 同步记录 ARIA、焦点恢复和关闭路径契约。
- [x] Tuffex Modal Escape/ARIA 与 wrapper 契约补证：
  - `TxModal` 补齐实例级标题 `aria-labelledby`、打开聚焦、隐藏/卸载焦点恢复与 Escape 关闭路径。
  - `TModal` wrapper 仅在存在 `header/footer` slot 时转发对应 slot，避免空 slot 覆盖 `TxModal` 的 title/footer 默认渲染。
  - 新增 `modal.test.ts` 固定 dialog 语义、标题关联、宽度/slot、焦点恢复、遮罩/Escape/关闭按钮关闭、custom header 与 TModal title fallback；Nexus/Tuffex 文档同步记录契约。
- [x] Tuffex Modal 官网兼容口径 hard-cut：
  - Nexus 双语 Modal 文档将 `TModal` 从 compatibility entry 改为基于 `TxModal` 的当前轻量入口，保留无 `header/footer` slot 时不覆盖默认 title/footer 的真实契约。
- [x] Tuffex ImageUploader disabled/remove 与 object URL 契约补证：
  - `TxImageUploader` 的 disabled 状态现在同时禁用移除按钮并阻断 remove 逻辑，避免禁用态仍可删除图片。
  - 新增 `image-uploader.test.ts` 固定 input attrs、现有预览、max 截断、disabled 添加/移除阻断、object URL 创建/释放、remove/change 事件。
  - Nexus 双语 ImageUploader 文档与 Tuffex docs 从拖拽上传口径硬切为当前点击选择器契约，并补齐 props/events/object URL 生命周期。
- [x] Tuffex ImageGallery 空态/索引与 Modal 预览契约补证：
  - `TxImageGallery` 缩略图和 Prev/Next 控件补齐可读 ARIA label，空列表不再打开 Modal 或触发 `open`。
  - `startIndex` 与 `items.length` 变化统一 clamp 到有效索引；列表清空时关闭当前预览，避免越界空预览。
  - 新增 `image-gallery.test.ts` 固定缩略图 alt/label、open payload、Modal title/viewer/count、边界导航、空列表与列表缩短行为；Nexus/Tuffex 文档同步移除未实现的键盘/手势承诺。
- [x] Tuffex BaseAnchor surfaceMotionAdaptation hard-cut 与契约补证：
  - `TxBaseAnchor` 的 `surfaceMotionAdaptation` 从类型/文档占位补齐为真实三态策略：`auto` 使用 Anchor 内部运动态，`manual` 读取 `panelCard.surfaceMoving`，`off` 强制关闭 surface moving。
  - 新增 `base-anchor.test.ts` 固定非受控 reference click、disabled 阻断/关闭、受控外部点击/Escape、关闭开关、attrs/referenceClass 透传与 surface motion 三态。
  - Nexus 双语 BaseAnchor 文档补齐交互契约；Tuffex docs 新增 BaseAnchor 组件页与索引入口。
- [x] Tuffex BaseSurface fallbackMaskOpacity hard-cut 与契约补证：
  - `TxBaseSurface` 的 `fallbackMaskOpacity` 从类型/文档占位补齐为真实降级透明度覆盖，`blur/glass` 运动降级到 `mask` 时优先使用该值。
  - 新增 `base-surface.test.ts` 固定 root tag/slot/CSS vars、mask clamp、blur/glass 降级、`fallbackMode='pure'`、GlassSurface 参数透传、refraction class/变量与 autoDetect 清理。
  - Nexus 双语 BaseSurface 文档补齐交互契约；Tuffex docs 新增 BaseSurface 组件页与索引入口。
- [x] Tuffex EdgeFadeMask 滚动渐隐契约补证：
  - 新增 `edge-fade-mask.test.ts` 固定根标签/axis class/slot、不可滚动不输出 mask、纵向/横向边界渐隐、disabled 阻断、size 单位转换与 ResizeObserver 生命周期。
  - Nexus 双语 EdgeFadeMask 文档与 Tuffex docs 补齐交互契约，明确 `threshold`、`disabled`、滚动轴、`size` 与 `observeResize` 行为。
- [x] Tuffex FlatButton 原生按钮 hard-cut 与契约补证：
  - `TuffFlatButton` 根节点从 `div role="button"` 硬切为原生 `<button type="button">`，删除手写键盘激活路径，交由浏览器按钮语义承接。
  - 新增 `flat-button.test.ts` 固定默认/primary/mini/loading/disabled、click 阻断、默认不提交表单与 install 注册。
  - Nexus 双语 FlatButton 文档与 Tuffex docs 补齐原生 button、loading/disabled、primary/mini 交互契约。
- [x] Tuffex FlatInput icon/default 与焦点契约补证：
  - `FlatInput` 的 `modelValue` 改为真实默认空字符串，`icon` 无需 prefix slot 即可渲染，根容器不再额外设置 `tabindex`。
  - 新增 `flat-input.test.ts` 固定默认值/placeholder、v-model、icon 与 slot 优先级、textarea、nonWin、password Caps Lock 提示和 install 注册。
  - Nexus 双语 FlatInput 文档与 Tuffex docs 补齐 `modelValue/icon/slot/focus/password/area/nonWin` 交互契约。
- [x] Tuffex BlankSlate wrapper 契约补证：
  - 新增 `blank-slate.test.ts` 固定 `variant="blank-slate"` 透传、`size/layout/surface` 默认值、显式覆盖、四个 named slots 转发与 install 注册。
  - Nexus 英文 BlankSlate 文档从占位描述硬切为真实 first-use empty state 口径；Nexus/Tuffex 文档同步补齐 wrapper 契约。
- [x] Tuffex ErrorState wrapper 契约补证：
  - 新增 `error-state.test.ts` 固定 `variant="error"` 透传、title/description/surface/action props、named slots 转发与 install 注册。
  - Tuffex docs 新增 ErrorState 组件页与索引入口，EmptyState 聚合页补齐 `TxErrorState` 预设项；Nexus 双语 ErrorState 文档补齐 wrapper 契约。
- [x] Tuffex GuideState wrapper 契约补证：
  - 新增 `guide-state.test.ts` 固定 `variant="guide"` 透传、title/description/surface/action props、named slots 转发与 install 注册。
  - Tuffex docs 新增 GuideState 组件页与索引入口，EmptyState 聚合页补齐 `TxGuideState` 预设项；Nexus 双语 GuideState 文档补齐 wrapper 契约。
- [x] Tuffex LoadingState wrapper 契约补证：
  - 新增 `loading-state.test.ts` 固定 `variant="loading"` 透传、title/description/loading/action props、named slots 转发与 install 注册。
  - Nexus 英文 LoadingState 文档从占位描述硬切为真实 loading placeholder 口径；Nexus/Tuffex 文档同步补齐 wrapper 契约。
- [x] Tuffex NoData wrapper 契约补证：
  - 新增 `no-data.test.ts` 固定 `variant="no-data"` 透传、title/description/surface/action props、named slots 转发与 install 注册。
  - Nexus 英文 NoData 文档从占位描述硬切为真实 empty dataset 口径；Nexus/Tuffex 文档同步补齐 wrapper 契约。
- [x] Tuffex NoSelection wrapper 契约补证：
  - 新增 `no-selection.test.ts` 固定 `variant="no-selection"` 透传、title/description/surface/action props、named slots 转发与 install 注册。
  - Nexus 英文 NoSelection 文档从占位描述硬切为真实 detail-panel empty state 口径；Nexus/Tuffex 文档同步补齐 wrapper 契约。
- [x] Tuffex SearchEmpty wrapper 契约补证：
  - 新增 `search-empty.test.ts` 固定 `variant="search-empty"` 透传、title/description/surface/action props、named slots 转发与 install 注册。
  - Nexus 英文 SearchEmpty 文档从占位描述硬切为真实 empty search result 口径；Nexus/Tuffex 文档同步补齐 wrapper 契约。
- [x] Tuffex OfflineState wrapper 契约补证：
  - 新增 `offline-state.test.ts` 固定 `variant="offline"` 透传、title/description/surface/action props、named slots 转发与 install 注册。
  - Nexus 英文 OfflineState 文档从占位描述硬切为真实 offline/network unavailable 口径；Nexus/Tuffex 文档同步补齐 wrapper 契约。
- [x] Tuffex PermissionState wrapper 契约补证：
  - 新增 `permission-state.test.ts` 固定 `variant="permission"` 透传、title/description/surface/action props、named slots 转发与 install 注册。
  - Nexus 英文 PermissionState 文档从占位描述硬切为真实 permission/access state 口径；Nexus/Tuffex 文档同步补齐 wrapper 契约。
- [x] Tuffex Skeleton / LayoutSkeleton 契约补证：
  - `TxLayoutSkeleton` 内容行宽从运行时 `Math.random()` hard-cut 为固定序列，避免 SSR/hydration 与测试输出不稳定。
  - 新增 `skeleton.test.ts` 固定 loading/slot、lines clamp、CSS 变量、circle radius、Card/List preset 与 install 注册。
  - 新增 `layout-skeleton.test.ts` 固定 header/sidebar/content 结构、确定性内容行宽与 install 注册；Nexus/Tuffex 文档同步修正 Skeleton variant 口径并补契约。
- [x] Tuffex stroke animation 组件契约补证：
  - `TxKeyframeStrokeText` 挂载后无论 `document.fonts` 是否存在都会同步测量一次文本尺寸，避免非 Font Loading API 环境保持默认 viewBox。
  - 新增 `keyframe-stroke-text.test.ts` 固定 SVG 可访问语义、CSS 变量、空文本 NBSP fallback、metrics 更新与 install 注册。
  - 新增 `tuff-logo-stroke.test.ts` 固定 mode class、`loop -> breathe` 映射、size/duration 变量、palette 透传、实例级 gradient/filter id 与 install 注册；Nexus/Tuffex 文档同步补齐动画契约。
- [x] Tuffex Grid 当前 API 契约补证：
  - 新增 `grid.test.ts` 固定 TxGrid fixed columns/rows/gaps/alignment、`minItemWidth` 优先级、响应式断点解析、resize 清理与 TxGridItem span clamp/install 注册。
  - Nexus/Tuffex Grid 文档从过期 `autoRows/dense/colStart/colEnd/rowStart/rowEnd/xxl` 口径 hard-cut 到当前实现 API，并补齐响应式/gap/span 契约。
- [x] Tuffex Scroll TouchScroll alias hard-cut：
  - Tuffex 顶层入口移除 `TouchScroll` 旧别名，仅保留当前 `TxScroll` 导出；新增 export boundary 测试防止旧别名回流。
  - Nexus / Tuffex Scroll 文档与 Nexus demo 统一切到 `TxScroll` 当前组件名，不再公开推荐 `TouchScroll`。
- [x] Tuffex Floating disabled hard-cut 与契约补证：
  - `TxFloating disabled=true` 现在停止 window pointer listeners 和 RAF、取消当前动画帧并重置已注册元素；重新启用后再启动监听和 RAF。
  - 新增 `floating.test.ts` 固定元素注册/缓动 transform、disabled 停止与重启、初始 disabled 不启动、depth 更新注册、卸载注销、className/slot 与 install 注册。
  - Tuffex docs 新增 Floating 组件页与索引入口，Nexus 双语 Floating 文档补齐 disabled/RAF/注册契约。
- [x] Tuffex components utils re-export 契约补证：
  - 新增 `utils.test.ts` 固定 `packages/components/src/utils` 对 env、z-index、withInstall、vibrate helper 的再导出可用性。
  - 组件测试覆盖清单中 `utils` 作为 re-export 目录完成归零。
- [x] Nexus AutoSizer / Slider 英文占位文档 hard-cut：
  - `auto-sizer.en.mdc` 从迁移占位改为真实 resize/FLIP 口径，并补齐外层/内层、inline、`flip()`、`action()` 与底层 utility 透传契约。
  - `slider.en.mdc` 从迁移占位改为真实 range input + elastic tooltip 口径，并补齐 clamp、事件、disabled、formatter、tooltip trigger、motion clamp 与 listener cleanup 契约。
- [x] Nexus ChatComposer / Card 英文占位文档 hard-cut：
  - 新增 `chat-composer.test.ts` 固定 v-model、trim send、键盘发送模式、disabled/submitting 阻断、附件发送/附件按钮、scoped slots、textarea 原生事件与 install 注册。
  - `chat-composer.en/zh.mdc` 补齐 props/events/slots 与发送/附件/键盘契约；`card.en.mdc` 从迁移占位改为真实 surface container 口径。
- [x] DeepAgent direct Responses fallback 命名清理：
  - `deepagent-engine.ts` 自有 fallback 函数和 audit type/reason 从 compatibility/legacy wording 改为 direct Responses fallback 口径；上游错误文本 `legacy protocol` 仍保留为异常签名匹配。
  - registry 行改为明确“上游错误文本匹配”，避免误标为项目兼容分支。
- [x] Legacy guard 非兼容分支例外收口：
  - 新增 `scripts/lib/legacy-keyword-exceptions.mjs`，仅过滤 Vue I18n `legacy: false` 固定 API 字段、DeepAgent 上游 `legacy protocol` 错误文本签名、`packages/utils` 负向 lint 禁止项。
  - 移除对应 5 条 legacy allowlist / compatibility registry 行，真实生产分支 key、迁移读取路径与文件名债务仍保留清册登记。
  - `legacy-keyword` 官方统计降至 `12 files / 18 hits`。
- [x] Pilot websearch provider id hard-cut：
  - 历史 `gatewayBaseUrl/apiKeyRef` 字段 hydration 时直接映射到当前 `searxng-main` provider，`pilot-tool-gateway` 不再按 `legacy-gateway` id 分支选择 connector。
  - 移除 datasource / tool gateway 实现与测试对应 4 条 legacy allowlist / compatibility registry 行。
  - `legacy-keyword` 官方统计降至 `8 files / 11 hits`。
- [x] Nexus team context 测试清册噪声清理：
  - `team-context.test.ts` 中组织团队 fixture 名称从 `Legacy Org` 改为中性 `Standalone Org`，保留“非协作套餐 owner 仍可解散组织团队”的行为断言。
  - 移除对应 legacy allowlist / compatibility registry 行。
- [x] Utils system SDK 测试清册噪声清理：
  - `system-sdk.test.ts` 的 failure path 仍固定 typed transport 抛错时不回退 raw channel，但测试标题改为 `retired raw channel`，不再占用 legacy 关键词清册。
  - 移除对应 legacy allowlist / compatibility registry 行。
- [x] Plugin install queue sdkapi 测试清册噪声清理：
  - `install-queue.test.ts` 中低于 sdkapi floor 的插件 fixture 从 `touch-legacy` 改为 `touch-below-floor`，继续固定未声明 `sdkapi >= 251212` 时安装在 finalize 前失败。
  - 移除对应 legacy allowlist / compatibility registry 行。
- [x] App provider keyword sync 测试清册噪声清理：
  - `app-provider.test.ts` 的稳定态 keyword sync 回归标题改为 `retired app item ids`，继续固定同步时不重复调用 `removeItems()`。
  - 移除对应 legacy allowlist / compatibility registry 行。
- [x] Storage subscription 测试清册噪声清理：
  - `packages/test` 的 storage subscription 回归标题与错误消息改为 `retired channel`，继续固定 typed storage transport 优先且不使用旧 channel snapshot。
  - 移除对应 legacy allowlist / compatibility registry 行。
- [x] Preset export v1 hard-cut：
  - `validatePresetData()` 仅接受当前 `PRESET_EXPORT_VERSION=2`，`version=1` 与未来未知版本都返回 invalid，不再以 warning/兼容方式继续导入。
  - `preset-export-types.test.ts` 改为固定 v1 payload 被拒绝，并移除对应 legacy allowlist / compatibility registry 行。
- [x] Renderer storage boundary 测试清册噪声清理：
  - `app-storage-boundary.test.ts` 的局部变量与测试标题改为 `retired` wording，继续固定旧 storage channel import 只允许存在于 bootstrap shim 文件内。
  - 移除对应 legacy allowlist / compatibility registry 行。
- [x] Unplugin CLI shim 测试清册噪声清理：
  - `cli-shim.test.ts` 的测试描述改为 `retired cli shim`，继续固定 deprecated wrapper 只输出弃用提示并转发到 `tuff-cli`。
  - 移除对应 legacy-keyword allowlist / compatibility registry 行；文件名自身仍作为 compat-file 清册项保留，等待 `2.4.11` 退场窗口处理。
- [x] Pilot route/model admin UI 清册噪声清理：
  - `route-combos.vue` 与 `model-groups.vue` 中“当前保存值已禁用/不存在”的临时选项状态从 `legacyStatus` 改为 `retiredStatus`，保留 disabled placeholder 展示逻辑。
  - 移除对应 legacy allowlist / compatibility registry 行。
- [x] PermissionStore SQLite-only 测试清册噪声清理：
  - `permission-store.test.ts` 的 JSON fixture 命名与测试标题改为 `retired` wording，继续固定 SQLite 初始化不会导入旧 JSON snapshot、backend unavailable 时不会恢复 JSON fallback。
  - 移除测试文件对应 legacy allowlist / compatibility registry 行；`permission-store.ts` 的 read-once migration exception 仍单独登记。
- [x] Plugin channel `sendSync` hard-cut：
  - `packages/utils/plugin/channel.ts` 与 generated plugin prelude 不再调用 `ipcRenderer.sendSync('@plugin-process-message', ...)`；旧 `sendSync` 表面保留为显式 hard-cut error（`plugin_channel_send_sync_removed`）。
  - `PluginChannelClient` / `IPluginRendererChannel` 的 SDK 类型面不再暴露 `sendSync`；Channel API 文档同步改为 retired 说明，不再展示同步调用示例。
  - 新增 `plugin-channel-send-sync-hard-cut.test.ts`，固定插件 prelude 不再生成同步 IPC 调用，且 renderer SDK channel 类型不再声明 `sendSync`。
  - Nexus Box SDK 文档中的 CoreBox 输入监听示例已从 `useChannel().regChannel('core-box:input-change')` 改为 `onCoreBoxInputChange()`，避免新插件继续复制旧 Channel listener。
- [x] Tuffex Radio 键盘契约补强：
  - `TxRadioGroup` 增加 radiogroup 级方向键/Home/End 选择逻辑，自动跳过 disabled radio，disabled group 不触发选择变更。
  - 新增 `radio.test.ts` 固定 ARIA、键盘选择、disabled 行为；Nexus Radio 组件文档同步补充键盘操作说明。
- [x] Tuffex Radio 官网占位清理：
  - Nexus 英文 Radio API 与 events 表改为真实使用说明，补齐 `updateOnSettled`、indicator variant、keyboard disabled skip 与 child radio selection 语义。
  - 复用既有 `radio.test.ts` 固定 radiogroup ARIA、方向键/Home/End、disabled item skip 与 disabled group 阻断契约。
- [x] Tuffex FlatRadio 键盘契约补证：
  - `TxFlatRadio` 已有键盘导航实现与 Nexus 文档承诺，本轮新增 `flat-radio.test.ts` 固定单选/多选 ARIA、方向键跳过 disabled、Home/End、disabled group 与 Enter/Space 多选切换。
  - `ResizeObserver` 不可用时不再抛 mounted hook 异常；组件仍正常渲染和响应键盘选择。
- [x] Tuffex FlatRadio 官网契约补齐：
  - Nexus 英文 FlatRadio API 补齐 `multiple`、单选/多选 model payload、Enter/Space 多选切换、disabled item skip 与 item slot/icon 行为说明。
  - 复用既有 `flat-radio.test.ts` 固定单选/多选 ARIA、方向键/Home/End、disabled group 与多选键盘 toggle 契约。
- [x] Tuffex Agents 官网占位清理：
  - 复用既有 `agents.test.ts` 契约证据，固定 enabled/disabled 分组、空态文案、disabled 选择阻断与 click/Enter/Space 选择行为。
  - Nexus 英文 Agents API、events 与 badge slot 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex SearchSelect 官网占位与旧链路清理：
  - Nexus 英文 SearchSelect API、events 与 Popover panel 表改为真实使用说明，并硬裁切旧 `TxPopover -> TxTooltip -> TxBaseAnchor` 公开链路描述。
  - 复用既有 `search-select.test.ts` 固定本地过滤/选择、remote debounce search 与空结果展示契约。
- [x] Tuffex TreeSelect 官网占位清理：
  - Nexus 英文 TreeSelect API、TreeSelectNode、events、node slot 与 expose 表改为真实使用说明，补齐单选/多选 model、clear 语义与 Popover dropdown 控制。
  - 复用既有 `tree-select.test.ts` 固定 tree selection、空态与 clear button 行为。
- [x] Tuffex Picker 契约补证与官网占位清理：
  - 新增 `picker.test.ts` 固定缺失值归一化到首个可用选项、toolbar confirm/cancel、disabled 按钮状态与 itemHeight/visibleItemCount 归一化 CSS 变量。
  - Nexus 英文 Picker API、PickerColumn、PickerOption 与 events 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex Select 契约补证与官网占位清理：
  - `TxSelect` 移除 setup 阶段直接调用 default slot 的 label fallback，硬切为由 `TxSelectItem` 注册 label，避免 Vue slot 追踪告警。
  - 新增 `select.test.ts` 固定 enabled/disabled option 选择、本地 searchable 过滤与 remote editable search 事件；Nexus 英文 Select API/events/item 表改为真实使用说明。
- [x] Tuffex GlassSurface 契约补证与官网占位清理：
  - 新增 `glass-surface.test.ts` 固定数字尺寸 px 归一化、slot 渲染、无 `backdrop-filter` 能力时的 solid fallback，以及 RGB displacement map/channel selector/`displace` 转发契约。
  - Nexus 英文 GlassSurface API 表移除生成占位，补齐 SVG filter -> backdrop-filter -> solid translucent fallback 与 displacement 参数真实语义。
- [x] Tuffex Cascader hard-cut 与官网占位清理：
  - `CascaderProps` 物理删除未实现的 `remote/searchLoading/searchResults/searchDebounce/resolvePath` 类型表面，`CascaderEmits` 删除未触发的 `search` 事件，避免保留假远程搜索契约。
  - 扩展 `cascader.test.ts` 固定单选/多选、clear、disabled 阻断、async `load`、expose helper 与本地搜索空态；Nexus 英文 Cascader API 表改为真实使用说明。
- [x] Tuffex Fusion 契约补证与官网占位清理：
  - 新增 `fusion.test.ts` 固定 slot 渲染、x/y 方向类、CSS 变量归一化、SVG gooey filter 参数、hover/click/manual trigger、受控状态与 disabled 阻断行为。
  - Nexus 英文 Fusion API 表移除生成占位，补齐受控/非受控 active、trigger、分裂轴、gooey filter 与事件真实语义。
- [x] Tuffex GradualBlur preset hard-cut 与官网占位清理：
  - `TxGradualBlur` 修正 preset 合并顺序为默认值 < preset < 显式 props，避免 `preset="intense"` 等被 `withDefaults` 默认值覆盖；非响应式模式直接使用当前 config 尺寸。
  - 新增 `gradual-blur.test.ts` 固定 layer 生成、page target/gpu/style/class、preset 与 divCount clamp、hoverIntensity、responsive breakpoint 尺寸；Nexus 英文 API 表改为真实使用说明。
- [x] Nexus/Tuffex browser-support wording hard-cut：
  - GradualBlur 文档将 `backdrop-filter` 说明从 compatibility 改为 browser-support 口径；Foundations 暗色选择器说明从兼容改为支持，避免浏览器能力说明被误登记为项目兼容壳。
- [x] Tuffex Card 契约补证与官网占位清理：
  - 新增 `card.test.ts` 固定默认 `background='pure'`、slot 区域、size/radius/padding、clickable/disabled click、loading spinner、mask/glass/refraction surface props 与 pointer light coupling。
  - Nexus 英文 Card API 表修正过期 `background` 默认与类型，移除生成占位，补齐 variant/shadow/size/loading/inertial/events/slots 真实语义。
- [x] Tuffex Slider 契约补证与官网占位清理：
  - 新增 `slider.test.ts` 固定 value clamp、formatValue/showValue、input/change 事件、disabled tooltip 阻断、hover/always tooltip、`tooltipMotion='none'` 与全局 pointer listener 清理。
  - Nexus 英文 Slider API 表移除生成占位，补齐 native range、tooltip trigger/formatter/placement、tilt/spring/motion/jelly 参数与事件真实语义。
- [x] Tuffex Scroll 契约补证与官网占位清理：
  - 新增 `scroll.test.ts` 固定 native mode、direction/noPadding/scrollChaining、scrollTo/getScrollInfo、scroll event、pullDown/pullUp 与 finish reset 行为。
  - Nexus 英文 Scroll API 表移除生成占位，补齐 native/BetterScroll 双路径、auto fallback、scrollbar、pull refresh/load 与事件真实语义。
- [x] Tuffex GroupBlock 契约补证与官网占位清理：
  - 新增 `group-block.test.ts` 固定 group 展开/折叠、memoryName 持久化、static group、BlockLine link、BlockSlot disabled、BlockSwitch 普通/导航/加载状态。
  - Nexus 英文 GroupBlock 文档移除生成占位 demo 文案与 API 表，补齐 group、line、slot、switch 的真实交互和事件语义。
- [x] Tuffex Tabs 分组受控修复与官网占位清理：
  - `TxTabs` 修复 `modelValue/defaultValue` 无法命中 `TxTabItemGroup` 内 tab 的问题，并移除 watcher 中直接调用 default slot 的追踪告警路径。
  - 新增 `tabs.test.ts` 固定 activation/group/header/nav-right、enabled/disabled 切换、分组内受控 tab、视觉 prop 归一化、AutoSizer expose 与 animation 参数。
  - Nexus 英文 Tabs API 表移除生成占位与重复 `autoHeight` 行，补齐 `borderless`、animation、slots、expose、events 真实语义。
- [x] Tuffex SearchInput 契约补证与官网占位清理：
  - 新增 `search-input.test.ts` 固定输入更新、Enter 搜索、remote 防抖、disabled remote 阻断与 clear/expose 透传行为。
  - Nexus 英文 SearchInput API 表移除 `Description for ...` 占位，说明与现有中文文档及组件契约对齐。
- [x] Tuffex Empty 契约补证与官网占位清理：
  - 新增 `empty.test.ts` 固定 `TxEmpty -> TxEmptyState` 的 variant/surface/layout、compact size 与 icon/title/description/action slot 映射。
  - Nexus 英文 Empty 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex LoadingOverlay 契约补证与官网占位清理：
  - 新增 `loading-overlay.test.ts` 固定容器遮罩、关闭态、fullscreen Teleport、spinnerSize/text/background 透传行为。
  - Nexus 英文 LoadingOverlay 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex Spinner 契约补证与官网占位清理：
  - 新增 `spinner.test.ts` 固定 ARIA、CSS 变量、SVG fallback 与 `visible=false` 不渲染行为。
  - Nexus 英文 Spinner 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex Stack 契约补证与官网占位清理：
  - 新增 `stack.test.ts` 固定默认/横向布局 CSS 变量、数字 gap px 归一化与 slot 渲染行为。
  - Nexus 英文 Stack 文档改为真实使用说明，并清理 `wrap/inline` 占位描述。
- [x] Tuffex Flex 契约补证与官网占位清理：
  - 新增 `flex.test.ts` 固定默认/自定义布局 CSS 变量、数字 gap px 归一化与 slot 渲染行为。
  - Nexus 英文 Flex 文档改为真实使用说明，并清理 `inline` 占位描述。
- [x] Tuffex GridLayout 响应式变量修复与官网占位清理：
  - `rootStyle` 改为 computed，确保 `gap/minItemWidth/maxColumns` props 更新后 CSS 变量同步更新。
  - 新增 `grid-layout.test.ts` 固定默认变量、props 更新、hover spotlight 与 `interactive=false` 阻断行为。
  - Nexus 英文 GridLayout 文档改为真实使用说明与 API 描述，不再保留 `hover` / `Description for ...` 占位。
- [x] Tuffex Container 栅格真实契约补证：
  - 新增 `container.test.ts` 固定 Container padding/maxWidth/margin/fluid/responsive、Row gutter/align/justify/wrap、Col span/offset/断点行为。
  - Nexus Container 中英文 API 表硬裁切不存在的 `push/pull/xxl` 与旧断点，改为真实 `xs/sm/md/lg/xl` 数值契约和当前 CSS 变量。
- [x] Tuffex NavBar 契约补证与官网占位清理：
  - 新增 `nav-bar.test.ts` 固定 title/safe-area/z-index、fixed/disabled、内置 back button 与左右插槽事件行为。
  - Nexus 英文 NavBar 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex GradientBorder 契约补证与官网占位清理：
  - 新增 `gradient-border.test.ts` 固定默认/自定义根元素、slot 包装、数字 px 归一化与字符串 CSS 单位透传。
  - Nexus 英文 GradientBorder 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex CornerOverlay 契约补证与官网占位清理：
  - 新增 `corner-overlay.test.ts` 固定默认内容、overlay slot、四角定位、offset 单位归一化与 `overlayPointerEvents` 行为。
  - Nexus 英文 CornerOverlay 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex Stagger 契约补证与官网占位清理：
  - 新增 `stagger.test.ts` 固定 TransitionGroup 根标签、CSS 时间变量、transition name/appear、子节点 index 与 comment 过滤行为。
  - Nexus 英文 Stagger 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex OutlineBorder 契约补证与官网占位清理：
  - 新增 `outline-border.test.ts` 固定根元素/slot、border/ring/ring-offset/ring-inset、overflow/clipPath/mask/none 裁切与单位归一化行为。
  - Nexus 英文 OutlineBorder 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex ContextMenu 契约补证与官网占位清理：
  - 新增 `context-menu.test.ts` 固定受控/非受控打开、右键坐标、Escape 关闭开关、菜单宽度、item select 关闭与 disabled item 阻断行为。
  - Nexus 英文 ContextMenu 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex DropdownMenu 契约补证与官网占位清理：
  - 新增 `dropdown-menu.test.ts` 固定 trigger/menu 渲染、Popover props 透传、open/close 事件、item select/closeOnSelect 与 disabled item 阻断行为。
  - Nexus 英文 DropdownMenu 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex SegmentedSlider 纵向布局修复与官网占位清理：
  - `TxSegmentedSlider` 纵向模式改为写入真实 `height/bottom` 样式，避免继续依赖未设置的 `--height/--bottom` 变量。
  - 新增 `segmented-slider.test.ts` 固定横向/纵向进度与点位、点击/键盘选择、disabled 阻断、label 开关与空值首段选择行为。
  - Nexus 英文 SegmentedSlider 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex GlowText 契约补证与官网占位清理：
  - 新增 `glow-text.test.ts` 固定默认 adaptive shine、root tag、CSS 变量映射、inactive/once 状态、text-clip 文本镜像与模式切换清理行为。
  - Nexus 英文 GlowText 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex Splitter 契约补证与官网占位清理：
  - 新增 `splitter.test.ts` 固定横向/纵向 pane 与 separator ARIA、ratio/barSize CSS 变量、pointer drag clamp/snap、键盘调整、disabled 阻断与拖拽中禁用收尾行为。
  - Nexus 英文 Splitter 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex StatCard 契约补证与官网占位清理：
  - 新增 `stat-card.test.ts` 固定默认 metric、custom slots、percent/delta insight、progress ring clamp、numeric progress fallback 与 progress meta slot 行为。
  - Nexus 英文 StatCard 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex SortableList 契约补证与官网占位清理：
  - 新增 `sortable-list.test.ts` 固定 list/listitem 语义、item slot props、默认 id 渲染、drag/drop reorder、same-item no-op、disabled 阻断、handle-only drag 与 dragend 清理行为。
  - Nexus 英文 SortableList 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex MarkdownView sanitize hard-cut 与官网占位清理：
  - `TxMarkdownView` 在 `sanitize=true` 且 DOMPurify 尚未就绪或加载失败时不再回退渲染 raw HTML，只有 `sanitize=false` 才允许 raw HTML。
  - 新增 `markdown-view.test.ts` 固定 sanitizer ready 前空输出、净化渲染、显式 raw 模式、light/dark/auto theme 与 document theme observer 行为。
  - Nexus 英文 MarkdownView 文档改为真实使用说明与 API 描述，不再保留生成占位文案。
- [x] Tuffex TextTransformer 契约补证与官网占位清理：
  - 新增 `text-transformer.test.ts` 固定默认 live region、root tag、CSS 变量、wrap、文本切换双层过渡、slot text props 与定时清理行为。
  - Nexus 英文 TextTransformer API 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex TypingIndicator 契约补证与官网占位清理：
  - 新增 `typing-indicator.test.ts` 固定 status/aria-live、dots/ai/pure/ring/circle-dash/bars 变体、尺寸 CSS 变量、文本显隐与 mask 绑定行为。
  - Nexus 英文 TypingIndicator API 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex CardItem 契约补证与官网占位清理：
  - 新增 `card-item.test.ts` 固定标题/副标题/描述、avatar 优先级、slot 覆盖、active/clickable/disabled、Enter 触发与 no-left 布局行为。
  - Nexus 英文 CardItem API、slots、events 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex AutoSizer 契约补证与官网占位清理：
  - 新增 `auto-sizer.test.ts` 固定 outer/inner tag、attrs/class/style 合并、inline 推导、auto-resize/flip 参数、expose 方法与 action snapshot 检测行为。
  - Nexus 英文 AutoSizer API 与 expose 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex Popover hard-cut BaseAnchor 契约补证：
  - `popover.test.ts` 移除旧 `TxTooltip` stub 测试，改为固定当前 `TxBaseAnchor` props 转发、offset 推导、hover 延迟开关、disabled 关闭、full-width reference 与 side slot 行为。
  - `toggleOnReferenceClick` 默认值修正为保留 `undefined`，确保 click/hover trigger 推导默认值生效。
  - Nexus 英文 Popover 文档硬裁切旧 “wraps TxTooltip” 描述，事件表改为真实状态变更说明。
- [x] Tuffex EmptyState 契约补证与官网占位清理：
  - `TxEmptyState` 修正 `icon=null` 语义，显式关闭 preset illustration，不再落回默认插画。
  - 新增 `empty-state.test.ts` 固定 variant 默认文案/插画、显式标题描述覆盖、slot 覆盖、action emit/disabled、loading spinner 与 `icon=null` 隐藏图标行为。
  - Nexus 英文 EmptyState API、EmptyStateAction、slots 与 events 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex DatePicker 契约补证与官网占位清理：
  - 新增 `date-picker.test.ts` 固定 `YYYY-MM-DD` 模型归一化、min/max clamp、列禁用、TxPicker props 透传、confirm/cancel/open/close 与 visible 事件转发行为。
  - Nexus 英文 DatePicker API 与 events 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex TabBar 契约补证与官网占位清理：
  - 新增 `tab-bar.test.ts` 固定 tablist/tab ARIA、active 状态、icon/badge 渲染、fixed/safe-area/z-index、enabled pick 事件与 bar/item disabled 阻断行为。
  - Nexus 英文 TabBar API、TabBarItem 与 events 表改为真实使用说明，不再保留生成占位文案。
- [x] Tuffex Tabs animation.size 官网兼容口径 hard-cut：
  - Tuffex Tabs 文档与 Nexus 中文 Tabs 文档不再把 `autoHeight*` 描述成兼容字段，改为当前 size animation 的便捷 props 与默认时长/缓动来源。
- [x] Tuffex Transition 契约补证与官网占位清理：
  - 新增 `transition.test.ts` 固定 preset/name 映射、TransitionGroup tag、smooth-size -> AutoSizer 转发、class/style/attrs 透传边界与语义 wrapper preset 行为。
  - Nexus 英文 Transition API 表改为真实使用说明，不再保留生成占位文案。
- [x] CoreApp transport 回归测试契约修复：
  - `clipboard.transport.test.ts` 图片 payload 断言对齐当前契约：列表值继续使用 thumbnail，原始 tfile URL 通过 `meta.image_original_url` 暴露，外部路径不伪造原图 URL。
  - `omni-panel/index.test.ts` 补齐 TouchWindow mock 的当前 BrowserWindow 表面，并把快捷键 hold re-arm 断言对齐为触发后复位 armed 状态。
  - `clipboard.transport.test.ts` 与 `omni-panel/index.test.ts` 全文件 vitest / eslint 已恢复通过。
- [x] Tuffex Alert/Avatar/Badge dts 输出收敛：
  - `TxAlert` / `TxAvatar` / `TxBadge` 的 `defineProps` 改为直接使用已导出的公共 props 类型，去掉 SFC 内不可命名的私有 `Props` 导出泄漏。
  - `packages/tuffex/packages/components` build 继续通过，首批 `TS4023` 组件导出诊断已消除。
- [x] Tuffex slot dts 诊断清零：
  - `TxFlipOverlay`、`TxSelect`、`TxSelectItem` 与文档 `DemoBlock` 显式使用 Vue `Slots` 类型，并统一按带 props 的 slot 调用形式生成声明。
  - `TxButton`、`TxEmpty`、`TxStagger`、`TxTooltip` 的 slot/VNode 类型已同步收敛，`packages/tuffex/packages/components` build 不再输出 dts 诊断。
- [x] Tuff Intelligence 包内 SDK typed event 同步：
  - `packages/tuff-intelligence` 自带 `agentSession*`、`agentTool*` 与 `workflow*` SDK 事件同步切到 typed builder。
  - 对外事件名保持不变，避免包内 SDK 与 `packages/utils` shared SDK / CoreApp main handler 再次分叉。
  - 补齐包内轻量 `defineEvent` builder，修复 typed builder 迁移后的运行时导出漏口。
  - 已补包内 `builder.test.ts`，直接固定 typed event name、legacy two-part raw event 保留与 SDK typed event 映射。
- [x] Inline workflow 多 step hard-cut 回归补强：
  - `workflow.execute` inline payload 已补 prompt step + direct tool step 混排测试，固定 prompt 执行、tool metadata 与 approval context。
  - 回归断言 inline workflow 使用 `inline.workflow`，避免回退到历史不存在的 legacy workflow agent ID。
  - `workflow.execute` inline step 不再按 `agentId/toolId` 隐式推断 kind；payload 必须显式声明 `kind='prompt'|'tool'|'agent'`，并在入口拒绝缺 kind / 缺 toolId / 缺 agentId / capabilityId 路由的步骤。
- [x] Inline workflow contract 标记 hard-cut：
  - `normalizeInlineWorkflowPayload()` 不再把当前 `workflow.execute` inline 主链路标记为 compatibility workflow，统一使用 `contract: 'workflow.execute.inline'`。
  - `intelligence-deepagent-orchestration.test.ts` 补齐归一化 metadata 断言，防止 inline workflow 当前契约重新回退为兼容壳描述。
- [x] Assistant transport typed event 收口：
  - `AssistantEvents.floatingBall.*` 与 `AssistantEvents.voice.*` 保持 `assistant:floating-ball:*` / `assistant:voice-panel:*` 对外事件名不变，内部定义从 `defineRawEvent` 切到 typed builder。
  - 已补 `transport-domain-sdks.test.ts` 的 `namespace/module/action` 断言，继续压缩旧 Channel/raw event 构造依赖。
- [x] Plugin widget transport typed event 收口：
  - `PluginEvents.widget.register/update/unregister` 保持 `plugin:widget:*` 对外事件名不变，内部定义从 `defineRawEvent` 切到 typed builder。
  - 已补 `transport-domain-sdks.test.ts` 的 widget event metadata 断言，继续压缩 plugin 链路 raw event 构造依赖。
- [x] Plugin storage open-in-editor typed event 收口：
  - `PluginEvents.storage.openInEditor` 保持 `plugin:storage:open-in-editor` 对外事件名不变，内部定义从 `defineRawEvent` 切到 typed builder。
  - 已补 `transport-domain-sdks.test.ts` 的 storage event metadata 断言，shared `events/index.ts` 中三段 raw event 已清零。
- [x] Plugin Storage SDK typed transport 收口：
  - `usePluginStorage()` 文件操作与诊断操作统一改走 `PluginEvents.storage.*` typed event，主进程 handler 已共用同一事件对象，`plugin:storage:*` 对外事件名不变。
  - `createPerformanceSDK()` 同步改走 `PluginEvents.storage.getStats` / `PluginEvents.performance.*`，保留 `{ data }` 包装响应解包语义。
  - `usePluginSqlite()` 同步改走 `PluginEvents.sqlite.*`，保留 SQL trim、params 归一化与失败响应抛错语义。
  - `createBoxSDK()` 已将 show/hide/expand、hideInput/showInput、getInput/setInput/clearInput、allowInput/allowClipboard、setHeight/setPositionOffset/getBounds 调用改走 shared `CoreBoxEvents` typed event 对象；`packages/utils/plugin/sdk/box-sdk.ts` 的 raw channel 命中清零。
  - `clearCoreBoxItems()` 已改走 `CoreBoxEvents.item.clear`，`packages/utils/plugin/sdk/core-box.ts` 的 raw channel 命中清零。
  - 插件窗口 `createWindow/toggleWinVisible/setWindowProperty` 已补 `PluginEvents.window.*` shared event 对象并让 main/SDK 共用，事件名保持 `window:*` 不变。
  - 插件 service 注册/注销/处理回调已补 `PluginEvents.service.*` shared event 对象并让 ServiceCenter/SDK 共用，事件名保持 `service:*` 不变；SDK 处理回调订阅已改走 `transport.on(PluginEvents.service.handle)`，不再直接调用 `channel.regChannel('service:handle')`。
  - 插件 shortcut 注册/触发与 index communicate 已补 `PluginEvents.shortcut.*` / `PluginEvents.communicate.index` shared event 对象并让 GlobalShortcon、PluginModule 与 SDK 共用；shortcut trigger 订阅已改走 `transport.on(PluginEvents.shortcut.trigger)`，`sendMessage()` 兼容 wrapper 已改为转发 `PluginEvents.communicate.index`，不再动态发送 `plugin:${message}` raw channel。
  - 插件临时文件 `useTempPluginFiles()` 与 renderer SVG 临时文件创建已共用 `PluginEvents.tempFile.*` shared event 对象，CommonChannel 补齐 `temp-file:create/delete` handler，返回继续使用 `tfile://` URL；`packages/utils/plugin/sdk/temp-files.ts` 的 raw channel 命中清零。
  - 插件 storage `onDidChange()` 已改走 `transport.on(PluginEvents.storage.update)`，复用主进程现有 typed broadcast，不再直接监听 `plugin:storage:update` raw channel 字符串。
  - 插件 lifecycle hooks 已改走 `transport.on(PluginEvents.lifecycleSignal.*)`，不再监听 `@lifecycle:*` 私有 raw channel 字符串；回包布尔语义由 typed listener 返回值承接。
  - 插件 CoreBox bridge hook 的 input / clipboard 监听已改走 `transport.on(CoreBoxEvents.input.change / clipboard.change)`；`core-box:key-event` 确认没有生产发送端，`onCoreBoxKeyEvent()` / `feature.onKeyEvent()` 已硬切为显式 migration error，官方 `touch-translation` widget 与 Nexus API 文档不再暴露该幻影扩展面。
  - `createFeatureSDK()` 的 input change 监听同步改走 `CoreBoxEvents.input.change`，避免继续在 SDK 内局部定义 `core-box:input-change` raw event。
  - Renderer `TouchStorage` 与 `StorageSubscription` 已硬切为 `StorageEvents.app.*` transport-only；历史 channel 参数仅保留无副作用入口，不再承担读写或 update listener fallback，renderer storage 基础层 raw 命中清零。
  - 官方 `touch-translation` widget 历史项回填 CoreBox 输入已改走 `CoreBoxEvents.input.setQuery` typed event，不再直接发送 `core-box:set-query`。
  - 已补 `plugin-storage-sdk.test.ts`、`plugin-performance-sdk.test.ts`、`plugin-sqlite-sdk.test.ts`、`plugin-box-sdk.test.ts`、`plugin-core-box-sdk.test.ts`、`plugin-window-sdk.test.ts`、`plugin-service-sdk.test.ts`、`plugin-temp-files-sdk.test.ts`、`renderer-storage-transport.test.ts` 与 `plugin-common-sdk.test.ts`；`ClipboardEvents.queryMeta` 已从 `clipboard:query` raw event 硬切为 `clipboard:history:query-meta` typed builder；`PollingService` 默认 lane 已从旧 `legacy_serial` 硬切为 `serial`，诊断结构不再暴露旧 lane；插件日志类型已删除 `LogLevelLegacy` 旧 alias，统一只导出 base `LogLevel` / `LogLevelString`；`ModuleBaseContext.runtime` 说明已硬切为显式 runtime context，不再登记旧 global wording；Tuffex `TxCodeEditor` 已移除 `@codemirror/legacy-modes` direct dependency，TOML/INI 改用本地 stream parser；`raw-channel-send` 统计已降为 `0 files / 0 hits`，`legacy-keyword` 同步降为 `64 files / 179 hits`，并移除所有已清零文件的 registry 行；Tuffex GroupBlock 旧 prop 与旧 localStorage key fallback 已硬切，Nexus `/api/sync/*` 退役路由不再进入鉴权链路。
- [x] Transport event typed boundary 防回退门禁：
  - 新增 `transport-event-boundary.test.ts`，扫描 shared event 定义文件，禁止 `namespace:module:action` 形态的事件继续使用 `defineRawEvent`。
  - 两段 legacy 协议仍需专项 hard-cut，不在本门禁中隐式改名。
- [x] Transport bridge adapter 兼容命名清理：
  - `TuffMainTransport` 内部桥接类型从 `LEGACY_CHANNEL` / `LegacyMainChannel` 切到当前 `BRIDGE_CHANNEL` / `MainChannelBridge` 命名，不改变 TouchChannel bridge 运行时行为。
  - `TuffRendererTransport` 与 `defineRawEvent` 文档硬裁切 legacy migration 叙述，改为 retained bridge / retained non-conforming event names 口径。
  - 已移除 `packages/utils/transport/{event/builder,sdk/main-transport,sdk/renderer-transport}.ts` 对应 stale registry 行，legacy keyword 清册继续下降。
- [x] Transport package 入口分组文案清理：
  - `packages/utils/transport/index.ts` 的 SDK 导出分组从 `Legacy Compatibility (Deprecated)` 改为 `Current SDK Surface`，避免当前正式入口继续被误标为旧兼容面。
  - 移除对应 stale registry 行。
- [x] touch-image Vue I18n 清册说明校准：
  - `plugins/touch-image/src/main.ts` 的 `legacy: false` 是 Vue I18n composition-mode 正式 API，不是项目兼容分支；registry 行已改为框架 API 例外说明。
  - 暂不改代码，等待 guard 支持 API-term exception 后再从 keyword 清册移除。
- [x] Utils ESLint removed-entry 诊断文案清理：
  - `packages/utils/eslint.config.js` 中禁止旧 channel/transport/permission 入口的错误提示从 legacy API 改为 removed entry/API，避免把防回退门禁误写成兼容面。
  - `/legacy` 字面量仍作为负向拦截规则保留，registry 行改为 no-compat-branch 说明。
- [x] User-managed launcher foundation：
  - `settingsSdk.appIndex` 已补齐 `listEntries / upsertEntry / removeEntry / setEntryEnabled` typed contract，main `common.ts` 同步注册 handler。
  - `app-provider` 复用现有 `files + file_extensions` 模型支持 manual entry CRUD、启用/禁用、冲突校验与启动元数据持久化，不新增 schema/table。
  - `search-processing-service` 已对 disabled manual entry 做 recommendation/search 过滤，执行链路继续复用 `scheduleAppLaunch`。
  - 已补 targeted regression：`transport-domain-sdks.test.ts`、`common.test.ts`、`app-provider.test.ts`、`search-processing-service.test.ts`。
- [x] macOS 中文应用名首轮索引修复：
  - `darwin.getAppInfo()` 首轮扫描新增 Spotlight `kMDItemDisplayName` 安全读取，并在英文名优先时保留本地化名称为 `alternateNames`，避免“网易云音乐”等中文名称被扫描阶段丢弃。
  - `app-provider` 会把 `displayName + alternateNames` 一并生成中文、全拼与首字母关键词；补齐 `darwin.test.ts`、`app-provider.test.ts` 与 `search-processing-service.test.ts` 定向回归。
- [x] 官方插件体验补强：
  - `touch-translation` 快翻 widget 与 `fy-multi` 已统一默认翻译方向、provider 顺序与错误文案，多源页不再硬编码中文目标语言。
  - 新增 `touch-dev-utils` 纯本地程序员工具插件，覆盖 UUID、JWT、时间戳、Query String、命名转换与字符串转义。
- [x] Transport stream 内部协议统一：
  - `main/renderer/plugin` 共用 `packages/utils/transport/sdk/stream/*` 内部 runtime；默认 Port 优先，失败自动回退 `:stream:*`。
  - `ClipboardEvents.change` 已补 renderer/plugin/main 定向回归，覆盖 port 成功、回退、取消与 server fallback。
- [x] Sync payload 真密文化：
  - `apps/core-app` 同步 payload 写入从旧 `b64:` Base64 载荷升级为 main 侧 AES-GCM `enc:v1` envelope，随机 key 保存在 secure-store，不再从 `deviceId` 派生。
  - `payload_enc` 与上传 blob 文本只承载密文；`meta_plain` 仅保留 `qualified_name/schema_version/payload_size/content_hash/crypto_version/key_id` 等非业务字段。
  - 旧 `b64:` 仅作为 pull migration fallback 读取；读取后标记 dirty，下一次 push 自动升级为 `enc:v1`。
  - renderer `sync-item-mapper` 退为拒写兼容壳，避免第二套 Base64 实现重新接入生产同步。
  - 已补定向回归：sync crypto/wire、AccountStorage token 不落盘、renderer platform 优先级、legacy language migration。
  - 迁移读取内部标记已改为 `requiresMigrationRewrite`，并清理测试文案噪声；`legacy-boundary` 与 `compat:registry:guard` 重新通过。
  - compatibility registry 已移除无当前扫描命中的 cleanup candidate 行；`pnpm compat:registry:guard` 当前通过且无 cleanup warning。
  - `compat-file` 扫描已将 `compat`、`shim/shims` 收紧为独立命名段，并对 declaration-only `.d.ts` 排除 `shim` 噪声；移除 `ShimmerText.vue`、`shims*.d.ts` 与 `langchain-openai-compatible-provider.ts` 的误伤登记；`sdk-compat.ts` 已硬切为 `sdkapi-hard-cut-gate.ts`，Pilot `pilot-compat-*` 已硬切为领域服务命名，当前真实 `compat-file` 降至 `5`。
  - 下载迁移 progress/result push 事件已进入 shared typed `DownloadEvents.migration.progress/result` registry，`MigrationProgress.vue` 不再本地 `defineRawEvent('download:migration-*')`。
  - Language localStorage snapshot 迁移读取路径已硬切，初始化只读取 typed app settings / browser / Intl；旧 `app-language` 与 `app-follow-system-language` 仅保留 retired key cleanup，不再作为偏好来源。
  - CoreApp renderer storage facade、Tuffex 集成策略与权限页 SDK blocked warning 的兼容命名噪声已清理，不改变运行时行为。
  - Shared `StorageEvents` 已物理删除旧 raw storage update namespace 与对应 payload 类型；`renderer-storage-transport.test.ts` 固定不再暴露该旧 namespace。
- [x] CoreApp 低风险兼容残留清理：
  - 删除未接入 runtime 的旧 `permission-center.ts` 与 `main/index.ts` 中已注释 legacy import，保留现行 `platform.permission-center` 能力 ID。
  - 删除未被构建入口或窗口 runtime 引用的裸 IPC `preload-view.js`。
  - renderer `sync-item-mapper` 仅保留插件 storage qualified-name helper，retired sync payload API 由 main 侧真实实现承载。
- [ ] CoreApp 后续兼容/跨平台专项：
  - [x] 2026-05-06 首轮 runtime 边界收口：新增 `WindowSecurityProfile`，主窗口/CoreBox/OmniPanel/Assistant/MetaOverlay 切到 app-grade baseline；插件 `WebContentsView` / DivisionBox 仅通过显式 `compat-plugin-view` 保留兼容。
  - [x] 2026-05-06 raw IPC 底座冻结：`@main-process-message` / `@plugin-process-message` 集中到内部 adapter，renderer `window.touchChannel` 仅保留 deprecated bootstrap bridge；新增 `runtime:guard` 拦截裸 IPC、宽松 WebPreferences、旧 i18n 与旧 `/api/sync/*`。
  - [x] 2026-05-06 跨平台 capability 合同补强：macOS Automation、Windows PowerShell、Linux `xdotool`、native share mail-only 与 permission deep-link degraded/unsupported path 均有 `issueCode/reason/limitations` 回归。
  - [x] 2026-05-10 跨平台兼容与占位实现审计报告已落地：`docs/plan-prd/report/cross-platform-compat-placeholder-audit-2026-05-10.md`。
  - [ ] 插件视图二阶段硬化：在插件 SDK/Surface 兼容验证后，把可迁移插件从 `compat-plugin-view` 逐步切到 `trusted-plugin-view`。
  - [ ] Linux documented best-effort：补齐真机 smoke 与 `xdotool` / desktop environment 用户提示截图证据。
- [ ] CoreBox 第三方 App 非阻塞启动 Windows 真机验证：
  - 验证 `shortcut` 保留 `launchArgs / workingDirectory` 并在 CoreBox 立即隐藏后后台启动。
  - 验证 `uwp` 继续通过 `explorer.exe shell:AppsFolder\\...` handoff，早期失败会触发系统通知。
  - 2026-04-22 本地回归已补：`app-provider.test.ts` 覆盖 `shortcut` / `uwp` `onExecute` 异步 handoff，不等待后台观察窗口即可返回；仍需 Windows 真机补“窗口已隐藏 + 实际启动体验”。
  - 2026-05-05 合并回归：Windows 应用索引补坏 `display_name` 回退、`Get-StartApps` 绝对路径桌面应用识别、Everything 后端尝试错误与 active-app 精简错误日志；仍需真机验证微信/Codex/Apple Music 搜索与启动。

### 2.4.10 当前优先：Windows App 索引 + 基础 legacy/compat

- [x] 基础 legacy 清理阻塞：清册中的 core-app `2.4.11` 项已关闭或显式降权；不得新增 `legacy` 分支、raw channel、旧 storage protocol、旧 SDK bypass。
  - 已将 `apps/core-app/scripts` 与 `apps/pilot/scripts` 纳入 `legacy/compat` 显式扫描范围，并手工补齐 allowlist / registry。
  - 插件 channel bridge 移除 legacy header 语义；DivisionBox dead `flow-trigger` 事件面已物理删除；Nexus store 旧 manifest/path fallback 已改为结构化错误。
  - permission JSON->SQLite、dev data root migration、theme localStorage migration 仍作为 read-once / marker-gated migration exception 保留；2026-05-08 已补明确退场条件与回归证据要求，禁止扩散为新的 runtime storage 依赖。
  - 2026-05-08 Intelligence Workflow 页面与 `useWorkflowEditor()` 硬编码文案已迁移到 `zh-CN/en-US` i18n；FileProvider 两处 `[DEBUG]` 日志前缀和 DEBUG 注释已清理，索引调度逻辑不变。
  - 2026-05-08 `compat-plugin-view`、raw IPC adapter 与 `window.touchChannel` 仅维持现有白名单边界；本轮未新增 legacy/raw channel 消费方。
- [x] Auth secure store 分层降级：`useSecureStorage` 缺省启用凭证持久保护，旧默认关闭配置会迁移到开启（用户显式关闭除外）；Electron `safeStorage` 不可用时使用 `config/local-secret.v1.key` 本地 AES-GCM fallback，只有 `unavailable` 才进入 session-only。
- [x] Sync secure payload key 降级兼容：`sync-payload-key` 通过 secure-store 分层持久化，注册包装记录真实 backend，旧 `b64:` 仍只作为 decrypt + rewrite 迁移输入。
- [x] Plugin icon 基础兼容修复：插件 manifest `file` 图标优先从插件目录解析，补 `src/assets` / `public` source-layout 候选；CoreApp `TuffIcon colorful=true` 直接保留 SVG 原色渲染，避免本地 SVG 读取失败导致破图。
- [x] Plugin channel sandbox 兼容修复：旧插件 channel/prelude 与 renderer channel reply 统一用 `ipcRenderer.send(...)`，避免 sandbox 事件对象缺少 `sender.send`。
- [x] CoreApp node typecheck 当前阻塞解除：renderer storage transport 测试 typing 与 Windows file-provider index runtime service 未使用类字段已收口。
- [x] 更新自动下载默认开启：UpdateService / UpdateSystem / renderer runtime / shared defaults 统一为 `autoDownload: true`，并保留用户显式关闭设置；当前 Windows 仍为下载后安装器安装，静默自动安装另列未闭环项。
- [x] Windows 自动安装受控策略基础：新增 `autoInstallDownloadedUpdates`，默认关闭且仅 Windows 高级设置可显式开启；只有自动下载任务携带 `autoInstallOnComplete` 且高级设置开启时才会在完成后走 NSIS/MSI installer handoff，手动下载或设置关闭仍只提示下载完成；Update diagnostic evidence 与 `update:diagnostic:verify` 已能区分 `windows-installer-handoff` / `windows-auto-installer-handoff`，并可用 `downloadTaskId` + `installedVersion` + `--requireInstalledVersionMatchesTarget` 复核自动下载任务、安装后版本与下载目标版本一致性，同时复核 cached release tag/channel 与 matching asset 平台/架构/size。
- [x] Windows 用户触发安装 handoff 补强：NSIS `*-setup.exe` 走 `/S`，MSI 走 `msiexec.exe /i <path> /passive /norestart`，安装器启动后退出当前应用释放文件占用；非 setup `.exe` 继续回落 `shell.openPath()`。
- [x] Windows 更新诊断证据导出：Settings Update 页可复制/保存 `update-diagnostic-evidence` JSON，记录 update settings/status、downloadReady/downloadTaskId、cached release/assets、platform/arch 与 `windows-installer-handoff` 判定；`update:diagnostic:verify` 可离线复核 autoDownload、downloadReady、Windows installer handoff、用户确认、无人值守未开启、匹配资产与 checksum 门禁，并校验 `verdict` / suggested fields、目标版本、release channel、matching asset 平台/架构/size 与源状态一致；显式标记 `unattendedAutoInstallEnabled: false`，避免误当作无人值守自动安装闭环。
- [x] DivisionBox detached widget 恢复链路修复：插件 feature 分离时优先使用 `meta.pluginName` 写入 session `pluginId`，避免把 `plugin-features` provider id 当作真实插件；widget 的 `detachedPayload` 前移到 `DivisionBoxConfig.initialState` 并在 session 构造期水合，避免窗口启动时先读到空 session state 再回退搜索；widget/webcontent/普通 app 结果路径已补 `useDetach.test.ts` 回归。
- [x] 复制 app path 加入本地启动区回归补证：SystemActionsProvider 已覆盖 Files/text/file URL 中的 `.exe/.lnk/.appref-ms/.app` 路径识别，并支持复制未加引号或带引号、含空格且带参数的 Windows app 命令行、`%LOCALAPPDATA%` / `%USERPROFILE%` 等 `%ENV%` Windows 路径、Windows UWP `shell:AppsFolder\\...` 虚拟路径或裸 `PackageFamily!App` AppID；执行 action 会调用 `appProvider.addAppByPath()`，写入 `entrySource=manual / entryEnabled=1` 本地启动区条目并进入应用索引而非文件索引；Windows ClickOnce `.appref-ms` 已补 Start Menu 扫描、实时变更和单项解析回归，仍需 Windows 真机验证复制真实应用路径后的用户体验。
  - 2026-05-11 已补快捷方式属性页复制场景回归：`Target: "C:\\...\\Demo Tool.exe" --profile work` 这类多行文本会提取真实 `.exe` 路径并生成 app-index action。
  - 2026-05-11 acceptance 结构化字段已收紧：`manualChecks.copiedAppPath` 必须填写 copied source、normalized app path、add-to-local-launch-area action、本地启动区条目、App Index diagnostic evidence、reindex 后 search query、indexed search result 与 indexed result launch evidence；最终 gate 会在布尔项之外复核这些字段非空。
  - 2026-05-11 手工证据字段已收紧：归档 Markdown 必须填写 add-to-local-launch-area action、indexed search result 与 indexed result launch evidence，不能只用 app-index diagnostic path 替代用户实际启动闭环。
- [x] Windows App 诊断证据导出：Settings App Index diagnostic 可复制/保存 `app-index-diagnostic-evidence` JSON，记录命中路径、launchKind/target、shortcut launchArgs/workingDirectory、bundle/appIdentity、`rawDisplayName/displayNameStatus`、`iconPresent`、generated/stored keywords、precise/phrase/prefix/FTS/N-gram/subsequence 阶段命中、reindex 状态与失败原因；`app-index:diagnostic:verify` 可离线复核 target 命中、query stage、launchKind、launchTarget、launchArgs、workingDirectory、bundle/appIdentity、clean/fallback displayName、索引图标存在、reindex 与 reusable caseId 门禁，并复算 `matchedStages` / stage targetHit / target itemId / matchCount、suggested fields 与 reindex path 的内部一致性，避免弱 JSON 伪造 query hit 或复制 app path 索引闭环；已补成功、not-found、坏 `display_name` fallback、缺图标与 stage 漂移证据 payload 回归。
- [x] Windows 能力证据 CLI：新增 `pnpm -C "apps/core-app" run windows:capability:evidence -- --target WeChat --target Codex --target "Apple Music"`，输出 `windows-capability-evidence/v1`，汇总 PowerShell、Everything CLI、Everything 目标关键词查询、`Get-StartApps`、registry uninstall fallback、Start Menu `.lnk/.appref-ms/.exe`、`.lnk` target/arguments/workingDirectory 与目标应用命中情况；`--installer <path>` 只 dry-run 输出 NSIS/MSI handoff 命令并保持 `unattendedAutoInstallEnabled: false`，`windows:capability:verify` 可按 `--requireEverything --requireEverythingTargets --requireTargets --requireUwp --requireRegistryFallback --requireShortcutMetadata --requireApprefMs --requireShortcutArguments --requireShortcutWorkingDirectory --requireInstallerHandoff` 做硬门禁；Everything diagnostic 复算会同时拒绝 `ready` 与 enabled/available 不一致、available 但 backend=unavailable、active backend 不在 fallback chain、healthy 但 unavailable、available 状态仍残留 stale error、active backend 有 attempt error、backendAttemptErrors 不在 fallback chain 或错误文本为空、CLI backend 缺 `esPath/version` 的弱证据；当前 macOS 本机 smoke 输出 `skipped`，真实验收仍需 Windows 设备执行并归档 JSON。
- [x] Windows 验收 Manifest 复核：新增 `windows-acceptance-manifest/v1`、`windows:acceptance:template` 与 `windows:acceptance:verify`，可生成 blocked 初始清单并汇总复核 `windows-everything-file-search` / `windows-app-scan-uwp` / `windows-copied-app-path-index` / `windows-third-party-app-launch` / `windows-shortcut-launch-args` / `windows-tray-update-plugin-install-exit`，并要求每项包含 evidence path、verifier command、search trace、clipboard stress、更新安装手工项与常见 App 启动样本；其中 `windows-copied-app-path-index` 单独卡住复制 app path 加入本地启动区后的 app-index 诊断、`entrySource=manual / entryEnabled=true` managed entry 与 reindex 链路，`manualChecks.copiedAppPath` 还会卡住复制源、add-to-local-launch-area、本地启动区条目、reindex、搜索命中与从索引结果启动闭环；模板会写入 `verification.recommendedCommand` 作为最终强门禁命令；`--updateInstallMode auto` 可为更新 case 生成 `windows-auto-installer-handoff` 自动接管 verifier command，默认仍生成手动 `windows-installer-handoff` gate；`--writeManualEvidenceTemplates` 可按 `manualChecks.*.evidencePath` 非覆盖式写入 Markdown 手工证据模板；`--writeCollectionPlan` 可按 manifest 生成 `WINDOWS_ACCEPTANCE_COLLECTION_PLAN.md`，汇总 case evidence path、capability evidence 采集命令、替换为实际 evidence path 的 verifier command、性能采集/复核命令、manual evidence path 与最终 recommended gate，降低真机采证漏项；`--requireExistingEvidenceFiles` 可校验 case、性能证据与 manual evidence 文件真实存在，`--requireNonEmptyEvidenceFiles` 会拒绝目录或 0 字节 evidence 文件，`--requireCompletedManualEvidence` 会拒绝未勾选 checklist、无 checklist、Evidence 区缺少当前模板要求的关键字段或只填 `N/A/TODO/-` 等占位值的手工 Markdown，并输出未勾选数量与缺失 Evidence label；`--requireEvidenceGatePassed` 可要求 case evidence、search trace stats 与 clipboard stress summary JSON 的 `gate.passed=true`，并按 caseId 校验允许的 evidence schema/kind；acceptance 层会按 case 复算 Windows capability、App Index、Everything、Update、search trace 与 clipboard stress 的关键硬门禁，App Index 复算会拒绝 `matchedStages` 与 stage targetHit / target itemId / matchCount 不一致、suggested fields 与 app 不一致或 reindex path 漂移的 evidence，自动接管 update evidence 会按 `windows-auto-installer-handoff` 强制要求安装后版本与下载目标版本匹配，并复核 cached release tag/channel、matching asset 平台/架构/size 与 runtime target 一致，性能预算固定为 search trace 200 样本、first.result P95 ≤ 800ms、session.end P95 ≤ 1200ms、slowRatio ≤ 0.1，以及 clipboard stress 2 分钟 500/250ms、P95 ≤ 100ms、max scheduler ≤ 300ms、realtime queue peak ≤ 2、drop=0；search trace stats 会拒绝 paired/session/sample/slow counter 自相矛盾，clipboard stress summary 会拒绝无有效 clipboard 采样或 scheduler sample 超过 count；`clipboard:stress:verify` 最终命令必须携带 `--strict` 强制 `clipboard-stress-summary/v1` schema，避免弱参数或非标准 schema 子证据被误收；gate 失败会输出具体复算原因，便于定位 launchKind、bundle/appIdentity、query stage、reindex、checksum、安装后版本、release/asset 漂移、性能阈值或计数一致性缺口；`--requireCaseEvidenceSchemas` 可要求每个 required case 同时具备 Windows capability evidence 与对应专项 diagnostic evidence；`--requireVerifierCommandGateFlags` 可要求 manifest 内 verifier command、`performance.searchTraceStatsCommand` 与 `performance.clipboardStressCommand` 同步携带 release 固定门禁参数，并接受 update 手动接管/自动接管两套强 gate；`--requireRecommendedCommandGateFlags` 可要求 `verification.recommendedCommand` 同步携带最终强门禁参数、非空 evidence 文件门禁与 completed manual evidence 门禁；`--requireRecommendedCommandInputMatch` 可要求 recommended command 的 `--input` 指回当前 manifest 文件；`--requireCommonAppLaunchDetails` 可要求 common app 样本逐项确认可搜索、显示名正确、图标正确、可启动且启动后 CoreBox 立即隐藏，并要求每项写入 `evidencePath`；`--requireCopiedAppPathManualChecks` 可要求复制 app path 链路手工证据；`--requireUpdateInstallManualChecks` 可要求 Windows 更新 UAC、安装器启动/退出、应用退出释放占用、安装后版本、重启可用与失败回滚逐项确认并写入 `evidencePath`；`--requireDivisionBoxDetachedWidgetManualChecks` 可要求插件 widget 分离窗口逐项确认真实 pluginId、`initialState.detachedPayload` 水合、原始 query 保留、widget surface 渲染且未回退到错误搜索结果并写入 `evidencePath`；`--requireTimeAwareRecommendationManualChecks` 可要求空 query 推荐、早/午两个时段样本、首位推荐随时段变化、频率信号保留与 timeSlot/dayOfWeek 缓存隔离均写入模板关键字段证据。
  - 2026-05-11 acceptance 结构化字段、manual `evidencePath` 与 Markdown evidence 占位拒绝已补齐：`manualChecks.commonAppLaunch / copiedAppPath / updateInstall / divisionBoxDetachedWidget / timeAwareRecommendation` 的必填字符串字段、对应 `evidencePath`，以及 Markdown `## Evidence` 下的必填 label，不再接受 `<...>` 模板值、`N/A` / `NA` / `none` / `TODO` / `TBD` / `-` / `待补` / `无`，这些值会按缺失处理；`dayOfWeek` 继续要求 `0..6` 数字。
- [ ] DivisionBox detached widget 真机验收：`useDetach.test.ts` 已覆盖 pluginId 与 `detachedPayload` 构造，Windows acceptance template 已生成 `manualChecks.divisionBoxDetachedWidget`；仍需在真实设备上从插件 feature 搜索结果分离 widget，确认分离窗口打开、session pluginId 为真实插件、首帧读取 `initialState.detachedPayload`、原始 query 保留、widget 内容正常渲染且无错误搜索回退，并使用 `windows:acceptance:verify --requireDivisionBoxDetachedWidgetManualChecks` 归档。
  - 2026-05-11 detached URL 语义已收紧：`source` 必须指向真实插件 id，`providerSource` 保留 `plugin-features` provider id；fallback 搜索过滤兼容旧 `source=plugin-features` URL 与新 `source=<pluginId>` URL，避免 session state 缺失时混淆插件身份和 provider 路由。
  - 2026-05-11 acceptance 结构化字段已收紧：`manualChecks.divisionBoxDetachedWidget` 必须填写 expected/observed pluginId、detached URL `source` 与 `providerSource`；最终 gate 会复核 observed session pluginId 和 URL `source` 均等于真实 feature pluginId，且 `providerSource=plugin-features`。
  - 2026-05-11 手工证据字段已收紧：归档 Markdown 必须填写 observed/expected pluginId、`detachedPayload` itemId/query 与 no-fallback 日志摘录，不能只用泛化日志说明替代。
- [ ] 分时推荐真机验收：`recommendation-engine.test.ts` 已覆盖 production cache key、内存 cache 隔离、持久化 `recommendation_cache` 隔离、weekday 空样本、time-based 去重保留并提升最终 recommendation source、morning/afternoon 首位变化；Windows acceptance template 已生成 `manualChecks.timeAwareRecommendation`，仍需在真实 Windows 设备上采集空 query 推荐、早/午两个时段样本、首位推荐随时段变化、频率信号仍保留与缓存隔离证据，并使用 `windows:acceptance:verify --requireTimeAwareRecommendationManualChecks` 归档。
  - 2026-05-11 acceptance 结构化字段已收紧：`manualChecks.timeAwareRecommendation` 必须填写 morning/afternoon timeSlot、dayOfWeek、早/午 top item/provider source/recommendation source 与 frequent comparison item/provider source/recommendation source；最终 gate 会复核早/午 timeSlot 不同、dayOfWeek 合法、top recommendation 不同、早/午 source 为 `time-based` 且频率对照 source 为 `frequent`。
  - 2026-05-11 手工证据字段已收紧：归档 Markdown 必须填写 `timeSlot/dayOfWeek` cache key 与 recommendation trace 摘录，避免只靠截图证明早/午首位不同。
- [x] CoreBox 展示期 polling pressure 降载：`PollingService` 支持 reason/TTL 型全局 pressure，可按 lane 放大轮询间隔并限制并发；CoreBox 可见期间短时降低 realtime/io/maintenance/serial 后台 polling lane 的频率与并发，隐藏后清理，配合 `PerfContext` 只在 blocking 或近期 event-loop lag 下输出慢上下文告警，降低搜索交互窗口内的后台噪音和误报。
- [x] Search-index worker 空闲退出：FTS/keyword/file progress 单写者 worker 空闲 60 秒后自动回收；`SearchIndexWorkerClient` 保留 `dbPath`，下一次 `removeItems` / `persistAndIndex` / `upsertFiles` 等写任务会重新启动 worker、重新 init，再派发真实写入，降低无索引写入时的常驻线程占用。
- [ ] Windows App 索引真实设备验收：Everything/文件搜索、Start Menu `.lnk`、UWP/Store、registry uninstall fallback、坏 `display_name` 回退、`launchArgs/workingDirectory` 启动语义；App Index diagnostic JSON 可用 `pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input <evidence.json> --requireSuccess --requireQueryHit --requireLaunchKind uwp,shortcut,path --requireLaunchTarget --requireCleanDisplayName --requireIcon --requireReindex` 复核，verifier 会同时复算 stage 命中、目标 itemId、suggested fields 与 reindex path 一致性；shortcut 样本额外加 `--requireLaunchArgs --requireWorkingDirectory --requireCaseIds windows-shortcut-launch-args`。
- [ ] Windows 更新自动安装闭环：用户触发安装与受控自动 installer handoff 基础已补；默认 gate 仍用 `pnpm -C "apps/core-app" run update:diagnostic:verify -- --input <evidence.json> --requireAutoDownload --requireDownloadReady --requireReadyToInstall --requirePlatform win32 --requireInstallMode windows-installer-handoff --requireUserConfirmation --requireUnattendedDisabled --requireMatchingAsset --requireChecksums --requireCaseIds windows-tray-update-plugin-install-exit` 复核手动接管；开启自动接管的真机证据可用 `pnpm -C "apps/core-app" run windows:acceptance:template -- --updateInstallMode auto` 生成 manifest，并用 `--requireInstallMode windows-auto-installer-handoff --requireAutoInstallEnabled --requireUnattendedEnabled --requireInstalledVersionMatchesTarget` 复核 update evidence；acceptance case evidence 复算也会按 auto handoff 强制校验自动下载任务 id 非空、安装后版本匹配、目标版本一致、cached release channel/tag 与 matching asset runtime target 一致，避免只靠 verifier command 字段；仍需验证 UAC/权限提升、安装器退出、失败回滚与 acceptance manifest 归档后才可关闭。
  - 2026-05-11 acceptance 结构化字段已收紧：`manualChecks.updateInstall` 必须填写 update diagnostic evidence、installer path/mode、UAC、app exit、installer exit、installed version、app relaunch 与 failure rollback evidence；最终 gate 会在布尔项之外复核这些字段非空。
  - 2026-05-11 手工证据字段已收紧：更新安装 Markdown 必须填写 UAC prompt、app exit、installer exit、installed version、app relaunch 与 failure rollback evidence，不能只用 installer path/mode 或截图替代。
- [ ] Windows 常见应用搜索启动验证：微信、Codex、Apple Music 至少三类真实应用完成“可搜索、可显示正确名称/图标、可启动、CoreBox 可立即隐藏”验证；`windows:acceptance:template` 已生成 `manualChecks.commonAppLaunch.checks[]` 占位，最终复核使用 `windows:acceptance:verify --requireCommonAppLaunchDetails --requireCommonAppTargets WeChat,Codex,"Apple Music"` 卡住五项布尔检查。
  - 2026-05-11 acceptance 结构化字段已收紧：每个 common app check 必须填写 `searchQuery / observedDisplayName / iconEvidence / observedLaunchTarget / coreBoxHiddenEvidence`；最终 gate 会在五项布尔检查之外复核这些字段非空。
  - 2026-05-11 手工证据字段已收紧：每个目标 App 必须填写 observed display name、icon evidence、observed launch target 与 CoreBox hidden evidence，不能只用泛截图替代显示名/图标/隐藏验证。
- [ ] `2.4.10` 文档证据闭环：每轮清理同步 `CHANGES + TODO + compatibility registry`，并优先保留本地可复现命令；Release Evidence 凭证缺失时不伪造远端写入。

### 2.4.11 必须解决的问题

- [ ] Windows 阻塞级回归：Everything/文件搜索、应用扫描/UWP、托盘状态、更新包匹配、插件权限拦截、安装/卸载、退出资源释放。
- [ ] macOS 阻塞级回归：首次引导权限、OmniPanel Accessibility 门控、native-share 标记、托盘/dock 行为、更新安装、插件权限拦截、退出资源释放。
- [ ] Linux 非阻塞观察：记录 `xdotool` / desktop environment 限制与 smoke 结果；不作为 `2.4.11` release blocker。
- [ ] Release Evidence 写入闭环：具备 `release:evidence` API key 或管理员登录态后，将 docs guard、平台 matrix 与 CoreApp 定向回归结果写入 Nexus。
- [ ] Legacy/compat/size 清册退场：`scripts/legacy-boundary-allowlist.json`、`scripts/large-file-boundary-allowlist.json` 与 `compatibility-debt-registry.csv` 中 `2.4.11` 退场项必须关闭或显式降权。
- [ ] 超长文件治理：对仍高于 1200 行的 `growthExceptions` 文件给出拆分计划或降低到阈值以下。
  - 2026-05-08 已将 core-app 13 个 `size-growth-exception` 收敛为后续小任务口径；优先拆分候选为 `clipboard.ts`（capture/history/transport/autopaste）、`search-core.ts`（routing/provider orchestration/cache-result merge）、`plugin-module.ts`（lifecycle/runtime repair/surface wiring/registry）。
  - 2026-05-11 已完成 `clipboard.ts` 十块切片：capture freshness / diff helper / freshness store 迁到 `clipboard-capture-freshness.ts`，history persistence / cache / query / favorite/delete/image URL 迁到 `clipboard-history-persistence.ts`，typed transport handler 注册与 stream fanout 迁到 `clipboard-transport-handlers.ts`，copy/apply/paste 自动化与失败通知迁到 `clipboard-autopaste-automation.ts`，live image read / temp namespace / orphan cleanup / native image reconstruction 迁到 `clipboard-image-persistence.ts`，polling interval / 低电量策略迁到 `clipboard-polling-policy.ts`，native watcher env/load/start-stop 迁到 `clipboard-native-watcher.ts`，meta DB write / queue pressure/drop/fk 处理迁到 `clipboard-meta-persistence.ts`，stage-B enrichment 迁到 `clipboard-stage-b-enrichment.ts`，capture/persist 主流程迁到 `clipboard-capture-pipeline.ts`；`clipboard.ts` 已降到 `1143` 行并清退 size exception。
  - 2026-05-11 已清零 new oversized：Nexus `provider-registry.vue` 降到 `999` 行、`provider-registry.api.test.ts` 降到 `951` 行；CoreApp `windows-acceptance-manifest-verifier.ts` 降到 `1136` 行、`windows-acceptance-manifest-verifier.test.ts` 降到 `1156` 行，并拆出 `windows-acceptance-command-requirements.ts`、`windows-acceptance-evidence-verifier.test.ts` 与 manifest test helper。
  - 2026-05-11 `recommendation-engine.ts` 的错误日志 meta、day bucket、time context boost/relevance score 已迁到 `recommendation-utils.ts`，主文件降到 `1869` 行并退出 grown list；`search-core.ts` 的 provider/filter/cache key/telemetry/scene 纯 helper 已迁到 `search-core-utils.ts`，主文件降到 `2475` 行并退出 grown list；`app-provider.test.ts` 已迁出 hoisted mock/test harness 并降到 `1400` 行；`app-provider.ts` 已迁出 UWP/path/managed-entry 纯 helper与 source scanner facade，并降到 `3305` 行，growth exception cap 收紧到 `3306`；`deepagent-engine.ts` 已迁出附件归一、chat content 与 Responses input builder 到 `deepagent-input.ts`，主文件降到 `1791` 行，growth exception cap 收紧到 `1792`；`update-system.ts` 已迁出 update asset 打分/分类 helper 并降到 `1610` 行；`omni-panel/index.ts` 已迁出 builtin definitions 并降到 `1845` 行；`packages/intelligence-uikit/src/playground/App.vue` 已迁出 playground state composable 并降到 `919` 行；Nexus `useSignIn.ts` 已迁出 redirect helper 并降到 `1538` 行，`assistant.post.ts` 已迁出 request audit meta helper 并降到 `1762` 行，`tuffIntelligenceLabService.ts` 已迁出 Lab tool execution helper 并降到 `3408` 行，`telemetryStore.ts` 已迁出 telemetry sanitizer 并降到 `1502` 行，Nexus locale 已迁出 legal shard 并使 `en.ts/zh.ts` 低于 exception cap；`node scripts/check-large-file-boundaries.mjs --report` 当前 `newOversizedFiles=0`、`grownOversizedFiles=0`、`cleanupCandidates=0`。
- [x] CoreApp 验证收口：补跑 `typecheck:node` / `typecheck:web` / 定向测试并记录证据。
  - 2026-05-11 本地验证补证：`pnpm -C "apps/core-app" run typecheck:node` 通过；`pnpm -C "apps/core-app" run typecheck:web` 通过（tuffex build 阶段仍输出既有 deprecation / dts 诊断噪声但命令返回 0）；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard/clipboard-request-normalizer.test.ts" "src/main/modules/clipboard/clipboard-freshness.test.ts" "src/main/modules/clipboard/clipboard-capture-freshness.test.ts" "src/main/modules/platform/windows-acceptance-verify-script.test.ts" "src/main/modules/platform/windows-acceptance-manifest-verifier.test.ts" "src/renderer/src/modules/box/adapter/hooks/useDetach.test.ts" "src/main/modules/division-box/session.test.ts"` 通过（`67 tests`）。
- [ ] 搜索性能验收：按 `search-trace` 采样 200 次真实查询，确认 `first.result/session.end` P95 与慢查询占比达标。
  - 2026-05-09 已接通跨机器匿名搜索 telemetry 聚合：CoreApp 最终 `session.end` 上报 `firstResultMs/providerTimings/providerResults/providerStatus`，Nexus Admin Analytics Search 页新增 Provider Performance 表，支持查看 calls/avg/P95/max/results/errors/timeouts/slow rate；仍需真实设备样本跑满 200 次验收。
  - 当前完成边界：上报、聚合、展示、类型与定向测试已完成；`search:trace:stats -- --input <core-app-log-file> --output <stats.json> --minSamples 200 --strict` 可从目标设备日志生成可归档 stats，Windows acceptance template 已输出 `performance.searchTraceStatsCommand`；验收关闭条件是目标设备产出 `search-trace-stats/v1`，并用 `search:trace:verify -- --minSamples 200 --strict` 通过样本数、P95、slowRatio 与内部 metric 自洽门禁。
- [ ] 启动搜索压测：执行“全量索引 + 高频推荐 + 剪贴板图像轮询”，产出 2 分钟窗口内 lag/P95 证据；`clipboard:stress:verify` 已可复核 `clipboard:stress` summary 的 2 分钟窗口、500/250ms interval、scheduler delay P95/max、realtime queue peak、drop/timeout/error 门禁，但真实设备压测尚未执行。
- [ ] 文档治理：第二批历史文档统一加“历史/待重写”头标，Telemetry/Search/Transport/DivisionBox 长文档改造为 TL;DR 分层模板。
- [ ] Transport Wave A：MessagePort 高频通道迁移 + `sendSync` 清理。
- [x] Transport Wave A 指标拆分：把 raw send violation 与 retained `defineRawEvent` definition 分开统计；2026-05-10 已在 `transport-event-boundary.test.ts` 输出 `rawSendViolations`、`retainedRawEventDefinitions` 与 `typedMigrationCandidates`，并继续禁止三段 typed-builder 形态新增 raw definition。
- [x] Transport Wave A retained event 迁移第一批：2026-05-11 已迁移当前扫描到的三段 retained raw event：`system:permission:*` 与 `omni-panel:feature:*`，外部事件名保持不变；`typedMigrationCandidates` 当前为 `0`，retained raw definition 上限收紧到 `264`。
- [ ] Transport Wave A retained event 迁移后续批：继续梳理 CoreBox / terminal / auth / sync / opener；二段或特殊名称继续保留 raw definition，直到有明确 wire-name 迁移方案。
- [ ] Pilot Wave B：存量 typecheck/lint 清理 + SSE/鉴权矩阵回归。
- [x] Pilot Wave B 假值治理第一切片：`system/serve/stat` 已改用 Node runtime metrics，采集不完整时返回 degraded/unavailable reason；支付 mock/DUMMY 订单已由 `PILOT_PAYMENT_MODE=mock` 门控，非 mock 环境返回 `PAYMENT_PROVIDER_UNAVAILABLE`。
- [x] Plugin storage 治理第一切片：`plugins/touch-image` 图片历史路径已从 renderer `localStorage` 写入迁到 plugin storage SDK，固定 50 条上限，补一次性旧数据迁移、缩略图失败剔除与清理入口。
- [ ] 架构 Wave C：`plugin-module/search-core/file-provider` SRP 拆分。
  - 2026-04-26 Nexus 证据入口：新增 `/api/admin/release-evidence/*`，支持 run 创建/分页/详情、item upsert、平台阻塞 matrix 与 `doc-guard` 快速写入；管理员登录态或 `release:evidence` API key 可写入，CI 默认走 API key。
  - 2026-04-27 写入阻塞：当前本地环境未提供 `release:evidence` API key 或管理员登录态，只能先把 docs guard、Nexus build/smoke 与本机 CoreApp 验证结果同步到 `CHANGES`；拿到凭证后按同一证据载荷写入 `/api/admin/release-evidence/doc-guard` 与 matrix。
  - 2026-04-27 matrix caseId 固化：Windows required 使用 `windows-everything-file-search` / `windows-app-scan-uwp` / `windows-third-party-app-launch` / `windows-shortcut-launch-args` / `windows-tray-update-plugin-install-exit`；macOS required 使用 `macos-first-run-permissions` / `macos-omnipanel-accessibility` / `macos-native-share-tray-dock-update` / `macos-plugin-permission-install-update` / `macos-exit-resource-release`；Linux 仅写 `linux-best-effort-smoke` 且 `requiredForRelease=false`。
  - 2026-05-06 matrix 口径回归补强：Release Evidence API 测试已覆盖 Windows failed required case 进入 blockers、macOS passed required case 通过、Linux `best_effort + requiredForRelease=false` 不阻塞 release。
  - 2026-04-20 自动门禁：`git diff --check`、`pnpm docs:guard`、`pnpm docs:guard:strict`、`pnpm compat:registry:guard`、`node scripts/check-legacy-boundaries.mjs`、`pnpm network:guard` 已通过；`pnpm legacy:guard` 在 legacy/compat 子门禁通过后被既有 `size:guard` 大文件基线漂移拦截；CoreApp typecheck/test 待本地依赖安装后补证。
  - 2026-04-22 CoreApp 补证：补齐 `EverythingProvider` 的 `SDK -> CLI -> file-provider` 双重失效同次查询回退回归；`git diff --check`、`pnpm -C "apps/core-app" run typecheck`、`pnpm -C "apps/core-app" exec vitest run "src/main/modules/box-tool/addon/files/everything-provider.test.ts" "src/main/modules/box-tool/search-engine/search-core.regression-baseline.test.ts" "src/main/channel/common.test.ts"` 已通过。
  - 2026-04-23 renderer 权限中心死分支清理：删除未使用且仍保留旧 SDK “跳过权限校验”语义的 `PermissionStatusCard` / `PermissionRequestDialog` / `usePluginPermission`，同步移除 `PermissionStatusCard` 清册条目，并补齐当前 `compatibility-debt-registry` 漂移项；`pnpm -C "apps/core-app" run typecheck:web`、`pnpm compat:registry:guard`、`git diff --check` 已通过。
  - 2026-04-23 SearchLogger 旧配置键清理：`search-engine-logs-enabled` runtime fallback 已改成启动迁移到 `app-setting.ini`，并同步移除 `search-logger.ts` 的 compatibility registry 条目；`pnpm -C "apps/core-app" exec vitest run "src/main/modules/storage/search-engine-logs-setting-transfer.test.ts" "src/main/modules/box-tool/search-engine/search-logger.burst.test.ts"`、`pnpm -C "apps/core-app" run typecheck:node` 待本轮 `git diff --check` / `pnpm compat:registry:guard` 一并复核。
  - 2026-04-26 CoreApp capability 语义收口：FlowBus 未注册 delivery handler 的 target 改为 `TARGET_OFFLINE`，插件投递异常不再被吞成 delivered；`platform.flow-transfer` / `platform.division-box` / active-app 改为条件型 best-effort，并删除过度乐观的 `isActiveAppCapabilityAvailable()`；macOS notification 支持态不再误报为 granted。定向回归：`permission-checker.test.ts`、`capability-runtime.test.ts`、`flow-bus.test.ts`、`flow-trigger.test.ts` 已通过。

### A. 文档治理（本轮）

- [x] 六主文档日期统一到 `2026-05-09`。
- [x] 六主文档“下一动作”统一为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，剩余未闭环项进入 `2.4.11` 必解清单。
- [x] `CHANGES` 完成“近 30 天主文件 + 历史月度归档”拆分。
- [x] `README/INDEX` 入口压缩为高价值快照。
- [x] Phase 0：新增 `legacy:guard`（冻结新增 `legacy` 分支与 `channel.send('x:y')` raw event）。
- [x] Phase 0：建立 `scripts/legacy-boundary-allowlist.json`，存量兼容债务全部附 `expiresVersion=2.4.11`。
- [x] 统一治理 SoT：新增 `docs/plan-prd/docs/compatibility-debt-registry.csv`（固定字段与 owner/expires/test_case）。
- [x] 统一治理门禁：新增 `pnpm compat:registry:guard` + `pnpm size:guard`，并并入 `pnpm legacy:guard`。
- [x] 重构期 Guard 分层：`lint/lint:fix` 已与架构门禁解耦；`size:guard` 默认阻断新增/增长并报告历史未增长债务，`size:guard:report` 只输出全量报告，`size:guard:changed` 阻断 changed files 新增/增长，`size:guard:strict` 保留 release/milestone 全量阻断；`legacy:guard` 不再因历史 size debt 失败。
- [x] 统一主线验收入口：新增 `pnpm quality:gate` 聚合命令（`legacy/network/test:targeted/typecheck/docs`）。
- [x] 超长文件冻结：新增 `scripts/large-file-boundary-allowlist.json`（主线基线 `47` 个）。
- [x] 主线隔离：root workspace 与 root lint 默认仅覆盖 `core-app/nexus/pilot/packages/plugins`。
- [x] Sync 兼容壳行为固化：补充 `/api/sync/pull|push` 返回 410 的自动化测试断言。
- [x] 债务扫描口径显式化：主线改为显式白名单 + 漏扫报错 + `scanScope` 摘要输出。
- [x] 超长文件防漂移：`--write-baseline` 禁止自动上调，新增 `growthExceptions` 显式豁免机制。
- [x] `TODO` 主文件完成入口重排，当前优先级与 `2.4.11` 必解问题独立维护。
- [ ] 第二批历史文档统一加“历史/待重写”头标。

### B. Nexus 风控（已降权历史入口）

- [x] Phase 0：补齐设备授权风控验收证据（含回滚演练记录）。
- [x] Nexus 组件文档页卡死收口：组件同步表改走服务端轻量数据源，`TuffDemoWrapper` 改为按文档引用 demo 懒加载，`/docs/dev/components` 加入 prerender。
- [x] Nexus updates/Tuffex 回归收口：公共 updates 页首屏 `history=1` 查询状态与要闻空态继续复用 Tuffex；Release Evidence schema guard 改为按 D1 binding 实例隔离，避免新 binding 跳过建表。
- [x] Tuffex Agents 列表契约补强：`TxAgentsList` section/empty 文案可配置，`TxAgentItem` disabled 选择守卫与 Enter/Space 键盘选择已由组件测试固化。
- [x] Tuffex Checkbox 契约补强：`TxCheckbox` label/ARIA/labelPlacement/click/keyboard/disabled 行为已由组件测试固化。
- [x] Tuffex Checkbox 官网占位清理：Nexus 英文 Checkbox API、events 与 default slot 表改为真实使用说明，并复用既有 `checkbox.test.ts` 固定 label/ARIA/labelPlacement/click/keyboard/disabled 契约。
- [x] Tuffex Switch 契约补强：`TxSwitch` ARIA/size/click/keyboard/disabled 行为已由组件测试固化。
- [x] Tuffex Switch 官网契约硬裁切：Nexus 英文 Switch API 移除不存在的 `loading/medium` 口径，改为真实 `small/default/large` 尺寸、disabled 阻断与 update/change 事件说明。
- [x] Tuffex Button 语义 tone 契约补证：`type` 保留为当前 semantic tone alias，不再描述为 legacy/兼容旧用法；Nexus 中英文 Button 文档与 tuffex docs 同步说明 `variant` 优先、`type=text` 映射 `ghost`，并由 `button.test.ts` 固定映射行为。
- [x] Tuffex FlipOverlay 组件源码兼容噪声清理：单 overlay mask 注释改为当前 baseline 描述，不再使用 backward-compatible 叙述；`flip-overlay.test.ts` 继续固定多层 stack/透明度行为。
- [x] Tuffex FlipOverlay size exception 清退：`TxFlipOverlay.vue` 的 stack registry / shared global mask 逻辑迁出到 `flip-overlay-stack.ts`，组件从 `1344` 行降到 `1194` 行并低于 1200 阈值；`SIZE-GROWTH-2026-05-08-TUFFEX-FLIP-OVERLAY` 已从 allowlist 与 registry 删除。
- [x] Phase 1：速率限制、冷却窗口、审计日志与长期授权时间窗落地。
  - 新增 `auth_device_auth_audits` 结构化审计表，覆盖 request/approve/reject/cancel/revoke/trust/untrust；`GET /api/devices/audits` 可查询当前用户设备授权时间线。
  - `start`/`approve` 复用 `evaluateDeviceAuthRateLimit()`，按 10 分钟窗口约束 `device/IP/user`，并在连续 reject/cancel 达阈值后返回 `429 + retryAfterSeconds` 冷却。
  - 长期授权必须命中后端签名 session 的 10 分钟新鲜窗口；可信设备白名单使用 `auth_devices.trusted_at` 显式标记，Dashboard 设备页可信任/取消信任。
- [x] Phase 1：补齐风控告警策略与责任人值守说明。
- [x] 输出最小可复现门禁命令与发布前检查单。

### C. 文档门禁节奏

- [x] `docs:guard` 已在 CI 以 report-only 运行。
- [ ] 连续 5 次 `docs:guard` 零告警（升级 strict 前置条件之一）。
- [ ] 连续 2 周无“状态回退/口径漂移”冲突。
- [ ] 达成条件后将 CI 从 report-only 升级为 strict 阻塞。

### D. 本轮回滚预案（2026-03-16 Findings 修复）

- 回滚触发条件：
  - `apps/nexus` 在 Sentry server config 加载路径上出现异常（启动失败或配置未生效）。
  - `compat:registry:guard` 出现非预期 coverage 回退。
- 回滚步骤（提交粒度）：
  - 文件名回滚：`apps/nexus/sentry.server.config.ts` 按需恢复到异常旧名路径，仅用于应急回退验证。
  - 清册回滚：恢复本轮清理的两条 registry 行（`apps/pilot/shims-compat.d.ts`、`apps/nexus/i18n.config.ts`）。
  - 脚本回滚：撤销 `check-compatibility-debt-registry.mjs` 中 `registry-only domain` 改动。
- 回滚后必跑：
  - `pnpm compat:registry:guard`
  - `pnpm legacy:guard`
  - `pnpm quality:gate`

### E. Transport Legacy 清退清单（启动项，目标 2.4.11）

- 清单文档：`docs/plan-prd/docs/TRANSPORT-LEGACY-RETIREMENT-CHECKLIST-2026-03.md`
- [x] 第一轮入口收口完成：`legacy-transport-import` 从 `4 files / 4 hits` 降到 `0 files / 0 hits`。
- [x] hard-cut 完成：`packages/utils/transport/legacy.ts` 与 `packages/utils/permission/legacy.ts` 已物理删除，SDK legacy 出口下线。
- 现状说明：
  - 对外仅保留 `@talex-touch/utils/transport` / `@talex-touch/utils/permission` 正式入口，CI/Lint 已禁止 legacy import。
  - CoreApp renderer storage 业务消费已收口到 `~/modules/storage/app-storage`、`@talex-touch/utils/renderer/storage` 与 `useStorageSdk()`；`~/modules/channel/storage` 仅保留 bootstrap/兼容 re-export 边界。
- 统一替换策略：
  - 对外入口优先 `@talex-touch/utils/transport` typed SDK，不新增 legacy 导出。
  - legacy 仅保留读兼容和 warn-and-forward，不再承载新能力。
- 执行顺序（单链路）：
  - [x] `packages/utils/plugin/preload.ts` 与 `packages/utils/renderer/storage/base-storage.ts`（内部调用侧）。
  - [x] `apps/core-app/.../widget-registry.ts`（renderer 暴露面）。
  - [x] `packages/utils/index.ts`（统一出口重导向）。
  - [x] `2.4.11` 前移除 transport 中 legacy 兼容符号对外转出（本轮已提前完成）。
- 验收口径：
  - [x] `legacy-transport-import` = `0 files / 0 hits`。
  - [x] CoreApp renderer storage consumer import boundary 已由 `app-storage-boundary.test.ts` 固化。
  - `pnpm quality:gate` 全绿且无新增兼容债务。

### F. Pilot / Intelligence 长尾（已下沉）

- [x] Pilot 附件、管理配置、路由 V2、工具审计、Websearch、旧 UI 卡片流、多模态与模型组能力治理的历史完成事实已下沉到 `CHANGES` 与长期债务池，主清单不再展开逐项历史。
- [ ] Pilot strict 错误码端到端回归、SSE 反向代理部署烟测、`video.generate` 真实运行时与严格模式线上观测继续由长期债务池承载。
- Tuff 2.5.0 AI Plan PRD：`docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
  - 版本定位：桌面 AI 入口收口，不做大规模 AI runtime 重写，也不把 Nexus Provider/Scene runtime 编排列为 2.5.0 必交付。
  - Stable：CoreBox AI Ask、OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue、Desktop Context Capsule、默认 Nexus provider、BYOK 安全配置合同、审计用量最小字段。
  - P0 模板：剪贴板整理、会议纪要/摘要、文本批处理；模板必须支持保存、运行、历史、重跑与复制结果。
  - Beta：Tuff Intents / Action Manifest、Skills Pack、Background Automations 与 Pilot 高级 Chat / DeepAgent 联动。
  - Experimental：Assistant 悬浮球/语音唤醒、多 Agent 长任务面板、image/audio/video 生成编辑、Nexus Scene runtime orchestration。
  - 安全前置：provider metadata 可普通存储，API Key / secret 必须走 secure-store 或 `authRef`；审计默认不保存完整 prompt / response。
- 入口：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

### G. Nexus Provider 聚合与 Scene 编排（进行中）

- 权威 PRD：`docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- 核心原则：Provider 与 Scene 解耦；汇率、AI 大模型、文本翻译、图片/截图翻译统一进入 Provider registry，不再按场景维护孤立供应商模型。
- [x] Phase 1：类型模型与 registry 文档化，固定 Provider、Capability、Scene、Strategy、Metering 类型、迁移边界、错误码、数据表草案、质量约束与验收清单。
- [x] Phase 1.5：Nexus 通用 Provider / Scene registry 基础 API 与 Dashboard Admin 基础配置页已落地，支持 provider/capability/scene/strategy binding D1 registry、dashboard admin CRUD、capability 与 scene 查询、Provider 创建/状态/删除、Scene 创建/状态/删除、Scene dry-run/execute 测试面板、Provider/Scene 深编辑、Dashboard Admin 默认 seed 入口、普通登录态 `/api/v1/scenes/:id/run` runtime API 和明文密钥字段拒绝；腾讯云机器翻译已具备 `text.translate` live check、`text.translate` / `image.translate` / `image.translate.e2e` 最小 adapter 与 Scene run 最小执行入口；汇率 `fx.rate.latest` / `fx.convert` 已有 Scene adapter，可复用现有 `exchangeRateService` 并输出统一 usage/trace/ledger；CoreApp OmniPanel 划词翻译已优先走 `corebox.selection.translate` Scene，CoreBox 剪贴板图片动作已优先走 `corebox.screenshot.translate` direct `image.translate.e2e` Scene 并支持写回剪贴板或打开置顶窗口，置顶窗口可改走 Scene 默认 composed 链并展示 `overlay.render` 客户端 overlay payload；CoreBox 汇率预览与 `/api/exchange/latest` / `/api/exchange/convert` 已优先走 `corebox.fx.convert` / `corebox.fx.latest` Scene 且失败时保留兼容 fallback；Scene run 已写入 `provider_usage_ledger` 安全元数据并可在 Dashboard Usage 视图查询；Provider check 已写入 `provider_health_checks` 并可在 Dashboard Health 视图查询；AI mirror check 已覆盖 `chat.completion` 与 `vision.ocr`；Scene strategy 已从静态字段进入最小路由逻辑，`least_cost` 读取 binding/capability 成本字段，`lowest_latency` 读取最新 health latency，`balanced` 综合成本、延迟与权重；Intelligence provider 读取主路径已统一经 bridge 合并旧表与 Provider Registry 镜像；OpenAI-compatible AI mirror 已有默认 `vision.ocr` adapter；系统级本地 `overlay.render` provider 与 `corebox.screenshot.translate` Scene 已可幂等 seed；仍缺旧 `intelligence_providers` 表退场、user-scope AI mirror OCR 自动绑定策略与更完整的 success rate、配额、动态 pricingRef 策略。
- [x] Nexus Provider Registry Admin SRP 与 typed-route typecheck 收口：类型、选项常量、表单工厂与纯 helper 已迁出到 `app/utils/provider-registry-admin.ts`，页面状态、API action、edit/run panel 管理与 admin redirect 已迁出到 `app/composables/useProviderRegistryAdmin.ts`，`provider-registry.vue` 从约 `2026` 行降到 `999` 行并低于 `1200` 行阈值；Provider Registry API 测试 Mock D1 与 fixture 已迁出到 `server/api/dashboard/provider-registry/provider-registry-test-utils.ts`，`provider-registry.api.test.ts` 从 `1313` 行降到 `951` 行；Nexus 页面内触发 Nuxt typed route 递归推导的 `$fetch` 调用已切到 `ofetch` `rawFetch`，`pnpm -C "apps/nexus" run typecheck` 恢复通过。
- [ ] Phase 2：迁移汇率与 AI providers；汇率已补 `fx.rate.latest/fx.convert` Scene adapter，CoreBox 汇率入口和 `/api/exchange/*` 已优先走 Scene 并保留兼容 fallback；Nexus dashboard AI providers 写入侧已镜像到通用 Provider Registry，读取侧已经由 bridge 支持 dashboard list/sync/model list/probe/admin chat/docs assistant/lab runtime 消费 registry-only 镜像，能力归一到 `chat.completion` / `text.summarize` / `vision.ocr`；仍需旧 `intelligence_providers` 表退场、迁移脚本与回滚策略。
- [ ] Phase 3：新增 Nexus 翻译/图片翻译 Provider 配置入口并接入 provider，腾讯云 `text.translate` 与基于 `ImageTranslateLLM` 的 `image.translate` / `image.translate.e2e` 最小 adapter 已落地，CoreApp OmniPanel 划词翻译已接 `text.translate` Scene，CoreBox 剪贴板图片已接 direct `image.translate.e2e` 截图翻译 Scene 和置顶窗口；composed 编排、本地 `overlay.render` 客户端 overlay payload、OpenAI-compatible AI mirror `vision.ocr` 默认 adapter 与 Dashboard Admin seed 入口已落地，仍需补 user-scope AI mirror OCR 自动绑定策略与真实 provider 验证。
- [ ] Phase 4：Scene 配置、路由、审计、计费统一，覆盖截图翻译、划词翻译、CoreBox 汇率换算、AI Chat 与图片翻译 pin window。

### N. Core Main 修理进展（2026-03-23）

- 已完成启动链路 fail-fast：必需模块加载失败直接终止，不再发送 `ALL_MODULES_LOADED`。
- 已完成退出链路统一：`closeApp` + tray 退出分支移除运行时 `process.exit(0)`，统一走 `app.quit()`。
- 已完成 EventBus 契约补齐：`once` 消费生效、`emit/emitAsync` handler 级异常隔离、诊断指标可观测。
- 已完成 IPC 重复注册收敛：`dialogOpenFileEvent` 保留单一注册实现并维持 payload 兼容。
- 已补齐主进程回归用例与门禁命令：`vitest` 定向 19 tests + `typecheck:node` 均通过。
- 已完成生命周期收口补完：
  - 新增 `startup-health` 统一健康门禁（`loadStartupModules + waitUntilInitialized`）与失败阻断测试。
  - 新增 `before-quit` 8s 超时保险，确保异步 handler 卡死时仍能继续退出。
  - `ModuleManager` 增加 `reason/appClosing/duration/failedCount` 卸载观测，并暴露 `getLastUnloadObservation()`。
- 已完成 `$app` 去耦首轮：
  - 生命周期上下文新增 `ctx.runtime`（`MainRuntimeContext`）。
  - `plugin-module`、`UpdateService` 首批改为 runtime 注入读取，保留 1 迭代过渡兼容告警。
  - 新增静态守卫：`pnpm guard:global-app`，防止 `src/main/**` 新增 `$app` 直接读取。
- 已完成结构治理首轮（保持外部契约不变）：
  - `plugin-module` 抽取编排/IO 服务（orchestrator + io service）。
  - `file-provider` 抽取路径/查询服务。
  - `UpdateService` 抽取检查/下载/安装 action controller。
  - direct tests 已补齐并纳入 `pnpm test:core-main` 子集门禁。
- 下一轮待推进（P2）：
  - 继续压缩 `$app` allowlist 存量命中；
  - `plugin-module/file-provider/UpdateService` 进一步按编排层 + 领域层 + IO 层深拆，补齐剩余 direct tests。

### S. Core-App 兼容层激进硬切（2026-04-18）

- [x] 契约层硬切：插件 feature trigger 输入统一为 `TuffQuery`；OmniPanel deprecated toggle event/type 删除；旧 SDK 插件继续按 `SDKAPI_BLOCKED` 阻断。
- [x] 存储/协议硬切：prompt registry 成为唯一 prompt SoT；Store/Agent 忽略 legacy key；`touch-app` 仅认 `app-setting.ini`；legacy `tfile://` 与非 canonical update channel 不再兼容。
- [x] 鉴权硬切：移除明文 machine seed 与 renderer localStorage legacy 迁移；secure storage 不可用时进入显式 degraded session 模式。
- [x] Windows 文件搜索回补：普通查询优先 Everything，过滤/索引型查询直走 `file-provider`，Everything 不可用/禁用时自动 fallback。
- [x] 平台能力收敛：`native-share` 仅 macOS 标记 `supported`；Win/Linux 仅保留显式 `mail` 目标，不再冒充系统分享。
- [x] 正式 UI 去占位：布局页不再展示 disabled “Coming Soon” 卡片；`Publish to Cloud` 按钮移除。
- [x] 热点日志收敛：`file-provider` / `file-system-watcher` / `permission-store` / `tray-manager` / `file-protocol` 改走统一 logger。
- [ ] 验证收口：待当前 worktree 安装 `apps/core-app/node_modules` 后补跑 `typecheck:node` / `typecheck:web` / `test` 并记录证据。

### O. CoreApp 文件索引稳态修复（2026-03-25）

- [x] flush 链路改为 pending/inflight 可恢复队列，失败回补且保持“新数据优先”。
- [x] 定时 flush 统一调度入口并固定兜底，消除 `Unhandled rejection`。
- [x] `search-index-worker` 关键写路径补齐 `SQLITE_BUSY` 重试并统一 label。
- [x] `SearchIndexService` 索引/删除日志改为时间窗 summary，慢批次即时输出。
- [x] 补齐定向测试：flush 失败恢复、worker 重试、日志节流。

### P. CoreApp 兼容债务硬切（2026-03-23）

- [x] 跨平台一致性修复：Linux 权限探测路径按平台分流；更新资产平台/架构识别统一并显式 `unsupported`；AppImage 小写识别修复。
- [x] 权限系统硬切：删除 legacy `sdkapi` 放行路径，缺失/低版本统一 `SDKAPI_BLOCKED` 阻断；`allowLegacy` 配置移除。
- [x] Storage/Channel 硬切：主进程 legacy `storage:get/save/reload/save-sync/saveall` 处理移除，统一 `StorageEvents.app.*`；`window.$channel` 业务入口清零。
- [x] 插件 API 硬切：deprecated 旧暴露（含顶层 `box/feature` 兼容别名）下线，仅保留 `plugin.box`/`plugin.feature` 与 `boxItems` 新入口。
- [x] 占位能力补齐：`OfficialUpdateProvider` 改为真实接口探测，后端不可用返回 `unavailable + reason`；`AgentStore` 实装远端目录/下载/校验/解包/回滚/真实更新比对；`ExtensionLoader` 补齐 unload 生命周期。
- [x] 自动化验证：`typecheck` 通过；定向 `vitest`（权限门禁、平台识别、AgentStore、Extension unload）通过。
- [ ] Windows/macOS 阻塞级人工回归：首次引导权限、更新包匹配、插件权限拦截、Agent 安装升级卸载、退出资源释放。
- [ ] Linux 非阻塞 smoke：记录 `xdotool` / desktop environment 限制与 smoke 结果，不阻塞 `2.4.11`。

### Q. CoreBox 搜索性能优化（2026-03-23）

- [x] P0：输入防抖下调（`BASE_DEBOUNCE=80ms`），保持去重窗口 `200ms`。
- [x] P0：`SearchIndexService` 增加 `warmup()`，并在初始化补齐 `keyword_mappings` 复合索引（`provider+keyword`、`provider+item`）。
- [x] P0：`SearchEngineCore` 在查询入口记录搜索活跃时间，并在 init 阶段非阻塞预热索引服务。
- [x] P0：`file-provider` 语义检索改为预算内补召回（`query>=3 && candidate<20`）+ `120ms` 超时降级。
- [x] P1：app/file 精确词匹配改为批量 `lookupByKeywords`，减少逐 term SQL round-trip。
- [x] P1：`lookupBySubsequence` 增加扫描上限（默认 `2000` + SQL `LIMIT`），app 侧触发约束为 `candidate<5 && query<=8`。
- [x] P1：跨 provider 排序优先可见标题命中，plugin feature 隐藏 token/source 命中降为低置信召回信号，并限制隐藏 token/fuzzy-token/source fallback 的 frequency/recency 行为信号上限；App 标题前缀/词首/子串命中和精确/前缀别名 token 命中获得 intent bonus，避免搜索 App 时被中等频次或异常 recency 的 feature 抢占首位，同时保留极高频可见 feature 的自学习前置能力；已补 App 标题前缀/词首/子串/精确别名 token 命中优先于 hidden token 与中等频次 feature 标题命中的 `tuff-sorter` 回归，2026-05-11 追加中文 App 查询回归：`微信` App 标题命中会排在中等频次 `微信工具箱` plugin feature 前，并补充 `vscod -> vscode` 这类别名前缀查询回归、极高频可见 feature 仍可排在 App 精确别名前的反向边界，以及 `plugin-features-adapter` 元数据回归。
- [x] P1：推荐内存缓存按 context cache key 校验，跨 `timeSlot/dayOfWeek` 不复用旧推荐结果；同一 App 在当前 `timeSlot/dayOfWeek` 有历史使用记录时会获得时间上下文加权，且候选去重会保留后续 time-based 统计并把最终 recommendation source 提升为 `time-based`；当前 weekday 暂无样本时不再把时段相关性归零，保证不同时间段推荐不同 App 的信号能即时生效且可被 UI/验收证据识别；已补同一候选集在 morning/afternoon 下首位不同和 slot-only relevance 的推荐引擎回归。
- [x] P2：后台重任务避让搜索活跃窗口（最近 `2s` 有 query 时跳过一轮，后续 idle 自动补跑）。
- [x] P2：设备 idle gate 先判断系统 idle 再读取电量，not-idle 直接拒绝周期任务；电量状态增加 30 秒短 TTL 缓存与 in-flight 去重，并在供电状态变化时失效，避免 Windows 上后台索引/同步轮询反复触发 PowerShell 电量查询。
- [x] P2：DivisionBoxManager 内存压力轮询改为按需注册，只有存在 active/cached DivisionBox session 时才注册 `division-box.memory-pressure`，最后一个 session 销毁或缓存清空后注销任务，避免无 DivisionBox 窗口时仍常驻 30 秒轮询。
- [x] P2：FileProvider worker dashboard snapshot 增加 1 秒短 TTL 缓存，详情页短时间重复刷新时不再向 scan/index/reconcile/icon/thumbnail/search-index worker 重复发送 metrics 请求。
- [x] P2：新增 `search-trace-stats/v1` 统计口径、`pnpm -C "apps/core-app" run search:trace:stats -- --input <log-file> --output <stats.json> --strict` 与 `pnpm -C "apps/core-app" run search:trace:verify -- --input <stats.json> --minSamples 200 --strict` 本地入口，可从现有 `search-trace/v1` 日志行解析 `first.result/session.end`，输出样本量、P50/P95/P99、慢查询数量、慢查询占比与 provider 慢源归因，并对归档 stats JSON 重新执行 200 样本/P95/slowRatio 硬门禁；Windows acceptance template 已生成 `performance.searchTraceStatsCommand` 降低真机采样操作成本。
- [x] P2：`clipboard:stress` 新增 `--output <summary.json>` 精确输出入口，Windows acceptance template 已生成 `performance.clipboardStressCommand`，可直接产出 manifest 期望的 `clipboard-stress-summary.json`；真实性能验收仍需目标设备执行 2 分钟 500/250ms 压测并通过 `clipboard:stress:verify -- --strict`。
- [x] 单测：新增 `search-activity.test.ts`，覆盖活跃窗口判定行为。
- [ ] 验收：按 `search-trace` 采样 200 次真实查询，确认 `first.result/session.end` P95 与慢查询占比达标。
- [ ] 门禁：待仓库既有 `extension-loader.test.ts` 类型错误修复后，补跑并记录 `typecheck:node` 全绿证据。

### R. 启动搜索卡顿永久治理（2026-03-24）

- [x] 数据库分层：新增 aux 库（`database-aux.db`）并迁移高频/非核心写入表（analytics/recommendation/clipboard/ocr/report queue）。
- [x] 双库开关：新增 `TUFF_DB_AUX_ENABLED`、`TUFF_DB_QOS_ENABLED`、`TUFF_STARTUP_DEGRADE_ENABLED`。
- [x] 调度器 QoS：`DbWriteScheduler` 支持 `priority/maxQueueWaitMs/budgetKey/dropPolicy`，并内建标签策略与 busy 熔断。
- [x] 兼容读取窗口：关键路径支持“先查 aux，未命中回查 core”兜底（recommendation/analytics range/report queue/telemetry stats）。
- [x] 索引热路径单写者：`file-index.full-scan/reconcile/scan-progress` 改由 `search-index-worker` 统一落库。
- [x] 启动降载：analytics 写入失败指数退避；clipboard 在索引高压下动态降频并增加图片落库去抖。
- [x] 观测增强：队列分级深度、标签等待统计、drop/circuit 状态与 `SQLITE_BUSY` 比例输出。
- [x] 新增单测：`db-write-scheduler.test.ts` 覆盖优先级、丢弃策略、熔断开启/恢复。
- [x] 搜索性能上报链路补强：CoreBox 搜索最终态匿名上报 first-result 与 provider 明细，Nexus 聚合 provider slow/error/timeout/P95，并在 Admin Analytics Search 页展示 Provider Performance。
  - 完成范围仅限 telemetry 观测链路；200 次真实查询采样验收仍保留在“搜索性能验收”和本节“验收”待办中。
- [ ] 压测验收：执行“全量索引 + 高频推荐 + 剪贴板图像轮询”并产出 2 分钟窗口内 lag/P95 证据；`pnpm -C "apps/core-app" run clipboard:stress:verify -- --input <summary.json> --minDurationMs 120000 --requireIntervals 500,250 --maxP95SchedulerDelayMs <ms> --maxSchedulerDelayMs <ms> --maxRealtimeQueuedPeak <count> --maxDroppedCount 0` 已提供 summary 复核门禁。

---

## 📚 文档债务池（第二轮 + 第三轮摘要）

### 已处理

- [x] `OMNIPANEL-FEATURE-HUB-PRD`：标记为 historical done（2.4.8 Gate）。
- [x] `PILOT-NEXUS-OAUTH-CLI-TEST-PLAN`：改为“已落地 vs 未启动”结构。
- [x] `TUFFCLI-INVENTORY`：切换为 `tuff-cli` 主入口口径。
- [x] `NEXUS-SUBSCRIPTION-PRD` 与 `NEXUS-PLUGIN-COMMUNITY-PRD`：加历史降权头标。
- [x] 新增长期债务池文档：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`。

### 剩余

- [ ] Telemetry/Search/Transport/DivisionBox 四个长文档改造为 TL;DR 分层模板。
- [ ] `04-implementation` 目录继续清点 Draft 文档并标注有效状态。
- [ ] 抽样复核主入口链接可达性（归档后不得断链）。

---

## 🌊 分波次债务推进（W2-W4）

- [ ] Wave A（Transport）：MessagePort 高频通道迁移 + `sendSync` 清理。
- [ ] Wave B（Pilot）：存量 typecheck/lint 清理 + SSE/鉴权矩阵回归。
- [ ] Wave C（架构质量）：`plugin-module/search-core/file-provider` SRP 拆分。
- [ ] 每波固定产出：`CHANGES` 证据 + `TODO` 状态 + 可复现门禁命令集。

---

## ✅ 历史收口状态（仅保留事实）

- [x] `2.4.8 OmniPanel Gate`：已完成，保留 historical 记录。
- [x] `v2.4.7 Gate D`：历史资产回填已完成（run `23091014958`）。
- [x] `v2.4.7 Gate E`：按 historical done 关闭，不重发版。
- [x] `2.4.9-beta.4`：发布基线与 CI 证据已固化。
- [x] CLI Phase1+2：迁移完成，`2.4.x` shim 保留、`2.4.11` 退场。
- [x] Pilot Chat/Turn 协议硬切：`/api/chat/sessions/:sessionId/stream` 为唯一主入口，`/api/v1/chat/sessions/:sessionId/{stream,turns}` 已物理删除；历史 `pilot_quota_history.value` 已完成 base64 -> JSON 迁移并统一 JSON 读写。
- [x] Pilot run-event card 公共符号硬裁切：
  - `projectPilotLegacyRunEventCard` / `resolvePilotLegacyRunEventCardKeys` / `PilotLegacyRunEventCard*` 公共导出已改为 `projectPilotRunEventCard` / `resolvePilotRunEventCardKeys` / `PilotRunEventCard*`。
  - Pilot server quota snapshot、Pilot app stream card upsert 与对应测试已迁移到当前命名，测试文案不再描述 legacy pending key / legacy 时间线。
  - 实现文件已从 `legacy-run-event-card.ts` 物理重命名为 `run-event-card.ts`，包级 barrel 改为当前路径；未继续暴露 Legacy 命名 API。
- [x] Pilot completion stream 公共符号硬裁切：
  - `buildLegacyCompletion*` / `resolveLegacyUiStreamInput` / `handleLegacyCompletionExecutorResult` / `resolveLegacyConversationSeqCursor` 等公共符号已改为 `buildPilotCompletion*` / `resolvePilotUiStreamInput` / `handlePilotCompletionExecutorResult` / `resolvePilotConversationSeqCursor`。
  - Pilot app 主调用方、首页 replay cursor 与对应 stream contract/input 测试已迁移到当前命名；运行时 metadata source 从 `legacy-ui-completion*` 改为 `pilot-ui-completion*`。
  - `legacy-stream-*` 文件与对应测试已物理重命名为 `pilot-stream-*` / `pilot-completion-stream-contract.test.ts` / `pilot-stream-input.test.ts`；不再新增 Legacy 命名 API。
- [x] Nexus Intelligence provider dot-route 兼容壳硬裁切：旧 `:id.probe` / `:id.test` 410 shell 与 `intelligence-route-compat` middleware/test 已删除，仅保留当前 slash-route 主路径。
- [x] Startup Path Governance：启动 root path、目录创建、legacy dev data marker 迁移与启动观测已完成；详细实现留在 2026-03-23 历史记录。

---

## 🔗 长期债务入口

- 长期与跨版本事项见：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

---

## 📊 任务统计

| 统计项 | 数值 |
| --- | --- |
| 已完成 (`- [x]`) | 309 |
| 未完成 (`- [ ]`) | 49 |
| 总计 | 358 |
| 完成率 | 86% |

> 统计时间: 2026-05-11（按本文件实时 checkbox 计数）。

---

## 🎯 下一步（锁定）

1. 完成 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口` 文档化与清册闭环。
2. 按 Windows/macOS 阻塞级回归清单补齐人工证据；Linux 仅记录 best-effort smoke。
3. `Nexus 设备授权风控` 保留实施文档与历史入口，降为非当前主线。
4. `docs:guard` 连续零告警后，再升级 strict 阻塞策略。
