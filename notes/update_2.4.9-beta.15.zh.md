# Tuff v2.4.9-beta.15 更新说明

## 本次更新

- 修正 `build-and-release` 对 beta tag 的 GitHub Release 标记逻辑，`v*-beta.*` 与 `SNAPSHOT` 版本现在会稳定发布为 pre-release，而不会误标成正式版。
- 复核并补强桌面打包链路：本地重新执行 macOS snapshot 打包，确认产物内包含 `module-details-from-path`、`require-in-the-middle`、`langsmith -> uuid / semver / p-queue`，以及 `compressing -> tar-stream -> readable-stream` 所需的运行时依赖闭包。
- 对所有必须落在 `resources/node_modules` 的运行时模块新增递归闭包同步与校验，减少安装包启动时逐层暴露新的缺包错误。
- 将主进程运行时 `@vue/compiler-sfc` 的依赖闭包同步到 `resources/node_modules` 并纳入校验，避免安装包继续因缺少 `@vue/compiler-core` 一类编译器依赖而启动失败。
- 修复安装包内 `SearchIndexWorker` 因静态卷入主进程 logger 依赖而报 `Cannot find module 'electron'` 的问题，恢复搜索索引 worker 的正常启动。
- macOS 未授予 `System Events` 自动化权限时，前台应用探测现在会短时退避并安静降级，不再持续刷出带完整堆栈的错误日志。
- 收口重复启动日志：主进程统一处理 `second-instance`，并在聚焦主窗口前补活体判断，避免 macOS 上继续出现 `Object has been destroyed` 异常日志。
- 修复 `clipboard-history` 一类 `webcontent` 插件的入口文件完整性问题：安装阶段会校验 `index.html` 等必需文件，已安装目录若缺失入口文件会优先尝试从同目录 `.tpex` 包做一次性本地自愈；若校验仍失败，会清理半残安装目录，避免后续重装被残留目录阻塞。
- 复核桌面启动链路：通过真实 macOS GUI 路径启动打包后的 `tuff.app`，未再复现此前“主进程缺模块导致启动即崩”的问题。

## 影响范围

- GitHub Release / Nexus Release 的 beta 发布语义与客户端更新通道口径重新对齐。
- 当前 beta 安装包可以继续作为后续预发布验证基线。
