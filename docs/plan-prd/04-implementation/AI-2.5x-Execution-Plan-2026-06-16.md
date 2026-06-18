# AI 2.5.x 近期执行计划

> 更新时间：2026-06-16
> 状态：Execution Plan / Evidence First
> 范围：AI 文档体系、近期实施顺序、验证门禁；不包含运行时代码实现。

## 1. 当前结论

AI 上下文管理已有核心 PRD：`docs/plan-prd/03-features/ai-2.5.4-context-hygiene-memory-prd.md`。
该 PRD 将 ContextHygiene 定义为 Tuff Intelligence 的上下文治理层，核心模型为 Session / Checkpoint / Memory / Compression / ContextPackage。
当前执行不能跳过 `2.5.0` 可见体验证据；后续顺序应为 `2.5.0 -> 2.5.3 -> 2.5.4`。

## 2. 2.5.0 可见体验证据

目标：先证明 Stable AI 桌面入口真实可用，Stable 只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径。

必须补齐：

- CoreBox AI Ask `text.chat` 成功路径。
- 剪贴板/显式图片 `vision.ocr -> text.chat` 成功路径。
- 未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied 失败路径。
- Local/Ollama 首选 provider 时不访问 disabled Nexus provider 的 routing log/trace。
- provider / model / trace / latency metadata chips。
- packaged Electron UI 截图或录屏 artifact。

不进入 Stable 阶段：OmniPanel Writing Tools、Workflow Use Model、Review Queue、全量多模态生成、语音唤醒、DeepAgent 长任务、完整 Scene orchestration。

## 3. 2.5.3 Context Builder 基座

目标：先让本地知识检索和上下文拼接成为独立、可引用、可降级的基础能力。

实施顺序：

1. SQLite documents / chunks / metadata schema。
2. FTS5 关键词、短语、前缀召回。
3. sourceType / timeRange / permissionScope / metadata filters。
4. token budget、dedupe、citation metadata 的 Context Builder。
5. embeddings / rerank 仅作为增强项，缺失时降级为 FTS5 并展示 degraded reason。

约束：SQLite 是本地 SoT；JSON 只允许密文同步载荷或引用；检索失败不得返回伪成功空上下文。

## 4. 2.5.4 ContextHygiene

目标：在 2.5.0 入口和 2.5.3 检索基座稳定后，治理会话边界、摘要、记忆和 prompt 预算。

P0 收窄：

- CoreBox-only feature flag。
- deterministic ScopeDecision。
- SQLite session / turn / checkpoint / context package log / tombstone。
- token budget prune。
- explain metadata，说明每段历史或记忆为何进入 ContextPackage。

关键产品规则：

- 默认轻上下文。
- 新 session 不默认继承旧 session 原文。
- 旧 session 只通过显式继续意图或相关性检索召回。
- MemoryItem 不是聊天记录，必须分类、策略检查、可禁用、可删除。
- 敏感/secret turn 不进 FTS、embedding、context log 或同步 payload。
- 删除 memory 必须 tombstone，并在 prepareTurn 二次过滤。

## 5. 2.5.5 / 2.5.8 非当前抢占范围

`2.5.5` 本地模型 runtime 方向保持锁定：不强依赖 Ollama，优先内置 GGUF / llama.cpp，模型权重按需下载到用户数据目录。
当前只保留文档方向，不抢 `2.5.0` 体验证据和 `2.5.3/2.5.4` 上下文基线。

`2.5.8` ASR Provider Runtime 方向保持锁定：本地 `whisper.cpp` + 云端 ASR provider，支持 `local-only / cloud-only / auto`。
TTS、语音唤醒和 streaming 转写不进入该阶段 Stable。

## 6. 验证门禁

本计划的本地门禁为：

- `mise run ai-docs:dev`：快速 AI 文档合同验证。
- `mise run ai-docs:verify`：release-readiness AI 文档验证，并执行 scoped `git diff --check`。

GitHub parity：`.github/workflows/ai-docs.yml` 必须调用同一个 `mise run ai-docs:verify`，权限保持 `contents: read`。
若没有可观察的 GitHub run 通过证据，不得宣称完整完成。

## 7. 风险与边界

- 不能把官网叙事、代码合同或局部单测当作 packaged Electron 体验闭环。
- 不能把 2.5.5 本地模型提前作为 2.5.3/2.5.4 的前置条件。
- 不能把所有历史对话迁入 prompt。
- 不能把 API key、token、恢复码、口令或用户未授权隐私信息保存为普通记忆。
- 不能新增 raw IPC channel 或绕过 Provider / Capability / Scene 解耦。

## 8. 后续切片

1. `test(ai): capture corebox ai packaged text evidence`。
2. `test(ai): capture corebox ai packaged ocr evidence`。
3. `test(ai): capture nexus invoke failure evidence`。
4. `feat(ai-knowledge): add sqlite fts context builder contract`。
5. `feat(ai-context): add corebox-only session boundary gate`。
6. `feat(ai-context): add context package explain metadata`。
7. `feat(ai-memory): add tombstone-first memory delete contract`。
