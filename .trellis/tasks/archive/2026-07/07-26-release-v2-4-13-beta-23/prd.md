# 发布 v2.4.13-beta.23

## Goal

将当前已确认的本地业务提交发布为 `v2.4.13-beta.23` prerelease，并形成可审计的版本、tag、GitHub Actions 与 GitHub Release 证据。

## Requirements

- 先完成并验证当前工作区中获准纳入发布的业务改动。
- AppProvider G02 采用用户明确接受的分块提交语义：每个 chunk 内保持文件/扩展原子性，后续 chunk 失败时保留已完成 chunk，由下次扫描补齐。
- 版本从 `2.4.13-beta.22` 顺延为 `2.4.13-beta.23`，根包与 CoreApp 版本及 lockfile 保持一致。
- 发布前工作区必须清洁，`master` 必须先推送到 `origin/master`。
- 创建并推送 annotated tag `v2.4.13-beta.23`，由 `.github/workflows/build-and-release.yml` 触发跨平台 prerelease。
- 跟踪 GitHub Actions 至终态；只有 workflow 成功且 GitHub prerelease 可见才算发布完成。
- 不 amend、不 rebase、不 force push、不删除已有 tag 或 release。

## Acceptance Criteria

- [x] 纳入发布的业务改动均已按逻辑提交，最小相关测试通过。
- [x] `package.json`、`apps/core-app/package.json` 与 `pnpm-lock.yaml` 均为 `2.4.13-beta.23` 对应状态。
- [x] `origin/master` 包含版本提交，远端 tag `v2.4.13-beta.23` 指向该提交。
- [x] Build and Release workflow 成功完成 Windows、macOS、Linux 构建及 release 创建。
- [x] GitHub Release `v2.4.13-beta.23` 标记为 prerelease，包含发布资产与 release manifest。
- [x] 最终本地工作区清洁，未执行历史改写或强制推送。

## Out of Scope

- 修改 beta.23 之外的产品功能。
- 修复与本次改动无关的既有 typecheck/lint 问题。
- 手工绕过 GitHub Actions 的签名、构建或 release 门禁。
