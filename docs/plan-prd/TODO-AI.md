# Tuff AI Stable TODO

> 更新时间：2026-07-13
> 范围：Roadmap R2 / AI 2.5.0 Stable。主验收矩阵以 `04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md` 为准。

## 当前口径

- Stable 只覆盖 CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、provider routing 与固定失败路径。
- OmniPanel Writing Tools、Workflow、Review Queue、Skills、Automation、Assistant 继续按 Beta / Experimental evidence 追踪。
- focused tests、schema、mock provider、dry-run、CDP raw 诊断不能替代 packaged Electron 体验证据。

## 已完成

- `AI-STABLE-01/02/03/04/05/06/07/08` 已绑定独立 packaged probe JSON + PNG artifact。
- CoreBox AI Ask packaged surface 已标记 `passed`。
- `corebox-search-states` packaged surface 已标记 `passed`：R2D 覆盖 idle、searching/warm-up、no-result retry/File Index settings 可接受截图；R2I 覆盖真实 result source/status/reason pills。
- `app-index-workbench` packaged surface 已标记 `passed`：Settings -> File Index -> App Index Manager 覆盖 summary counts、6 类 source filters、found/unchecked/disabled/attention diagnostic filters 与 filtered-empty state。
- `browser-login-recovery` packaged surface 已标记 `passed`：覆盖 browser-open failure waiting session、manual login URL copy、short code copy、timeout retry 文案与 network failure copy JSON。
- `omnipanel-writing-tools` packaged surface 已标记 `passed`：覆盖 selected-text context / recovery hint、writing actions、AI result preview、Retry / Copy / Replace Clipboard 与 replace confirmation。
- `provider-migration-evidence` surface 已标记 `passed`：覆盖 Nexus local-only dry-run migration summary、readiness/blockers/counts、secret redaction 与 dry-run 不声明 registry-primary readiness 边界。
- `assistant-floating-ball-entry` surface 已标记 `passed`：packaged evidence 覆盖 Settings 中 Assistant enabled + voice wake disabled、悬浮球可见且不抢焦点、拖动位置重启后持久化、点击打开 Voice Panel。
- `assistant-screenshot-translate` surface 已标记 `passed`：packaged evidence 覆盖 Settings 开关、剪贴板图片翻译入口、翻译结果窗口、空剪贴板与 provider fallback。
- `workflow-use-model-review-queue` surface 已标记 `passed`：packaged evidence 覆盖 Review Queue pending/failed 队列态、Use Model 输出、成本/trace 信号与失败恢复。
- `provider-registry-observability` surface 已标记 `passed`：packaged evidence 覆盖 provider health、scene latest run/recent failure、状态 filter 与 next-action hint。
- 2026-07-13 默认 Nexus provider 的 CoreBox stream 已从 buffered compatibility 升级为已认证 `/api/v1/intelligence/stream` token SSE：CoreApp 解析 split UTF-8 SSE，逐 delta 保留实际 `traceId/provider/model/latency`，terminal usage 只发一次；Nexus 继续执行 provider quota/request audit、credits billing 与 usage ledger。provider retry/fallback 只允许发生在首个可见 delta 前，输出后失败直接 fail-closed，避免重复回放；guest 仍在网络前返回 `NEXUS_AUTH_REQUIRED`。当前只有 focused contract，不替代登录态 packaged success recapture。
- 2026-07-13 CoreApp Intelligence quota guard 已移除存储异常时的 fail-open：`checkQuota()` 失败统一抛出 `QUOTA_CHECK_UNAVAILABLE`，带稳定 reason/recovery；caller-scoped `invoke()` / `stream()` 在 provider 执行前阻断。CoreBox / OmniPanel recovery classifier 优先识别该基础设施故障，展示“配额校验暂不可用 + 检查存储/配置”，不再误导用户检查 credits/team quota；普通 `quota_exceeded` 仍保持原恢复语义。focused contract 已覆盖 direct check、invoke、stream、normalizer 与 renderer recovery。
- 2026-07-13 Assistant image translation 已补 shared `IntelligenceErrorCode` 端到端合同：scene、clipboard、screenshot degraded reason、OCR/text fallback 均保留 typed `code/reason/recovery`，VoicePanel 按本地化 recovery 展示登录/quota/provider 等语义；`INVALID_REQUEST` / `UNKNOWN` 保持可见但不误导用户打开 Intelligence settings。opaque stage error 继续使用兼容错误码。
- Official `touch-intelligence@1.2.0` 与 CoreBox signal metadata 已切换 canonical AI failure codes：移除 plugin `AUTH_REQUIRED` / `QUOTA_EXCEEDED` 输出别名，保留 quota verification 与 quota exhausted 优先级，补齐 network/invalid/capability 映射和中英文 next-action。plugin packaged build 已验证。
- Nexus Intelligence transport 已统一 canonical `code/message/reason/recovery`：SSE error frame 覆盖 pre/post-delta；`/invoke` 将 auth/validation/quota/provider/network 等失败映射为语义 HTTP status + canonical body，并显式 opt in `captureErrorResponseData` 后从 `NetworkHttpStatusError.responseData` 恢复 typed Error。guest/tokenMode guest preflight 也在零网络请求下保留 exact auth code/reason/recovery，不再只抛 message。generic network request 默认不解析/保留远端 error body，malformed legacy body 保留原始 HTTP error；retry/cooldown 失败语义不变。
- Dashboard Agent 流式路径已按当前仓库纠偏并补 smoke：实际入口是 `/api/admin/intelligence-agent/session/stream`，首个 graph event 在后续 gate 与 graph completion 前即可从真实 `Response.body` 读取，后续 event + 唯一 done 保持顺序；historical `/api/chat/sessions/:sessionId/stream` 与 `fromSeq + follow` 均不属于当前实现，历史恢复使用 trace GET 的 `fromSeq + limit`。
- Admin Intelligence 7 天 analytics 的 runtime source 漂移已修复：所有当前 writer 使用 `intelligence-agent-runtime`，但 store 仍只查询 legacy `intelligence-lab-runtime`，导致当前 Agent runs 从 Dashboard 消失；`listRuntimeAudits()` 现同时读取 current + legacy source，保留历史数据。`AIAPP_STRICT_MODE_UNAVAILABLE` 在当前仓库无 producer，后续 observability 应基于 canonical `errorCode`，不再围绕失效 label 建告警。
- `/api/admin/analytics/intelligence?days=N` 现从 current/legacy runtime audits 的 explicit `metadata.errorCode` 或结构化 `metadata.error` 派生 canonical `errorCodeDistribution`，仅统计 failed runs，按 count/code 稳定排序，并在 recent failed run 附 code；成功记录中的 stale error metadata 不计入，response 不暴露 raw message/stack。告警 threshold 与 Dashboard 分布可视化仍保持开放。
- Nexus buffered/stream provider attempt 失败 audit 已显式写入 canonical `metadata.errorCode`，复用 HTTP/SSE 同一 normalizer；generic provider failure 为 `UNKNOWN`，provider request quota 为 `QUOTA_EXHAUSTED`，retry/fallback 与原始 errorMessage 行为不变。成功调用的 usage ledger 与 failed attempt audit 职责在 PRD 中已明确区分，不再笼统声称失败一定进入 usage ledger。
- Agent graph 与 legacy runtime model failure 已统一通过 Nexus canonical normalizer 输出 `code/message/reason/recovery`，并在 failed audit metadata 显式记录 `errorCode`；新 SSE frame、持久化 runtime trace 与 audit 不再复制 Error stack/cause/name/任意 enumerable secret。outer Admin Agent stream rejection与 historical trace GET 的 legacy root/nested error 都在 response boundary 清洗；历史存储保持只读、不做写回。
- Plugin Intelligence quota/usage control plane 已收紧为 host-owned：facade 隐藏 `get/set/delete/getAll/checkQuota` 与 `getCurrentUsage`，raw typed event 在 storage/validation 前返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`；普通 plugin `invoke/stream` 的 caller 强制绑定为 `plugin:<transport plugin id>`，不能靠缺失/伪造 metadata caller 绕过或跨插件计费。宿主 domain SDK 与内部 invoke-time quota check 保持不变。
- Plugin autonomous Intelligence execution 已从 `intelligence.basic` 分离：generic `agent.run` / `workflow.execute` invoke/stream、`autoRunGraph` session 与 direct workflow run 在 runtime/provider/tool 前统一 fail-closed 检查 `intelligence.agents`；普通 chat、inert session 与 host path 保持。permission runtime unavailable/denied 使用稳定 `INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE` / `INTELLIGENCE_AGENTS_PERMISSION_DENIED`。
- Plugin Intelligence provider/admin surface 已收紧：facade 与 raw typed handlers 都阻断 provider test、capability smoke、model fetch、cross-caller audit/usage stats 和 local environment scan，避免 network/cost bypass 与本机路径泄露；`getCapabilityStatus` / `getProviderModelOptions` / `getCapabilityTestMeta` 仍为 plugin-safe read-only discovery，host domain SDK 不变。
- Plugin alternate provider paths 已补 caller governance：`chatLangChain` / `ttsSpeak` 与 generic invoke/stream 一样覆盖缺失或伪造 caller 为 verified `plugin:<id>`，host metadata 保持原样；TTS cache key 额外包含 caller，避免跨 caller 复用 trace/result 或把插件成本归到 system/anonymous。
- Plugin local knowledge 已补 actor namespace：四个 index/search/build typed handlers 都覆盖 payload `permissionScope` 为 verified `plugin:<id>`，explicit/implicit document 与 chunk references deterministic 按插件隔离，返回 document id 可安全用于追加 chunk；host payload identity 与显式 scope 语义不变，插件不能再用 omitted/default/other scope 搜索全部 FTS rows 或覆盖 host/其他插件 id。
- DeepAgent token usage 不再硬编码为 0：adapter 归一 OpenAI Responses root usage 与 LangChain AIMessage `usage_metadata`（含 kwargs/response metadata 常见形态且不重复计数），`agent.run`、prompt/agent step output 与 workflow 顶层 aggregate 逐层保留，stable model step usage 也纳入；仅所有 step 都无 usage 时显式为零。
- `video.generate` backlog 已按代码事实扩展：当前 `IntelligenceCapabilityType`、payload/result、typed SDK domains、Nexus/CoreApp provider runtime 与 UI 均无该 capability；这不是单一 provider adapter 缺口。视频生成通常是异步长任务，后续必须把 job status/progress/cancel/artifact 与 quota/audit 一起设计并完成真实 provider 成功路径后再公开 SDK，不能先交付 unsupported wrapper。
- Default Nexus TTS 假阳性已移除：shared/provider defaults 曾同时把 `audio.tts` 声明为 `tuff-nexus-default` capability 并设为首选 binding，但 Nexus server 的显式合同会在 provider 调用前以 unsupported fail-closed。fresh defaults 与 persisted config migration 现都移除 Nexus TTS capability/binding，保留 OpenAI/SiliconFlow 的真实 `/audio/speech` runtime；避免 UI 显示 available 后稳定失败。
- 已覆盖：
  - text.chat success
  - OCR handoff success
  - logged-out fail-closed
  - provider unavailable
  - quota exhausted
  - model / capability unsupported
  - copy failure remains visible
  - Local/Ollama routing
- packaged startup hot/cold benchmark 已 passed。
- startup first-screen evidence 已 passed。
- historical artifact gate 仍为 `gate.passed=true`、13/13 required surfaces `passed`，且 72 个唯一 artifact 均存在/非空；但 manifest `baselineVersion=2.4.12-beta.8`，当前 CoreApp 为 `2.4.13-beta.6`。2026-07-13 新增 `--requireCurrentVersion` 后当前版本门禁明确失败，必须 recapture/update baseline 后才能重新称为“当前 strict gate passed”。

## 状态明细

| 主题                              | 状态                   | 缺口                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corebox-search-states`           | closed                 | 2026-06-22 R2D/R2I packaged evidence 已覆盖 idle、searching/warm-up、no-result retry/File Index settings 与 result source/status/reason pills；普通 `core-box` 从 `720x56` resize 到 `720x242`。                                   |
| `app-index-workbench`             | closed                 | 2026-06-24 packaged Settings UI evidence 已覆盖 summary counts、UWP/Store、Steam、shortcut、protocol、AppRef、path filters，found/unchecked/disabled/attention states 与 filtered-empty distinction；diagnostic JSON gate 已通过。 |
| `browser-login-recovery`          | closed                 | 2026-06-24 packaged evidence 已覆盖 browser-open failure waiting session、manual login URL copy、short code copy、timeout retry 文案与 network failure copy JSON。                                                                 |
| `omnipanel-writing-tools`         | closed                 | 2026-06-24 packaged evidence 已覆盖 selected-text context / recovery hint、5 个 writing actions、AI result preview metadata、Retry / Copy / Replace Clipboard 与 replace confirmation。                                            |
| `provider-migration-evidence`     | closed                 | 2026-06-24 Nexus local-only dry-run evidence 已覆盖 migration summary、planning readiness、blocker/counts、secret redaction 与 dry-run 不声明 registry-primary readiness；不代表生产 registry-primary ready。                      |
| `assistant-floating-ball-entry`   | closed                 | 2026-06-24 packaged probe 已覆盖 Assistant enabled + voice wake disabled、悬浮球可见且不抢焦点、拖动位置重启后持久化、点击打开 Voice Panel。                                                                                       |
| `assistant-screenshot-translate`  | closed                 | 2026-06-24 packaged evidence 已覆盖 Settings、clipboard image translate start/result、empty clipboard 与 provider fallback；截图翻译后续进入产品化 polish。                                                                        |
| `workflow-use-model-review-queue` | closed                 | 2026-06-24 packaged evidence 已覆盖 pending / failed queue、Use Model output、runtime cost/trace 与恢复文案。                                                                                                                      |
| `provider-registry-observability` | closed                 | 2026-06-24 packaged evidence 已覆盖 provider health、scene latest run/recent failure、状态 filter 与 next-action hint。                                                                                                            |
| Broader visible surfaces          | historical closed      | 2026-06-24 manifest 的 13/13 surfaces passed；不代表 `2.4.13-beta.6` 已复采。                                                                                                                                                      |
| Global visible gate               | current recapture open | artifact/schema/tag/file gate 历史通过；`--requireCurrentVersion` 当前以 `2.4.12-beta.8 != 2.4.13-beta.6` fail-closed。                                                                                                            |
| AI Beta surfaces                  | open                   | Workflow Use Model、Review Queue、Assistant、Agent 工具执行等不反向阻塞 CoreBox Stable。                                                                                                                                           |

