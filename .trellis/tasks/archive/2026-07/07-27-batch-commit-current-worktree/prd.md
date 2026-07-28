# 分批提交当前工作区改动

## Goal

将当前 `master` 工作区中的已跟踪和未跟踪改动按功能归属拆成可独立审阅、可回滚的提交，并在验证通过后推送到 `origin/master`。

## Requirements

- 保留当前工作区全部有效改动，不丢弃、不重写用户代码，也不修改既有 31 个本地提交的历史。
- 根据真实功能依赖分组，不单纯按目录拆分；同一功能的实现、测试、文档和生成物进入同一提交。
- 每批使用显式文件清单暂存，并在提交前检查 `git diff --cached --check`、暂存文件列表和提交摘要。
- 提交消息遵循仓库现有 Conventional Commit 风格，并在适用时标注关联任务。
- 推送前运行覆盖 CoreApp、插件和 Nexus 的必要验证；任何由本次工作区改动导致的阻断失败必须先解决。
- 仅执行普通 `git push origin master`，禁止 force、amend、rebase、reset 或历史重写。

## Acceptance Criteria

- [x] 当前工作区改动被拆为职责清晰、顺序合理的多笔提交。
- [x] 每笔提交只包含已核对的显式文件，且暂存区检查通过。
- [x] CoreApp 插件宿主相关测试与 typecheck、插件校验、Nexus 相关测试/typecheck、`git diff --check` 通过。
- [x] 提交后 `git status --short` 无遗漏的源码、测试、任务文档或未跟踪文件。
- [x] `origin/master` 与本地 `HEAD` 一致，普通推送成功。

## Constraints

- 本任务只提交并推送现有工作区，不发布版本、不创建 tag、不关闭 GitHub Issue。
- 不顺手修复与当前改动无关的问题；既有验证失败需单独记录。
