# 变更日志

> 更新时间：2026-07-13
> 定位：只保留当前阶段的高信号变更索引。早期流水记录已从文档树移除，可从 Git 历史追溯。


## 2026-07-13

### assistant: route VoicePanel through governed provider ASR

- typed `assistant:voice-panel:transcribe-audio` 现在承载内存音频 data URL、MIME、时长和语言 hint；Assistant 主进程在任何 provider work 前 fail-closed 拒绝 disabled、格式不匹配/非法、超过 5 MiB 或超过 30 秒的请求，不记录或持久化原始音频。
- VoicePanel 以 `MediaRecorder` 作为短语音主路径，用户停止或 30 秒上限后只通过 `tuffIntelligence.audio.stt` 调用现有 provider registry，并绑定 `caller=core.assistant.voice-transcribe`；成功保留 transcript/language/confidence/provider/model/latency/trace，失败保留 canonical code/reason/recovery。
- MediaRecorder 不可用或 provider 转写失败时复用现有 Web Speech；renderer 统一回收 tracks/recorder/recognizer/timer，隔离 stale callback，失败 recognizer 和 pending restart 均可单击重新进入 provider 录音，重试时清理旧错误恢复动作。中英文录音、转写、fallback 与恢复文案已同步。
- ASR PRD、TODO、AI execution plan 与质量基线已改为 `Cloud Short Voice Slice Landed`，明确本地 `whisper.cpp`、`local-only/cloud-only/auto`、artifact lifecycle、长音频/streaming 与 packaged 真 provider success 仍开放。Focused verification：Assistant 3 files / 87 tests、CoreApp node/web typecheck、scoped ESLint、`electron-vite build` 与 `mise run ai-docs:dev` passed；current built Electron 以受控音频流实测 recording -> typed ASR -> canonical provider-unavailable recovery -> Web Speech fallback -> provider retry，未把无真实 provider 的 failure smoke 写成转写成功。

### intelligence: fail closed when quota verification is unavailable