## Strict gate 闭环分组

| Surface                           | Artifact count | 摘要                                                                                         |
| --------------------------------- | -------------: | -------------------------------------------------------------------------------------------- |
| `assistant-screenshot-translate`  |              6 | packaged Assistant image translate probe + Settings/start/result/empty/fallback PNG 已绑定。 |
| `workflow-use-model-review-queue` |              3 | Review Queue probe + pending/failed PNG 已绑定。                                             |
| `provider-registry-observability` |              3 | Provider registry probe + health/scene run PNG 已绑定。                                      |

## R2 artifact inventory

- Manifest artifact 总引用 72 次，去重后 72 个唯一文件，覆盖 13 个 passed surfaces：startup hot/cold、startup first-screen、CoreBox search states、app-index workbench、browser login recovery、CoreBox AI Ask、OmniPanel writing tools、provider migration evidence、Assistant floating ball entry、Assistant screenshot translate、Workflow review queue 与 Provider registry observability。
- `--requireExistingArtifacts --requireNonEmptyArtifacts` 已确认全部 manifest 引用存在且非空；JSON artifact 均可解析。
- `evidenceTagArtifacts` 没有 unknown artifact 引用；AI-STABLE tag artifact 均同时落在 `artifactPaths`。
- PNG / JSON 对应关系基本为同名 `*-dom.json` 或 `*-probe.json`；`packaged-corebox-hotkey-page-04.png` 由 `packaged-corebox-hotkey-capture.json` 的 `captures[].screenshotPath` 关联。

