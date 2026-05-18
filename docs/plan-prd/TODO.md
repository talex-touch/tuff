# Tuff TODO

> 更新时间：2026-05-18
> 定位：当前 2 周执行清单。历史完整清单已归档到 `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md`；长期债务见 `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`。

## 当前执行窗口

- 当前基线：`2.4.10`。
- 当前主线：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，补齐 Windows/macOS 阻塞级回归；Linux 保持 documented best-effort。
- 下一版本门槛：`2.5.0` AI 桌面入口收口，Stable 只承诺文本 + OCR；Workflow/Skills/Automation 保持 Beta。
- 执行约束：PR lint 已收敛为 changed-file lint，但 `quality:release` 仍保留全仓 lint；2026-05-16 live-tree 审计未发现新的 P0 fixed fake-success；旧 compat registry / legacy allowlist / size allowlist 已退场，不再作为 live SoT；2026-05-18 已按维护决策删除独立 `.github/workflows/omnipanel-gate.yml`，OmniPanel scoped typecheck/lint/unit/build/smoke 不再作为 GitHub Actions 自动门禁；npm 公共子包发布因仓库 `NPM_TOKEN` 无法 publish `@talex-touch` scope 仍阻塞；`2.5.0` AI/Provider 与可见体验工作台优化只能以 dev 小切片推进，不得抢占 `2.4.11` 稳定化与债务退场主线。

## P0 - 2.4.11 必须收口

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P0-COMPAT | legacy/compat/size 债务关闭或降权 | 进行中 | 以 2026-05-15 兼容总结、2026-05-16 深度审计、Quality Baseline、长期债务池与最近路径代码证据为准关闭或记录降权理由；禁止新增 legacy/raw channel/旧 storage protocol/旧 SDK bypass。 |
| P0-PLATFORM | Windows/macOS 阻塞级人工回归 | 待执行 | Windows/macOS 完成 release-blocking 手工回归；Linux 仅记录 best-effort smoke 与桌面环境限制。 |
| P0-AI-COMPAT | AI 兼容占位成功响应退场 | 待执行 | `livechat/random`、prompt detail、catch-all 未实现接口改为明确 HTTP status、`unavailable + reason` 或迁移目标。 |
| P0-SECRET | CLI 与插件 secret storage 收口 | 进行中 | CLI token 已通过 `CliCredentialStore` 做 POSIX `0700/0600` 权限缓解与 Windows ACL warning；`touch-translation` provider secret 已迁入 `usePluginSecret()` 并清理普通配置，配置弹窗已展示 secure-store available/degraded/unavailable health；插件侧已新增只读 `plugin.secret.health()` / `usePluginSecret().health()` 以暴露 secure-store degraded/unavailable 状态。仍需 OS Keychain/Credential Locker/libsecret backend 与遗留 secret 清理 evidence。 |
| P0-SHELL-CAP | 插件 shell capability 统一诊断 | 进行中 | `plugins/touch-workspace-scripts` 首切已完成：safe-shell 缺失时 fail-closed，不再回退裸 shell；CoreBox item 暴露 `available` / `permission-missing` / `unsupported`、permission、unsupported reason、command source 与 audit 字段；执行前校验空命令、换行/null payload 与 cwd 目录可用性，并返回 `started` / `blocked` / `cancelled` 状态。2026-05-18 已完成 `plugins/touch-browser-open` 第二切：浏览器打开 item 增加 `system.shell` capability/audit metadata 与 non-mutating permission check，网页搜索 item 增加 shell open platform/audit metadata；Linux 指定浏览器打开明确 `linux-specific-browser-open-unsupported`，复制 URL 不再依赖 shell 权限；执行结果统一返回 `started` / `blocked`。同日第三切已收口 `plugins/touch-system-actions` 与 `plugins/touch-window-manager`：展示阶段改为 non-mutating permission diagnostics，safe-shell/support 缺失时 fail-closed blocked，不再请求后继续枚举/执行；系统动作的 `open-main-window` 改为 native window capability，不再依赖 shell；窗口管理动作统一返回 `started` / `blocked` 并保留 platform/permission reason。已补 browser/system/window focused Vitest、文件级 ESLint 与 `git diff --check`。仍需继续复核快捷动作等剩余 shell/OS capability surface。 |
| P0-PREVIEW-SDK | PreviewSDK 内核与动态执行治理 | 进行中 | `packages/utils/core-box/preview` 已落地最小 SDK、纯 payload 协议、安全声明、ability inventory；BasicExpression/AdvancedExpression/Percentage/TextStats/Color/ScientificConstants/UnitConversion/TimeDelta 已迁入 SDK，BasicExpression 不再使用 `new Function`，单位换算与 `calculation/unit-converter.ts` 已共用静态转换核心。Currency 仍保留 CoreApp adapter；Widget runtime sandbox 只进入 Runtime Safety 清单，不纳入 PreviewSDK 首批。 |
| P0-TRANSPORT | Transport Wave A retained aliases 继续收口 | 进行中 | 已完成 sync/terminal/opener/auth/CoreBox UI、beginner shortcut、input focus、ui resume、forward key event、input command、input visibility/value request、input monitoring、clipboard allow、provider management、recommendation、preview history/copy、action panel、MetaOverlay bridge、layout control、uiMode enter/exit 等 alias 迁移切片；继续按 canonical event + legacy alias registry + dual listen 策略推进，禁止改变 wire name 语义。 |
| P0-STARTUP | CoreApp 启动异步化长尾跟进 | 进行中 | Dev 与 packaged hot/cold benchmark、CoreBox 核心状态、App Index workbench 已完成最近路径验证；后续只保留真实设备 benchmark、登录恢复、AI/OmniPanel/Workflow/Provider 可见体验长尾跟进，不再作为 `2.4.10` 发布口径。 |

