# Tuff 项目待办事项

> 从 PRD 文档提炼的执行清单（压缩版）
> 更新时间: 2026-05-08

---

## 🧭 单一口径矩阵（2.4.10 -> 2.4.11）

| 主题 | 当前事实 | 下一动作 | 强制同步文档 |
| --- | --- | --- | --- |
| 版本主线 | 当前工作区基线为 `2.4.10-beta.14` | `2.4.10` 优先解决 Windows App 索引与基础 legacy/compat；剩余未闭环项进入 `2.4.11` 必解清单 | `TODO` / `README` / `INDEX` / `CHANGES` |
| Windows App 索引 | Start Menu、UWP、registry uninstall 与 `launchArgs/workingDirectory` 已有回归覆盖，但仍缺真实 Windows 设备体验证据 | `2.4.10` 完成微信/Codex/Apple Music 等真实应用搜索与启动验证，并记录失败证据 | `TODO` / `README` / `INDEX` / `CHANGES` |
| Legacy/兼容/结构治理 | 已锁定统一实施 PRD（五工作包并行），清册退场目标统一前移到 `2.4.11` | 清册中的 `2.4.11` 项必须关闭或显式降权，不再新增 legacy 分支/raw channel/旧 storage protocol/旧 SDK bypass | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
| CoreApp 平台适配 | `2.4.11` 前 Windows/macOS 为 release-blocking；Linux 保留 documented best-effort | Windows/macOS 完成阻塞级人工回归；Linux 仅记录 `xdotool` / desktop environment 限制与非阻塞 smoke | `TODO` / `README` / `INDEX` / `CHANGES` / `Roadmap` / `Quality Baseline` |
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

### CoreApp 兼容治理（当前进行中）

- [x] P0 Runtime Accessor / Sync IPC / Active Legacy Bridge hard-cut 主体完成。
- [x] P1 secure-store dedupe 收口到 `src/main/utils/secure-store.ts`。
- [x] P1 renderer update runtime 调用方迁移到 update SDK 薄运行时层，runtime 页面不再依赖 `useApplicationUpgrade`。
- [x] P2 fake prompt / DivisionBox settings 假入口清理完成。
- [x] P2 production `src` 下 demo/test/doc 文件物理删除，并清理 `components.d.ts` 悬空声明。
- [x] CoreApp compatibility 验收阻塞解除：
  - `pnpm -C "apps/core-app" run typecheck` 已通过。
  - `pnpm -C "apps/core-app" exec vitest run "src/main/modules/clipboard.transport.test.ts" "src/main/modules/omni-panel/index.test.ts" "src/main/channel/common.test.ts"` 已通过（`3 files / 17 tests`）。
  - `rg` 回归扫描确认 runtime 口径仅保留 bootstrap `genTouchApp()`，`sendSync(` / `resolveRuntimeChannel(` / `legacy-toggle` / placeholder demo 命中已清零。
- [x] Windows Everything 搜索收口：
  - Everything provider 支持搜索取消、CLI CSV 稳健解析、多词查询透传、SDK 目录结果元数据保留。
  - SearchCore 明确 `@everything` / `@file` 路由语义，并修复同文本不同输入复用缓存的问题。
  - 已补 targeted regression：Everything provider 与 SearchCore baseline。
- [x] Clipboard 插件预览链路收口：
  - Clipboard SDK `history.onDidChange()` 对旧版 plugin transport stream 同步抛错做 non-fatal 降级。
  - clipboard-history 详情页优先解析 `meta.image_original_url` / `getHistoryImageUrl(id)`，原图不可用时显式展示缩略图降级状态。
- [x] Clipboard 自动粘贴失败诊断收口：
  - `copyAndPaste` / `applyToActiveApp` 失败结果保留 message/code，插件 UI 不再只显示泛化失败。
  - 主进程自动粘贴失败日志只记录安全元数据；macOS System Events 权限错误映射为可读授权提示。
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
  - permission JSON->SQLite、dev data root migration、theme localStorage migration 与 download legacy migration manager 已从启动/runtime 主路径移除，不再保留 migration exception。
- [ ] Windows App 索引真实设备验收：Everything/文件搜索、Start Menu `.lnk`、UWP/Store、registry uninstall fallback、坏 `display_name` 回退、`launchArgs/workingDirectory` 启动语义。
- [ ] Windows 常见应用搜索启动验证：微信、Codex、Apple Music 至少三类真实应用完成“可搜索、可显示正确名称/图标、可启动、CoreBox 可立即隐藏”验证。
- [ ] Windows App 诊断证据导出：使用 app-index diagnostic evidence 记录命中路径、关键词、FTS/N-gram/subsequence 命中情况与失败原因。
- [ ] `2.4.10` 文档证据闭环：每轮清理同步 `CHANGES + TODO + compatibility registry`，并优先保留本地可复现命令；Release Evidence 凭证缺失时不伪造远端写入。

### 2.4.11 必须解决的问题

