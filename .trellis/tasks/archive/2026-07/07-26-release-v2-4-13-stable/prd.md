# 发布 v2.4.13 稳定版

## Goal

基于已发布并完成本机安装启动验收的 `v2.4.13-beta.23`，发布 `v2.4.13` 稳定版，并形成版本、tag、三平台签名构建、GitHub Release 与 Nexus 发布的完整证据。

## Confirmed Background

- `v2.4.13-beta.23` workflow `30240039942` 全部成功。
- macOS arm64 beta.23 下载资产已通过 manifest SHA-256、RSA sidecar、Developer ID、stapler 和 Gatekeeper 校验，并在本机稳定启动。
- 本地 `master` 与 `origin/master` 同步，工作区 clean。
- 远端无 `v2.4.13` git tag，但存在 2026-06-23 创建、无正文无资产的旧 draft Release（ID `343235869`）。用户已明确授权删除该空草稿。

## Requirements

- 删除已授权的旧空 draft，避免稳定 tag workflow 同名冲突。
- 发布前运行仓库 release quality gate；失败时不创建 tag。
- 版本从 `2.4.13-beta.23` 升级为 `2.4.13`，根包与 CoreApp 保持一致。
- 推送 `master` 与 annotated tag `v2.4.13`，禁止 amend、rebase、force push。
- tag workflow 必须完成 Windows、macOS、Linux stable 构建，macOS 必须保持 Developer ID/notarization 门禁。
- GitHub Release 必须为非 draft、非 prerelease，并包含三平台首选资产、签名、manifest 与 release test summary。
- Nexus Release 同步与正式发布必须成功。
- 下载并验证稳定版 manifest 与 release summary；manifest 的 stable rollback 基线必须属于 stable 同频道。

## Acceptance Criteria

- [x] 旧空 draft 已按授权删除，远端稳定 tag 创建前不存在。
- [x] 本地 release quality gate 通过，版本提交和 tag 指向同一 commit。
- [x] `origin/master` 与本地 `master` 同步，远端 `v2.4.13` tag 正确。
- [x] Build and Release workflow 全部成功，包含三平台、Create Release、Sync Nexus Release。
- [x] GitHub `v2.4.13` 为正式 Release，资产/签名/manifest/test summary 完整。
- [x] Manifest 和 summary 校验通过，Nexus stable 发布成功。

## Safety

- workflow 失败时不删除 tag、不改写历史，使用后续修复版本处理。
- 不绕过签名、notarization、Gatekeeper、manifest 或 release summary 门禁。
- 除已单独授权的旧空 draft 外，不删除远端 Release、资产、tag 或分支。
