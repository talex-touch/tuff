# Tuff 产品总览与路线图

> 更新时间：2026-05-29
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
| 质量目标 | 建立稳定质量门禁，typecheck/lint/test/build 可复现、可追踪 | PR lint 已收敛为 changed-file lint；2026-05-25 UI/兼容/占位/架构审计未发现新的 P0 fixed fake-success，并把 legacy alias hard-cut、旧 snippets placeholder、memory fallback 证据分层、preload/dialog 安全收口与 TuffEx visual smoke 列为近期治理项；2026-05-26 已收口 preload debug 运行时日志文本化与同段 debug console 清理；2026-05-29 增量审计继续未发现新的 P0 fixed fake-success，确认 Nexus/TuffEx 组合 demo 与 dashboard chart wrapper 改善 UI 完善度；同日已落地 legacy alias hit telemetry/hard-cut 判定记录、旧 snippets hidden/deprecated/replacedBy 退场、Nexus evidence source enum/UI 分层、dialog message 文本/可信 HTML 分流与 TuffEx visual smoke 脚本；2026-05-28 已修复 Tuffex 0.3.7 发布链路的 frozen lockfile 阻断，并让 Tuffex package workflows 覆盖 lockfile/workspace catalog 触发；2026-05-18 已删除独立 OmniPanel Gate workflow，OmniPanel scoped typecheck/lint/unit/build/smoke 不再作为 GitHub Actions 自动门禁；`quality:release` 仍受 CoreApp 既有 lint debt 阻断，需记录替代验证；旧 compat registry / legacy allowlist / size allowlist 已退场 |
| 发布目标 | 打通 OIDC + RSA 官方构建信任链与 Nexus 自动同步闭环 | `build-and-release` 为桌面发版主线；`v2.4.10` GitHub Release 与 Nexus release metadata sync 已成功；`@talex-touch/tuffex@0.3.7` 补发链路已完成本地等价验证，push 后由包级 publish workflow 通过仓库 `NPM_TOKEN` 发布；其余公共 npm 子包补发仍需仓库 token 覆盖 `@talex-touch` scope |
| 产品目标 | Flow / DivisionBox / Intelligence 核心能力闭环 | 当前主线转入 `2.4.11` 稳定化与债务退场 |
| AI 目标 | CoreBox / OmniPanel 成为桌面 AI 主入口，AI Runtime 可观测、可恢复 | 2.5.0 Stable 只承诺文本 + OCR；2.5.3 / 2.5.5 / 2.5.8 拆分本地知识检索、本地模型运行时与 ASR |
| Provider 目标 | Nexus Provider registry + Scene 编排承载汇率、AI、翻译、图片/截图翻译 | 已有最小 runtime/API/Dashboard/ledger，后续补旧表退场与高级策略 |
| 插件数据源目标 | 官方插件扩展本地 App 数据搜索，并把 Windows Everything 收口到可诊断、可回归、可受控发布 | 已新增 App Data Plugins 与 Everything Roadmap；先推进 Browser Data、Obsidian、VSCode、macOS App Data、Epic 插件规划与 Everything SDK/CLI/路径过滤/evidence 收口 |

## 3. 当前版本路线

### 2.4.10 - 稳定基线

**目标**：作为当前稳定基线，承接已完成的 Windows App 搜索/启动体验、基础 legacy/compat 收口与发版准备。

**已纳入基线**：

- Windows App 索引与启动体验。
- FileProvider 编译边界恢复：`file-provider.ts` 已恢复等价导出，`typecheck:node` 已通过。
- 基础 legacy/compat 收口与 release 准备口径。
- `v2.4.10` GitHub Release 已发布，Windows setup、macOS app zip、Linux AppImage/deb、更新 YAML、builder debug 与 manifest 资产已上传；Nexus release metadata sync 已成功。

**非目标**：

- 不把 `v2.4.10` release workflow 成功等同于全量 release gate 全绿；Windows acceptance evidence、release evidence 内容与公共 npm 子包补发仍按 TODO 跟踪。
- 不把 `2.5.0` AI、Provider 高级策略、SRP 大拆分回填为 `2.4.10` 工作。

### 2.4.11 - 债务退场与跨平台阻塞回归

**目标**：关闭或显式降权剩余 legacy/compat/size 债务，并补齐 Windows/macOS release-blocking 回归。

**必须解决**：

