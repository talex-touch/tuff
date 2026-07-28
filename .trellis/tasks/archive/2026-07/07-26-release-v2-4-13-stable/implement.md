# 执行计划

## 1. Preflight

- [x] 删除用户授权的旧空 draft Release ID `343235869`。
- [x] fetch origin 并确认 `master` 同步、`v2.4.13` tag 不存在。
- [x] 运行 `pnpm quality:release` 与 `git diff --check`；修复并提交 lint/type/test 三类既有门禁漂移后完整通过。

## 2. Version And Push

- [x] 通过仓库版本脚本显式升级为 `2.4.13`；版本提交 `9935ed49b`。
- [x] 验证版本提交、annotated tag 与远端指针，均 peeled 到 `9935ed49b`。

## 3. Release Workflow

- [x] 跟踪 tag 触发的 `build-and-release.yml` 至终态：run `30243898517` success。
- [x] 确认 Windows、macOS、Linux build success。
- [x] 确认 Create Release 和 Sync Nexus Release success。

## 4. Acceptance

- [x] 验证 GitHub Release 非 draft、非 prerelease：`https://github.com/talex-touch/tuff/releases/tag/v2.4.13`。
- [x] 验证三平台资产、sidecar signatures、manifest 和 release summary。
- [x] 下载并运行 manifest validator；summary 为 `RELEASE/pass`，rollbackFromVersion=`2.4.12`，macOS native trust=true。
- [x] 最终 `origin/master...HEAD = 0/0`，HEAD/tag=`9935ed49b`，工作区 clean。
