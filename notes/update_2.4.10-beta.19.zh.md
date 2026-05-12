# Tuff v2.4.10-beta.19 更新说明

## 本次更新

- 准备 `2.4.10-beta.19` 测试包，覆盖 Windows App 索引、App 图标缓存稳定性与 macOS `.app` 文件预览过滤的近期修复。
- `build-and-release` 新增显式 `beta` 手动构建类型，beta tag 会自动走 beta 发布语义并保持 GitHub pre-release 标记。
- Beta 构建现在保留 `BETA` 运行时 metadata，同时复用既有 snapshot 打包策略，避免客户端构建信息被误识别为 snapshot。
- 补齐根脚本与 CoreApp 脚本的 `build:beta:*` 平台入口，避免本地或 CI 调用 `pnpm build:beta` 时缺少 workspace 脚本。
- CI/CD 基线统一到 Node `22.16.0` 与 pnpm `10.32.1`，发布构建改用锁文件安装并自动批准已登记 build scripts。
- PR CI 从 `pull_request_target` 收窄到只读 `pull_request`，并覆盖 `main/master`，降低外部 PR 执行仓库权限的风险。
- Release artifacts 上传范围收窄到安装包、压缩包与 updater metadata，减少 Actions artifact 体积和 release 汇总下载时间。

## 已知限制

- 该版本仍是 beta 测试包，不代表 `2.4.10` 正式发布 gate 已完成。
- Windows 真机 acceptance、性能采样和 Nexus Release Evidence 写入仍是正式发布阻塞项。