- Windows/macOS 阻塞级人工回归。
- Linux documented best-effort smoke 与限制说明。
- AI 兼容占位成功响应退场。
- CLI token OS 级 credential backend 收口；当前仅完成 POSIX `0700/0600` 权限缓解与 Windows ACL warning。
- 插件 provider secret storage 收口；`touch-translation` 已迁入 `usePluginSecret()`，仍需 secure-store 系统 backend 与 degraded health evidence。
- 插件 shell capability 诊断统一；`touch-snipaste`、`touch-window-presets`、`touch-browser-data`、`touch-quick-actions` 已有首批 fail-closed/source diagnostics 证据，下一步改为复核剩余 shell/OS capability surface。
- 动态执行边界治理：PreviewSDK 算式/单位换算已收口，widget runtime sandbox 继续进入审计/回归清单。
- Transport Wave A retained alias/hard-cut 后续批次。
- CoreApp 启动异步化真实设备 benchmark；CoreBox app launch handoff 已先补 immediate hide，避免慢启动期间 launcher 可见卡死。

### 2.5.0 - AI 桌面入口收口

**目标**：让 CoreBox / OmniPanel 成为用户可感知的桌面 AI 主入口。

**Stable**：

- `text.chat`
- `text.translate`
- `text.summarize`
- `text.rewrite`
- `code.explain`
- `code.review`
- `vision.ocr`
- CoreBox AI Ask
- OmniPanel Writing Tools MVP
- 默认 Nexus AI provider / 登录态 invoke

**Beta**：

- Workflow `Use Model` 节点。
- Review Queue。
- Skills Pack / Background Automations 与 AI 联动。
- 剪贴板整理、会议纪要、文本批处理 P0 模板。

**Experimental / 2.5.x 后续**：

- Assistant 悬浮球/语音唤醒。
- 多 Agent 长任务面板。
- image/audio/video 生成编辑。
- Nexus Scene runtime 全量 orchestration。

### 2.5.3 - 本地知识检索与上下文构建

**目标**：把本地文档、网页摘录、插件知识与桌面上下文转换为可检索知识，由 Context Builder 只把最相关片段送入模型上下文。

**方向**：

- SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项。
- MVP 覆盖 `documents` / `chunks` schema、FTS5 召回、metadata 过滤、citation 与上下文拼接。
- 不把上传即 embedding 即 vector db 作为 MVP，不在第一版引入 Tantivy/HNSW 独立索引。
- 检索能力独立于 2.5.5 本地模型 runtime，可服务 Nexus / 云端 / 本地模型。

### 2.5.5 - 本地开源模型运行时

**目标**：把本地开源大模型升级为 Tuff Intelligence 的一等运行方向，用户可在本机下载、管理并运行轻量模型，文本能力优先本地执行并可回退云端 provider。

**方向**：

- 不强依赖 Ollama；Ollama 只作为已安装用户的可选兼容后端。
- 优先内置 GGUF / `llama.cpp` runtime；模型权重按需下载到用户数据目录，不进入安装包。
- Runtime 管理覆盖模型目录、下载/删除、加载/停止、健康状态、失败原因与流式输出。
- 首批只承诺文本能力：`text.chat`、翻译、摘要、改写、代码解释/Review；多模态生成编辑不进入 2.5.5 Stable。
- 新增接口继续走 typed transport / domain SDK，并复用现有 Provider / Capability / Audit / Workflow 路由。
- 不实现本地知识库索引、Context Builder、ASR 或 TTS；这些分别归属 2.5.3 与 2.5.8。

### App Data Plugins 与 Everything 收口 - 官方数据源插件路线

**目标**：让 CoreBox 从“应用 + 文件 + 插件功能”扩展到“用户显式授权的本地 App 数据”，并把 Windows Everything 文件搜索从已接入推进到生产化收口。

**方向**：

- 先建立统一数据源/索引诊断基线：source health、permissionState、lastIndexedAt、itemCount、lastError、disable/clear/rebuild 语义。
- Browser Data 优先真实浏览器书签/历史索引；现有 `touch-browser-bookmarks` 自有收藏保留为 manual/pinned 数据源，不伪装成浏览器真实数据。
- Obsidian 插件覆盖 vault、Markdown heading/tag/frontmatter/backlink 与 `obsidian://` 打开。
- VSCode 插件覆盖本地 extensions 与 recent workspaces/projects；Marketplace 搜索不进入首版。
- macOS App Data 先调研 Notes/Reminders/Calendar/Contacts 的权限与本地只读可行性；无法给出授权/降级 reason 时不接入。
- Epic 插件先澄清 Epic 指向；若是 Unreal 本地项目，优先 `.uproject` 与最近项目。
- Everything 收口明确 SDK vs CLI 策略、路径授权过滤、diagnostic evidence 与 Windows 真机回归。
- 非目标：不包含更新系统 Nexus Hard-Cut；不做跨 App 写回、账号同步或未授权扫描。

### 2.5.8 - ASR Provider Runtime

