# Tuff v2.4.9-beta.15 更新说明

## 本次更新

- 修正 `build-and-release` 对 beta tag 的 GitHub Release 标记逻辑，`v*-beta.*` 与 `SNAPSHOT` 版本现在会稳定发布为 pre-release，而不会误标成正式版。
- 复核并补强桌面打包链路：本地重新执行 macOS snapshot 打包，确认产物内包含 `module-details-from-path`、`require-in-the-middle`、`langsmith -> uuid / semver / p-queue`，以及 `compressing -> tar-stream -> readable-stream` 所需的运行时依赖闭包。
- 对所有必须落在 `resources/node_modules` 的运行时模块新增递归闭包同步与校验，减少安装包启动时逐层暴露新的缺包错误。
- 将主进程运行时 `@vue/compiler-sfc` 的依赖闭包同步到 `resources/node_modules` 并纳入校验，避免安装包继续因缺少 `@vue/compiler-core` 一类编译器依赖而启动失败。
- 修复安装包内 `SearchIndexWorker` 因静态卷入主进程 logger 依赖而报 `Cannot find module 'electron'` 的问题，恢复搜索索引 worker 的正常启动。
- macOS 未授予 `System Events` 自动化权限时，前台应用探测现在会短时退避并安静降级，不再持续刷出带完整堆栈的错误日志。
- 收口重复启动日志：主进程统一处理 `second-instance`，并在聚焦主窗口前补活体判断，避免 macOS 上继续出现 `Object has been destroyed` 异常日志。
- 修复 beta 更新判断链路：主进程版本读取不再受 `polyfills` 初始化时序和安装包 `SNAPSHOT` 元数据干扰，`2.4.9-beta.15` 不会再错误弹出 `beta.12` 的更新窗口；更新版本比较也统一兼容 `beta / alpha / snapshot` 预发布序列。
- 收口更新弹窗重复展示与层级异常：自动检查与可用更新事件改为共用同一弹窗会话门禁，同一版本不会再连续弹两次；`blowMention` 补齐显式层级，点击“下次提醒我”后不会再出现被挡住且无法操作的低层 dialog。
- 修复 `clipboard-history` 一类 `webcontent` 插件的入口文件完整性问题：安装阶段会校验 `index.html` 等必需文件，已安装目录若缺失入口文件会优先尝试从同目录 `.tpex` 包做一次性本地自愈；若校验仍失败，会清理半残安装目录，避免后续重装被残留目录阻塞。
- 收口剩余主进程日志噪音：`CoreBoxManager.exitUIMode()` 在非 UI 模式下不再额外输出 warn；`app:file-index:progress:stream:cancel` 这类可忽略的 stream cancel 请求不再刷出 `No handler registered`。
- 将更新检查、启动分析上报、Sentry 遥测里的上游 `403 / 429 / Cloudflare challenge` 统一降噪：更新检查改为短 warn + 冷却说明，启动分析沿用同一远端失败判定，Sentry 遥测只记录压缩后的挑战页摘要，不再把整页 HTML 打进日志。
- `AnalyticsStore` 的队列压力汇总区分真正失败与正常节流：纯 throttle / skip 改记为 info，仅丢弃或持久化失败时保留 warn。
- 复核桌面启动链路：通过真实 macOS GUI 路径启动打包后的 `tuff.app`，未再复现此前“主进程缺模块导致启动即崩”的问题。

## 影响范围

- GitHub Release / Nexus Release 的 beta 发布语义与客户端更新通道口径重新对齐。
- 当前 beta 安装包可以继续作为后续预发布验证基线。
