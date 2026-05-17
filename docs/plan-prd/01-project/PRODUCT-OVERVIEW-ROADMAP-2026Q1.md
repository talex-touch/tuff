# Tuff 产品总览与路线图

> 更新时间：2026-05-16
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
| 质量目标 | 建立稳定质量门禁，typecheck/lint/test/build 可复现、可追踪 | PR lint 已收敛为 changed-file lint；2026-05-16 live-tree 审计未发现新的 P0 fixed fake-success；`quality:release` 仍受 CoreApp 既有 lint debt 阻断，需记录替代验证；旧 compat registry / legacy allowlist / size allowlist 已退场 |
| 发布目标 | 打通 OIDC + RSA 官方构建信任链与 Nexus 自动同步闭环 | `build-and-release` 为桌面发版主线；release evidence 继续补齐 |
| 产品目标 | Flow / DivisionBox / Intelligence 核心能力闭环 | 当前不抢 `2.4.10` Windows evidence gate |
| AI 目标 | CoreBox / OmniPanel 成为桌面 AI 主入口，AI Runtime 可观测、可恢复 | 2.5.0 Stable 只承诺文本 + OCR；2.5.3 / 2.5.5 / 2.5.8 拆分本地知识检索、本地模型运行时与 ASR |
| Provider 目标 | Nexus Provider registry + Scene 编排承载汇率、AI、翻译、图片/截图翻译 | 已有最小 runtime/API/Dashboard/ledger，后续补旧表退场与高级策略 |

## 3. 当前版本路线

### 2.4.10 - Windows App 索引与 release evidence

**目标**：完成 Windows App 搜索/启动体验与正式 release evidence 闭环。

**Release blockers**：

- Windows acceptance collection plan。
- FileProvider 编译边界已恢复：`file-provider.ts` 已恢复等价导出，`typecheck:node` 已通过；继续补文件搜索最近路径与 Windows fallback 验收。
- Windows case/manual/performance evidence。
- Everything target probe、App Index diagnostic、common app launch、copied app path、UWP/Store、Steam、update install、DivisionBox detached widget、time-aware recommendation。
- search trace `200` 样本。
- clipboard stress `120000ms`。
- `windows:acceptance:verify` final gate。
- Nexus Release Evidence 写入。

**非目标**：

- 不把全部跨平台回归压进 `2.4.10`。
- 不把 `2.5.0` AI、Provider 高级策略、SRP 大拆分升级为 `2.4.10` blocker。

### 2.4.11 - 债务退场与跨平台阻塞回归

**目标**：关闭或显式降权剩余 legacy/compat/size 债务，并补齐 Windows/macOS release-blocking 回归。

**必须解决**：

- Windows/macOS 阻塞级人工回归。
- Linux documented best-effort smoke 与限制说明。
- AI 兼容占位成功响应退场。
- CLI token OS 级 credential backend 收口；当前仅完成 POSIX `0700/0600` 权限缓解与 Windows ACL warning。
- 插件 provider secret storage 收口；`touch-translation` 已迁入 `usePluginSecret()`，仍需 secure-store 系统 backend 与 degraded health evidence。
- 插件 shell capability 诊断统一。
- 动态执行边界治理：算式 evaluator、单位公式 evaluator 与 widget runtime sandbox 进入审计/替换/回归清单。
- Transport Wave A retained alias/hard-cut 后续批次。
- CoreApp 启动异步化真实设备 benchmark。

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
- CI/CD：GitHub Actions `uses:` 依赖保持 Node 24-compatible major；业务 Node runtime 继续固定 `22.16.0+`。

## 5. 当前状态快照

- 当前基线：`2.4.10-beta.25`。
- `2.4.10-beta.25` notes 与 tag-push pre-release 准备已完成；真实 commit/push/tag 需用户确认。
- FileProvider 编译边界已恢复且 CoreApp `typecheck:node` 已通过；`quality:release` 仍被 CoreApp 既有 lint debt 阻断，不得宣称全仓 release gate 已绿。
- 2026-05-16 兼容性/占位实现 live-tree 审计未发现新的 P0 假成功；`2.4.11` 首切建议聚焦插件 shell capability、动态执行边界、secret backend 与 SRP 小切片。
- Windows App Search & Launch Beta 已进入实现态：应用索引管理页、UWP/Store 诊断字段、Steam 最小 provider、`protocol` 启动白名单等仍需真机 evidence。
- CoreApp 启动异步化 P0/P1/P2/P3 代码切片已推进，剩余真实设备 benchmark 与长尾补证。
- Nexus Provider Registry / Scene 已具备最小运行链路，后续继续补旧 AI provider 表退场、user-scope OCR 绑定策略、success rate/配额/dynamic pricingRef。

## 6. 关联入口

- 当前执行清单：`../TODO.md`
- PRD 主入口：`../README.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- 变更日志：`./CHANGES.md`
- 全局索引：`../../INDEX.md`
