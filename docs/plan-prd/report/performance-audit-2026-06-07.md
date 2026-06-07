# 性能审计与优化（2026-06-07）

> 范围：`apps/core-app` 主进程（CoreBox 搜索引擎、文件/应用 provider、索引、IPC/channel、存储、剪贴板、启动模块）、`apps/core-app` 渲染层 CoreBox 搜索 UI、`packages/utils` 文件扫描工具。
> 关系：本轮为首次系统性性能梳理。基线 `HEAD` 为 `686ec013e`，根目录与 CoreApp 版本 `2.4.11-beta.7`。结论：整体工程化程度高、无致命问题；本轮落地 3 项低风险高价值优化 + 1 处真泄漏修复，全量虚拟滚动按决策留作后续专项。

## 总结

- **总体判断**：搜索/索引/IPC/启动等关键路径在性能上经过认真工程化，**没有致命问题**。能动的优化是少数几个具体、可量化的点，而非架构性返工。
- **本轮已落地**：搜索 debounce 调优、结果渲染上限、`scanDirectory` 重构（含测试）、`InteractiveTerminal` 真泄漏修复。
- **已验证健康（不要误伤）**：两阶段流式搜索 + 缓存 + Worker 线程索引；剪贴板原生事件监听（非轮询）；存储广播 debounce + 排除源窗口；推荐引擎多层缓存 + 空闲后台刷新；IPC 监听器/定时器清理纪律一致。
- **待办**：全量虚拟滚动专项（与焦点/键盘导航强耦合，风险高）；debounce/上限的运行时手感实测；少量 document 级监听调用点确认。

## 一、已验证的性能强项（基线很高）

| 机制 | 位置 | 说明 |
| --- | --- | --- |
| 两阶段流式搜索 | `search-core.ts:1521+` / `mergeAndRankItems` | base 排序先推前端 → 再做 usage/pinned/completion 富化后二次推送 |
| 结果用 `shallowRef` | `useSearch.ts:153` | 避免对大结果数组做深度响应式 |
| 文件扫描 + FTS5 索引写入跑 Worker 线程 | `addon/files/workers/file-scan-worker.ts`、`search-engine/workers/search-index-worker.ts` | 不阻塞主线程/UI |
| 重活先等空闲再扫 | `file-provider.ts:2067` `appTaskGate.waitForIdle()` | worker 扫描前让出，仅 worker 异常时才回退主线程内联扫描 |
| 剪贴板原生事件监听（非轮询） | `clipboard/clipboard-native-watcher.ts:122` | OS 事件驱动，无定时轮询开销 |
| 存储广播 debounce + 排除源窗口 | `storage/index.ts:32,53` | 抑制 IPC 放大 |
| 推荐引擎多层缓存 + 空闲后台刷新 + `setImmediate` 分片 | `recommendation/recommendation-engine.ts:66,122,458` | 开盒热路径已缓存 |
| Provider 结果上限 + SQLite 索引查询 | `everything-provider.ts:822`、`file-provider.ts:1755/2302` `.limit()` | 不做全量内存扫描 |
| AbortSignal 取消 + 会话序列号 + 重复查询抑制 | `search-core.ts:1296`、`useSearch.ts:187,316` | 防陈旧结果/重复请求 |
| 搜索 trace 廉价门控 | `search-core.ts:713` `if (!isEnabled()) return` | 每次搜索 ~15 处埋点默认是空操作 |
| 搜索结果缓存（TTL） | `search-core.ts:1221` | 命中缓存直接返回 |
| IPC 监听器注销纪律 | `channel/common.ts:876→1946`（`transportDisposers`）、`core/channel-core.ts:477`（`regChannel` 返回注销函数 + 482 防重复） | 销毁时统一释放，基础 `ipcMain.on` 仅注册一次 |
| 渲染层 hook 清理 | `useSearch.ts:960`（`onBeforeUnmount` 注销全部 `transport.on` + `clearTimeout`） | 无监听器/定时器泄漏 |
| 主进程定时器配对 | `intelligence-module.ts:1742/1757` ↔ `1635/1639`；`plugin.ts`、`plugin-module.ts` 均配对 `clearInterval` | 无定时器泄漏 |

