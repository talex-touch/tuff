# Tuff TODO

> 更新时间：2026-05-16
> 定位：当前 2 周执行清单。历史完整清单已归档到 `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md`；长期债务见 `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`。

## 当前执行窗口

- 当前基线：`2.4.10-beta.25`。
- 当前主线：`2.4.10` 聚焦 Windows App 索引、Windows 应用启动体验、基础 legacy/compat 收口与 release evidence。
- 下一版本门槛：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，补齐 Windows/macOS 阻塞级回归；Linux 保持 documented best-effort。
- 执行约束：PR lint 已收敛为 changed-file lint，但 `quality:release` 仍保留全仓 lint；2026-05-16 live-tree 审计未发现新的 P0 fixed fake-success；旧 compat registry / legacy allowlist / size allowlist 已退场，不再作为 live SoT；Windows 真机 evidence 与 Nexus Release Evidence 未闭环前，不宣称正式 `2.4.10` gate 通过；`2.5.0` AI/Provider 高级策略只能以 dev 小切片推进，不得抢占当前 release gate。

## P0 - 2.4.10 Release Blockers

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P0-WIN-PLAN | 生成 Windows acceptance collection plan | 待执行 | 在 Windows 真机执行 `pnpm -C "apps/core-app" run windows:acceptance:template -- --writeManualEvidenceTemplates --writeCollectionPlan`，产出 manifest、manual evidence templates 与 collection plan。 |
| P0-WIN-CASE | 补齐 Windows case/manual evidence | 待执行 | 覆盖 capability evidence、Everything target probe、App Index diagnostic、common app launch、copied app path、本地启动区索引、应用索引管理页手动条目、UWP/Store、Steam、update install、DivisionBox detached widget、time-aware recommendation。 |
| P0-WIN-PERF | 补齐性能 evidence | 待执行 | `search-trace` 真实查询 `200` 样本生成 `search-trace-stats/v1`；执行 `clipboard:stress` `120000ms` 并用 `clipboard:stress:verify --strict` 复核。 |
| P0-WIN-VERIFY | Windows final gate | 待执行 | 执行 `pnpm -C "apps/core-app" run windows:acceptance:verify`；case evidence、manual evidence、performance evidence 均非空、非占位且 gate 通过。 |
| P0-REL-EVIDENCE | 写入 Nexus Release Evidence | 阻塞中 | 需要 `release:evidence` API key 或管理员登录态；写入 documentation review、platform matrix、CoreApp targeted tests、Windows 真机 evidence 与性能 evidence。凭证缺失时保持 blocked。 |
| P0-FILE-PROVIDER | 恢复 FileProvider 编译边界 | 已恢复 | `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 已恢复到完整 `fileProvider` 导出；`pnpm -C "apps/core-app" run typecheck:node` 已通过。仍需按发版节奏补文件搜索最近路径验证。 |
| P0-QUALITY | 发版前最小质量复核 | 未完成 | 至少复跑 `git diff --check`、`pnpm quality:release` 或最近路径替代命令。当前 `typecheck:node` 已恢复通过；CoreApp 仍有既有 lint debt（restricted global、renderer console、raw IPC guard 等）。 |

## P1 - 2.4.11 必须收口

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P1-COMPAT | legacy/compat/size 债务关闭或降权 | 进行中 | 以 2026-05-15 兼容总结、2026-05-16 深度审计、Quality Baseline、长期债务池与最近路径代码证据为准关闭或记录降权理由；禁止新增 legacy/raw channel/旧 storage protocol/旧 SDK bypass。 |
| P1-PLATFORM | Windows/macOS 阻塞级人工回归 | 待执行 | Windows/macOS 完成 release-blocking 手工回归；Linux 仅记录 best-effort smoke 与桌面环境限制。 |
| P1-AI-COMPAT | AI 兼容占位成功响应退场 | 待执行 | `livechat/random`、prompt detail、catch-all 未实现接口改为明确 HTTP status、`unavailable + reason` 或迁移目标。 |
| P1-SECRET | CLI 与插件 secret storage 收口 | 进行中 | CLI token 已通过 `CliCredentialStore` 做 POSIX `0700/0600` 权限缓解与 Windows ACL warning；`touch-translation` provider secret 已迁入 `usePluginSecret()` 并清理普通配置，配置弹窗已展示 secure-store available/degraded/unavailable health；插件侧已新增只读 `plugin.secret.health()` / `usePluginSecret().health()` 以暴露 secure-store degraded/unavailable 状态。仍需 OS Keychain/Credential Locker/libsecret backend 与遗留 secret 清理 evidence。 |
| P1-SHELL-CAP | 插件 shell capability 统一诊断 | 待执行 | 优先以 `plugins/touch-workspace-scripts` 为首切样本；系统动作、快捷动作、窗口管理、workspace scripts 等能力暴露 platform/permission/unsupported reason 与审计字段。 |
| P1-PREVIEW-SDK | PreviewSDK 内核与动态执行治理 | 进行中 | `packages/utils/core-box/preview` 已落地最小 SDK、纯 payload 协议、安全声明、ability inventory；BasicExpression/AdvancedExpression/Percentage/TextStats/Color/ScientificConstants/UnitConversion/TimeDelta 已迁入 SDK，BasicExpression 不再使用 `new Function`，单位换算与 `calculation/unit-converter.ts` 已共用静态转换核心。Currency 仍保留 CoreApp adapter；Widget runtime sandbox 只进入 Runtime Safety 清单，不纳入 PreviewSDK 首批。 |
| P1-TRANSPORT | Transport Wave A retained aliases 继续收口 | 进行中 | 已完成 sync/terminal/opener/auth/CoreBox UI、beginner shortcut、input focus、ui resume、forward key event、input command、input visibility/value request、input monitoring、clipboard allow、provider management、recommendation、preview history/copy、action panel、MetaOverlay bridge、layout control、uiMode enter/exit 等 alias 迁移切片；继续按 canonical event + legacy alias registry + dual listen 策略推进，禁止改变 wire name 语义。 |
| P1-STARTUP | CoreApp 启动异步化补证 | 进行中 | 2026-05-16 已补 10 轮本机 dev startup benchmark：`docs/engineering/reports/startup-dev-runs-2026-05-16/汇总报告.md`，Startup health P50 509ms / P95 890ms、0 WARN、0 ERROR、脚本 final gate 通过；该证据仍未覆盖 packaged cold/hot、renderer ready / StartupAnalytics total time、UI 观感截图与 WAL/health 长尾。 |

## P2 - 近期推进但不阻塞 2.4.10

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P2-AI-250 | Tuff 2.5.0 AI 桌面入口 | 进行中 | CoreBox AI Ask、handoff session、Nexus invoke credits 扣减、CoreApp credits summary、Tuff-native Tool Kit foundation、OmniPanel Writing Tools MVP、Workflow `Use Model` 最小节点、Workflow 页面本地 Review Queue MVP 与 3 个 P0 模板已进入 dev 切片；2026-05-15 Review Queue 状态已写回 workflow run metadata 并可从持久化历史恢复，Use Model 步骤补 `inputSources` / `output` 合同与页面 JSON 编辑入口；本地 AI 环境扫描已接 typed `intelligence:api:local-environment`，只读展示 Codex / Claude、项目指令与 Codex skills provider 摘要，后续补 provider / scene / skill 权限门控与执行策略；继续推进跨入口 Review Queue、单步骤重跑/跳过、TTS 队列/播放服务与持久缓存评估。Stable 只承诺文本 + OCR。 |
| P2-AI-253 | Tuff 2.5.3 本地知识检索与上下文构建 | 已定方向 | 已新增 `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md`；方向为 SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项。2.5.3 聚焦 documents/chunks schema、FTS5 召回、metadata 过滤、citation 与上下文拼接，不把向量数据库作为 MVP 第一优先级。 |
| P2-AI-255 | Tuff 2.5.5 本地开源模型运行时 | 已定方向 | 已新增 `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md`；方向为不强依赖 Ollama，优先内置 GGUF / llama.cpp runtime，模型权重按需下载到用户数据目录；Ollama 仅作为可选兼容后端。2.5.5 聚焦本地模型目录、下载/删除、健康状态、文本能力本地优先可回退与 runtime 可观测，不抢占 2.4.10 release gate。 |
| P2-AI-258 | Tuff 2.5.8 ASR Provider Runtime | 已定方向 | 已新增 `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md`；方向为本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto` 策略。2.5.8 聚焦音频文件转写、provider health、隐私策略、音频 artifact 生命周期与统一 transcript result；TTS、语音唤醒和 streaming 转写不进入 Stable。 |
| P2-PROVIDER | Nexus Provider Registry / Scene 编排 | 进行中 | 已有 D1 secure store、Scene run、Dashboard dry-run/execute、AI mirror、health/usage ledger 与最小策略路由；旧 `intelligence_providers` 表退场已补实施计划 `docs/plan-prd/04-implementation/NexusIntelligenceProviderRetirement-2026-05-16.md`，后续按 Phase 0/1 采集 dry-run/execute evidence，再推进 registry-primary reads、user-scope OCR 自动绑定、success rate/配额/dynamic pricingRef。 |
| P2-NATIVE | Native transport V1 真机 smoke | 待执行 | 补 macOS 屏幕录制授权、Windows 多屏、Linux X11/Wayland best-effort；打包预览确认 `sharp` 与 ffmpeg/ffprobe 可执行。 |
| P2-QUICK-LAUNCH | Quick Launch 真机验收 | 待执行 | macOS/Windows/Linux 验证默认浏览器打开、`network.internet` 授权/拒绝、suggestion 超时降级、URL 打开与网页搜索互不抢占。 |
| P2-PUBLISHER | 插件发布管理端到端证据 | 进行中 | CoreApp `/store/publisher` 与 Nexus assets/API key 流程已接入；补 package policy/security scan 与真实 `.tpex` 上传端到端证据。 |