- Intelligence SDK 不再在 quota storage/check 异常时返回 `allowed: true`；统一抛出稳定 `QUOTA_CHECK_UNAVAILABLE`，保留原始 cause，并提供独立 reason/recovery。caller-scoped `invoke()` / `stream()` 都在 provider 选择与执行前阻断，正常 quota deny 语义不变。
- Assistant screenshot 的 OCR/text fallback 两阶段统一传递 `caller: core.assistant.screenshot-translate` 与稳定 source，补齐 host fallback 对 Intelligence quota guard/audit 的归属；不再因只写 source metadata 而绕过 caller-scoped 配额校验。Focused verification：Assistant screenshot translate 1 file / 23 tests 与 CoreApp node typecheck passed。
- `@talex-touch/utils` 新增共享 `IntelligenceErrorCode` / runtime guard，CoreApp normalizer 不再维护第二份 union；CoreBox image scene 与 Assistant clipboard/screenshot response 透传 typed `code/reason/recovery`，semantic scene failure 仍可进入 OCR/text degraded fallback，并记录 `IMAGE_TRANSLATE_<code>`。
- VoicePanel 复用统一 AI recovery classifier 展示本地化登录、quota verification、provider/model/permission/network 恢复；`INVALID_REQUEST` / `UNKNOWN` 显示通用失败但不提供误导性的 Intelligence settings 动作。Focused regression：6 files / 127 tests passed；CoreApp node/web typecheck、TuffEx build 与 `mise run ai-docs:dev` passed。
- Official `touch-intelligence` error normalizer 现在保留 canonical shared codes，message fallback 也区分 quota exhausted / quota verification、capability / model、network 与 invalid request；不再输出 plugin 私有 `AUTH_REQUIRED` / `QUOTA_EXCEEDED` 别名。
- CoreBox result signal reason/tone/action 覆盖 canonical AI failures，并为 quota verification、network、invalid request 提供独立中英文恢复提示。Focused verification：plugin 1 file / 63 tests、CoreBox source metadata 1 file / 19 tests、plugin packaged build、CoreApp web typecheck、TuffEx build 与 `mise run ai-docs:dev` passed。
- Nexus Intelligence token SSE error frame 新增 canonical `code/message/reason/recovery`；server 将 H3 nested code、credits/provider quota 与常见 provider failure 统一归类，quota verification 优先于 generic 402/429 quota。CoreApp NexusProvider 在首 delta 前和可见 delta 后均保留 typed Error 字段，legacy message-only frame 不虚构 code。Focused verification：Nexus normalizer + real Response endpoint 2 files / 26 tests、CoreApp NexusProvider 1 file / 8 tests、CoreApp node / Nexus typecheck 与 `mise run ai-docs:dev` passed；Nexus typecheck 保留既有 vue-router Volar subpath warning。
- Nexus Intelligence `/invoke` 现将 auth、invalid request、permission、quota、unsupported、provider unavailable、quota-check unavailable、network 与 unknown 失败映射为稳定 HTTP status + canonical body；CoreApp network SDK 的 `NetworkHttpStatusError.responseData` 保留解析后的非 2xx body，NexusProvider 恢复 typed Error，同时 retry/cooldown 仍把请求计为失败，malformed legacy body 不被误分类。Focused verification：shared network 1 file / 1 test、CoreApp network + NexusProvider 2 files / 15 tests、Nexus HTTP + SSE 3 files / 41 tests、CoreApp node / Nexus typecheck 与 `mise run ai-docs:dev` passed；Nexus typecheck 保留既有 vue-router Volar subpath warning。
- Dashboard Agent continuous SSE 新增真实 `Response.body` 分块 smoke：首事件在 graph completion 前可读，后续事件与唯一 done 有序到达，并锁定 `text/event-stream`、`no-cache, no-transform`、`keep-alive` headers。同步纠正文档中当前仓库不存在的 historical `/api/chat/sessions/:sessionId/stream` 与 `fromSeq + follow` 声明；现行入口为 `/api/admin/intelligence-agent/session/stream`，历史 trace 使用 `fromSeq + limit`。Focused verification：Nexus 1 file / 1 test 与 `mise run ai-docs:dev` passed。
- Admin Intelligence analytics 修复 runtime audit source 漂移：current writers 的 `intelligence-agent-runtime` 与 legacy `intelligence-lab-runtime` 现在同时进入 selected-days status/recovery summary，避免 7 天面板漏掉当前 Agent runs。长期 backlog 同步退役当前仓库无 producer 的 `AIAPP_STRICT_MODE_UNAVAILABLE` label，并明确后续告警应基于 canonical `errorCode`。Focused verification：Nexus store 1 file / 1 test、targeted ESLint、Nexus typecheck 与 `mise run ai-docs:dev` passed；Nexus typecheck 保留既有 vue-router Volar subpath warning。
- 修正文档对 `video.generate` 完成度的低估：当前仓库从 capability type、payload/result、typed SDK、provider adapter、异步 job 生命周期到 UI/e2e 均未实现，并非只缺“真实 Provider runtime”。长期计划改为先确定 provider + job status/progress/cancel/artifact + quota/audit 合同，真实成功路径成立后再公开 SDK，避免交付永久 unsupported 的空入口。Focused verification：repo-wide capability/runtime search 与 `mise run ai-docs:dev` passed。
- Default Nexus 不再广告/首选绑定尚未实现的 `audio.tts`：fresh shared defaults 移除 capability 与 binding，persisted Intelligence config 同步清理 stale provider capability/binding；OpenAI/SiliconFlow TTS 保持不变。修复 UI/SDK 把 Nexus TTS 标为 available 后，server 在模型调用前稳定 unsupported 的假阳性。Focused verification：CoreApp config 1 file / 10 tests、scoped Core config ESLint、Tuff Intelligence build、CoreApp node/web typecheck（含 TuffEx build）与 `mise run ai-docs:dev` passed；legacy generated Intelligence type surfaces 仍有既存全文件 style debt，本批不声称其 ESLint passed。
- Network SDK 的非 2xx response body capture 改为 least-privilege opt-in：`NetworkRequestOptions.captureErrorResponseData` 默认 false，shared/CoreApp network path 均只在显式启用时解析并挂载 `NetworkHttpStatusError.responseData`；未启用时取消 body 且仍按 status failure 进入 retry/cooldown。Nexus `/invoke` 是当前唯一 opt-in consumer，typed canonical failure 保持不变。Focused verification：shared network 1 file / 2 tests、CoreApp NetworkService + NexusProvider 2 files / 16 tests、CoreApp node typecheck、scoped network-core ESLint 与 `mise run ai-docs:dev` passed。
- Nexus guest auth preflight 从 plain `Error('NEXUS_AUTH_REQUIRED')` 升级为 canonical typed failure：普通 invoke 与 token stream 都在零网络请求下保留 exact message/code、稳定 reason 与 recovery，直接 provider caller 不再依赖下游 message inference。Focused verification：CoreApp NexusProvider 1 file / 11 tests 与 node typecheck passed。
- Admin Intelligence selected-days analytics 新增 canonical `errorCodeDistribution` 与 recent-run `errorCode`：兼容 explicit code 和 legacy message-only runtime audit，复用 shared normalizer，排除 success contamination，并只返回 code/count，不泄露 raw provider error message/stack。Focused verification：Nexus analytics 1 file / 1 test、targeted ESLint、Nexus typecheck 与 `mise run ai-docs:dev` passed；Nexus typecheck 保留既有 vue-router Volar subpath warning。
- Nexus buffered/token-stream provider attempt 的 failed audit 现显式持久化 canonical `metadata.errorCode`，与 HTTP/SSE failure normalizer 对齐；generic provider failure 与 governance quota failure 分别稳定记录 `UNKNOWN` / `QUOTA_EXHAUSTED`，不改变 retry/fallback 或 billing。Focused verification：Nexus invoke service 1 file / 8 tests、targeted ESLint、Nexus typecheck 与 `mise run ai-docs:dev` passed；Nexus typecheck 保留既有 vue-router Volar subpath warning。
- Agent runtime failure telemetry 已改为 canonical safe detail：graph/legacy runtime 的 SSE、persisted trace、failed audit 及 outer Admin stream rejection 只携带 `code/message/reason/recovery`，audit 另存 explicit `errorCode`；不再复制 Error stack/cause/name/enumerable secret。Focused verification：graph runner 1 file / 2 tests、Admin stream route 1 file / 2 tests、targeted ESLint 与 Nexus typecheck passed；Nexus typecheck 保留既有 vue-router Volar subpath warning。
- Admin Agent historical trace GET 对 legacy persisted root/nested `error` 增加读取侧 canonical sanitization：保留非错误 trace 与分页/鉴权，返回安全 `code/message/reason/recovery`，不暴露旧 stack/cause/name/enumerable secret，也不修改存量记录。Focused verification：trace route 1 file / 1 test、targeted ESLint、Nexus typecheck 与 `mise run ai-docs:dev` passed；Nexus typecheck 保留既有 vue-router Volar subpath warning。
- Plugin Intelligence quota boundary 改为 host-owned：插件 facade 不再发现六个 quota/usage control-plane 方法，raw event 也在 quota manager 前 fail-closed；plugin invoke/stream caller 由 transport identity 覆盖为 `plugin:<id>`，避免 caller omission/spoof 绕过或跨插件计费。Focused verification：CoreApp quota + invoke actor boundary 2 files / 10 tests、Utils plugin facade 1 file / 9 tests、CoreApp/Utils scoped ESLint 0 errors与 `mise run ai-docs:dev` passed；CoreApp node typecheck 仍被用户工作区既有 unresolved merge markers（`packages/utils/transport/events/types/core-box.ts`、`apps/core-app/src/main/modules/plugin/plugin-module.test.ts`）阻断，未改动这些冲突文件。
- Plugin autonomous Agent/workflow execution 不再借 `intelligence.basic` 旁路高风险权限：generic invoke/stream 的 `agent.run` / `workflow.execute` 统一要求 `intelligence.agents` 并在 runtime/provider/tool 前 fail-closed；低层 Agent 与 persisted workflow control plane 另行 hard-cut 为 host-only，高层 wrappers、`text.chat` 与 host workflow 保持原行为。Focused verification：CoreApp generic invoke actor 1 file / 8 tests、scoped ESLint 与 AI docs verifier passed。
- Plugin Intelligence provider/admin surface 改为 host-only：provider test/capability smoke/model fetch、audit/usage telemetry 与 local environment 不再从 facade 或 raw typed event 可达；安全 capability/model/test-meta discovery 保持可用，避免插件借宿主网络/系统 caller 绕过治理或读取本机工具配置路径。Focused verification：CoreApp admin boundary 1 file / 11 tests、Utils plugin facade 1 file / 9 tests、scoped ESLint 0 errors与 `mise run ai-docs:dev` passed；CoreApp node typecheck 仍被用户工作区既有 unresolved merge markers 阻断。
- Plugin Intelligence low-level Agent runtime 改为 host-only：facade 不再暴露 `agentSession*`、`agentPlan/Execute/Reflect` 或 `agentTool*`；raw plugin request/trace subscription 在 history/trace/state/mutation、订阅、timer 或 disconnect pause 前统一返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`，CoreApp renderer host 与高层 Agent/Workflow capability wrapper 保持可用。Focused verification：CoreApp session/autonomous boundary 2 files / 12 tests、generic invoke 1 file / 8 tests、Utils facade 1 file / 9 tests、targeted ESLint、CoreApp node typecheck、AI docs verifier 与 diff check passed。
- Plugin Intelligence persisted workflow control plane 改为 host-only：facade 不再暴露 `workflowList/Get/Save/Delete/Run/History/ReviewUpdate`；raw plugin request 在定义/历史读取、保存/删除/review mutation、runtime wait 或 provider/tool work 前统一返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`。CoreApp renderer host 的 list/save/run 与 payload/metadata identity 保持，高层 `workflow.execute()` 仍走 `intelligence.agents`。Focused verification：CoreApp workflow/autonomous boundary 2 files / 12 tests、generic invoke 1 file / 8 tests、Utils facade 1 file / 9 tests、targeted ESLint、node typecheck、AI docs verifier 与 diff check passed。
- Plugin ContextHygiene observability 改为 host-only：facade 不再暴露 `contextListCheckpoints` / `contextListPackageLogs`；raw plugin query 在 ContextHygieneService/SQLite 前返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`，避免无 owner/namespace 的 checkpoint summary/reason/metadata 与可无 session filter 的 package trace/source/item metadata 跨 actor 泄露。Host query payload/result identity 保持，`contextInvoke` / `contextStream` / `contextEvaluateMemory` 仍可用。Focused verification：CoreApp context boundary 1 file / 16 tests、Utils facade 1 file / 9 tests、targeted ESLint、node typecheck、AI docs verifier 与 diff check passed。
- Plugin System SDK 新增 selected-text capture：OmniPanel 私有 AXSelectedText / copy fallback 已抽为单一 host-owned service，`context.utils.system.captureSelection()` 与 renderer `captureSelectedText()` 复用 typed App/System event；verified plugin + `clipboard.read` 在 accessibility/shortcut/clipboard 前 fail-closed，fallback 在成功、空选区与错误后恢复全格式快照，restore 失败不返回文本伪成功。SDK 返回 support/issue/limitations/capturedAt，active README、Nexus 中英文 Clipboard/Plugin Context/API index、Raycast/uTools matrix、TODO 与安全规范已对齐。Focused verification：CoreApp 5 files / 78 tests、Utils 1 file / 11 tests、Nexus SDK search 1 file / 7 tests passed；CoreApp node/web 与 Nexus typecheck、targeted ESLint、AI docs verifier、diff check passed；Nexus 保留既有 vue-router Volar subpath warning。
- Plugin alternate provider path 不再绕过 caller quota attribution：`chatLangChain` 与 `ttsSpeak` 在 provider/cache 前绑定 verified transport caller，host metadata 不变；TTS cache 按 caller 隔离，避免跨插件 trace/result 泄露。Focused verification：CoreApp actor boundary + TTS cache 2 files / 11 tests、changed-file diagnostics 0、scoped ESLint 0 errors；CoreApp node typecheck 仍被用户工作区既有 unresolved merge markers 阻断。
- Plugin local knowledge 不再信任 `permissionScope` 或全局 SQLite id：index/search/build 统一绑定 verified plugin actor scope，document/chunk references 使用 deterministic per-plugin namespace；host payload 原样透传。Focused verification：CoreApp knowledge actor boundary + local engine 2 files / 11 tests、changed-file diagnostics 0、scoped ESLint 0 errors；CoreApp node typecheck 仍被用户工作区既有 unresolved merge markers 阻断。
- LocalKnowledgeEngine `buildContext()` 修复首个 chunk 可越过 `tokenBudget` 的预算漏洞：所有超限候选均跳过但不阻断后续较小命中，聚合 `tokenEstimate` 不再超过硬上限；有 FTS 命中但无完整 chunk 可容纳时返回 `degraded / token-budget-exhausted` 与空正文/citation，避免伪成功和超预算上下文。Focused verification：CoreApp local knowledge engine 1 file / 7 tests、targeted ESLint 与 node typecheck passed。
- ContextHygiene 与 LocalKnowledgeEngine 不再各自使用 UTF-16 `length / 4`：新增共享 tokenizer-independent Unicode-aware estimator，连续 ASCII 近似保持每 4 code points 计 1，CJK 等非 ASCII 至少各计 1、emoji 采用更保守权重；persisted turn/chunk 在读取时取 `max(stored, current-content estimate)`，不改写旧 SQLite row 也不允许遗留低值绕过 ContextPackage/knowledge hard budget。Focused verification：纯 estimator + 两条 legacy CJK regression 共 CoreApp 3 files / 68 tests、targeted ESLint 与 node typecheck passed；estimate 不等同 Provider 实际 token/计费值。
- ContextHygiene 修复 ContextPackage 首个可选项预算绕过：`items.length === 0` 不再自动获得超预算例外，只有正常 mandatory `current_input` 可显式保留；secret/private 当前输入被排除时，oversized continuation/compression/legacy summary、recent turn、Memory 与 retrieval 仍被 `token-budget-pruned`，metadata/package log 不含被拒正文。Focused verification：CoreApp ContextHygiene/context-execution 2 files / 63 tests、targeted ESLint 与 node typecheck passed；包含 oversized mandatory current input 的 package 仍可能高于预算，这是保留当前任务的既有合同。
- ContextHygiene 与 LocalKnowledgeEngine 的 token budget 现统一按 untrusted runtime 值归一：有限 number 向下取整并 clamp 至最小 1；省略/非 number/`NaN`/正负无穷在 ContextHygiene 回退 1,600、在 knowledge build fail-closed 到 1，数字字符串不再通过 `Number(...)` 扩大预算。Focused verification：CoreApp estimator/knowledge/ContextHygiene/context-execution 4 files / 93 tests、targeted ESLint 与 node typecheck passed；typed SDK、valid finite budget 与 quota 合同未变。
- Host-owned ContextExecution 修复 degraded current-input fallback 的 secret policy 绕过：ContextHygiene/SQLite prepare 在分类前失败时，invoke/stream 会先复用同一本地 classifier；unsafe raw input 以稳定 `CONTEXT_CURRENT_INPUT_POLICY_BLOCKED` fail-closed，Provider 不执行，日志/错误/metadata 不含 secret；safe input 仍按 `context_prepare_failed` current-only payload 降级。Focused verification：CoreApp ContextHygiene/context-execution 2 files / 68 tests、targeted ESLint 与 node typecheck passed。
- ContextExecution 的 `context_prepare_failed` summary/runtime metadata 不再保留独立 `Math.floor/Math.max` 路径：统一复用有限预算 normalizer，非 number、`NaN`、正负无穷回退 1,600，有限小数向下取整；safe current-only payload 与 unsafe secret blocking 语义不变。Focused verification：CoreApp ContextExecution 1 file / 10 tests、targeted ESLint 与 node typecheck passed。
- ContextHygiene 修复显式 privacy hint 可降级 secret 的问题：host `containsSecret()` 现优先于 caller `privacyLevel`，匹配内容无论声明 normal/private 都以 `secret` + canonical redacted marker 持久化并从 ContextPackage 排除；safe explicit-private 仍保持 private/redacted/policy-blocked。Focused verification：CoreApp ContextHygiene/context-execution 2 files / 71 tests、targeted ESLint 与 node typecheck passed；SQLite/package log/metadata 不含 raw secret。
- ContextHygiene shared secret classifier 补齐明确 Bearer/JWT coverage：`Bearer` + 至少 16 个标准 token 字符与 JSON-looking 三段 JWT 现统一触发 MemoryPolicy reject、turn secret/redaction、ContextPackage exclusion 及数据库降级 invoke/stream blocking；`Bearer token`、`Bearer <token>`、`foo.bar.baz` 不误报。Focused verification：CoreApp ContextHygiene/context-execution 2 files / 78 tests、targeted ESLint 与 node typecheck passed；不宣称通用 DLP 或 vendor credential 全覆盖。
- Local/Ollama-compatible `chatStream()` 不再逐 Buffer 独立 `toString('utf8')`：单一 `StringDecoder` 保留跨 transport chunk 的 CJK/emoji bytes 与 NDJSON framing；EOF 无尾换行的 `done` frame 会先输出 final delta，再输出且仅输出一个携带 `prompt_eval_count/eval_count` 的 terminal usage chunk。Focused verification：CoreApp LocalProvider + provider model discovery 2 files / 11 tests、targeted ESLint 与 node typecheck passed；仅证明现有 Ollama compatibility，不宣称内置 GGUF runtime、模型管理 UI、packaging 或设备 smoke。
- LocalProvider 的 Ollama→OpenAI-compatible stream fallback 现以首个非空 delta 为 commit point：pre-output 404 仍返回兼容 backend chunks；一旦 Ollama 输出可见，后续 404-like error 原样传播，兼容 backend 不执行，也不合成 done/第二份回答。Focused verification：CoreApp LocalProvider + model discovery 2 files / 13 tests、targeted ESLint 与 node typecheck passed；不改变非流式或 SDK-wide provider fallback。
- LocalProvider 的 Ollama compatibility fallback 不再从任意 `error.message` 搜索 `404`：非流式与流式调用现在都只接受 `NetworkHttpStatusError.status === 404`，普通 parser/provider error 即使消息包含 `404` 也按原对象传播；pre-output typed 404 仍回退，首个 delta 后 typed 404 仍 fail without fallback。Focused verification：CoreApp LocalProvider + model discovery 2 files / 16 tests、targeted ESLint、node typecheck、AI docs verifier 与 diff check passed；不改变 NetworkService、SDK-wide provider selection 或内置 runtime 范围。
- NetworkService `requestStream()` 不再在 response body 刚打开时提前 `recordSuccess`：guard 现在只在 readable `end` 后按 `autoResetOnSuccess` 清理 failure，body `error` 只记录一次 failure 且继续传给消费者，主动 early close 不增不减；fetch/open retry 保持，body 交付后不 replay。Focused verification：CoreApp NetworkService 1 file / 10 tests、LocalProvider/model discovery 2 files / 16 tests、targeted ESLint、node typecheck、AI docs verifier 与 diff check passed。
- Assistant 悬浮球重开不再按当前光标显示器重解释已保存坐标：仅 canonical `{-1,-1}` 使用光标默认位置，其余 finite 坐标（含左/上方显示器的负坐标）先按 saved point 选择最近显示器，再把完整窗口 clamp 到当前 work area；显示器移除或布局变化时仍回落到 Electron nearest display。Focused verification：Assistant module 1 file / 30 tests、targeted ESLint 与 CoreApp node typecheck passed；真实多显示器/HiDPI 与 current-version packaged evidence 保持 open。
- Assistant 模块新增 Electron display topology 生命周期恢复：成功初始化后用同一 handler 订阅 `display-added` / `display-removed` / `display-metrics-changed`，销毁时精确移除；事件只重排已存在的悬浮球，并将 visible Voice Panel 重新锚定/clamp 到修正后的 work area，不创建/显示/聚焦窗口、不重复广播 `panelOpened`，也不把临时 fallback 坐标写回设置。Focused verification：Assistant module 2 test files / 40 tests、targeted ESLint 与 CoreApp node typecheck passed；真实 display hot-plug/HiDPI 与 current-version packaged evidence 保持 open。
- 共享 renderer `AppEntrance` 不再静态加载三个 Assistant SFC：FloatingBall、VoicePanel、ScreenshotRegionSelector 复用现有 `defineAsyncComponent(() => import(...))` 模式，仅在对应 window mode 分支渲染时加载；CoreBox/DivisionBox/OmniPanel/MetaOverlay/MainApp 策略不变。Production renderer build 明确生成约 8.36 / 44.16 / 6.03 kB 的三个独立 JS chunks。Focused verification：Assistant startup contract 1 file / 8 tests、targeted ESLint、CoreApp web typecheck（含 TuffEx build）与 `electron-vite build` passed；无启动 benchmark 或 packaged recapture，不宣称耗时/安装体积改善。
- DeepAgent/Workflow 真实 token usage 现从 OpenAI Responses 与 LangChain AIMessage 元数据归一并贯穿 adapter、Agent result、prompt/agent step 与 workflow aggregate，移除可用 usage 被硬编码零覆盖的问题。Focused verification：Tuff Intelligence parser 1 file / 5 tests、CoreApp orchestration 1 file / 12 tests、changed-file diagnostics + ESLint 0 errors、Tuff Intelligence build passed；CoreApp broad typecheck 仍被用户工作区既有 unresolved merge markers 阻断。
- Intelligence day/month usage aggregation 不再把 caller 编进再拆解冒号 key；structured buckets 保留 `plugin:<id>` 等 opaque caller，避免 canonical plugin caller 被误解析后整桶静默丢弃，恢复日/月 quota 与 analytics 计数。Focused verification：CoreApp 1 file / 1 test、changed-file diagnostics 与 scoped ESLint 0 errors；CoreApp broad typecheck 仍被用户工作区既有 unresolved merge markers 阻断。
- Autonomous Agent/Workflow caller 不再在权限通过后漂移为共享内部身份：受治理 high-level invoke/stream、host-owned internal graph/workflow model/context 与 DeepAgent config/adapter 全链路保留 bound caller，host fallback 与 metadata 语义不变；raw plugin low-level control-plane channel 现另行 host-only。Focused verification：CoreApp channel/runtime/orchestration 3 files / 22 tests、changed-file diagnostics 与 scoped runtime/orchestration ESLint 0 errors。
- Host-owned persisted/direct workflow 的 DeepAgent prompt/agent step 保留 self-governance：canonical non-host caller 的 provider call 在 config/adapter 前 fail-closed，成功记录真实 usage，失败记录 canonical safe detail 且不含 prompt；generic outer Agent/Workflow 避免重复 inner 计费。Focused verification：CoreApp orchestration 1 file / 16 tests、workflow service 1 file / 13 tests、changed-file diagnostics 与 scoped ESLint 0 errors。
- CoreBox / OmniPanel AI recovery 优先识别 quota verification failure，显示稍后重试及检查 Intelligence quota storage/configuration 的中英文建议，不再把它归类为 credits/team quota exhausted。Focused verification：Intelligence SDK + error normalizer + renderer recovery 3 files / 46 tests、CoreApp node/web typecheck、TuffEx build 与 `mise run ai-docs:dev` passed。

### assistant: add provider-channel failure recovery

- VoicePanel 在剪贴板图片 `SCENE_UNAVAILABLE` 以及截图 `SCENE_UNAVAILABLE` / `OCR_UNAVAILABLE` / `TEXT_TRANSLATE_UNAVAILABLE` 后展示独立的 AI 渠道恢复动作；图片缺失、截图权限、平台不支持或截图不可用继续保持各自语义，不误导用户修改 provider。
- typed `assistant:voice-panel:open-intelligence-settings` 由 Assistant 主进程恢复、显示并聚焦主窗口，通过既有 typed navigation 直达 `/intelligence/channels`，成功后才隐藏 Voice Panel；主窗口缺失/销毁或 renderer navigation 失败均返回 false，保留可重试错误态。
- 中英文文案、Assistant typed contract/runtime、VoicePanel 和行为测试已同步。Focused verification：Assistant main + VoicePanel 2 files / 40 tests passed；CoreApp node/web typecheck、TuffEx build 与 `mise run ai-docs:dev` passed。scoped ESLint 仍被这 5 个既有文件的 669 个格式错误阻断，本批不声称 lint passed。

### assistant: add microphone permission recovery

- VoicePanel 将 Web Speech `not-allowed` / `service-not-allowed` 回调，以及同步 `NotAllowedError` / `SecurityError`，统一映射为可恢复的麦克风拒绝态；授权错误会停止自动 restart，避免持续打扰。
- 首次恢复通过既有 typed `system:permission:request` 请求 `microphone`；macOS 已拒绝时 `PermissionChecker` 直达 `Privacy_Microphone`，未决定时仍使用原生 `askForMediaAccess`，Windows 保持系统麦克风设置入口。设置/请求完成后按钮切换为显式“重试语音输入”，重建 recognizer 且不重复打开设置。
- denied microphone 在 Permission Center 继续标记为可请求，中英文状态与恢复文案、Assistant PRD/TODO/能力矩阵已同步。Focused verification：PermissionChecker + VoicePanel 2 files / 38 tests passed；包含 Assistant navigation 的合并回归 3 files / 61 tests passed；CoreApp node/web typecheck、TuffEx build 与 `mise run ai-docs:dev` passed。scoped ESLint 仍被这 2 个既有 permission 文件的 152 个格式错误阻断，本批不声称 lint passed。

### assistant: make VoicePanel keyboard-first

- VoicePanel 每次 `panelOpened` 都先聚焦文本框，再并行刷新 runtime config 与显示器列表；listener 在初始异步加载前同步注册，避免窗口 show/broadcast 与 renderer mount 之间丢失 opened event。
- 普通 Enter 单次提交，Shift+Enter 保留换行，IME composition Enter 不误触；pending submit 通过 renderer guard 去重。纯键盘文本发送 `source: 'manual'`，收到非空 SpeechRecognition 结果后仍保留 `source: 'voice'`。Escape 单次发送 typed close，composition/defaultPrevented 不误关，pending close 去重且 unmount 清理全局 listener。
- textarea / close button 分别暴露 `enterkeyhint=send`、`aria-keyshortcuts=Enter` / `Escape`；Assistant PRD/TODO 已同步。Focused verification：VoicePanel 1 file / 31 tests passed；Assistant + PermissionChecker 合并回归 3 files / 72 tests passed；CoreApp node/web typecheck、TuffEx build 与 `mise run ai-docs:dev` passed。scoped ESLint 仍受上方既有格式基线阻断，本批不声称 lint passed。

### docs(ai): realign the current CoreApp version baseline

- 当前代码已是 CoreApp `2.4.13-beta.6`；活跃 TODO、计划、PRD、质量基线、能力矩阵与 AI evidence report 不再把 `2.4.13-beta.4` 写成当前版本。
- `2.4.13-beta.4` AI Command packaged capture 与 strict verifier JSON 继续保留为历史/partial evidence，不伪造 beta.6 recapture；current-version gate 仍因 `2.4.12-beta.8 != 2.4.13-beta.6` fail-closed。
- Focused verification：`mise run ai-docs:dev` passed。


### plugin(ai): restore ContextHygiene token streaming

- CoreApp 插件 lifecycle 不再用 send-only compatibility channel 构造 `IntelligenceSdk`；改为复用插件 typed transport，并在 `send` / `stream` 两条路径注入当前 `_sdkapi`。因此官方 `touch-intelligence` 的 `contextStream()` 会进入受 `intelligence.basic`、verified plugin actor、取消和审计约束的 `intelligence:context:stream`，不再因 `stream-capable transport` 缺失而固定退化到 buffered `contextInvoke()`。
- 现有 top-level `stream()` permission/caller guard 保持不变；ContextHygiene stream 仍由 host-owned assembler 生成安全 ContextPackage，插件拿不到 host-only Memory 管理原文。send-only legacy client 调用 streaming 继续显式失败，不伪装 token stream。
- 官方 `touch-intelligence` 同样把首个 widget-visible delta 作为 commit point：只有 stream transport/auth 在输出前失败时才降级 `contextInvoke()`；已展示部分回答后发生错误会保留原错误态，不再启动 buffered invoke 重放或拼接第二份答案。
- 官方插件现在持有当前 `contextStream()` 的 `StreamController`：新 feature query、清空/切走入口、send 或 retry 会先失效旧 request id，再取消上游 stream；若 controller 在 supersede 后才返回，也会立即自取消。旧 delta/end/error 因 commit guard 不得覆盖新请求或 idle 状态，避免隐藏窗口继续消耗 provider token/quota。
- Stream delta/terminal 状态现在优先通过 `plugin.feature.updateItem("intelligence-widget", …)` 原位更新已有 widget，只在首次挂载或旧 host 缺少 update/get API 时 clear+push。FeatureSDK `pushItems()` 会透传底层 `void | Promise<void>` completion，首次挂载可等待 host 异步 file-icon 初始化与 batch upsert 完成；后续 update 刻意保留已解析 icon/source，消除逐 token 重跑和旧异步 push 晚到覆盖新答案的顺序风险。
- Renderer 与 main-process lifecycle 现在复用同一 `createPluginIntelligenceFacade()` hard-cut：`get` / `in` / `Object.keys` 均不暴露 prepare-turn、CompressionSnapshot 与 Memory list/save/replace/enable/delete 管理方法；host handler 的 `INTELLIGENCE_HOST_ONLY_CAPABILITY` 保留为 defense-in-depth。插件类型、运行时对象与文档不再出现三套边界。
- Focused verification：official plugin full contract 63/63（含 stream fallback/cancellation、dynamic shared renderer 与 in-place widget update）、FeatureSDK lifecycle 14/14、plugin Intelligence hard-cut 9/9、CoreApp plugin runtime injection 1/1、CoreApp node typecheck passed；typed plugin stream smoke 证明 `_sdkapi=260713` 随 start envelope 发送并收到 delta/end，`touch-intelligence@1.2.0` builder passed。

### plugin(ai): add custom CoreBox AI Command registry

- `touch-intelligence@1.2.0` 新增 bounded `ai-commands.json` schema：最多 20 个 enabled command、每项 1–8 个唯一 alias、受限 id/name/description/template/variables/version；invalid、disabled、重复、内置 alias 冲突与超限项确定性跳过。
- 合法 command 动态注册为 `intelligence-custom-<id>` text/html widget feature，并通过 `interaction.rendererFeatureId: "intelligence-ask"` 复用同插件已预编译 ask renderer，而不是声明不存在的动态 `interaction.path`；命令继续使用 first-class template/variables、stateless context、显式后缀优先、附带剪贴板文本 fallback，以及 host-owned provider/model、quota/audit/fallback、copy/retry 链路。
- `AI 命令管理` 提供配置目录打开与 reload；reload 以 feature id 原子 reconcile。top-level malformed、static id/name collision 或 add/remove failure 保留上一版 registry，不产生半更新。
- 管理入口升级为预编译 Vue editor：支持 create/update/delete、JSON import/export、打开目录和 reload；表单先校验 id/alias/version/template/variables/duplicate，host 再执行同一 bounded schema 校验并以 canonical document 持久化。
- 模板正文只进入本地插件 storage、editor payload 与 provider input；普通 runtime metadata 只保留 command id/version 和既有 prompt hash。invalid save/import、storage failure 与 registry collision 均回滚文件和 active features。
- Current-version packaged smoke 进一步修复三个真实运行缺口：host 缺失文件返回 `{}` 时初始化 canonical empty registry；变量 byte limit 改用 VM-safe UTF-8 计数，不依赖 sandbox 未注入的 `Buffer`；AI Ask、内置/自定义命令与管理入口统一用 prefix `match`，避免 `over` catch-all 抢占显式命令后缀。
- Focused verification：plugin intelligence + official seed version contracts 3 files / 62 tests passed；CoreApp node/web typecheck、Electron/Vite build 与 `electron-builder --dir` passed；afterPack 验证 `touch-intelligence@1.2.0` seed，builder 预编译 5 个 widget 并生成 `.tpex`。`2.4.13-beta.4` packaged evidence 覆盖 editor ready/save 与 dynamic exact/suffix result，但不等于 provider invocation 或全局 13-surface current-version gate。

### plugin(ai): preview custom command prompt variables

- `AI 命令管理` editor 新增 live System Prompt 预览：按 host LangChain simple Mustache 语义替换 `{{name}}` / nested key，重复变量只计一次，缺失或 `null` 值明确提示并渲染为空文本。
- invalid / oversized Prompt Variables JSON 不生成误导性预览；预览使用 Vue 文本插值呈现，不把变量值作为 HTML 注入。轻量 renderer 位于 widget sandbox 的 `_shared` private module，并随 editor bundle 编译。
- Focused verification：official intelligence plugin 1 file / 58 tests passed；`touch-intelligence@1.2.0` builder 仅预编译 manifest 对应的 5 个 widget 并成功生成 `.tpex`。当前不替代 provider-backed command invocation 或 packaged editor preview evidence。

### plugin(ai): add curated AI Command starter presets

- `AI 命令管理` editor 新增 host-owned 入门模板选择：语法与拼写修正、专业语气、友好语气、代码审查。选择只填充 unsaved draft，不绕过现有 validation、atomic save 或 reserved alias 边界。
- 同一 preset 可重复使用；editor 会基于当前 registry 为 id 和全部 alias 确定性分配 `-2` / `-3` 后缀，避免覆盖或直到保存时才暴露冲突。四个 preset 通过 runtime canonical parser，0 rejected。
- Focused verification：official intelligence plugin 1 file / 59 tests passed；`touch-intelligence@1.2.0` builder 仍只预编译 5 个 widget 并生成 `.tpex`。当前只关闭本地 starter preset，不宣称 Raycast 式分享链接或一键安装分发。

### sdk: support private widget helper modules

- `tuff builder` 保留公开 supported files 的 directory-widget auto-discovery，同时将任一路径段以下划线开头的文件视为 private module；manifest 显式 entry 不受影响。
- private module 仍必须位于 `widgets/` sandbox 内，可被 Vue/script widget 相对导入并打进 entry bundle，但不再生成伪 `widget._shared.*` manifest entry；这消除了复用 `.ts` helper 被误打包成独立 widget 的 SDK 缺口。
- Focused verification：`tuff-cli-core` widget builder 1 file / 11 tests passed；`tuff-cli-core`、`tuff-cli` build passed；`touch-intelligence@1.2.0` 使用 `widgets/_shared/prompt-template-preview.ts` 后仍只预编译 5 个 widget 并生成 `.tpex`。

### plugin(ai): add governed replace-selection action

- Plugin main-runtime `featureUtil.clipboard` 新增 typed `copyAndPaste`，通过现有 `ClipboardEvents.copyAndPaste`、plugin identity 与 `_sdkapi` 路由宿主权限/自动粘贴链路；失败保留 host error code，不回退 raw IPC、shell 或浏览器剪贴板。
- `touch-intelligence@1.2.0` answer preview 新增“复制回答 / 替换选中文本”显式动作；替换前 fail-closed 检查 `clipboard.write`，成功时由宿主隐藏 CoreBox 并粘贴，macOS 自动化拒绝、旧宿主 SDK 缺失和通用粘贴失败会重新激活 widget 并展示恢复提示。
- `touch-intelligence` manifest 升至当前 `sdkapi: 260713`，README、AI 2.5 约束与 Raycast/uTools 能力矩阵同步该合同；清理 `packages/test` 仍把 `260626` 当 current marker 的陈旧断言。
- Focused verification：CoreApp plugin runtime 1 file / 21 tests、official intelligence plugin 1 file / 57 tests passed；CoreApp node/web typecheck passed。当前未宣称 macOS 自动化真实应用粘贴 packaged evidence。

### plugin(sdk): repair dynamic feature identity lifecycle

- `TouchPlugin.addFeature()` 现在同时拒绝重复 id 与重复展示名，不再允许同 id、不同名称的动态 feature 覆盖 registry identity。
- `delFeature()` / SDK `removeFeature()` 统一按 `feature.id` 删除；未知 id 返回 `false` 且不修改其它 feature，为后续 storage-backed AI Command registry 的 reload/reconcile 清除阻塞。
- Focused verification：CoreApp plugin runtime 1 file / 20 tests passed；CoreApp node typecheck 与 scoped ESLint passed。该 identity 修复已由 `touch-intelligence@1.2.0` registry/editor 消费。

### plugin(ai): add built-in CoreBox AI Commands

- `touch-intelligence@1.1.0` 新增 `intelligence-rewrite`、`intelligence-summarize`、`intelligence-explain` 三个 text-only widget feature，支持 `rewrite/改写`、`summarize/summary/总结/摘要`、`explain/解释` 命令别名并复用现有 ask panel。
- 每个命令使用 versioned first-class `promptTemplate` / `promptVariables` 与审计安全的 `aiCommandId/aiCommandVersion`；provider/model 选择、quota/audit、fallback、copy/retry 仍由宿主链路承担，不新增 raw IPC。
- 命令强制 `stateless`，不创建 handoff，不读取/写入 AI Ask conversation history，也不触发 Memory policy；widget 隐藏可变 context chooser 并明确展示“AI 命令 / 无历史”。默认 AI Ask/OCR 路径保持原合同。
- 命令输入按“显式后缀 > CoreBox 附带 text/html 剪贴板文本”解析；空后缀可直接处理长剪贴板输入，显式后缀不会被附件覆盖，默认 AI Ask 也不会隐式读取附件文本。
- Focused verification：plugin intelligence + official seed version contracts 3 files / 57 tests passed；`touch-intelligence` builder 已生成 4 个 widget 和 `touch-intelligence-1.1.0.tpex`，scoped ESLint passed。该 `1.1.0` 内置命令切片自身不等于后续 custom registry/editor 或 current-version packaged evidence。

### ai: stream Nexus provider tokens end to end

- 新增已认证 `POST /api/v1/intelligence/stream` SSE；只接受 `text.chat`，按 `start -> delta* -> usage -> end` 输出真实 provider token 与后端 route metadata。Nexus provider quota/request audit、credits billing、usage ledger 和 secret 边界继续生效。
- Nexus provider stream adapter 覆盖 OpenAI-compatible / Local / Anthropic，并通过 AbortSignal/timeout 终止上游；CoreApp Intelligence SDK 同步在每个候选 provider 记录首个 client-visible delta，并对 fallback start 去重：整次调用只有一个 provisional start，只有首个 delta 前的失败可进入下一候选，任何 provider 输出后失败都直接上抛，避免把两个 provider 的回答拼接成重复文本。
- CoreApp `NexusProvider.chatStream()` 改走 `requestStream()`，安全解析跨 chunk UTF-8/SSE frame，忽略 comment/unknown event，透传 trace/provider/model/latency/usage，确保 terminal chunk 只出现一次；guest 在网络前 fail-closed。
- Focused verification：Core Nexus provider 1 file / 6 tests、Nexus governed provider adapter 1 file / 4 tests、CoreApp Intelligence SDK stream routing focused cases passed；CoreApp node typecheck、Nexus typecheck 与两包 scoped ESLint passed。当前不替代登录态 packaged success、真实 token pacing 或 server/model denial recapture。

### sdk: expose typed AI Command prompt options

- `IntelligenceInvokeOptions` 新增 first-class `promptTemplate` / `promptVariables`，typed `invoke` 与 `text.chat` transport 原样透传；显式顶层字段优先于 legacy metadata 与 capability binding，旧调用保持兼容。
- CoreApp chat runtime 在 primary provider 失败后继续把同一模板和变量交给 fallback，避免 AI Command 降级时静默丢失 system prompt；模板变量会进入 provider 输入，审计只保留 prompt hash。
- Nexus 中英文 Intelligence SDK 与 Plugin Workflow 新增 Raycast-style AI Command 最小示例，明确 `intelligence.basic`、capability discovery、host-owned provider/quota/audit/fallback 与 secret 边界。
- Focused verification：CoreApp Intelligence runtime 1 file / 36 tests、Utils typed transport 1 file / 39 tests passed；CoreApp node typecheck、`@talex-touch/tuff-intelligence` build 与 scoped ESLint passed。当前不替代 official command registry/editor 或 current-version packaged AI surface 采证。

### assistant: add host-owned pin window actions

- image translation pin window 继续使用 sandboxed data URL 与 strict CSP，不引入 raw IPC 或 renderer browser clipboard；右键菜单由 main process 提供复制译图/译文/原文、Zoom In/Out/Reset、100%/85%/70%/55% 透明度预设和关闭动作，Linux 明确禁用不受支持的透明度菜单。
- 窗口以初始中心为锚按 75%/100%/125%/150%/200% 缩放，始终限界在当前 work area；Esc 关闭，`Cmd/Ctrl+Shift+C` 优先复制译文，`Cmd/Ctrl +/-/0` 调整或重置缩放。加载后再显示，继续保持 always-on-top 与跨 workspace 可见。
- Focused verification：`image-translate-pin-window.test.ts` 1 file / 8 tests passed；CoreApp node typecheck、scoped ESLint、Electron build 与 unsigned packaged directory build passed。当前不替代 current-version packaged 右键复制、键盘缩放、透明度、多显示器与窗口边界采证。

### assistant: add typed screenshot region selection

- VoicePanel 截图来源新增 `region`：capture、save 和 translate 在执行前按需打开透明区域 overlay，可选择指针所在或指定显示器；有效框选统一发送 `{ target: 'region', displayId, region }` 到既有 NativeScreenshotService，不新增 raw IPC。
- region selector 通过独立 `AssistantRegionSelector` window role 与 typed submit/cancel events 工作；主进程只接受 selector 自身 webContents，裁剪本地矩形并映射为全局 DIP，overlay 在提交、Esc/右键/按钮取消、60 秒超时、窗口关闭和 module destroy 时销毁。
- VoicePanel 在选择期间隐藏，取消立即恢复且不触发 capture/save/translate，成功则在 native capture 后恢复；3 秒兜底避免 renderer 中断后面板永久隐藏。当前仅有 focused code/test evidence，不替代 current-version packaged 多显示器/HiDPI/permission smoke。
- Focused verification：Utils window role、Assistant contract/runtime、VoicePanel、region selector 与 native screenshot service 6 files / 50 tests passed；CoreApp node/web typecheck、TuffEx build、scoped ESLint 与 `mise run ai-docs:dev` passed。

### assistant: expose image translation route metadata

- `CoreBoxImageTranslateResponse` 与 typed Assistant clipboard/screenshot translation response 新增可选 route metadata：scene `runId` / `sceneId`、端到端耗时，以及逐阶段 capability/provider/model/latency；不向 renderer 暴露 scene selection 中的 authRef、endpoint 或 credential。
- image translate normalizer 以 Nexus `selected` 为实际路由、用同 provider+capability 的 `usage` 补 model、用成功 `adapter.dispatch` trace 补 latency；无效可选字段被忽略，翻译结果不因观测字段缺失而失败。
- VoicePanel 对截图和剪贴板图片成功路径展示低敏路由卡片，新一轮 panel open、翻译或截图复制会清理 stale metadata。当前仅有 focused code/test evidence，不替代 current-version packaged provider-backed recapture。
- Focused verification：image translate / Assistant runtime / VoicePanel 3 files / 39 tests passed；CoreApp node/web typecheck、TuffEx build、scoped ESLint 与 `mise run ai-docs:dev` passed。

### quality: fail closed stale visible-evidence baselines

- `visible:experience:verify` 新增 opt-in `--requireCurrentVersion`：读取当前 `apps/core-app/package.json`，manifest `baselineVersion` 不一致时输出稳定 failure 并 exit 1；不带 flag 仍可验证明确标注的 historical snapshot。
- 当前 AI visible manifest 的 artifact/schema/tag/file gate 仍为 historical 13/13 passed，但新版本门禁直接证明 `2.4.12-beta.8 != 2.4.13-beta.4`。README、TODO、AI PRD、Evidence Matrix、report 与 recommended command 已改为 current recapture open，不再把旧 artifact 写成当前闭环。
- Focused verification：verifier CLI 1 file / 4 tests、CoreApp node typecheck 与 scoped ESLint passed；真实 current-version packaged recapture 未执行。

### assistant: select the screenshot display

- VoicePanel 新增截图来源选择：默认保持“指针所在显示器”，也可从 `NativeScreenshotService.listDisplays()` 的友好名称、分辨率和主屏标记中选择指定显示器；无可用显示器时自动保留默认模式。
- typed Assistant transport 新增 `listScreenshotDisplays`，capture / save / translate payload 共享 `cursor-display | display` target 与 `displayId`；主进程只接受非空指定显示器 ID，否则 fail-safe 回退 cursor-display。
- 截图复制、保存与翻译共用当前选择；现有 permission-denied 恢复、preview/copy/save 状态和默认 cursor-display 行为保持不变。当前改动只有 focused code/test evidence，不替代 current-version packaged 多显示器 recapture。
- Focused verification：Assistant contract/runtime/VoicePanel 与 native screenshot service 4 files / 29 tests passed；CoreApp node/web typecheck、TuffEx build、scoped ESLint 与 `mise run ai-docs:dev` passed。

### docs(core): remove the obsolete Assistant environment gate

- Nexus Core App runtime env 中英文参考不再把已删除的 `TUFF_ENABLE_ASSISTANT_EXPERIMENT` 列为有效开关，也不再描述不存在的 Assistant `shouldSkip` 路径。
- 文档改为当前真实语义：`assistantModule` 始终参与启动编排，产品默认关闭和启用状态由持久化 App Settings 的 `assistant.enabled` 控制。
- Focused verification：Nexus docs API/page/search/prerender 4 files / 22 tests passed；仓库复查仅保留“flag 已移除”的说明与防回归断言。

### sdk: expose permission-gated plugin screenshots

- `IPluginUtils` 新增同对象 `screenshot` / `plugin.screenshot` facade，复用 `createNativeScreenshotSdk()` 与 typed `NativeEvents.screenshot.*`，覆盖 support、显示器枚举和 cursor-display / display / region capture，不新增 raw IPC。
- `createPluginScreenshotSDK()` 在插件边界移除 native 临时文件原始 `path`，只返回 `tfileUrl` / `dataUrl` 与低敏 capture metadata；plugin transport 将宿主解析后的 `sdkapi` 与 verified identity 一并带入 native handler，再执行既有高风险 `window.capture` permission 门禁，避免权限层把有效插件误判为 missing-sdkapi。
- Nexus 新增 Screenshot SDK 中英文 API 页并接入 API 索引、sidebar 与 feature search；Plugin Context、Permission、平台能力 PRD 和 package SDK README 同步真实 facade、截图后 OCR 的独立 `intelligence.basic` 权限与禁止记录图片/OCR payload 的边界。
- Focused verification：Utils native SDK 1 file / 38 tests、CoreApp plugin/native facade 2 files / 26 tests、permission guard/store 2 files / 14 tests、Nexus SDK route/docs API/page/search/prerender 5 files / 29 tests passed；CoreApp node 与 Nexus typecheck、三包 scoped ESLint、`mise run ai-docs:dev` passed（Nexus 保留既有 vue-router/Volar subpath warning）。当前结果不替代真实 packaged plugin 的授权、拒绝、多显示器与区域截图 smoke。

### assistant: degrade screenshot translation to OCR text

- `translateScreenshot` 在 `image.translate.e2e` scene 不可用时不再直接终止：复用同一张内存截图调用 host Intelligence `vision.ocr`，识别到非空文本后再调用 `text.translate`；图片翻译成功路径继续打开 pin window，且不会触发 fallback。
- typed response 新增 `translated-image | ocr-text` mode、稳定 `OCR_UNAVAILABLE` / `TEXT_TRANSLATE_UNAVAILABLE` 错误与低敏 fallback metadata；只返回 source/target text 和 OCR/translate provider、model、trace、latency，不持久化截图、OCR 文本或 AI payload。
- VoicePanel 新增可滚动 OCR 文本翻译卡片，展示识别文本、译文和两阶段 provider/model；新一轮 panel open、截图翻译或截图复制会清理 stale fallback，错误文案保持 i18n。当前改动不替代 current-version packaged 系统 OCR + 真实 text provider 采证。

### ai: restore interim Nexus chat stream compatibility (superseded)

- 该中间切片先移除了客户端 `NEXUS_STREAM_UNSUPPORTED`，把已认证 invoke 完整结果投影成单 delta，并补 `traceId/provider/model/latency` metadata；现已由本日上方 authenticated token SSE 实现替代。
- historical focused contract 保留用于证明 guest fail-before-network、空结果 terminal usage 与 metadata 兼容；不再把 buffered compatibility 描述为当前能力。
- 当时补充的 Intelligence SDK callback / `StreamController` 文档继续有效；buffered 边界已改为真实 token SSE、terminal usage 与 pre-delta-only fallback 边界。
- historical verification：Nexus provider、Intelligence SDK 与 Nexus invoke smoke 共 3 files / 42 tests passed；packaged login-state success recapture 一直开放。

### docs(sdk): make plugin context the canonical facade

- Nexus Plugin Context 中英文页改为以 typed `IPluginContext` / `context.utils` 为主入口，补齐 `secret`、Intelligence、Localization/Domain Lexicon、QuickOps 与 permission 边界；`globalThis` 明确降为旧 CommonJS compatibility projection，不再被描述为完整现代 SDK。
- SDK feature search 新增 Indexed Source、BoxItem、Features、Plugin 与 TuffTransport card 的真实文档 route，复用现有 Search/Feature/Plugin Context/Transport 页面，不创建重复文档体系。
- Focused verification：SDK route + docs API/page/search/prerender 5 files / 28 tests passed；Nexus typecheck passed（保留既有 vue-router Volar subpath warning），scoped ESLint passed。

### docs(ai): realign the AI docs contract gate

- `mise run ai-docs:dev` 不再要求已从当前 TODO/PRD 删除的 `P1-AI-250/253/254/255/258` 与旧“文本 + OCR / Nexus AI invoke”措辞；gate 改为检查当前 R2 historical/current recapture、`--requireCurrentVersion`、R9.2 closure、R8-F CatalogService 和 authenticated Nexus token stream 合同。
- 这次只修正验证器与当前 SoT 的漂移，不恢复旧任务 ID，也不把 current-version packaged evidence 标为完成。
- Focused verification：`mise run ai-docs:dev` passed；scoped ESLint passed（保留既有 `.eslintignore` migration warning）。

### assistant: add screenshot permission recovery

- `PermissionChecker` 新增 `screenRecording` status/request：macOS 通过 Electron `getMediaAccessStatus('screen')` 返回 granted/denied/notDetermined，并把显式用户动作深链到 `Privacy_ScreenCapture`；其他平台保持 unsupported/false，不伪造授权成功。
- VoicePanel 仅在 capture/save/translate 返回 `SCREENSHOT_PERMISSION_DENIED` 后展示“前往录屏权限设置”，通过 typed `system:permission:request` 发送 `screenRecording`，并区分 settings opened 与 unavailable；普通 provider/unsupported/unavailable 错误不显示该恢复动作。
- 当前改动只有 focused code/test evidence，不替代 `2.4.13-beta.4` packaged screenshot recapture。
- Focused verification：PermissionChecker、Assistant screenshot contract/runtime 与 VoicePanel recovery 4 files / 37 tests passed；CoreApp node/web typecheck、TuffEx build 与 scoped ESLint passed。

### docs(sdk): expose the permission-gated Localization SDK

- Nexus `i18n` 中英文 API 页从宿主内部 `$i18n:`/`i18nResolver.addMessages()` 说明切换为真实 `sdkapi 260713` 插件合同，覆盖 main/renderer 入口、三项权限、API 返回值、error codes、namespace 隔离、原子注册上限与 lifecycle cleanup；不再建议插件绕过 verified identity 和 host permission。
- `tuffSdkItems`、feature search map 与 API index 新增 Localization SDK discoverability，搜索结果直达 `/docs/dev/api/i18n`；Raycast/uTools gap matrix 同步 AI historical/current evidence 边界与已落地 Browser Data 首版。
- Focused verification：Nexus SDK search + docs API/page/search/prerender 5 files / 23 tests passed，Nexus typecheck passed（保留既有 vue-router Volar subpath warning），scoped ESLint passed。

### r8: expose permission-gated plugin localization SDK

- 新增 `sdkapi 260713` 的 `PluginI18nSDK` / `PluginLexiconSDK`：main `context.utils` 与 renderer exports 共用 typed `plugin:i18n:*` / `plugin:lexicon:*` transport；`getLocale`、localized text、纯 `createMessage`、official/scoped resolve/search/register 均有单一 contract。
- 新增 `i18n.read`、`lexicon.read`、`lexicon.register` 与中英文 permission/category 文案。host handler 要求 verified plugin context、已加载且 marker 达标、permission runtime/manifest declaration/grant 全部有效；payload identity 无法选择其他 plugin overlay。
- `DomainLexiconEntry` 增加 `builtin/catalog/plugin` source provenance；plugin-local entries 由宿主投影为 `plugin:<pluginId>:<localId>`，执行 100 entries/plugin、50 entries/batch、256 KiB/batch 的 plain-JSON 原子验证，禁止 official override/跨插件读取，并在 disable/unload 清理。
- Focused verification：utils 7 files / 56 tests、CoreApp localization/permission 4 files / 29 tests、plugin facade/loader 2 files / 41 tests passed；CoreApp node/web typecheck 与 utils/CoreApp scoped ESLint passed。R8-E closed；R8-F CatalogService 与 R8-G quality gates 继续开放。

### r8: land Domain Lexicon V1 and shared unit conversion source

- `packages/utils/i18n` 新增只读 `DomainLexiconRegistry` 与 53-entry unit baseline；canonical `unit.*` id、zh-CN/en-US labels/aliases、跨 locale 解析、确定性排序与不可变返回值均由 focused contract 覆盖，`KB`/`Kb` 保持精确 symbol 语义。
- PreviewSDK UnitConversion、CoreApp calculation 与 QuickOps preview 改为共用 lexicon-backed conversion core；PreviewSDK resolve options 与 CoreApp/QuickOps host context 显式传递 locale，中文/英文输入均可解析，输出按当前 locale 展示。
- Focused verification：`packages/utils` 3 files / 31 tests、CoreApp PreviewProvider 8/8 与 QuickOps 114/114 passed；CoreApp node/web typecheck 与 scoped ESLint passed。R8-D closed；R8-E Plugin SDK facade、CatalogService 与质量门禁继续开放。

## 2026-07-12

### ai: close packaged OmniPanel context evidence

- visible OmniPanel 通过 clipboard desktop capsule 执行 built-in `AI 解释`，host-owned context 建立 `owner=omni-panel`、`mode=new`、`scope=light` session/package log；UI 展示 local Provider、受控 model 与 Ready result。
- isolated macOS arm64 profile 记录 1 个 context session、1 个 `new / light` package log、2 turns 与恰好 1 次 `/api/chat`；package 只含 `current_input` metadata，不携带跨入口 history。Provider harness 仅保存 role/count/length projection，不保存请求 payload。
- OmniPanel focused 3 files / 38 tests、manifest verifier 与 privacy scan passed。manifest 现为 7 cases / 6 passed，packaged entrypoints=`corebox, assistant, workflow, omni-panel`；仅 real-profile 保持 open。

### ai: close packaged Workflow context lifecycle evidence

- Workflow `Use Model` 不再对尚未创建的 `workflow-context.<run>` 直接 `continue`。每个 run 的首个 `text.chat` step 现在用 `new / session` 建立确定 session，后续 chat step 用 `continue / session` 复用它；不同 run 保持不同 session。
- 多步骤 focused regression 覆盖 `[new, continue, new, continue]`、run 内同 session、run 间隔离、`owner=workflow` / `scope=session` / `workflow.use-model` 与 raw invoke 禁止路径。
- isolated macOS arm64 package 通过受控 Local/Ollama-compatible Provider 完成两次 visible Workflow run：SQLite 记录两个独立 Workflow session、两个 `new / session` package log、每 session 2 turns，Provider 捕获恰好 2 次调用。manifest 现为 6 cases / 5 passed，packaged entrypoints=`corebox, assistant, workflow`，privacy scan passed；OmniPanel packaged 与 real-profile 继续 open。

### quickops: preserve CoreBox query and plugin identity through confirmed Pomodoro Flow

- CoreBox Flow payload 现在由统一 builder 保留 `{ item, query }`，并从 `meta.pluginName` 解析真实 sender/actor；通用 provider id `plugin-features` 不再被冒充为插件 identity，owner 缺失时 sender 回退 `corebox`、actor fail-closed 为 undefined。
- `FlowSelector` focused contract 改为真实 `quickops.start-pomodoro` requireConfirm target；用户确认后携带 one-time confirmation token。主进程 `resolveFlowPomodoroOptions()` 同时消费 direct `text` 与 CoreBox envelope 的 `query`，让 settings-driven custom template、CJK alias、cycle/long-break 参数穿过真实确认链，显式结构化字段继续优先。
- QuickOps main 114 tests、FlowSelector 4 tests、useDetach 10 tests，合计 128/128；focused ESLint、CoreApp node/web typecheck、`quickops:flow-ai:audit --strict` 与本切片 scoped `git diff --check` 已通过。该 focused 产品链不替代真实确认 UI 截图/录屏、clean-screen visual 或 packaged advanced-loop/quit evidence。

### touch-dev-toolbox: validate external URLs before the network gate

- toolbox 配置与 item action 的外链统一通过 `URL` parser canonicalize，只接受 HTTP/HTTPS；`file:`、`javascript:`、畸形或空 payload 在 permission check 前返回 `invalid-url`，不会触发 permission request 或 `openUrl`。
- 补齐 `network.internet` check 异常不继续 request，以及 `openUrl` SDK 缺失/调用失败的稳定 `open-url-unavailable` / `open-url-failed` blocked result；只有授权成功且 host capability 完成后才返回 `started`。
- Canonical dev-toolbox suite 12/12、package-test ESLint、Prelude ESLint `--no-ignore`、`node --check`、边界顺序检查与本切片 scoped `git diff --check` 已通过。R5 仍保持 partial，其他 shell / OS / network / fs 与 Widget sandbox 长尾继续开放。

### tuffex: make GroupBlock header toggle semantic without nesting actions

- `TxGroupBlock` 不再把整段 header `div` 直接绑定 click；collapsible 模式新增全幅原生 `button type="button"`，提供 `aria-expanded`、`aria-controls`、可见 focus ring 与浏览器原生 Enter/Space 激活，静态 group 不渲染交互入口。
- toggle button 与 `header-extra` 成为 sibling 层，标题/图标区域继续把 pointer 交给全幅 toggle，但 extra 中的 `TxButton` / 原生按钮不再嵌套在 toggle 内，也不会因冒泡意外折叠分组；既有 header/label/toggle class 与存储、动画、emit contract 保持不变。
- GroupBlock focused 5/5，连同 Tree/TreeSelect 相关回归共 14/14；focused ESLint、TuffEx 全包 `vue-tsc` 与本切片 scoped `git diff --check` 已通过。R6 继续保留其他非语义交互、legacy Menu 与 visual smoke 长尾。

### tuffex: add Tree roving focus and keyboard navigation

- `TxTree` 现在只保留一个可 Tab 进入的 enabled `treeitem`，disabled item 会被跳过；Enter/Space 执行选择，ArrowUp/ArrowDown/Home/End 移动焦点，ArrowRight/ArrowLeft 完成展开、进入子级、折叠与返回父级。
- 内置 caret/checkbox 保留 pointer 操作但退出行内 Tab 序列；`TxTreeSelect` 自定义 `TxCardItem` 同样把键盘入口交给外层 treeitem，并移除内外两层同时处理同一次 click 导致的重复 selection emit。
- Tree/TreeSelect focused 9/9，Checkbox/Transfer/Cascader 相关消费回归合计 25/25；focused ESLint、TuffEx 全包 `vue-tsc` 与本切片 scoped `git diff --check` 已通过。R6 仍保持 partial，其他主路径非语义交互、legacy Menu 与 visual smoke 继续开放。

### touch-translation: prove network provider fail-closed boundary

- canonical translation suite 新增行为级矩阵，从真实 `onFeatureTriggered('touch-translate')`、debounce 和 provider config 路径进入 `startTranslationRequest`，覆盖 permission SDK 缺失、`network.internet` 拒绝、check 异常与 request 异常。
- 每条场景都给 `http.get/post` 注入 trap，证明 permission failure 时 provider/network 调用保持为零；check 异常不会继续 request，拒绝/request 异常只请求 canonical `network.internet`。
- Focused network matrix 4/4、translation 本包 tests 11/11、package-test scoped ESLint、plugin `vue-tsc`、Prelude `node --check`、边界顺序检查与 `git diff --check` 已通过。canonical translation 全文件仍有 3 个既有 generated bundled-runtime ENOENT，未用本轮 focused 结果冒充完整 suite closure。

### tuffex: make DataTable row interaction explicit and keyboard accessible

- `TxDataTable` 新增默认关闭的 `interactiveRows`：只读表格继续不产生额外 Tab stop；opt-in rows 获得稳定 tabindex、pointer cursor、focus-visible 和 Enter/Space 行级激活，内部 button/control 的键盘事件不会冒泡触发行动作。
- Nexus updates、pending review 与 plugin list 三个真实 `@row-click` 表格已显式 opt-in；现有 mouse `rowClick` emit 与 row/column/class contract 不变。
- 同步修复 `TxContextMenuPanel`、`TxDropdownMenu`、`TxDrawer` 在 Nexus `noUncheckedIndexedAccess` 下暴露的索引类型缺口。DataTable focused 7/7、相关 TuffEx 44/44、ESLint、TuffEx `vue-tsc`、Nexus typecheck 与 `git diff --check` 已通过；Nexus typecheck 仍输出既有 vue-router Volar export warning，但退出码为 0。

### quickops: connect custom Pomodoro templates to Flow delivery

- `quickops.start-pomodoro` 的 confirmed Flow delivery 现在会把字符串或 object payload 中的 `text` 交给 canonical `parseQuickOpsQuery()`，把 settings-driven template 的 focus/break/cycle/long-break 参数传入 shared runtime；显式结构化字段继续优先，只由文本 parser 填补缺失值。
- 修复 CJK 自定义模板名称/别名只能在空格边界命中的问题；含中文关键字改为连续文本匹配，`开始写作冲刺` 可消费 `写作冲刺` 别名，disabled template 继续不匹配，英文模板仍保留词边界。
- CoreApp QuickOps 5 files / 142 tests、官方插件 26 tests、focused ESLint、主进程 typecheck 与 `git diff --check` 已通过；真实 CoreBox confirmation UI、packaged advanced-loop path、clean-screen visual 与 packaged quit cleanup evidence 仍开放。

### touch-system-actions: strengthen shell fail-closed evidence

- canonical plugin suite 不再依赖当前机器是否恰好缺少 safe-shell；测试显式注入 unavailable runner 并固定受支持 runtime platform，证明 shell capability 在 permission request 前阻断。
- 新增 permission check 抛错回归，断言不会继续 request `system.shell`，也不会进入 safe-shell runner；既有 SDK 缺失、拒绝、request 异常与 native main-window 独立路径继续通过。
- Focused Vitest 17/17、ESLint、Prelude `node --check`、边界顺序检查和 `git diff --check` 已通过；生产 Prelude 与 manifest 无需修改。

### touch-batch-rename: prove fs.write fail-closed boundary

- 新增 Prelude 行为测试，覆盖 apply 的 permission SDK 缺失、用户拒绝、permission check 异常与 request 异常，以及 undo 的 `fs.write` 拒绝路径。
- 测试在插件加载前注入 `fs/promises.rename` trap，并使用真实临时文件断言原文件保留、目标文件不存在；所有 blocked 路径同时保持 rename、确认 dialog、撤销记录 storage 读写为零。
- Focused `node --test` 5/5、ESLint `--no-ignore`、`node --check`、边界静态检查和 `git diff --check` 已通过；R5 继续保留其他 shell / OS / network / fs 与 Widget sandbox 长尾。

### tuffex: restore Dropdown state and keyboard navigation

- `TxDropdownMenu` 的可选 `modelValue` 不再被默认 `false` 强制成受控模式；未传 `v-model` 的既有用法现在由内部状态持有打开/关闭，同时继续发送 `update:modelValue` / `open` / `close`。
- Dropdown 打开后聚焦首个可用 menu item，支持 ArrowDown / ArrowUp 循环导航与 Home / End 跳转；嵌套 menu 的键盘事件不会被父 menu 接管。
- `TxDropdownItem` 补 Space 激活与 disabled `menuitem` / `aria-disabled` 语义；focused 9/9、ESLint、TuffEx 全包 `vue-tsc`、静态检查和 `git diff --check` 已通过。

### tuffex: add ContextMenu keyboard navigation

- `TxContextMenu` 打开后聚焦首个可用 menu item，支持 ArrowDown / ArrowUp 循环导航与 Home / End 首尾跳转，并在导航时跳过 disabled item。
- `TxContextMenuItem` 补 Space 激活；disabled item 继续阻断 select/close，同时保留 `role="menuitem"` / `aria-disabled="true"` 且不进入 Tab 序列。
- Focused ContextMenu 15/15、ESLint、TuffEx 全包 `vue-tsc` 与 `git diff --check` 已通过；row interaction、更多 legacy Menu 与 visual smoke 仍开放。

### touch-browser-open: bind specific-browser actions to detected targets

- specific-browser action 不再直接信任 item payload 的 browser `id/name/target`；每次浏览器检测先清空并重建仅内存 canonical map，执行时要求 `id + target` 精确匹配当前检测结果。
- 未知 action、未知 browser、同 ID 错配 target 在 permission request 前返回 `unsupported-action` / `browser-target-not-allowed`；合法 action 使用 canonical name/target 执行并写 recent storage，忽略 payload 伪造 name。
- 行为测试覆盖 unknown action/target、target mismatch、permission denied、permission SDK unavailable 与 canonical success/spawn 参数，共 6/6；ESLint、语法检查、边界顺序扫描和 `git diff --check` 已通过。

### tuffex: trap focus inside TxDrawer

- `TxDrawer` 在 visible modal 状态下接管 Tab：dialog root/外部焦点进入首个可聚焦控件，末尾 Tab 回到首项，首项 Shift+Tab 回到末项。
- Drawer 内没有可聚焦子控件时，Tab 保持焦点在 `role="dialog"` root；既有打开聚焦 root、Escape / mask / close button 关闭与关闭后恢复原焦点合同不变。
- Focused Drawer 13/13、ESLint、TuffEx 全包 `vue-tsc`、静态键盘扫描和 `git diff --check` 已通过；legacy Menu 与 visual smoke 仍开放。

### tuffex: make DataTable sortable headers semantic

- `TxDataTable` 可排序列继续使用 `<th scope="col" aria-sort>` 表格语义，但移除 `<th>` 自身的 tabindex、click 与 Enter/Space 手写处理。
- 排序 label/slot 与 sort indicator 迁入满尺寸 `button type="button"`，sortable cell 的 padding 转移到按钮，保留原点击面积、列宽、fixed/nowrap/header class 与三态排序合同；非 sortable header DOM 不新增包装。
- Focused DataTable 5/5、ESLint、TuffEx 全包 `vue-tsc`、静态扫描和 `git diff --check` 已通过；整行 row interaction 保留为后续独立切片。

### touch-window-manager: bind shell execution to runtime platform

- 修复 action payload 的 `platform` 被执行路径直接信任的问题：`executeAction` 现在只使用实际 `process.platform`，`onItemAction` 在 permission request 前拒绝 payload/runtime platform mismatch。
- unsupported runtime 同样在 permission 与 shell 之前 fail-closed，避免伪造 `darwin` / `win32` payload 选择错误的 AppleScript、PowerShell 或 `open -a` 分支。
- 新增 lifecycle 行为测试并给 `execFile` / `spawn` 注入 trap，覆盖 platform mismatch、unsupported runtime、permission SDK unavailable、denied、check failure、request failure；focused 6/6、ESLint、语法检查、执行顺序静态检查和 `git diff --check` 已通过。

### tuffex: make TxCheckbox semantic

- `TxCheckbox` 根节点从 `div role="checkbox"` 收为原生 `button type="button" role="checkbox"`，使用原生 disabled 与 Enter/Space 激活语义，移除手写 tabindex / keydown，并保留 `aria-checked`、label/slot、`update:modelValue` / `change` 和现有 class contract。
- 组件补最小 button reset，避免在表单中触发 submit 或继承浏览器默认边框、字体和背景。
- Checkbox focused 7 tests、DataTable / Tree / TreeSelect / Transfer / Cascader 直接消费者 19 tests、ESLint、TuffEx 全包 `vue-tsc`、静态语义扫描与 `git diff --check` 已通过；R6 仍保持 partial。

### quickops: expose advanced Pomodoro loop capability accurately

- `QuickOpsDiagnosticsInfo` 新增 `pomodoroAdvancedLoopSupported` 与 `pomodoroCustomTemplateCount`，CoreApp diagnostics producer 从当前 runtime/settings 生成真实只读能力状态，并在诊断文本中显示 loop support 与启用的自定义模板数量。
- 官方插件 settings summary 改为消费 host diagnostics，显示 `supported` / `unsupported` / `unknown-host-capability`；旧 host 缺字段时保持明确 unknown，不再固定标记 `pending-host-capability`。
- CoreApp QuickOps focused tests 123/123、官方插件 tests 26/26、主进程 typecheck 与 `git diff --check` 已通过。全文件 scoped ESLint 仍被目标文件既有风格债务阻断，本轮新增行未出现在报错位置；真实 advanced loop 产品路径、clean-screen visual 与 packaged app quit cleanup evidence 仍开放。

### tuffex: close TxStep verification and make TxSwitch semantic

- `TxStep` 原生 button 切片已通过仓库本地 Vitest 5/5、focused ESLint、静态语义扫描与 `git diff --check`；此前 pnpm non-TTY module-dir 清理提示不再作为验证阻塞。
- `TxSwitch` 根节点从 `div role="switch"` 收为原生 `button type="button" role="switch"`，使用原生 disabled 与 Enter/Space 激活语义，移除手写 tabindex / keydown，并保留 `aria-checked`、`update:modelValue` / `change` 和现有 class contract。
- Switch 样式补最小 button reset；focused Vitest 3/3、ESLint、TuffEx 全包 `vue-tsc`、静态语义扫描与 `git diff --check` 已通过。R6 仍保持 partial，继续收 legacy Menu/Drawer、剩余非语义交互与 visual smoke。

### touch-window-presets: prove shell permission fail-closed boundary

- 新增 Prelude lifecycle 行为级测试，覆盖 `system.shell` permission SDK 缺失、用户拒绝、permission check 异常与 request 异常四条路径。
- 测试在加载插件前注入 `execFile` trap，并断言四类失败都返回稳定 blocked reason、shell 调用次数保持为零；生产执行逻辑不变。
- Focused `node --test` 4/4、ESLint `--no-ignore`、`node --check`、执行顺序静态检查与 `git diff --check` 已通过；R5 仍保持 partial，继续收其他 shell / OS / network / fs 与 Widget sandbox 长尾。

### ai: harden packaged Workflow dispatch and clone persistence

- Workflow 编辑器在进入 typed Intelligence SDK 前会复制 reactive `toolSources`，避免 Vue proxy 触发 Electron structured-clone 失败。
- 新建或从内置模板派生的 workflow 现在生成 workflow-scoped step ID，并同步重写 model `previousStep` 引用，避免全局主键 `intelligence_workflow_steps.id` 与内置步骤冲突。
- focused workflow editor `12 tests`、CoreApp web typecheck、focused lint、production bundle 与 isolated macOS arm64 package 均通过。fresh-profile packaged run 已成功持久化并进入 `text.chat` 执行，最终以明确的 `[Intelligence] No enabled providers for text.chat` domain result 结束；该 smoke 不等同于 Provider 成功，也不关闭 Workflow entrypoint owner/scope context evidence。

### ai: productize tombstone context explain

- Intelligence Audit 现在对 `memory-tombstoned` package exclusion 独立计数，并在 inline summary 与 explain drawer 显示中英文“删除后移除”reason/notice。
- explain summarizer 继续只投影 sourceType/sourceId/reason/tokenEstimate；unknown reason 安全回退，不展示被删 MemoryItem、prompt 或 turn 原文。
- focused summarizer 9 tests、CoreApp web typecheck、catalog JSON parse 与 focused lint-error check 通过；packaged/real-profile evidence 未采集。

## 2026-07-13

### corebox: preserve programmatic query context

- Typed `setQuery` transport requests now carry optional `TuffContext` through the main-process renderer bridge, and CoreBox attaches that context only to the forced search triggered by the programmatic query.
- Plugin feature activation keeps an immutable submission snapshot while widget render metadata refreshes, preventing a refreshed custom-render item from replacing the feature payload executed by the plugin.

## 2026-07-11

### ai: productize archived context continuation

- 修复显式 continue 指向 archived/expired/idle session 时复用旧 `sessionId` 重插、触发主键冲突并退化为 current-input-only 的问题；现在创建新 session 与 metadata-only `session_start` checkpoint。
- 新 session 只继承一份经过既有 policy 校验的 CompressionSnapshot 或 secret-free legacy summary；blocked/missing 返回 excluded/unavailable，旧 raw turns、MemoryItem 和摘要正文不进入公开 context metadata。
- `ContextContinuationSummary` 已进入 utils/tuff-intelligence typed contract；官方 `touch-intelligence` widget 安全展示 boundary reason/status。CoreApp 59 tests、插件 42 tests、utils SDK 46 tests、plugin production build 与 node/web typecheck 通过；packaged/real-profile evidence 未采集。

### ai: close R9.2 P0/P1 context hygiene and entrypoint evidence

- R9.2 六个 closure 子任务实现 `6/6`：Memory governance/scope、host context execution/CoreBox、Memory Review、CompressionSnapshot、entrypoint/evidence 与 CoreBox AI dispatch idempotency 均完成；workspace/project memory 在稳定 `scopeRef` migration 前继续 fail-closed，本轮未执行 schema/data migration，自动长期记忆仍关闭。
- Workflow `Use Model` 以每 run 独立 session 执行，OmniPanel AI action 与 Assistant voice 使用 `new + light`；CoreBox 保留 new/continue/stateless。CoreBox set-query 现在把 trusted one-shot entrypoint context 绑定到实际 item execution，并抑制同值 reactive duplicate search，避免 Assistant 意图在搜索/执行边界退化为 CoreBox history。
- canonical `touch-intelligence` build 已同步到 CoreApp bundled runtime seed；同版本 signature drift 会在启动时刷新旧 seed，避免 packaged app 继续运行缺少 entrypoint context 的陈旧插件 bundle。
- 分级 evidence manifest 已通过：unit `1 passed`、controlled `1 passed`、packaged `2 passed`、real-profile `1 open`，privacy scan passed。isolated macOS arm64 packaged Electron 证明 CoreBox owner=`corebox`/scope=`retrieval` 与 Assistant owner=`assistant`/scope=`light`，每次操作各触发一次受控 `/api/chat`；OmniPanel/Workflow packaged 与真实用户 profile 不在本次完成声明内。

### ai: preserve CoreBox model selection and reconcile Stable status

- 修复 `touch-intelligence` 模型选项刷新时把 session 的 `selectedProviderId` / `selectedModel` 当成 `providerId` / `model` 读取、从而清空用户显式选择的问题；刷新后只在 provider/model 已不再可用时回退自动选择。
- 补强 AI 测试加载边界：mock harness 在 subject module 前注册，避免静态导入提前加载 Electron/Sentry 依赖；CoreApp AI 31 files / 178 tests、插件 Intelligence 40 tests、Intelligence package 36 tests 与 utils SDK focused 42 tests 已通过。
- `ai-2.5.0-plan-prd.md` 已与 Evidence Matrix、`TODO-AI.md` 和 visible evidence report 对齐：Stable packaged gate 为 13/13 passed，旧的 evidence-open 清单改为已完成；下一高优先级回到 R9.2 Memory governance/scope 与 host context execution。

### ai: fail closed unsafe Memory injection and plugin management

- ContextHygiene usable-memory 策略现在同时检查 enabled、normal privacy、正数 TTL、tombstone SQL 过滤和 scope：只允许 global 与 `sourceSessionId` 精确匹配的 session memory；workspace/project 在没有稳定 `scopeRef` 时不再注入，且应用层会对数据库结果再次执行同一 fail-closed policy。
- Memory 保存会同时扫描 content、summary 与 tags 的 secret pattern，避免安全正文配合敏感摘要/标签绕过 MemoryPolicy；`ttl` 合同明确为从最近 `updatedAt` 开始的正数毫秒生命周期。
- Plugin Intelligence facade 已移除 raw context prepare 与 Memory list/save/enable/delete，主进程 handler 同时按 `HandlerContext.plugin` 拒绝绕过 facade 的调用；raw typed-event handler regression 覆盖五个 host-only event。`revalidatePackageMemories()` 会在共享 assembler 前重新读取 tombstone/enabled/privacy/TTL/scope，移除 prepare 后失效项并更新 metadata-only package log。未执行任何 SQLite schema/data migration。

### ai: execute governed ContextPackage content in CoreBox

- 新增 typed `contextInvoke()` / `contextStream()` 与 host-owned `IntelligenceContextExecutionService`；stream/non-stream 共用 `ContextMessageAssembler`，忽略插件提供的 user/assistant history，只按 system policy -> validated summary -> recent turns -> Memory -> untrusted retrieval reference -> current input 组装有界 provider messages。
- Context execution 使用 `host:*` / `plugin:*` actor namespace 隔离 session，最终 Memory 复核紧邻 assembler；policy-blocked current input 不会通过 fail-soft 绕过，prepare/revalidate 不可用时只回退到经过清洗的 system + current input，并返回 metadata-only `context_prepare_failed` 摘要。无历史模式仍可消费 retrieval，但不会携带 summary/recent turns/Memory；成功响应会写入受治理 assistant turn。
- 官方 `touch-intelligence` 已迁移到新 contract，插件只持有 package/session/citation 安全摘要；CoreBox widget 增加新会话、继续、无历史三种显式模式，保留 provider/model 选择。旧宿主兼容 invoke 也会剥离插件 history，不能绕开 host-owned 边界；packaged Electron closure 见本日最新 R9.2 条目。
- `@talex-touch/tuff-intelligence` 现在直接复用 `@talex-touch/utils` 的 canonical `DEFAULT_CAPABILITIES`，消除两份默认 capability registry 漂移，同时保留 package 自有 message/runtime 类型扩展。
- Controlled verification：CoreApp AI `29 files / 173 tests`、官方插件 `41 tests`、utils Intelligence SDK `44 tests`、tuff-intelligence `36 tests` 通过；workspace node/web typecheck 与 `touch-intelligence` production build 通过。以上不替代 packaged Electron 可见证据。

### workspace: complete renderer and package optimization wave

- Added the repository-wide HTML dry-run audit at `docs/engineering/reports/optimization-dry-run-2026-07-11/index.html`, covering renderer complexity, Tuffex delegation, shared-utils candidates, OSAdapter bypasses, monolith boundaries, package naming, and generated artifacts.
- Extracted stateful renderer logic into focused CoreApp/Nexus/plugin composables, including user identity, dialog interaction/autosizing, locale orchestration, provider-registry administration, analytics data, and word-lyric runtime behavior.
- Migrated duplicated UI primitives to `@talex-touch/tuffex`, removed legacy wrapper files/callers, and added parity contracts for button, checkbox, icon, tag, tabs, and progress behavior.
- Consolidated canonical sleep, plugin image-data URL handling, indexing snapshot cloning, and environment/OSAdapter capabilities in `@talex-touch/utils`; system actions and app launching now route through typed adapters instead of local platform branching.
- Split the plugin transport, app provider, QuickOps, search/indexing, updater, governance, analytics, and provider-registry monoliths by runtime responsibility while preserving public behavior through focused contracts.
- Normalized package-backed plugin names, moved the internal analysis app to `apps/tuff-analyse`, promoted the builder example to `examples/tuff-builder.example.ts`, and removed approved generated outputs; CoreApp now exposes the documented package typecheck script.

### corebox: unify AutoPaste freshness gating

- CoreBox renderer hooks now share one clipboard freshness predicate and track whether active clipboard state came from implicit AutoPaste or an explicit user action.
- Hidden clipboard changes no longer populate active renderer state directly; shortcut reopen and implicit search refresh both reject ineligible or expired clipboard items, while explicit paste and plugin execution retain manual clipboard semantics.

## 2026-07-10

### docs: plan R9.2 ContextHygiene P0/P1 closure

- 新增 R9.2 ContextHygiene Trellis 父任务与 5 个子任务，补齐 PRD / Design / Implement，规划 `5/5`、实现 `0/5`；顺序为 Memory governance/scope -> host context execution/CoreBox -> Memory Review 与 CompressionSnapshot -> 多入口/evidence。
- 记录两项当前真实缺口：CoreBox 仅把 ContextPackage 安全摘要写入 metadata，retrieval/memory 尚未由宿主统一进入 provider messages；workspace/project memory 缺稳定 `scopeRef`，在迁移确认前必须 fail-closed。
- 同步 `TODO.md`、R8/R9 execution plan、2.5.4 PRD/details 与 Quality Baseline；自动长期记忆、R9.3 本地模型和 R9.4 ASR runtime 继续后置，SQLite schema/data migration 保留单独确认门禁。

### goal: snapshot R4-R6 small-slice progress

- 当前 Goal `R4-R6小切片并行QuickOps、Plugin Trust Boundary、UI/TuffEx，不抢当前稳定化窗口。` 记录为 `paused / partial`；本次只同步日期进度，不修改 scope，后续单独讨论是否拆分或收窄。
- R4 已完成并验证 safe Flow `statefulRuntime` / cleanup marker、clean-screen visual contract marker 与 Pomodoro 默认只读模板 contract；真实 visual evidence、高级循环 runtime 与 app quit cleanup 仍开放。
- R5 已完成并验证五个官方插件的 clipboard SDK / permission fail-closed 小切片，不回退 `navigator.clipboard`；shell / OS / network / fs 权限缺失路径和 Widget sandbox 仍开放。
- R6 已完成并验证 `touch-music` 与七个 TuffEx 语义清理切片；`TxCardItem` 默认非交互语义已收敛。`TxStep` 原生 button 源码与 focused test 调整已落，但 Vitest / ESLint 验证受 pnpm `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 阻塞，因此不计为已验证闭环。
- 下一次 Goal 复盘重点：评估是否按 QuickOps runtime/evidence、Plugin permission matrix、TuffEx semantics/visual smoke 拆为三个更短、可独立关账的目标。