**目标**：把语音转文字抽成独立 ASR Provider Runtime，支持本地 `whisper.cpp` 与云端 ASR provider，并让用户按隐私、准确率、成本和设备性能选择策略。

**方向**：

- Stable 覆盖音频文件转写、provider 抽象、本地 `whisper.cpp`、云端 provider、统一 transcript result。
- 用户策略为 `local-only`、`cloud-only`、`auto`；隐私内容必须允许强制本地，不能默认上传云端。
- streaming transcription、VAD 断句、会议长音频与 faster-whisper 作为 Beta / Experimental。
- TTS、语音唤醒、Assistant 悬浮球默认入口不进入 2.5.8 Stable。

## 4. 质量与安全路线

- Storage：SQLite 为本地 SoT；JSON 只作为密文同步载荷或引用。
- Secret：API key、token、refresh token、provider secret 不得进入普通 JSON/localStorage/log；文件权限缓解只能作为过渡，最终应进入系统 credential backend 或明确 degraded health。
- Sync：新增同步能力走 `/api/v1/sync/*` 及 keys/devices 配套接口。
- Transport：新增事件优先 typed builder；retained raw event 必须有 alias registry、dual listen、hit evidence 与 hard-cut 条件。
- Runtime：生产路径不得返回固定假值成功或可消费占位 payload。
- Platform：Windows/macOS release-blocking 必须有真实设备证据；Linux best-effort 必须有可见 reason。
- CI/CD：GitHub Actions `uses:` 依赖保持 Node 24-compatible major；业务 Node runtime 继续固定 `22.16.0+`；独立 OmniPanel Gate workflow 已删除，不再作为 push/PR/manual 自动门禁；包级 publish workflow 的 path filter 必须覆盖对应 package manifest、publish 脚本、`pnpm-lock.yaml` 与 workspace catalog，避免依赖规格修复漏跑发布流水线。

## 5. 当前状态快照

- 当前基线：`2.4.10`。
- `2.4.10` 已作为当前稳定基线；GitHub Release 与 Nexus release metadata sync 已成功；`@talex-touch/tuffex@0.3.7` 发布阻断已通过 lockfile specifier 修复与本地等价验证解除，push 后由 Tuffex package publish workflow 补发；其余公共 npm 子包缺失版本仍需确认具备 `@talex-touch` publish 权限的 `NPM_TOKEN` 后补发；`2.4.11-beta.1` 保留为已验证 beta pre-release 记录，后续 `2.4.11` 继续收口 legacy/compat/size 债务。
- FileProvider 编译边界已恢复且 CoreApp `typecheck:node` 已通过；`quality:release` 仍被 CoreApp 既有 lint debt 阻断，不得宣称全仓 release gate 已绿。
- 2026-05-22 兼容性/占位实现增量审计未发现新的 P0 假成功；`touch-snipaste`、`touch-window-presets`、Browser Data source diagnostics 与 `touch-quick-actions` 已有 live-tree hardening 证据，`2.4.11` 后续聚焦 Credential Locker/libsecret、真实平台 evidence、widget runtime sandbox regression、裸 console、示例插件调试噪声与 SRP 小切片。
- 2026-05-25 UI/兼容/占位/架构审计继续未发现新的 P0 fixed fake-success；2026-05-26 已完成 preload debug DOM 文本化与同段 debug console 清理；2026-05-29 增量审计确认 Nexus/TuffEx 组合 demo 与 dashboard chart wrapper 改善 UI 完善度，同日已完成 legacy retained aliases hit telemetry/hard-cut 判定记录、`touch-text-snippets` / `touch-code-snippets` hidden/deprecated/replacedBy 退场、Nexus `source: memory` evidence source 分层、dialog message 文本/可信 HTML 分流与 TuffEx docs visual smoke 脚本。当前仍缺真实截图运行证据与完整 release cycle legacy hit=0 观察；visual smoke 先作为 focused evidence，不改变 `quality:pr` / `quality:release` 门禁。
- CoreApp 启动异步化 P0/P1/P2/P3 代码切片已推进，剩余真实设备 benchmark 与长尾补证。
- App Data Plugins 与 Everything 已新增专题 Roadmap，近期不进入更新系统 Nexus Hard-Cut 范围；Browser Data、Obsidian、VSCode、macOS App Data、Epic 与 Everything 生产化收口按插件/搜索主线推进。
- Nexus Provider Registry / Scene 已具备最小运行链路，后续继续补旧 AI provider 表退场、user-scope OCR 绑定策略、success rate/配额/dynamic pricingRef。

## 6. 关联入口

- 当前执行清单：`../TODO.md`
- PRD 主入口：`../README.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- 变更日志：`./CHANGES.md`
- 全局索引：`../../INDEX.md`