## 二、按严重度排序的发现

| 级别 | 发现 | 位置 | 状态 |
| --- | --- | --- | --- |
| 🟠 中-高 | 结果列表无虚拟滚动，全量渲染；`res` 无总量上限，多 provider 聚合后可达 150-200+ 项 | `components/render/BoxGrid.vue:101,125`、`useSearch.ts` `res` computed | ✅ 已修（结果上限 80） |
| 🟠 中 | 搜索 debounce 仅 30ms，近似每按键触发一次完整管线 + 整列表重建 | `useSearch.ts:183` | ✅ 已修（80ms） |
| 🟡 中 | `scanDirectory` 串行递归 + 每文件串行 `stat` + 每目录/文件 `await import('node:fs/promises')` + 无深度上限 + `push(...subFiles)` 展开累积 | `packages/utils/common/file-scan-utils.ts:276` | ✅ 已修（重构 + 测试） |
| 🟠 中 | `InteractiveTerminal.vue` 无任何卸载钩子：`window` resize 监听匿名不可移除 + xterm `term` 从不 `dispose()`，每次开关泄漏完整 xterm 实例 | `components/terminal/InteractiveTerminal.vue` | ✅ 已修（`onUnmounted`） |
| ⚪ 观察 | `<Transition mode="out-in">` + `resultBatchKey` 在「重大变化」（overlap < 0.3）时整列表卸载重建 | `views/box/CoreBox.vue:355,369,774` | 缓解（debounce + 上限降频）；全量虚拟滚动留专项 |
| 🟡 低 | 对账查询无 `.limit()`：多个 `OR` 的 `LIKE 'prefix%'`，大索引下可能偏慢（非热路径） | `file-provider.ts:2076` `getReconciliationDbFiles` | 开放 |
| 🟡 低 | 模块级 `document`/`body` 监听无 `removeEventListener`，若仅 app 启动调用一次则无害 | `modules/hooks/application-hooks.ts:37`、`useUrlProcessor.ts:51`、`dropper-resolver.ts:135/171` | 开放（待确认调用点） |

## 三、本轮改动证据

### 1. 搜索 debounce 30ms → 80ms

证据：

- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts` `SEARCH_DEBOUNCE_MS` 由 `30` 改为 `80`，`debouncedSearch = useDebounceFn(executeSearch, SEARCH_DEBOUNCE_MS)`。
- `INPUT_CHANGE_DEBOUNCE_MS = 25`（输入文本同步到其他窗口用）保持不变，与搜索触发无关。

判断：

- 每次「重大变化」结果都会经 `CoreBox.vue` 的 `<Transition mode="out-in">` 重建整列表，提高 debounce 直接减少快速输入时的整列表重建次数（worst-case ~2.6x）。
- 80ms 仍低于 ~100ms 感知阈值，体验上仍接近即时；后端搜索耗时由 `search-core.ts` 的 `firstResultMs` 独立记录，可用于验证。

### 2. 结果渲染上限 `MAX_RENDERED_RESULTS = 80`

证据：

- `useSearch.ts` 的 `res` computed 末尾由 `return filterDetachedItems(result)` 改为 `return filterDetachedItems(result).slice(0, MAX_RENDERED_RESULTS)`。

判断：

- CoreBox 把每个结果渲染成组件且无窗口化，后端已按相关度返回，截断只去掉用户几乎不会滚到的低相关项。
- 焦点/键盘导航以 `res` 为索引基准，截断同一数组不会造成索引错位；推荐（空查询，≤10 项）与单结果预览（`length === 1`）路径不受影响。

### 3. `scanDirectory` 重构（`packages/utils/common/file-scan-utils.ts`）

证据：

- 新增 `getFsPromises()` 惰性缓存 `node:fs/promises`（仍保持动态 import 以兼容浏览器打包），替换原先「每目录 + 每文件」重复 `await import` 的写法。
- 新增 `mapWithConcurrency()` 轻量并发池：同目录内可索引文件以 `FILE_STAT_CONCURRENCY = 32` 并发 `stat`（叶子操作，不会与递归互锁）。
- 子目录递归保持**串行**，规避共享信号量在递归遍历中的死锁。
- 新增 `MAX_SCAN_DEPTH = 24` 深度上限；结果改为 push 进共享 `out` 数组，避免 `push(...subFiles)` 展开累积。
- 公共签名 `scanDirectory(dirPath, options?, excludePaths?)` 保持不变；修正了 `Dirent` 重载类型（用字面量选项内联 `readdir(..., { withFileTypes: true })` 命中 `Dirent[]` 重载）。

判断：

- 该函数经 `file-provider.ts:2063` 的 `scanDirectoryWithWorker` 在 Worker 线程调用，优化提升的是索引吞吐而非 UI 响应；改动不改变筛选语义（黑名单目录、dotfile、system/dev/cache 过滤、可索引判定均保留）。

证据（测试）：

- 新增 `packages/utils/__tests__/file-scan-utils.test.ts`，4 用例：跨嵌套递归收集 + 跳过 `node_modules`、`excludePaths` 生效、`ScannedFileInfo` 字段完整、超过并发上限（100 文件）全部命中无丢失/重复。
- 临时目录根在 `process.cwd()` 而非 `os.tmpdir()`：macOS tmpdir 为 `/var/folders/...`，其 `var` 段会触发 `isIndexableFile` 中**不受开关控制**的路径段黑名单（`MACOS_SYSTEM_DIRS` 含 `var`/`private`），否则会误判为空。

### 4. `InteractiveTerminal.vue` 泄漏修复

证据：

- 导入 `onUnmounted`；`window.addEventListener('resize', ...)` 改为具名 `onResize` 句柄；`setTimeout` 句柄存入 `fitTimer`。
- 新增 `onUnmounted`：`clearTimeout(fitTimer)` + `window.removeEventListener('resize', onResize)` + `term.dispose()`。

判断：

- 该组件被 `components/addon/TerminalTemplate.vue` 使用，确实在用；修复后每次开关不再泄漏 window 监听器与完整 xterm 实例。

## 四、验证

| 项 | 结果 |
| --- | --- |
| utils 新测试 `file-scan-utils.test.ts` | ✅ 4/4 通过 |
| utils 完整测试套件 | ✅ 仅剩**既有且无关**的 `markdown-sanitizer.test.ts` 失败（与本轮改动零耦合） |
| 渲染层 `typecheck:web` | ✅ 改动文件零 `error TS` |
| ESLint（改动区） | ✅ 零新增错误；`InteractiveTerminal.vue` 全清；`useSearch.ts`/`file-scan-utils.ts` 既有问题保持不动以聚焦 diff |

本轮改动文件：`useSearch.ts`、`file-scan-utils.ts`、`InteractiveTerminal.vue` + 新测试。
（注：`electron-builder.yml`、`scripts/build-target/*.js` 的工作区改动非本轮所为。）

## 五、待办与下一步

1. **全量虚拟滚动专项**（中-高价值，高风险）：保留全量数据、仅挂载可视区项。难点是 `itemRefs[index]` 滚动定位、键盘上下选中未挂载项、grid 多列 + 分 section 布局；需配套测试。本轮已用「结果上限」拿到大部分收益。
2. **运行时手感实测**：debounce 80ms 与上限 80 的体验需拉起 app 验证（`pnpm core:dev`），并对照 `firstResultMs`。
3. **document 级监听调用点确认**：核实 `application-hooks` / `useUrlProcessor` / `dropper-resolver` 是否仅在 app 启动调用一次（若是则无害）。
4. **对账查询补 `.limit()`**：`getReconciliationDbFiles` 在超大索引下的兜底上限（低优先）。