## 2026-07-07

### nexus: bound plugin store APIs

- `/api/store/search` now uses `searchStorePlugins` instead of loading every store plugin/version into the route handler; D1 mode pushes approval/category/keyword filters, latest visible approved version selection, total count, and limit/offset into SQL.
- `/api/store/plugins` now reuses the bounded store list helper with limit/offset metadata; compact listing returns only latest-version card fields, while non-compact D1 responses hydrate approved versions only for the current bounded page.
- Added store-search D1 indexes for approved plugin/category listing and approved version lookup, plus focused Nexus tests for D1 binding/mapping, memory fallback pagination/latest-version semantics, route pagination clamps, compact field trimming, and bounded D1 version hydration.
- Store front page now consumes compact `/api/store/search` directly with remote debounce, server-side category/keyword refresh, and offset-based "load more" pagination, so first paint no longer depends on fetching all store plugins for local filtering.
- Store front page detail overlay now lazy-loads the dialog, tab shell, metadata header, and shared detail renderers only when a plugin detail is requested, keeping interaction-only plugin detail code out of the initial store page import graph.

### nexus: trim dashboard first-visit imports

- Dashboard devices page now lazy-loads `GeoLeafletMap.client.vue` only when a device map is expanded, keeping Leaflet map code out of the first-visit synchronous import graph; added a focused performance boundary test for the lazy map contract.
- Dashboard overview page now lazy-loads `DashboardSparklineChart.client.vue` and `GeoLeafletMap.client.vue`, keeping ECharts/Leaflet client widgets behind the chart/map render boundary instead of the page's synchronous imports.
- Dashboard storage page now lazy-loads the sync details `FlipDialog` and sparkline chart client only when their UI boundaries render, trimming dialog/chart code from the storage route's first-visit synchronous imports.
- Dashboard team page now lazy-loads team action `FlipDialog` overlays and the credit trend sparkline client at their render boundaries, avoiding modal/chart code in the team route's first-visit synchronous imports.
- Dashboard account page now lazy-loads the profile edit `FlipDialog` only when the edit overlay opens, keeping dialog code out of the account route's first-visit synchronous imports.
- Dashboard notifications page now lazy-loads the browser setup `FlipDialog` only when the setup overlay opens, while keeping the setup trigger in the initial page without dialog code.
- Dashboard OAuth page now lazy-loads the create-app `FlipDialog` only when the create dialog opens, while keeping the primary create trigger in the route's initial UI.
- Dashboard API keys page now lazy-loads the create-key `FlipDialog` only when a create overlay opens, preserving both populated and empty-state create triggers without dialog code in the initial route graph.
- Dashboard admin analytics page now lazy-loads the geo `GeoLeafletMap.client.vue` widget behind the geo analytics data boundary, avoiding Leaflet code in the analytics route's initial synchronous imports.

