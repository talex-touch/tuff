# GitHub Automation

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/github-automation.zh-CN.full-2026-05-14.md`

## TL;DR

本文说明 GitHub Actions、release、package CI 与自动化发布的当前维护口径。详细历史见完整快照。

## 当前规则

- 桌面发版主线：`build-and-release`。
- beta / snapshot tag 必须保持 pre-release 语义，不得误标稳定版。
- Release notes 需要中英文结构化内容，Nexus 发布日志 `notes/notesHtml` 必须为 `{ zh, en }`。
- 主 PR CI 使用只读 `pull_request`；高权限 release/label/drafter workflow 只处理仓库受控事件。
- GitHub JavaScript Actions `uses:` 依赖保持 Node 24-compatible major；项目业务 Node runtime 继续固定 `22.16.0+`。
- 不通过 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` 或长期 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 绕过 runtime warning。

## 当前注意事项

- `quality:release` 仍可能被既有 lint debt 阻断；不得因此宣称全仓 release gate 已绿。
- 触发真实 commit/push/tag 前必须由用户确认。
- Release Evidence 写入需要 `release:evidence` API key 或管理员登录态。

## 关联入口

- `.github/workflows/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
