# 对齐已发布版本 Release Gate 契约 — Design

## Problem

`v2.4.13-beta.19` 的正式发布工作流和 `release-test-summary.json` 均通过，但发布后的 `check-release-gates.mjs --stage gate-e` 仍有三类误判：工作区本地 notes 缺失、Nexus linked asset 使用 GitHub sidecar URL、以及同一 Linux pair 额外发布 DEB sidecar。

根因不是发布资产错误，而是 post-publish gate 把三种不同真源混为一个约束：

- 本地 notes 是发布前输入，Nexus notes 是发布后事实；
- Manifest 是 preferred `platform/arch` matrix，GitHub Release 是完整 package inventory；
- Nexus R2 资产有 canonical endpoint，GitHub-linked 资产只有外部 sidecar URL。

## Source-of-truth contracts

### Notes

- `gate-a` 至 `gate-d`：本地 `notes/update_<version>*` 是输入门禁。
- `gate-e`：仅远端 `release.notes` 和 `release.notesHtml` 是验收真源。

### GitHub inventory

- Manifest 中每个 pair 只能有一个 preferred package。
- 额外 CoreApp package 仅在其推断 pair 已存在于 Manifest 且同名 `<package>.sig` sidecar 完整时合法。
- preferred package 和 sidecar 继续执行 Manifest SHA-256、名称、tag、URL 和上传状态检查。
- 额外 package 执行名称唯一、pair、GitHub digest、tag/URL、上传状态和 sidecar 配对检查；不进入 Nexus preferred matrix。

### Nexus signature URL

每个 Nexus preferred asset 的 `signatureUrl` 只允许两种形态：

1. 同源 `/api/releases/<tag>/signature/<platform>/<arch>`，无 query/hash；
2. 与 GitHub Release 中 Manifest 指定 sidecar 的 `browser_download_url` 完全相同。

Gate 使用该实际 URL获取 payload。相对 URL以 Nexus base URL 解析；外部 GitHub URL允许正常重定向，但不把最终临时 URL写入摘要。

## Data flow

1. 获取 Nexus release、GitHub release 和 GitHub manifest。
2. 构建 Manifest preferred matrix 与 GitHub name → asset 映射。
3. 比较 Nexus matrix：文件名、SHA-256、download URL、允许的 signature URL。
4. 检查 GitHub 完整 inventory：preferred 资产以及同 pair 的额外 package/sidecar。
5. 请求每个 Nexus asset 实际 `signatureUrl` 并分类 payload。
6. 只有所有 gate-e 检查通过时输出 `result: pass`；`--strict` 以退出码 0 收口。

## Compatibility and risk

- CoreApp 已支持绝对 external `signatureUrl` 和相对 Nexus URL，本变更不修改 runtime 或 API schema。
- canonical Nexus signature endpoint 保持受支持，不删除 R2 路径。
- 不调用 Nexus 写接口，不改变 beta.19 远端数据。
- 失败分类继续 fail closed；只消除与现行 release contract 冲突的误判。

## Rollback

回滚 `local-checks.mjs`、`remote-checks.mjs` 及其 focused tests 即可；无数据迁移或生产回滚。