### corebox: bound subsequence fallback scans

- SearchIndex subsequence fallback now pushes the subsequence shape into SQLite with an escaped `LIKE` prefilter, deterministic short-keyword ordering, and a hard 2k scan cap before JS scoring, reducing hot-path keyword rows scored in memory while preserving fuzzy recall.
- Added focused CoreApp coverage for LIKE prefilter generation, scan-limit clamping, and fallback result ordering.

### corebox: parallelize hot search-index reads

- AppProvider 与 FileProvider 搜索首段 now dispatch exact keyword lookup, short-query prefix lookup, and FTS lookup together, so independent SQLite/SearchIndex reads overlap instead of stacking on the user-visible `onSearch` path.
- Added deterministic CoreApp tests proving prefix/FTS reads start before exact lookup resolves; n-gram/subsequence fallback remains gated after first-pass candidate aggregation.
- AppProvider and FileProvider search now observe `AbortSignal` before starting search-index work, after parallel candidate reads, and after candidate DB fetch/processing boundaries, avoiding stale query row loads/scoring when CoreBox supersedes app/file searches.
- Search gatherer now gives each provider call a per-task `AbortSignal`, aborts it on provider timeout, and clears fast-layer timeout timers once fast providers complete, so timed-out fast/deferred providers stop stale work and completed fast searches do not leave extra pending timers.

