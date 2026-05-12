# Tuff v2.4.10-beta.20 更新说明

## 本次更新

- 修复 CI/CD 发布构建在 `afterPack` 阶段解析 esbuild 可选平台依赖时失败的问题。
- 打包运行时依赖收集现在会跳过非当前平台的可选 runtime dependency，避免 Linux/macOS/Windows 构建被 `@esbuild/aix-ppc64` 等无关平台包阻断。
- 目标平台所需的 esbuild native binary 仍保留 fail-fast 校验，确保真正缺失当前平台二进制时不会静默发布。
- 补充 runtime modules contract 测试，覆盖可选依赖缺失时的跳过语义。
- 已通过 `workflow_dispatch` beta 验证构建，Windows、macOS、Linux 三端构建、校验和 artifact 上传均通过。

## 已知限制

- 该版本仍是 beta 测试包，不代表 `2.4.10` 正式发布 gate 已完成。
- Windows 真机 acceptance、性能采样和 Nexus Release Evidence 写入仍是正式发布阻塞项。
- GitHub Actions 提示 Node.js 20 actions 将在 2026-06-02 起默认迁移到 Node.js 24，后续需要单独升级/验证相关 action。
