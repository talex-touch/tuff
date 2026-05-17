# PRD: Tuff 2.5.5 本地开源模型运行时

> 更新时间：2026-05-16
> 状态：Planned / Direction Locked
> 目标版本：2.5.5

## 1. 最终目标

2.5.5 将本地开源大模型作为 Tuff Intelligence 的一等运行方向：用户可以在本机下载、管理并运行轻量开源模型，优先服务文本类能力，减少云端依赖并提升隐私可控性。

工程目标是复用现有 `Intelligence` Provider / Capability / Audit / Workflow 路由，不重写 AI 子系统；本地运行时作为 `LocalProvider` 的后端之一接入，对上仍暴露 `text.chat`、翻译、摘要、改写、代码解释/Review 等文本能力。

本 PRD 只覆盖本地文本模型运行时。Local Knowledge Retrieval 归属 2.5.3，ASR Provider Runtime 归属 2.5.8。

## 2. 产品方向

- 不强依赖 Ollama：Ollama 仅作为可选兼容后端，用于已安装用户的快速接入。
- 主方向为内置 GGUF runtime：优先评估 `llama.cpp` / GGUF，本地模型文件放用户数据目录，不打进应用安装包。
- Runtime 管理由 CoreApp 后台进程承担：模型下载、校验、列表、删除、加载、停止、健康状态与流式输出均走 typed transport / domain SDK。
- 首批模型聚焦轻量文本模型：优先支持 0.5B / 1B / 3B / 4B 档位，避免把 7B+ 作为默认体验。
- 本地优先可回退：用户启用本地模型后，文本能力可优先走本地；模型不可用、资源不足或 capability 不支持时，按现有策略回退 Nexus / 云端 provider。

## 3. 范围与非目标

### Stable 范围

- 本地模型目录管理：展示已下载模型、大小、量化、能力标签、更新时间与占用空间。
- 模型下载与删除：下载进度可见，删除需要确认；下载失败不影响已有模型。
- 本地文本推理：覆盖 `text.chat`、`text.translate`、`text.summarize`、`text.rewrite`、`code.explain`、`code.review` 等全部文本能力。
- 运行时健康状态：展示 runtime 可用性、加载中、运行中、失败原因、资源不足原因。
- 路由与审计：沿用 `IntelligenceInvokeResult`，记录 provider/model/latency/usage/success/errorCode，不保存完整 prompt/response。

### Beta / Experimental

- Ollama 兼容后端：检测已有 Ollama 服务并纳入同一 Local runtime 页面，但不要求安装 Ollama。
- WebGPU / JS runtime：可作为实验后端评估 WebLLM / Transformers.js，不作为第一主路径。
- Rust Candle 后端：作为备选技术路线，仅在模型兼容与打包收益明确时进入实现。

### 非目标

- 不把模型权重打包进桌面安装包。
- 不默认静默安装 Ollama、Python、CUDA toolkit 或其它大型外部依赖。
- 不实现本地知识库索引、Context Builder、ASR、TTS。
- 不在 2.5.5 承诺图片/音频/视频生成编辑。
- 不绕过现有 Provider registry / Capability / Scene 解耦模型。

## 4. 质量与安全约束

- Storage：模型文件只放本地用户数据目录；索引元数据可进 SQLite，禁止把模型文件或明文业务输入 dump 成 JSON 同步载荷。
- Security：下载源、checksum、模型文件路径、删除动作必须可审计；删除模型属于高风险文件操作，UI 需要二次确认。
- Runtime：不得返回伪成功；本地运行时不可用时必须返回明确 `unavailable/degraded + reason`。
- Performance：不得把模型下载、加载、探测放入首屏 critical path；首次加载需有超时、取消、资源不足提示。
- Packaging：runtime binary 必须按平台拆分，安装包体积预算单独记录；模型权重按需下载，不进入 release artifact。
- Transport：新增运行时管理接口必须使用 typed transport / domain SDK，不新增 raw channel。

## 5. 验收清单

- [ ] 未安装 Ollama 时，Tuff 仍可通过内置 runtime 管理并运行至少 1 个轻量 GGUF 文本模型。
- [ ] 已安装 Ollama 时，Tuff 可检测并作为可选兼容后端展示，不强制切换。
- [ ] 本地模型可完成全部文本能力的最近路径调用，失败时按策略回退云端 provider。
- [ ] 下载、删除、加载、停止均有用户可见状态和失败原因。
- [ ] 模型权重不进入应用安装包、同步载荷、普通日志或云端审计。
- [ ] Windows/macOS 至少完成真实设备 smoke；Linux 记录 best-effort 与限制 reason。
- [ ] README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步。

## 6. 关联入口

- AI 2.5.0 主线：`./ai-2.5.0-plan-prd.md`
- 本地知识检索：`./ai-2.5.3-local-knowledge-retrieval-prd.md`
- ASR Provider Runtime：`./ai-2.5.8-asr-provider-runtime-prd.md`
- 当前执行清单：`../TODO.md`
- 产品路线图：`../01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