### nexus: bound intelligence chat and provider probe streams

- `/api/admin/intelligence/chat` and `/api/dashboard/intelligence/providers/:id/probe-stream` now clamp provider/request stream timeouts to 5s–120s and apply them to stream open plus per-chunk waits, so stalled LLM providers produce typed SSE errors and close instead of leaving callers waiting indefinitely.
- LangChain provider clients now use static imports and pass timeout through OpenAI/Anthropic-supported config paths; added focused fake-timer utility coverage for bounded promises and async iterables.

### intelligence: surface orchestration decisions as AEP events

- `@talex-touch/tuff-intelligence` now dispatches `skillRequests` and `subAgentTasks` from normalized agent decisions as first-class AEP runtime envelopes (`skill.request` / `subagent.task`) instead of silently dropping them.
- Added focused DecisionDispatcher coverage that preserves request/task payload identity and correlation ids, giving CoreApp/Nexus callers a stable hook for LangChain/DeepAgent-style skill loading and delegated agent execution.

### nexus: bound shared runtime bridge stalls

- Nexus intelligence-agent shared runtime bridge now enforces a bounded AEP stream timeout, emits a `shared_runtime_timeout` error event, and persists failed runtime session state instead of letting `/api/admin/intelligence-agent/session/stream` callers wait indefinitely.
- Added focused bridge tests covering the successful shared AEP stream path and a fake-timer never-yielding runtime stream, locking the failed metrics/session behavior without sleeping in real time.

