# 优化 Translation 插件

## Goal

优化 Translation 的核心翻译工作流，使普通文本翻译、多 Provider 结果与后续操作更直接、稳定且易于理解。

## Confirmed Facts

- 实现目录为 `plugins/touch-translation`。
- 当前包含普通翻译、多源翻译和实验性截图翻译三类入口。
- CoreBox 运行时已实现请求隔离、debounce、取消旧请求和多 Provider 状态。
- 基线测试共 19 项，全部通过。

## Requirements

- 基于用户优先级选择首轮主路径，不同时重做所有入口。
- 走查输入、加载、部分 Provider 成功、全部失败、复制、历史和权限恢复状态。
- 经复现或测试确认后再把风险升级为缺陷。
- 保持现有 Provider、宿主权限和搜索结果契约兼容。

## Acceptance Criteria

- [ ] 首轮主路径与非目标入口边界明确。
- [ ] 已验证问题均有复现步骤或自动化测试证据。
- [ ] 关键状态和恢复动作具备可测试验收标准。
- [ ] Translation 相关测试、类型检查和构建通过。

## Out of Scope

- 未经产品决策同时重写普通翻译、多源翻译和截图翻译。
- 与翻译体验无关的 Intelligence 平台重构。