## P1 - 近期推进但不阻塞 2.4.11

| ID | 事项 | 状态 | 验收/证据 |
| --- | --- | --- | --- |
| P1-TOUCH-WIDGET | TouchWidget Arrow/WebComponent beta | 进行中 | `arrow` 与 `webcomponent` runtime 以 beta 标记接入 Widget pipeline；保持 `.vue` 默认兼容。后续补真实示例插件、packaged/dev source 手动验收与 `@arrow-js/sandbox` 单独安全评估。 |
| P1-AI-250 | Tuff 2.5.0 AI 桌面入口 | 进行中 | CoreBox AI Ask、handoff session、Nexus invoke credits 扣减、CoreApp credits summary、Tuff-native Tool Kit foundation、OmniPanel Writing Tools MVP、Workflow `Use Model` 最小节点、Workflow 页面本地 Review Queue MVP 与 3 个 P0 模板已进入 dev 切片；2026-05-15 Review Queue 状态已写回 workflow run metadata 并可从持久化历史恢复，Use Model 步骤补 `inputSources` / `output` 合同与页面 JSON 编辑入口；本地 AI 环境扫描已接 typed `intelligence:api:local-environment`，只读展示 Codex / Claude、项目指令与 Codex skills provider 摘要；2026-05-17 CoreBox AI Ask 预览卡片已补状态 tone、pending/ready/error 可读提示、provider metadata pending fallback 与 focused tests，OmniPanel Writing Tools 预览区已补 running/ready/failed/confirming 状态说明与带 label 的 capability/provider/model/latency metadata chips，Workflow Review Queue 已补 capability/provider/trace/latency/tokens/risk/failure metadata chips 与 focused tests，但这些仍缺 packaged Electron answer/failure/workflow-run UI evidence，不能标记为体验闭环通过；后续补 provider / scene / skill 权限门控与执行策略，并继续推进跨入口 Review Queue、单步骤重跑/跳过、TTS 队列/播放服务与持久缓存评估。Stable 只承诺文本 + OCR。 |
| P1-AI-253 | Tuff 2.5.3 本地知识检索与上下文构建 | 已定方向 | 已新增 `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md`；方向为 SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项。2.5.3 聚焦 documents/chunks schema、FTS5 召回、metadata 过滤、citation 与上下文拼接，不把向量数据库作为 MVP 第一优先级。 |
| P1-AI-255 | Tuff 2.5.5 本地开源模型运行时 | 已定方向 | 已新增 `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md`；方向为不强依赖 Ollama，优先内置 GGUF / llama.cpp runtime，模型权重按需下载到用户数据目录；Ollama 仅作为可选兼容后端。2.5.5 聚焦本地模型目录、下载/删除、健康状态、文本能力本地优先可回退与 runtime 可观测，不抢占 2.4.11 稳定化与债务退场主线。 |
| P1-AI-258 | Tuff 2.5.8 ASR Provider Runtime | 已定方向 | 已新增 `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md`；方向为本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto` 策略。2.5.8 聚焦音频文件转写、provider health、隐私策略、音频 artifact 生命周期与统一 transcript result；TTS、语音唤醒和 streaming 转写不进入 Stable。 |
| P1-PROVIDER | Nexus Provider Registry / Scene 编排 | 进行中 | 已有 D1 secure store、Scene run、Dashboard dry-run/execute、AI mirror、health/usage ledger 与最小策略路由；旧 `intelligence_providers` 表退场已补实施计划 `docs/plan-prd/04-implementation/NexusIntelligenceProviderRetirement-2026-05-16.md`。2026-05-17 已在 `docs/engineering/reports/coreapp-visible-evidence-2026-05-17/provider-migration-dry-run.md` 补本地隔离 API/bridge dry-run 证据，使用 migration API handler + 真实 migration bridge + Mock D1 确认 dry-run 输出不会声称 registry-primary ready、不含 secret，且不会写 registry / secure store；Provider Registry Admin observability list 已补 initial/filtered/no-attention/no-unknown/no-failed empty states 与 “show all” 过滤恢复动作，Usage Ledger / Health tabs 已补 failed/planned/estimated/completed/unhealthy/degraded/healthy next-action guidance，以及 all/attention/status 本地过滤和计数，并有 focused helper tests；这些仍不是真实 Dashboard/Admin UI evidence。后续仍需按 Phase 0/1 采集真实 dry-run/execute evidence 和真实 Provider Admin health/usage/scene/filter 视觉证据，再推进 registry-primary reads、user-scope OCR 自动绑定、success rate/配额/dynamic pricingRef。 |
| P1-NATIVE | Native transport V1 真机 smoke | 待执行 | 补 macOS 屏幕录制授权、Windows 多屏、Linux X11/Wayland best-effort；打包预览确认 `sharp` 与 ffmpeg/ffprobe 可执行。 |
| P1-QUICK-LAUNCH | Quick Launch 真机验收 | 待执行 | macOS/Windows/Linux 验证默认浏览器打开、`network.internet` 授权/拒绝、suggestion 超时降级、URL 打开与网页搜索互不抢占。 |
| P1-PUBLISHER | 插件发布管理端到端证据 | 进行中 | CoreApp `/store/publisher` 与 Nexus assets/API key 流程已接入；2026-05-18 已修复发布认证 scope 口径：`plugin:publish` 隐含 `plugin:read`，新建 API key 默认带 `plugin:read` + `plugin:publish`；CLI 真实 publish 前改用 `/api/dashboard/auth/publisher` 进行 publisher 预检并兼容 API Key，旧 Nexus 缺少该 endpoint 时回退 Dashboard plugin lookup，避免 `/api/auth/me` 误杀 API Key；交互 CLI 已区分本地 token 文件与远端可用登录态，账号/云端插件列表会显示认证或网络失败原因而非伪装为空列表；`--dry-run` 保持本地预览；`touch-snippets` 已收口 text/code/prompt/template 片段的 CoreBox 搜索、复制、保存与管理入口，旧 `touch-text-snippets` / `touch-code-snippets` 已从 CoreBox feature surface 退为 legacy placeholder；仍需补 package policy/security scan、真实 `.tpex` 上传端到端证据，以及旧 snippets 目录删除/迁移策略确认。 |
| P1-CLOUDSHARE | CloudShare 插件内容包发布/安装 MVP | 进行中 | 已新增 `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md`、`CloudShareSDK`、Nexus `/api/store/plugin-content/*`、Store 详情页 Content tab 与 `touch-snippets` snippet pack 导出/导入/list/install 基础能力；仍需补插件 Surface/CoreApp Store 的登录发布 UI、内容审核队列、团队可见与订阅/fork。 |

## 已完成/历史不再重复开发

- 2026-05-16 Nexus Intelligence admin 页面已改为 ClientOnly lazy shell，Content trim 已扩展到重复 root SQL dumps；Intelligence lazy 后本地 dist 约 24.06 MiB，Worker executable JS 约 7.76 MiB，root SQL dump trim 预计额外移除 749.3 KiB。
- 2026-05-16 Nexus 全量 Vitest 已恢复通过；同步修正 exchange-rate、Turnstile 与 OAuth context 测试 mock/alias。
- 2026-05-16 Nexus Content sqlite wasm 重复产物已通过 post-build trim 去重，Provider Registry admin 页面已改为 ClientOnly lazy shell；本地 dist 约 24.48 MiB，Worker executable JS 约 8.05 MiB。
- 2026-05-16 Nexus API tests 已全部迁出 `server/api` 到 `test/api`，并新增零容忍 route-tree guard，防止测试/开发文件重新进入 Nitro 生产路由树。
- 2026-05-16 Nexus PWA precache 已排除 Nuxt Content SQL dump、sqlite wasm 与 sqlite worker 资产，并在 Worker bundle analyzer 中增加回潮检查；`nativeSqlite` 仍需保留，直接关闭会触发 `better-sqlite3` build 依赖。
- 2026-05-16 Nexus 公开站低风险清理与性能小切片已完成：生产测试页、`.DS_Store`、旧 GIF 退场；Landing 大图切到压缩 JPG；highlight.js 改为 docs 按需加载；公开页预渲染范围扩大。
- 2026-05-16 Nexus OAuth 回调缺失 session 时已增加错误兜底与重试入口，避免官网登录回调一直停留在处理中状态。
- `2.4.10` 正式版发布已产出 GitHub Release 与 Nexus release metadata：根/CoreApp 版本已切到 `2.4.10`，本地 macOS release build 已用 `--publish=never` 产出 `apps/core-app/dist/mac-arm64/tuff.app` 与 `apps/core-app/dist/tuff.app.zip`；GitHub Actions `Build and Release` 已成功发布 Windows setup、macOS app zip、Linux AppImage/deb、更新 YAML、builder debug 与 manifest 资产，并完成 Nexus release metadata sync。npm 公共子包仍因本机 npm `E401` 与仓库 `NPM_TOKEN` publish `@talex-touch` scope 返回 `E404 PUT` 阻塞，目标缺失版本为 `@talex-touch/utils@1.0.50`、`@talex-touch/tuffex@0.3.5`、`@talex-touch/unplugin-export-plugin@1.2.16`、`@talex-touch/tuff-cli@0.0.3`、`@talex-touch/tuff-core@0.0.1`、`@talex-touch/tuff-intelligence@0.0.2`。
- Widget production precompile gate 已完成。
- CoreApp 启动异步化 P0/P1/P2/P3 主要代码切片已完成，后续只保留真实设备 benchmark 与长尾补证。
- Quick Launch 搜索引擎模式、补全隔离、图标与旧结果清理已完成。
- 插件禁用后 CoreBox push items 门禁已完成。
- Nexus docs prerender routes 与 docs 切换性能优化已完成。
- 2.4.8 OmniPanel Gate、v2.4.7 Gate A/B/C/D/E、2.4.9 插件完善主线为 historical done；2026-05-18 起独立 OmniPanel Gate workflow 已删除，后续 OmniPanel 回归按普通最近路径本地/PR 验证或显式手动命令执行，不再作为自动质量门禁。

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