### corebox: avoid stale file search cleanup waits

- FileProvider search now schedules stale search-index candidate removal off the user-visible `onSearch` path, so missing DB rows no longer make file search wait on FTS cleanup or worker initialization latency.
- Added focused CoreApp coverage where stale candidate cleanup never settles; `onSearch` still returns an empty result promptly while scheduling `removeProviderItems` best-effort cleanup.

### corebox: batch app search exact keyword lookup

- AppProvider 多词精确搜索复用现有 `SearchIndexService.lookupByKeywords` 批量查询，一次读取 term / phrase 命中集合，避免按 term 并发打 `keyword_mappings` 查询造成可感知延迟与 SQLite 读放大。
- 新增 focused AppProvider 测试，锁定多词交集语义、phrase lookup 复用 batch 结果、候选加载仍只返回共同命中应用，并确保旧的 per-term `db.select({ itemId })` 路径会失败。

### corebox: align AutoPaste freshness behavior

- AutoPaste 快捷键唤起时刷新剪贴板快照，并统一以 `freshnessBaseAt` / `observedAt` 判断新鲜度；超过 `autoPaste.time` 的旧内容不会再经由短文本或重复长文本路径自动填入。
- `autoPaste.time = 0` 明确保留为无限制，`-1` 为关闭；Nexus CoreBox 架构文档同步为当前实际行为。