## 下一步

1. Assistant screenshot translate 进入灰度产品化：保留 Voice Panel 双入口；面板打开自动聚焦、Enter 发送、Shift+Enter/IME 保持编辑、in-flight 去重与 Escape 关闭，麦克风拒绝后的系统设置深链 + 显式语音重试、录屏 permission recovery、cursor/display/region 模式、image route metadata、OCR 文本降级、pin window host copy/close/work-area/zoom/opacity，以及 provider/login/quota/OCR/文本翻译失败后直达 Intelligence Channels 的一键恢复均已落 code path，后续补 current-version recapture 和多显示器/HiDPI 采证。
   - Assistant screenshot OCR/text fallback 已补统一 caller `core.assistant.screenshot-translate`，两阶段调用均进入 Intelligence quota governance；focused contract 保留 degraded result metadata，并验证 OCR 与 text.translate 不再遗漏 caller。
2. OmniPanel / Assistant 性能优化：VoicePanel 已同步注册 opened listener、先聚焦输入再并行刷新 config/display，避免首开事件竞态；下一步继续聚焦窗口生命周期、悬浮球拖拽持久化、packaged asset 排除与首屏不阻塞。
3. 桌面烟花 MVP：feature flag 默认关闭，轻量 overlay/canvas，限制粒子数、帧率、自动退出与无障碍降级。
4. 截图功能逐步引入：已落地 Voice Panel `capture + preview + copy/save/translate`、cursor/display/region 来源、无副作用区域取消、permission denied / unsupported / unavailable 区分，以及翻译 provider 失败后前往 AI 渠道设置的 typed 恢复动作；下一步补多显示器/HiDPI 与 current-version packaged 采证。
5. AI Command 产品化：`promptTemplate` / `promptVariables` typed options、legacy metadata 兼容、provider fallback 保真、中英文 Plugin Workflow，以及 CoreBox `rewrite/改写`、`summarize/summary/总结/摘要`、`explain/解释` 三组 text-only stateless 内置命令已落。`touch-intelligence@1.2.0` 进一步新增 bounded `ai-commands.json` registry、动态 text/html command feature、按 id 原子 reload/reconcile，以及可视化 create/update/delete/import/export/open/reload editor；editor 已新增与 host simple Mustache 语义一致的 live System Prompt 预览，明确 nested key、缺失变量空文本与 invalid JSON 状态，并提供语法修正、专业语气、友好语气、代码审查四个 host-owned starter preset；命令输入按“显式后缀 > CoreBox 附带 text/html 剪贴板文本”解析，默认 AI Ask 不会隐式替换输入。2026-07-13 `2.4.13-beta.4` partial packaged capture 已覆盖 editor ready/save、missing registry 初始化、VM-safe 变量校验与 dynamic exact/suffix CoreBox result。下一步是 provider-backed current-version command invocation 与 share-link / one-click install preset 分发；全局 13-surface current-version gate 仍开放，不重复扩散 raw prompt IPC。
6. 保留 R2D idle、searching/warm-up、no-result 与 R2I result pills 作为最终 CoreBox Search evidence，避免旧 r2/r2b/r2c 或 `corebox-search-result-reasons.png` 被误用。
7. 后续每次产品化变更仍同步 `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/`、Evidence Matrix、TODO 与 CHANGES；不使用旧 raw blocker artifact 冒充最终 evidence。

