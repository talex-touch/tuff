# 执行计划

## 1. 完成本地提交

- [x] 更新 G02 分块写入正式契约与当前任务决策。
- [x] 运行 AppProvider 与 onboarding focused tests。
- [x] 审查 package built-dependency 白名单和现有 Trellis 规范/证据改动。
- [x] 按逻辑提交 G02、onboarding、构建依赖与规范/证据。
- [x] 保持发布任务过程文件不进入业务提交。

## 2. 发布前门禁

- [x] `pnpm install --frozen-lockfile --ignore-scripts`
- [x] `pnpm lint:changed`
- [x] `git diff --check`
- [x] 确认工作区清洁、远端目标 tag 不存在、master 可正常推送。

## 3. 版本与推送

- [x] 使用版本脚本显式生成 `2.4.13-beta.23` 版本提交与 annotated tag。
- [x] 推送 `origin/master` 与 `v2.4.13-beta.23`。
- [x] 验证远端 branch/tag 指针。

## 4. 发布验收

- [x] 跟踪 `build-and-release.yml` tag run 至终态：Actions run `30240039942` success。
- [x] 验证 GitHub Release 为 prerelease：`https://github.com/talex-touch/tuff/releases/tag/v2.4.13-beta.23`。
- [x] 验证 release assets 包含跨平台安装包、`tuff-release-manifest.json` 与测试摘要；manifest rollback 为 `2.4.13-beta.22`。
- [x] 记录 run/release URL 和最终 git 状态：`master...origin/master` 为 `0/0`，HEAD/tag 均为 `022ade0d0`。

## Rollback Points

- 本地验证失败：不创建版本提交/tag。
- master 推送失败：不推 tag，修复非 fast-forward 或权限问题。
- tag workflow 失败：不删除 tag/改写历史；保留证据并用后续修复版本处理。
