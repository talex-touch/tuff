# 微审计 52/70

- 审计主题

NativeFileSearchProvider 是否被正确定位为 macOS / Linux 平台的 best-effort 文件搜索补强，而不是被等同为 Windows Everything 或 FileProvider 内容索引的跨平台强保证。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
   - provider 表把平台分层写为 Windows: shell + Everything + FileProvider；macOS: Spotlight + FileProvider；Linux: native + FileProvider。
   - Native file providers 行明确写成 macOS Spotlight / Linux locate-tracker-baloo fast provider，缺口是 unavailable reason 消费面。
   - 文件搜索召回矩阵把 native provider 与 Everything、FileProvider 并列为不同来源，并要求记录 native provider missing / degraded reason。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
   - 第 3 节把 macOS Native File Search 写为部分落地：`mdfind` 限定 Documents / Downloads / Desktop / Music / Pictures / Videos 与用户额外路径。
   - 同一节把 Linux Native File Search 写为 best-effort：依赖 `locate` / `tracker3` / `tracker` / `baloosearch`，缺后端时必须 degraded / unsupported。
   - File Search evidence 清单要求 macOS 验证 `mdfind -onlyin` scope，Linux 验证 backend available / missing 两态。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 52 条判断 NativeFileSearchProvider 是平台 best-effort，不应等同 Everything；主文档已有平台分层。
4. `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
   - `registerDefaults()` 只在 `win32` 注册 `windowsShellFileProvider` + `everythingProvider`，在 `darwin` 注册 `macSpotlightFileProvider`，在 `linux` 注册 `linuxNativeFileProvider`，随后统一注册 `fileProvider`。
   - 代码注释明确 native providers 只提供 fast first-frame candidates，FileProvider 仍是 index / enrichment layer。
5. `apps/core-app/src/main/modules/box-tool/addon/files/native-file-search-provider.ts`
   - `BaseNativeFileSearchProvider` 的 `priority = 'fast'`、`expectedDuration = 75`，说明定位是快速首屏候选，不是完整索引替代。
   - `onLoad()` 会在平台不匹配时直接 `available = false`；`isSearchReady()` 同时检查平台与探测结果。
   - `onSearch()` 在无 query、未 ready、abort、异常或无结果时返回空结果；当前不会把 `lastError` 直接带到 CoreBox 用户可见层。
   - `MacSpotlightFileProvider` 使用 `mdfind -0 -onlyin ...`，默认 scope 来自 Electron 用户目录和 `extraPaths`，并二次过滤 watch root 内路径、排除 `.app` bundle 内部结果。
   - `LinuxNativeFileProvider` 只在探测到 `locate` / `tracker3` / `tracker` / `baloosearch` 之一后 ready；搜索命令按 backend 分支执行，解析输出仅保留绝对路径。
6. `apps/core-app/src/main/modules/box-tool/addon/files/native-file-search-provider.test.ts`
   - 测试覆盖 macOS `.app` bundle 过滤、`mdfind -onlyin` 参数、extra paths 去重、无搜索 root 时不运行全盘 `mdfind`、root containment 大小写归一。
7. `apps/core-app/src/main/modules/box-tool/search-engine/search-core-utils.ts`
   - `macos-spotlight-provider` 与 `linux-native-file-provider` 均被归类到 `file` provider category；这支持 `@file` 类过滤，但不改变二者 best-effort 属性。

- 结论

主文档对 NativeFileSearchProvider 的映射口径成立：Tuff 当前确实有 macOS / Linux 原生文件搜索 fast provider，但它的产品语义应是“平台原生搜索候选 + FileProvider 补充索引”的 best-effort 组合，而不是 Raycast / Alfred / uTools 文件搜索体验的完整等价实现。

这个判断有三条源码证据支撑：

1. **平台分工清楚**：Windows 走 shell / Everything，macOS 走 Spotlight，Linux 走 locate / tracker / baloo；三者不是同一个能力等级。Everything 有 Windows 专项 backend / fallback 语义，native provider 只是非 Windows fast layer。
2. **scope 没有越界**：macOS Spotlight 查询使用 `-onlyin` 限定默认用户目录和 extra paths，并额外过滤 `.app` bundle 内部路径；测试也覆盖“没有 root 时不跑全盘 mdfind”。这与 09 文档里“不默认扩大成全文或系统 App 数据扫描”的边界一致。
3. **Linux 必须诚实降级**：Linux provider 依赖本机是否安装 `locate` / `tracker` / `baloo`。探测失败时 `isSearchReady()` 为 false，搜索返回空结果；因此 release evidence 必须补 backend missing / degraded reason，不能把缺后端包装成“正常 0 结果”。

因此后续最小动作不应是改排序或扩大 native 搜索范围，而是按主文档要求补 evidence：macOS 记录 `mdfind -onlyin` scope 命中 / scope 外丢弃，Linux 记录 backend available / missing 两态、provider duration、empty/degraded reason，并确认 CoreBox / trace 消费层能区分“无结果”和“native backend unavailable”。

- 是否发现需修正的主文档问题

否。`05-search-performance-ranking.md`、`09-cross-platform-local-data.md` 与 `11-100-round-cross-review-ledger.md` 都没有把 NativeFileSearchProvider 写成跨平台强保证；它们把 macOS Spotlight、Linux native backend missing、Windows Everything 和 FileProvider fallback 分开描述，符合当前源码事实。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-52.md`，未修改业务代码，未修改 01-11 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
