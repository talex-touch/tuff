# 优化 Intelligence 插件

## Goal

优化 Intelligence 的 CoreBox AI 工作流，使问答与高频 AI 命令更清晰、可控、可恢复，并降低集中式实现带来的维护风险。

## Confirmed Facts

- 实现目录为 `plugins/touch-intelligence`。
- 当前支持问答、OCR、续问、流式输出、取消、重试、复制、替换选中文本和模型选择。
- 当前还提供改写、摘要、解释及自定义 AI 命令注册表。
- 仓库级运行时测试共 68 项，全部通过。

## Requirements

- 明确首轮聚焦问答主路径、快捷 AI 命令，或命令注册表，不同时扩张全部能力。
- 走查流式输出、取消、重试、权限、Provider/Model 不可用和上下文续接状态。
- 拆分只服务于已确认的产品或可靠性改动，不做纯形式重构。
- 保持宿主 Intelligence 能力、审计、配额和错误码契约兼容。

## Acceptance Criteria

- [ ] 首轮主路径和能力边界明确。
- [ ] 已验证问题均有复现步骤或测试证据。
- [ ] 流式、取消、失败恢复和结果动作具备可测试验收标准。
- [ ] Intelligence 相关测试和构建通过，并补齐适合插件直接执行的质量命令。

## Out of Scope

- 重写宿主 Intelligence 平台。
- 无行为收益的全量文件拆分。
