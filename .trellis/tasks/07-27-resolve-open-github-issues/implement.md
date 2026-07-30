# Implementation Plan — 收口全部开放 GitHub Issues

## Wave 0 — 快速证据收口

- [x] 完成 `07-27-close-superseded-legacy-issues`：核验 #43/#46/#54 的当前实现，运行最小相关测试，逐项评论并关闭。
- [x] 完成 `07-27-verify-close-issue-295`：汇总 #295 关联提交、focused tests 和打包/真实 profile 证据；证据满足后评论并关闭，否则把缺口转为明确修复项。
- [x] 推进 `07-27-diagnose-ubuntu-startup-213`：已向报告者请求最新版、安装包类型、启动命令、stderr、主进程日志和 `uname -a`；等待外部复现资料。

## Wave 1 — 授权基础

- [x] RED/GREEN `07-27-fix-permission-revocation-296`：session-only、persistent-only、combined、alias、revokeAll、restart；#299 已消费 awaited teardown event，待最终 review/Issue close。
- [x] RED/GREEN `07-27-fix-transport-caller-identity-300`：payload uniqueKey 不得验证；sender/port/plugin instance/activation generation 必须一致；local test context 显式可信。

## Wave 2 — 高权限存储

- [x] 完成 `07-27-harden-plugin-storage-299`：统一 permission guard、canonical root、双层 SQL policy、rows/bytes/time/statements/concurrency/disk/native limits、worker close/delete lifecycle。
- [x] 使用真实临时目录与 built worker 验证 symlink/validation-to-open replacement、cross-plugin、quoted/unquoted PRAGMA、permission runtime unavailable、timeout recovery 与 quota errors。

## Wave 3 — 运行时隔离

- [x] 完成 `07-27-secure-plugin-views-298`：安全 Electron preferences/bridge v1 默认启用；legacy 在构造前稳定拒绝；navigation、popup、download、protocol、local resource policy sender-bound；真实 Electron smoke通过。
- [x] 完成 `07-27-isolate-plugin-prelude-297`：utilityProcess 默认启用；typed capability RPC；callbacks/cancel/timeout/crash/restart/generation/resource limits；移除生产 main-process fallback。
- [x] 运行全部官方插件构建、加载与关键能力回归：22/22 官方 Prelude 完成隔离迁移；CoreApp plugin 84 files / 1104 tests、Node/Web typecheck、production build 与 Electron smoke 通过；#297 已证据关闭。

## Wave 4 — 隐私生命周期与总收口

- [x] 与用户逐项确认 #301 的数据类别默认保留期、卸载/撤权策略、备份恢复和远程处理披露。
- [x] 实现 Clipboard、OCR/Search detail、plugin data、Secrets、logs/telemetry 的 inspect/export/clear/delete controls 与合成 canary 测试；#301 由 `5bf6e08b4` 实现并证据关闭。
- [x] 更新 #302 checklist，执行最终 lint/typecheck/test/build、隔离 Electron smoke 与 GitHub baseline query。

### Final Integration Evidence — 2026-07-30

- 原始 12-issue baseline 已全部处置：#43/#46/#54/#295/#296/#297/#298/#299/#300/#301 CLOSED；#213 已请求 v2.4.13 包类型、系统/session、stderr 与 main log，保持 OPEN 等待报告者资料；#302 是唯一待本次关闭的 tracker。
- #296-#301 均有 GitHub closure comment、实现提交、原始失败回归和独立安全 review。Trellis stale `review` 状态已与外部完成证据同步并归档。
- #301 最终 closure matrix `324/324`，Node/Web typecheck、scoped ESLint/Prettier、`plugins:validate` `24/24`、13-entry/26-reference inventory、production build、13-handler isolated Electron Privacy smoke 与 `git diff --check` 通过。
- #297 final evidence 保持 22/22 官方 Prelude、CoreApp plugin 84 files / 1104 tests、production build 与 Electron isolation smoke。
- 最终查询未遗漏 2026-07-27 baseline issue。执行期间新增的 #303+ 继续由各自 task/issue 管理，不自动扩大本父任务范围。

## Validation Gates

- 每个子任务先运行最小相关测试，再运行受影响 package 的 lint/typecheck/test/build。
- 安全跨层任务必须执行 `trellis-check` 并核对 SDK -> transport -> main enforcement -> lifecycle 全链路。
- GitHub 关闭操作只在对应子任务验收完成后执行；执行期间新增 Issue 记录为后续，不自动改变本任务基线。

## Review And Rollback Points

- Gate A：Wave 0 关闭评论文本与 #213 信息请求经证据复核。
- Gate B：#300 identity contract 评审通过后，#299/#297 才依赖其类型。
- Gate C：#298/#297 hard-cut 前完成官方插件 compatibility inventory。
- Gate D：#301 产品默认值经用户确认后才写数据迁移或删除逻辑。
- 任一 gate 失败时只回滚当前子任务，不回滚已验证的独立 Issue 处置。
