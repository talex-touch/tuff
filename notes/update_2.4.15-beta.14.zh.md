# Tuff v2.4.15-beta.14 更新说明

## 摘要

- Tuff 3.0 Phase 1 搜索与索引内核进程隔离（Slice 1 & 2）：新增同包体 Electron `utilityProcess` 搜索与索引内核宿主及 Writer/Reader 桥接，通过 `TUFF_SEARCH_KERNEL_UTILITY_PROCESS=1` 启用（纯 Node 跨进程 RSS 基准：主进程峰值 RSS `-187.36 MiB` / `-71.94%`、负载增量 `-91.28%`、查询零延迟回退；默认仍保持 `worker_threads` 以便 beta 安全验证）。
- Tuff 3.0 Phase 3 空闲渲染能耗优化：在窗口失焦、隐藏、`<KeepAlive>` 失活、系统减弱动态效果或低电量模式下，暂停 `TxBorderBeam`、`HomePet`、`HomeEmptyHead`/`TxMiko` 与 `useAuth` 的动画与定时器（后台降至 0 Hz）。
- 文件索引软链根目录修复：在 `file-scan-fd-backend.ts` 中对软链监听根目录与排除路径做真实路径规范化，解决 macOS 软链根目录下 `fd` 漏扫文件的问题。
- 通用 ACP 与多 CLI 常驻运行时宿主：统一常驻 ACP、Codex 与 Claude CLI 运行时宿主 `CliAgentRuntimeHost`，并新增可选 Git Worktree 隔离与有界 Diff 服务。
- TuffEx Pro FoldPage/FoldCorner 与验收工具齐步更新：新增 `@talex-touch/tuffex/pro` 的 `TxFoldPage`/`TxFoldCorner`（`0.9.5`），对齐 Phase 0 基线探针的打包隔离启动与 CoreBox CDP 就绪判定，完善 Nexus 线上预览取证边界，并同步 `beta.13` 打包验收文档。

## 变更内容

- Tuff 3.0 Phase 1 搜索与索引内核宿主及 Writer/Reader 桥接（`#2279`、`#2280`）：新增纯 Node 同包体 `utilityProcess` 内核宿主（`search-kernel-protocol.ts`、`search-kernel-process.ts`、`search-kernel-client.ts`，产物 `out/main/search-kernel-process.js` 零 Electron GUI 导入以继承同签名与 TCC 身份），并通过 `search-kernel-worker-handlers.ts` 与共享 `SearchKernelClient` 单例将 `SearchIndexWorkerClient` 与 `SearchIndexReadWorkerClient` 桥接至 `TUFF_SEARCH_KERNEL_UTILITY_PROCESS=1` 可选通道；保留提交回执恢复、分泳道隔离、`SharedArrayBuffer` `Atomics.store` 语义取消及优雅停机，默认路径继续使用 `worker_threads`；配套 `coreapp-search-kernel-rss-benchmark.mjs` 实测主进程峰值 RSS 由 `260.45 MiB` 降至 `73.09 MiB`（`-187.36 MiB` / `-71.94%`）、负载增量由 `+205.13 MiB` 降至 `+17.89 MiB`（`-91.28%`），结果一致性通过且无查询延迟回退。
- Tuff 3.0 Phase 3 空闲 GPU 与渲染进程 CPU 治理（`#2281`）：在窗口失焦、隐藏、`<KeepAlive>` 失活、`prefers-reduced-motion` 或 `html[data-low-battery-motion='1']` 时暂停 `TxBorderBeam` CSS 动画及其共享 30 fps `pulse-driver.ts` `requestAnimationFrame` 循环；暂停 `HomePet`（`usePetController.ts`/`HomePet.vue`）动画循环、定时器与 `getBoundingClientRect()` 轮询；将 `HomeEmptyHead.vue` 中 `visibility: hidden` 的隐藏重复 `<TxMiko>` 替换为 `v-if` 并通过 `.is-paused` 暂停 `TxMiko` 定时器与关键帧动画；将 `useAuth` 聚焦提示轮询改为仅在浏览器登录挂起时惰性注册，前台聚焦视觉与交互体验保持不变，后台降至 0 Hz。
- 文件索引软链根目录与排除路径规范化（`#2273`）：在 `file-scan-fd-backend.ts` 中通过 `fs.realpath`（不存在时回退 `path.resolve`）解析 `canonicalRoot` 并传入 `fd` 与遍历裁剪规则，同时保留解析前后及跨根目录重映射的排除路径，修复 macOS 软链根目录（如 `/var/folders/...`、`/tmp/...` 或用户软链监听目录）下 `fd --absolute-path` 丢弃全部文件的问题，并补齐回归单测。
- 通用 ACP 与多 CLI 常驻运行时宿主及 Git Worktree 隔离（`#2282`）：在 `@talex-touch/tuff-intelligence` 中新增通用 `AcpClient`、常驻 `CodexAppServerClient` 与双向 `ClaudeStreamClient`（完整兼容既有 `OmpAcpClient`），在 `apps/core-app` 中落地统一的 `CliAgentRuntimeHost` 与驱动解析，并新增基于 `userData/ai-worktrees` 租约管理的 `GitWorktreeManager` 可选隔离工作树与有界 Diff 服务。
- TuffEx Pro FoldPage/FoldCorner、Phase 0 探针、Nexus 取证与 `beta.13` 报告（`#2276`、`#2275`、`#2272`、`#2274`、`#2278`）：在 `@talex-touch/tuffex/pro` 中新增 `TxFoldPage` 与 `TxFoldCorner`（`0.9.5`）及中英文 Nexus 文档与交互示例；对齐 `coreapp-energy-baseline-probe.mjs` 的正式包隔离启动与 CoreBox CDP 就绪检测；强化 Nexus 线上预览取证状态推导、路由请求预算、API 边界、`--deployed-only` 模式及嵌套 `omp` 实测清理；同步记录 `v2.4.15-beta.13` 实机打包验收与 Phase 0 基线证据。
