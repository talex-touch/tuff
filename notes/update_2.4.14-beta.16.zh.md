# Tuff v2.4.14-beta.16 更新说明

## 摘要

- **修复 CoreBox 与主窗口白屏：** 窗口 preload 入口改为从 Electron 应用根目录解析，避免 electron-vite 将配置打包进 `out/main/chunks` 后把路径错误指向不存在的 `out/main/preload`。
- **统一桌面窗口启动契约：** Main、CoreBox、Division、Assistant、Screenshot 与 OmniPanel 共用同一条经过验证的 preload 路径，确保 IPC bridge 在所有窗口一致初始化。
- **补齐发布回归：** Electron 测试桩同步 `app.getAppPath()` 契约；CoreApp 完整测试、工作区类型检查、发布门禁与真实 CoreBox 启动验证均已通过。

## 变更内容

- **CoreApp 窗口启动**

- 将 preload 入口集中为 `app.getAppPath()/out/preload/index.js`，不再依赖最终 chunk 所在目录的 `__dirname`；测试环境保留 `process.cwd()` 降级，避免 Electron 桩导入失败。
- 八类 `BrowserWindow` 配置统一复用该入口，修复 preload `ENOENT` 导致的 `window.electron.ipcRenderer` 缺失、Vue 根节点无法挂载和 CoreBox 空白面板。

- **验证**

- GitHub PR CI 的工作区类型检查、CoreApp/Nexus/集成测试、文档质量、PR Quality 与 CodeQL 均通过。
- macOS 开发态实际启动后，Main renderer 正常挂载；CoreBox 输入框、占位文字和控件可见，推荐引擎成功返回 8 项结果。
- 本版本仍为 Beta 预发布通道；建议升级后优先确认主窗口和 CoreBox 快捷键唤起路径。
