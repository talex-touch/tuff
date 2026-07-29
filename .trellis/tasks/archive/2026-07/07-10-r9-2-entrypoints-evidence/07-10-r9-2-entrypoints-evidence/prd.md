# R9.2 多入口接入与真实 Evidence

## Goal

在治理、CoreBox 执行、Memory Review 和 CompressionSnapshot 完成后，把 ContextHygiene 接入 OmniPanel、Workflow、Assistant 最近路径，并建立不会夸大完成度的 controlled/packaged/real-profile evidence 闭环。

## Requirements

### Entrypoints

- CoreBox 作为完整 context-aware 基线。
- OmniPanel 默认轻上下文，只消费当前 selection/capsule 与允许的 retrieval，不自然继承完整历史。
- Workflow 每个 run 使用独立 session；Use Model 等步骤只消费该 run 的明确上下文。
- Assistant 默认轻上下文；语音/剪贴板图片路径不继承无关 CoreBox/OmniPanel 历史。
- 所有入口复用 host-owned assembler、scope filter、citation trace 和 degraded contract。

### Evidence

- focused/contract tests 证明 session 隔离、package input、citation、memory disable/delete、checkpoint/compression 和 degraded/fail-closed。
- controlled local evidence 与 packaged Electron evidence 分开标注；真实 profile 证据缺失时不得写成完成。
- evidence artifact 不包含完整 prompt、response、turn、memory、secret 或 retrieval chunk。

### Documentation

- 同步 TODO、AI 2.5.4 PRD/details、CHANGES、Quality Baseline 和 R8/R9 execution plan。
- 每条开放项映射到 task/owner/status/evidence，不重复维护冲突口径。

## Dependencies

- 依赖 `context-execution-corebox`、`memory-review-management`、`compression-snapshot` 完成；共同依赖 `memory-governance-scope`。

## Acceptance Criteria

- [x] CoreBox、OmniPanel、Workflow、Assistant 各至少有一条 context-aware integration test 和安全降级 case。
- [x] 新入口之间默认 session 隔离，无显式继续时不继承完整历史。
- [x] Workflow run session 独立，OmniPanel/Assistant 使用轻上下文策略。
- [x] packaged evidence 覆盖 CoreBox、Assistant、Workflow 与 OmniPanel context 主路径；real-profile 明确标为 open。
- [x] evidence manifest 区分 unit/controlled/packaged/real-profile，且敏感内容扫描通过。
- [x] 项目文档进度、任务树和实际 evidence 一致，无 mock 冒充 production/packaged。

## Out Of Scope

- 新增 AI 入口、自动长期记忆、R9.3 本地模型、R9.4 ASR runtime。