## R2 visible gate 执行梯队

| 梯队 | Surface                           | 目标时间 | 必须证明                                                                                                                                                          | 关账条件                                                                          |
| ---- | --------------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| done | `browser-login-recovery`          |   closed | Browser-open failure 不丢 device authorization session；manual login URL copy、short code copy、timeout/network failure 文案可见                                  | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。           |
| done | `app-index-workbench`             |   closed | Summary counts、UWP/Store/Steam/shortcut/protocol/AppRef/path source filters、attention/found/unchecked/disabled filters、no entries vs filtered-out empty states | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。           |
| done | `omnipanel-writing-tools`         |   closed | Selected-text context / recovery hint、writing actions、AI result preview、copy / replace / retry / confirmation states                                           | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。           |
| done | `provider-migration-evidence`     |   closed | Dry-run migration summary、readiness/blockers/migrated/skipped/failed counts、secret redaction、dry-run 不声明 registry-primary readiness                         | 2026-06-24 local-only dry-run evidence 已绑定；strict verifier 不再列该 surface。 |
| done | `assistant-floating-ball-entry`   |   closed | Settings enabled + voice wake disabled、浮窗不抢焦点、拖动位置持久化、点击打开 Voice Panel                                                                        | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。           |
| done | `assistant-screenshot-translate`  |   closed | Clipboard image translate、result window、empty clipboard 与 provider fallback                                                                                    | 2026-06-24 packaged evidence 已绑定；后续做产品化 polish。                        |
| done | `workflow-use-model-review-queue` |   closed | Use Model output 入 Review Queue、pending/failed queue、cost/trace signals、failed recovery                                                                       | 2026-06-24 packaged evidence 已绑定。                                             |
| done | `provider-registry-observability` |   closed | Provider health、latest usage、scene latest run、recent failure、filters、next-action hints                                                                       | 2026-06-24 packaged evidence 已绑定；不暴露 provider secret。                     |

每个 R2 follow-up 批次结束必须同步：

- `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/README.md`
- `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json`
- `docs/plan-prd/TODO-AI.md`
- `docs/plan-prd/01-project/CHANGES.md`
- 如 strict gate failure count 或总状态变化，再同步 `docs/plan-prd/TODO.md`

## 验证命令

```bash
corepack pnpm -C "apps/core-app" exec vitest run "scripts/coreapp-packaged-ai-ask-probe.test.ts" "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.test.ts" "src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts" "src/renderer/src/views/box/search-state.test.ts" "src/renderer/src/modules/box/adapter/hooks/useResize.test.ts"
corepack pnpm -C "apps/core-app" run typecheck
corepack pnpm -C "apps/core-app" run build:unpack
corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"
corepack pnpm -C "plugins/touch-intelligence" run build
corepack pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireEvidenceTags --requireExistingArtifacts --requireNonEmptyArtifacts --requireCurrentVersion
git diff --check
```