- [ ] Windows 阻塞级回归：Everything/文件搜索、应用扫描/UWP、托盘状态、更新包匹配、插件权限拦截、安装/卸载、退出资源释放。
- [ ] macOS 阻塞级回归：首次引导权限、OmniPanel Accessibility 门控、native-share 标记、托盘/dock 行为、更新安装、插件权限拦截、退出资源释放。
- [ ] Linux 非阻塞观察：记录 `xdotool` / desktop environment 限制与 smoke 结果；不作为 `2.4.11` release blocker。
- [ ] Release Evidence 写入闭环：具备 `release:evidence` API key 或管理员登录态后，将 docs guard、平台 matrix 与 CoreApp 定向回归结果写入 Nexus。
- [ ] Legacy/compat/size 清册退场：`scripts/legacy-boundary-allowlist.json`、`scripts/large-file-boundary-allowlist.json` 与 `compatibility-debt-registry.csv` 中 `2.4.11` 退场项必须关闭或显式降权。
- [ ] 超长文件治理：对仍高于 1200 行的 `growthExceptions` 文件给出拆分计划或降低到阈值以下。
- [ ] CoreApp 验证收口：补跑 `typecheck:node` / `typecheck:web` / 定向测试并记录证据。
- [ ] 搜索性能验收：按 `search-trace` 采样 200 次真实查询，确认 `first.result/session.end` P95 与慢查询占比达标。
- [ ] 启动搜索压测：执行“全量索引 + 高频推荐 + 剪贴板图像轮询”，产出 2 分钟窗口内 lag/P95 证据。
- [ ] 文档治理：第二批历史文档统一加“历史/待重写”头标，Telemetry/Search/Transport/DivisionBox 长文档改造为 TL;DR 分层模板。
- [ ] Transport Wave A：MessagePort 高频通道迁移 + `sendSync` 清理。
- [ ] Pilot Wave B：存量 typecheck/lint 清理 + SSE/鉴权矩阵回归。
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

- [x] 六主文档日期统一到 `2026-05-08`。
- [x] 六主文档“下一动作”统一为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，剩余未闭环项进入 `2.4.11` 必解清单。
- [x] `CHANGES` 完成“近 30 天主文件 + 历史月度归档”拆分。
- [x] `README/INDEX` 入口压缩为高价值快照。
- [x] Phase 0：新增 `legacy:guard`（冻结新增 `legacy` 分支与 `channel.send('x:y')` raw event）。
- [x] Phase 0：建立 `scripts/legacy-boundary-allowlist.json`，存量兼容债务全部附 `expiresVersion=2.4.11`。
- [x] 统一治理 SoT：新增 `docs/plan-prd/docs/compatibility-debt-registry.csv`（固定字段与 owner/expires/test_case）。
- [x] 统一治理门禁：新增 `pnpm compat:registry:guard` + `pnpm size:guard`，并并入 `pnpm legacy:guard`。
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
- 入口：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

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
- [x] P2：后台重任务避让搜索活跃窗口（最近 `2s` 有 query 时跳过一轮，后续 idle 自动补跑）。
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
- [ ] 压测验收：执行“全量索引 + 高频推荐 + 剪贴板图像轮询”并产出 2 分钟窗口内 lag/P95 证据。

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
  - 当前仅保留实现文件名 `legacy-run-event-card.ts` 作为待确认的物理文件移动事项；未继续暴露 Legacy 命名 API。
- [x] Pilot completion stream 公共符号硬裁切：
  - `buildLegacyCompletion*` / `resolveLegacyUiStreamInput` / `handleLegacyCompletionExecutorResult` / `resolveLegacyConversationSeqCursor` 等公共符号已改为 `buildPilotCompletion*` / `resolvePilotUiStreamInput` / `handlePilotCompletionExecutorResult` / `resolvePilotConversationSeqCursor`。
  - Pilot app 主调用方、首页 replay cursor 与对应 stream contract/input 测试已迁移到当前命名；运行时 metadata source 从 `legacy-ui-completion*` 改为 `pilot-ui-completion*`。
  - 当前仅保留 `legacy-stream-*` 文件名作为待确认的物理文件移动事项；不再新增 Legacy 命名 API。
- [x] Startup Path Governance：启动 root path、目录创建、legacy dev data marker 迁移与启动观测已完成；详细实现留在 2026-03-23 历史记录。

---

## 🔗 长期债务入口

- 长期与跨版本事项见：`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`

---

## 📊 任务统计

| 统计项 | 数值 |
| --- | --- |
| 已完成 (`- [x]`) | 262 |
| 未完成 (`- [ ]`) | 37 |
| 总计 | 299 |
| 完成率 | 88% |

> 统计时间: 2026-05-08（按本文件实时 checkbox 计数）。

---

## 🎯 下一步（锁定）

1. 完成 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口` 文档化与清册闭环。
2. 按 Windows/macOS 阻塞级回归清单补齐人工证据；Linux 仅记录 best-effort smoke。
3. `Nexus 设备授权风控` 保留实施文档与历史入口，降为非当前主线。
4. `docs:guard` 连续零告警后，再升级 strict 阻塞策略。