## 已完成/历史不再重复开发

- 2026-05-16 Nexus Intelligence admin 页面已改为 ClientOnly lazy shell，Content trim 已扩展到重复 root SQL dumps；Intelligence lazy 后本地 dist 约 24.06 MiB，Worker executable JS 约 7.76 MiB，root SQL dump trim 预计额外移除 749.3 KiB。
- 2026-05-16 Nexus 全量 Vitest 已恢复通过；同步修正 exchange-rate、Turnstile 与 OAuth context 测试 mock/alias。
- 2026-05-16 Nexus Content sqlite wasm 重复产物已通过 post-build trim 去重，Provider Registry admin 页面已改为 ClientOnly lazy shell；本地 dist 约 24.48 MiB，Worker executable JS 约 8.05 MiB。
- 2026-05-16 Nexus API tests 已全部迁出 `server/api` 到 `test/api`，并新增零容忍 route-tree guard，防止测试/开发文件重新进入 Nitro 生产路由树。
- 2026-05-16 Nexus PWA precache 已排除 Nuxt Content SQL dump、sqlite wasm 与 sqlite worker 资产，并在 Worker bundle analyzer 中增加回潮检查；`nativeSqlite` 仍需保留，直接关闭会触发 `better-sqlite3` build 依赖。
- 2026-05-16 Nexus 公开站低风险清理与性能小切片已完成：生产测试页、`.DS_Store`、旧 GIF 退场；Landing 大图切到压缩 JPG；highlight.js 改为 docs 按需加载；公开页预渲染范围扩大。
- 2026-05-16 Nexus OAuth 回调缺失 session 时已增加错误兜底与重试入口，避免官网登录回调一直停留在处理中状态。
- `2.4.10-beta.25` beta notes 与 tag-push pre-release 准备已完成；真实 commit/push/tag 仍需用户确认。
- Widget production precompile gate 已完成。
- CoreApp 启动异步化 P0/P1/P2/P3 主要代码切片已完成，剩余为真机补证。
- Quick Launch 搜索引擎模式、补全隔离、图标与旧结果清理已完成。
- 插件禁用后 CoreBox push items 门禁已完成。
- Nexus docs prerender routes 与 docs 切换性能优化已完成。
- 2.4.8 OmniPanel Gate、v2.4.7 Gate A/B/C/D/E、2.4.9 插件完善主线为 historical done。

## 长期债务入口

长尾事项统一维护在 `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`，包括：Transport MessagePort 高频通道、AI lint/typecheck 存量债务、SRP 大文件拆分、AttachUIView/Multi Attach View、Widget Sandbox、Flow Transfer、DivisionBox、Build Signature、Nexus 支付与 TuffEx docs/build 门禁等。

## 文档同步规则

行为/接口/架构/目标变化时至少同步以下入口之一；目标或质量门禁变化时同时同步 Roadmap 与 Quality Baseline：

- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/INDEX.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
