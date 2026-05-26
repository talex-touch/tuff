# GitHub Automation

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-26
> 完整快照：`./archive/github-automation.zh-CN.full-2026-05-14.md`

## TL;DR

本文说明 GitHub Actions、release、package CI 与自动化发布的当前维护口径。详细历史见完整快照。

## 当前规则

- 桌面发版主线：`build-and-release`。
- beta / snapshot tag 必须保持 pre-release 语义，不得误标稳定版。
- Release notes 需要中英文结构化内容，Nexus 发布日志 `notes/notesHtml` 必须为 `{ zh, en }`。
- GitHub Release 正文由 `scripts/generate-release-notes.mjs` 在发布时生成：默认取上一个同渠道 tag 到当前 tag 的 merged PR，输出精简摘要、PR 明细和中英文 notes 草稿。
- 若仓库存在 `notes/update_<version>.zh.md` / `.en.md` 或共享 `notes/update_<version>.md`，人工维护文件优先；没有人工文件时使用自动生成的中英文 notes。
- `release-drafter` 只作为草稿与标签辅助信号，最终 GitHub Release 与 Nexus sync 均以 `build-and-release` 生成/读取的 notes payload 为准。
- 主 PR CI 使用只读 `pull_request`；高权限 release/label/drafter workflow 只处理仓库受控事件。
- GitHub JavaScript Actions `uses:` 依赖保持 Node 24-compatible major；项目业务 Node runtime 继续固定 `22.16.0+`。
- 不通过 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` 或长期 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 绕过 runtime warning。

## 当前注意事项

- `quality:release` 仍可能被既有 lint debt 阻断；不得因此宣称全仓 release gate 已绿。
- 触发真实 commit/push/tag 前必须由用户确认。
- Release Evidence 写入需要 `release:evidence` API key 或管理员登录态。
- PR 模板中的 Release Notes 字段推荐填写一句用户可见变更；CI 会自动整合 PR 标题、labels、作者和 PR 链接，未填写时不阻断发版。

## 关联入口

- `.github/workflows/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
