# Tuff v2.4.10-beta.21 更新说明

## 本次更新

- 修复 OmniPanel Gate 在主进程模块中读取 `globalThis.$app` 的 lint 阻断，改为通过模块生命周期上下文保存 `TouchApp` 引用。
- 修复 OmniPanel 渲染端裸 `console.error` 阻断，统一走 renderer logger。
- 更新 Utils transport boundary 测试基线，固定当前 retained raw definition 扫描结果。
- 补齐 `clipboard-history` 与 `touch-dev-utils` 插件本地 ESLint 配置，并修正 clipboard history 组件事件命名与格式化问题，确保插件质量门禁可独立运行。
- 修复 tuff-cli bin 入口和 tuff-native screenshot build 脚本的 lint 问题，避免全量质量链路被工具包脚本阻断。
- 已在本地验证 macOS beta 构建可生成可用 `.app.zip`，应用 bundle 版本与包版本保持一致。

## 已知限制

- 该版本仍是 beta 测试包，不代表 `2.4.10` 正式发布 gate 已完成。
- Windows 真机 acceptance、性能采样和 Nexus Release Evidence 写入仍是正式发布阻塞项。