## 2026-07-06

### docs: refresh P0 roadmap and execution order

- 当前规划入口统一到 root / CoreApp `2.4.13-beta.3`，避免 README / TODO / Roadmap / Quality Baseline 继续停留在 `2.4.13-beta.1` 或旧 HEAD 口径。
- 首要任务顺序更新为：先拆分并验证当前 dirty worktree，再收尾 Trellis bootstrap，然后推进 R3 attach-only natural evidence、Nexus deployed preview evidence，最后等待 R1 signing materials 闭环。
- R2 AI Stable 当前按 13/13 visible surfaces passed 处理；后续 Assistant / OmniPanel / screenshot 只作为产品化 follow-up，不反向阻塞 Stable gate。

## 2026-07-04

### docs: add stability and architecture optimization entry

- 新增 `docs/plan-prd/04-implementation/Stability-Architecture-Optimization-2026-07-04.md`，把当前文档读取顺序、稳定性优先级、架构代码优化落点、执行切片和最小验证矩阵集中到一个实施入口。
- 同步 `docs/plan-prd/README.md`、`docs/INDEX.md` 与 `docs/plan-prd/04-implementation/README.md`，让稳定性 / 架构优化入口可从主文档索引进入。
- 修正 `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` 的当前执行版本口径，移除过期本地 `HEAD` / dirty worktree 描述，避免长期质量基线承载易漂移环境事实。

### nexus: record guarded performance status and deployed preview gate

- Nexus performance 当前记录为约 `98%` guarded：local Wrangler runtime smoke、PWA precache trim、Cloudflare root SQL dump retention、bfcache source guard、worker/runtime evidence guard 与 deployed preview collector guard 已闭合。
- 最终 production 结论仍缺 deployed Cloudflare Pages preview HAR、真实 provider callback smoke、authenticated dashboard runtime smoke 与真实 bfcache hit；完成口径以 `node build/check-runtime-evidence.mjs --require-deployed-preview` 通过为准。
- `review-wlcb1-new-api-dryrun` 是独立只读运维评估，已归档为完成；不关闭 Nexus performance / Cloudflare production gate。

## 2026-06-27

### r9: add manual Memory Review and tombstone list gate

- Intelligence Audit 新增 host-side Memory Review 最小面板：用户手动输入候选后先调用 `contextEvaluateMemory`，只有 `suggested` 且内容未变更时才暴露显式保存按钮并调用 `contextSaveMemory`；`rejected` / `needs_review` 保持 fail-closed，不写库、不走插件侧自动长期记忆。
- 新增 `contextListMemories` 与 `contextSetMemoryEnabled` typed SDK / CoreApp channel，默认只返回 normal、未 tombstone 的 MemoryItem；Memory Review 面板已能展示已保存记忆、禁用/重新启用记忆，并通过 `contextDeleteMemory` 写 tombstone 删除。
- 新增 / 更新 focused tests 覆盖先评估后保存、rejected / needs_review 不暴露保存入口、内容变更后必须重新评估、保存后刷新列表、禁用走 `memory:set-enabled`、删除走 tombstone，以及 memory typed event mapping；R9.2 仍需继续补完整 Memory 面板搜索/编辑、OmniPanel/Workflow/Assistant 最近路径与更多真实数据 evidence。
- `TODO.md` 新增 R9.2 ContextHygiene 剩余 TODO 专项表，`ai-2.5.4-context-hygiene-memory-details.md` 的验收清单改为状态化表格，并同步 README 与 R8/R9 执行计划，明确剩余 CompressionSnapshot、Memory 搜索/编辑/来源审计、entrypoint integration 与真实数据 evidence。

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
- `@talex-touch/tuff-intelligence` 镜像 SDK 已补齐 knowledge/context typed events 与 `contextListPackageLogs` / `contextListCheckpoints`，CoreApp Intelligence Audit 日志展开区可按 trace 懒加载 context package metadata-only 摘要，并按 session 显示 checkpoint boundary type/reason/scope/metadata keys；ContextPackage metadata-only explain drawer 外壳已展示 included / excluded source id、reason、token estimate 与 citation metadata，覆盖 excluded/pruned/policy-blocked 证据，不展示 prompt/turn/retrieval content。
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
- Preflight report 覆盖 required tables、`scan_progress` path-only/source-scoped shape、blank/invalid progress rows、legacy `file_fts` retain-unchanged policy、`search_index` FTS5 shadow tables、provider row parity、keyword/meta orphan 与 meta coverage，并新增 `migrationDryRun` plan 输出 approval/blocker、预计影响 rows、rollback 与 verification。
- CLI 支持 `--output <report.json>` 生成可附到迁移审批的只读 evidence artifact；focused tests 覆盖 path-only、blocked、clean source-scoped、unsafe rows report 与文件落盘。该切片只提供 SQLite/FTS durable ownership 与 `scan_progress` source-scoped migration 前置证据，不代表真实迁移已执行。

### r3: make scan_progress runtime source-scope compatible

- 新增 `scan-progress-schema` helper，运行期检测 `scan_progress` 是否存在 `source_id`，避免在真实 schema migration 前硬编码 path-only 假设。
- FileProvider scan progress 读取、runtime reset cleanup 与 SearchIndex worker upsert 在 source-scoped 表上按 `file-provider` + path 隔离读写；旧 `scan_progress(path primary key, last_scanned)` 表继续走现有 path-only Drizzle 逻辑。
- Focused tests 使用真实临时 SQLite 覆盖 source-scoped read/delete/upsert isolation；该切片不创建/迁移 `scan_progress` schema，不执行数据 backfill。

### r3: add controlled scan_progress source-scope migration helper

- `planScanProgressSourceScopeMigration()` 只读输出 `scan_progress` source-scoped migration 的 approval、schema/data rewrite、blocker、rollback 与 verification 信息。
- 新增 `search:scan-progress-migration` CLI，默认只读输出 plan；只有显式传 `--execute --confirm-source-scope-migration` 才会执行 path-only -> `PRIMARY KEY(source_id, path)` 迁移，使用 staging table、`BEGIN IMMEDIATE`、`scan_progress_path_only_backup` 与 path index。
- Focused tests 使用真实临时 SQLite 覆盖旧 DB 迁移、新 DB 初始化、unsafe rows blocked、未确认拒绝执行与 post-migration source-scoped shape；该 helper 尚未接入生产 DB migrations，也未执行真实 profile 迁移。

### r3: add Settings indexing diagnostics evidence verifier

- 新增 `settings:indexing-diagnostics:verify` CLI，可读取 CoreBox indexing diagnostics JSON 或 packaged probe envelope，并复用 Settings recent task chip helper 验证 recent task `jobId/time/summary` 与 `duration/trigger/reason/attempt/code` 审计字段可见。
- Verifier 输出只包含 source/chip/audit gate 摘要，不回显 raw diagnostics/root path；focused tests 覆盖通过、缺字段失败与 `diagnostics.sources` envelope。
- 该切片只提供 durable job history packaged evidence 的 JSON 门禁，不等同于真实 Settings 截图/录屏已完成，也不新增 SQLite schema 或执行迁移。

### r3: add packaged indexing diagnostics probe entry

- 新增 `visible:experience:indexing-diagnostics-probe` CLI，复用 packaged Electron CDP 采样模式，可 attach 到已运行 packaged profile 或启动 isolated userData，打开 Settings File Index，读取 typed indexed-source diagnostics，并生成 diagnostics JSON、verifier JSON、Settings/source detail DOM 与截图 artifact 路径。
- Probe 明确只读，不触发 scan/reset/reconcile、FTS rebuild 或 schema migration；focused tests 覆盖 Settings target selection、artifact naming、通过与缺失 evidence failure matrix。
- 该切片把 durable job history packaged Settings evidence 推进到可采集入口，但尚未对真实 packaged app 运行，不关闭真实截图/录屏 evidence。

### r3: add production migration readiness auditor

- 新增 `search:production-migration-readiness` CLI，只读检查 CoreApp `schema.ts`、资源迁移目录、Drizzle journal 与 `SearchIndexService` FTS runtime creation ownership，不打开 SQLite、不运行 migration、不 rebuild FTS。
- Report 输出 `scanProgressSchema`、source-scoped `scan_progress` migration、`indexed_source_task_state` schema/migration、`search_index_meta` migration 与 `search_index` FTS durable ownership readiness，并列出 blocker/action/verification。
- 当前真实仓库 readiness 为 `blocked`：`scan_progress` schema 仍是 path-only，source-scoped `scan_progress` 与 `indexed_source_task_state` 资源迁移缺失，`search_index` FTS5 仍由 runtime 创建；`search_index_meta` 资源迁移已存在。该切片只补生产迁移可审计入口，不执行 schema/data migration。

### r3: add scan_progress source-scope copy simulation

- 新增 `search:scan-progress-simulate` CLI，用 `VACUUM INTO` 从目标 SQLite 生成 simulation copy，并只在副本上执行 `runScanProgressSourceScopeMigration()`。
- Simulation report 输出源库前后 `scan_progress` snapshot、copy migration 前后 plan/snapshot、migrated rows、backup rows、source-id row counts 与 gate blockers，证明源库未被修改且副本迁移后为 source-scoped shape。
- Focused tests 覆盖 path-only source 成功仿真、unsafe rows blocked 与 CLI artifact 落盘。该工具不替代生产 DB migration 接入或真实 profile execute approval。

### r3: add FTS ownership copy simulation

- 新增 `search:fts-ownership-simulate` CLI，用 `VACUUM INTO` 从目标 SQLite 生成 simulation copy，并只在副本上应用候选 durable FTS ownership DDL。
- Simulation report 覆盖 `search_index` required columns、FTS5 shadow tables、`search_index_meta`、keyword mapping indexes、legacy `file_fts` retain-unchanged policy、row discard 与 full-reindex impact，并校验源库前后 snapshot 未变化。
- Focused tests 覆盖缺失 `search_index` 创建 durable FTS shape、legacy FTS 缺 `content` 列时的 rebuild impact、CLI artifact 落盘。该工具不执行生产 migration，不关闭真实 SQLite/FTS durable ownership blocker。

### r3: harden packaged indexing diagnostics probe targeting

- `visible:experience:indexing-diagnostics-probe` 的 source detail 打开逻辑改为优先匹配目标 source 行，避免在 Settings 搜索源诊断列表中误点第一个 `详情` 按钮。
- Focused test 覆盖 `file-provider` 行选择，确保 Browser Bookmarks / Applications / File Index 多行同时存在时会打开 File Index。
- 本机 isolated `dist/mac-arm64/tuff.app` 试采已能打开 File Index detail 并生成 diagnostics / verifier / DOM / screenshot artifact；因 isolated profile 没有 recent task history，verifier 仍正确失败，真实 durable job history evidence 仍需 attach 到已有 recent task 的 packaged profile 或受控 profile。

### r3: add controlled packaged indexing diagnostics seeded evidence

- `visible:experience:indexing-diagnostics-probe` 新增 isolated-only `--seedRecentTaskEvidence`，会在临时 userData 中写入低敏 `indexed_source_task_state` recent task，用于证明 packaged Settings File Index detail、recent task chip 与 verifier gate 链路可通过。
- Attach-only `--remoteDebuggingUrl` 禁止 seeded evidence，focused test 覆盖 seed/attach 互斥；probe JSON 会标记 `seededRecentTaskEvidence`，避免与自然真实 profile history 混淆。
- 本机 isolated `dist/mac-arm64/tuff.app` seeded run 已生成 `/tmp/tuff-r3-indexing-diagnostics-seeded` artifact，`ok=true` 且 verifier passed；该证据不替代真实 scan/watch/reconcile/reset recent task 截图/录屏，也不执行 schema/data migration。

### r3: add isolated packaged maintenance reset evidence

- `visible:experience:indexing-diagnostics-probe` 新增 isolated-only `--runMaintenanceAction scan|reconcile|reset`，通过 typed `app:indexed-source:*` maintenance IPC 触发受控运行时任务；该选项禁止与 attach-only `--remoteDebuggingUrl`、`--seedRecentTaskEvidence` 混用，避免修改真实 profile 或把 seeded 与 runtime evidence 混淆。
- Probe 在 maintenance action 后会刷新 Settings/File Index detail DOM 与截图，verifier 对 reset 结果校验 `duration/trigger/reason` 可见字段；focused tests 覆盖 attach-only 拒绝、action 类型解析和 reset evidence required fields。
- 本机 isolated `dist/mac-arm64/tuff.app` reset run 已生成 `docs/engineering/reports/r3-indexing-runtime-2026-06-25/indexing-diagnostics-probe-maintenance-reset-2026-06-25.json` 等 artifacts，`ok=true` 且 verifier passed；该证据证明 packaged runtime maintenance recent task 可进入 Settings detail，但仍不替代真实用户 profile 的自然 scan/watch/reconcile/reset history。

### r3: guard isolated scan/reconcile maintenance fixture roots

- FileProvider 新增 `TUFF_FILE_PROVIDER_BASE_WATCH_PATHS` diagnostic override，只在显式环境变量存在时替换默认 base watch roots；正常用户路径仍使用 Electron `app.getPath()` 默认根。
- `visible:experience:indexing-diagnostics-probe` 新增 isolated-only `--fixtureRoot`，会创建低敏小型 fixture tree，并把 fixture root 传给 packaged 子进程；attach mode 禁止该选项，且必须与 `--runMaintenanceAction` 搭配使用。
- Probe gate 会校验 diagnostics roots 是否被 fixtureRoot 约束，未生效时直接失败，避免把默认 Home roots 的 scan/reconcile 超时探索误收为受控 evidence。当前 `maintenance-reconcile-2026-06-25` 产物为 `ok=false`，不计入 passing evidence；scan/reconcile 仍需重包后重新采集。
- Probe 在 `--fixtureRoot` 模式启动前新增 packaged bundle marker preflight，检查 `app.asar` 是否包含 `TUFF_FILE_PROVIDER_BASE_WATCH_PATHS`；当前 `maintenance-reconcile-fixture-preflight-2026-06-25` 产物提前失败并明确要求重包，仍不计入 passing evidence。

### r3: bind isolated scan/reconcile fixture maintenance evidence

- 修复阻塞本地 `build:unpack` 的类型缺口：AI hygiene 测试 fixture 补齐 `KnowledgeDocument.permissionScope`，Assistant screenshot save error map 补齐 permission denied / unsupported 分支；`typecheck:node`、`typecheck:web` 与 `build:unpack` 通过，本地 `dist/mac-arm64/tuff.app` 已刷新且 `app.asar` 包含 `TUFF_FILE_PROVIDER_BASE_WATCH_PATHS` marker。
- 使用刷新后的 packaged bundle 重新采集 `--runMaintenanceAction reconcile --fixtureRoot /tmp/tuff-r3-indexing-runtime-fixture-reconcile` 与 `--runMaintenanceAction scan --fixtureRoot /tmp/tuff-r3-indexing-runtime-fixture-scan`，生成 `maintenance-reconcile-fixture-2026-06-25` / `maintenance-scan-fixture-2026-06-25` artifacts。
- 两个 fixture probe 均为 `ok=true`、verifier passed、bundle marker preflight passed，diagnostics roots 被约束在对应 `/tmp` fixture root；该证据证明 controlled packaged runtime scan/reconcile recent task 可进入 Settings detail，但仍不替代真实用户 profile 的自然 history 或真实 SQLite/FTS/`scan_progress` migration evidence。

### r3: add durable runtime-store resource migration

- 新增 `0024_search_index_runtime_store.sql`，通过资源迁移幂等创建 `indexed_source_task_state`、`idx_indexed_source_task_state_updated_at` 与 durable-shape `search_index` FTS5 table。
- Drizzle migration journal 已登记 `0024_search_index_runtime_store`；`search:production-migration-readiness` 现在能识别 `indexed_source_task_state` 与 `search_index` FTS5 durable ownership，真实仓库 blocker 从 4 项收敛到 `scan_progress` schema path-only / source-scoped migration 缺失。
- 该切片不执行真实 profile migration、不重建 FTS；legacy `file_fts` 在 R3 本批保留不改，退役另立高风险迁移批；`SearchIndexService` runtime `CREATE IF NOT EXISTS` 仍保留为旧库/repair 兜底。

### r3: decide legacy file_fts retain policy for durable ownership

- R3 durable SQLite/FTS ownership migration 明确保留 legacy `file_fts` 不改、不迁移、不删除；运行时文件搜索继续以 `search_index` provider rows 为 durable SoT。
- `search:index-migration:preflight` 的 legacy `file_fts` 检查改为 `retain-unchanged` info evidence，`migrationDryRun` 不再把 `file_fts` 计入本批 schema/data rewrite。
- `search:fts-ownership-simulate` 输出 `legacyFileFtsPolicy`，并说明任何 `file_fts` 退役都必须另起独立高风险迁移批和等价搜索覆盖 evidence。

### r3: wire scan_progress source-scoped production schema

- `schema.ts` 的 `scan_progress` 改为 `PRIMARY KEY(source_id, path)`，并新增 `0025_scan_progress_source_scope.sql` 作为新库 source-scoped resource shape；Drizzle journal 已登记 `0025_scan_progress_source_scope`。
- DatabaseModule 在正常 Drizzle migrations 后复用 `runScanProgressSourceScopeMigration()` 受控 helper 迁移旧 path-only rows 到 `file-provider` scope；遇到 unsafe rows、残留 staging 或 backup blocker 时记录 warning 并保留 old/new schema 兼容模式。
- File watch auto-scan eligibility、Tuff dashboard scan progress overview 与 worker path-only fallback 均改为按真实 `scan_progress` 表 shape 分支；`search:production-migration-readiness` 当前 source-read-only readiness 为 `ready`。该切片不执行真实 profile migration，也不关闭真实 preflight / Settings evidence。

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

### r3: bind isolated packaged durable scan evidence

- 2026-06-30 新增 R3 isolated packaged durable scan evidence：plain Node CDP 对本机 `dist/mac-arm64/tuff.app` isolated userData 触发 typed `app:indexed-source:scan`，并落盘 diagnostics、task-state snapshot、Settings verifier、SQLite/FTS preflight、FTS ownership simulation 与 `scan_progress` source-scope simulation。
- 同一 isolated DB 结果为 `indexed_source_task_state=1`、`scan_progress=1`、`search_index=35`；Settings verifier gate passed，preflight/simulation gate passed。
- 该证据不替代真实 profile migration execute / natural Settings screenshot evidence；`visible:experience:indexing-diagnostics-probe` npm/tsx cold-start 路径仍需修复 packaged Electron `SIGABRT`，本地 crash report 指向 AppKit/HIServices `_RegisterApplication` / `NSApplication.sharedApplication`，早于 CoreApp main-process JS 日志。
