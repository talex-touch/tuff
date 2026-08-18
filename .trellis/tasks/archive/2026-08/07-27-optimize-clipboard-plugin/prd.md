# 优化 Clipboard History 插件

## Goal

优化独立的 Clipboard History 插件，让用户可通过 CoreBox 输入快速找回近期剪贴内容，并可靠预览图片、识别来源应用，同时保持详情与管理能力简单、稳定、可预测。

## Confirmed Facts

- Clipboard History 是完整插件，实现在 `plugins/clipboard-history`。
- 当前通过 Clipboard SDK 获取历史，支持类型/收藏筛选、分页、详情、复制、粘贴、收藏、删除和键盘导航。
- 当前每页 50 条，按时间倒序；历史变化会重载当前筛选第一页；图片原图按选择延迟解析。
- Clipboard SDK 已提供 `searchHistory/getHistory({ keyword, type, isFavorite, page, pageSize, sortOrder })`。
- 宿主查询使用 SQLite `LIKE` 匹配 content/rawContent/metadata，并按 timestamp 排序；单页上限 100。
- 基线测试 20 项全部通过。

## Product Requirements

- 启用 WebContent 的 `showInput` / `allowInput`，将 CoreBox 输入通过现有 `FeatureSDK.onInputChange` 作为关键词搜索入口，不在插件页面重复增加第二个搜索框。
- 搜索与类型/收藏筛选组合使用，结果按时间倒序，优先满足用户找回近期内容的真实需求。
- 默认每页继续使用 50 条，滚动按需加载更多匹配项；不预取或扫描全历史到插件内存。
- 输入搜索词时保留现有详情预览、复制、粘贴、收藏、删除和键盘选择能力。
- 空 query 恢复普通近期历史；清除搜索不丢失当前类型筛选。
- 覆盖文本、HTML、图片 OCR metadata 和文件记录的现有数据库匹配边界，UI 不宣称 typo/fuzzy 或语义搜索。
- 图片记录详情优先显示 Clipboard SDK 返回的原图；原图不可用时降级显示现有缩略图，不得保留空白预览区。
- 来源应用按记录中的精确应用标识懒解析，显示应用图标与人类可读名称；解析失败时保留原始应用标识。

## Reliability And Security Requirements

- 搜索输入使用轻量 debounce，query 或筛选变化时回到第一页。
- 使用请求代次保护；较早请求晚返回时不得覆盖最新 query/filter 结果。
- 历史变化时保留当前 query/filter 并刷新当前搜索，而不是退回无条件历史。
- 搜索、复制、粘贴、收藏、删除、图片加载和来源应用解析失败必须有明确或可理解的降级；失败后保留当前可用内容并允许重试相关读取。
- 插件声明 `fs.tfile`；宿主仅在当前插件实时获准该权限时允许其 WebContentsView 加载 `tfile:`，底层协议路径 allowlist 继续生效。
- 新增最小 `system.resolveApplication` SDK：只接受精确应用 id，返回有界的 `identifier`、`displayName`、`icon` 投影；受 `system.applications` 权限保护，不返回原生路径或图像字节。
- Clipboard History 1.1.12 声明 `sdkapi: 260817`；旧宿主必须在兼容性门禁处拒绝激活，支持 260817 的宿主才可开放应用解析。
- 保持 Clipboard SDK、宿主应用恢复和既有剪贴板读写权限门兼容；新增权限缺失或拒绝时必须 fail closed 或安全降级。

## Acceptance Criteria

- [x] 用户可通过 CoreBox 输入组合关键词与类型/收藏筛选，结果按时间倒序分页返回。
- [x] 搜索只通过现有 Clipboard SDK/SQLite 查询，不在插件内复制通用匹配算法或全量扫描历史。
- [x] 空 query、清除 query、无结果、读取失败和重试状态明确。
- [x] 快速输入或切换筛选时，旧请求不会覆盖最新结果。
- [x] 历史更新后保留当前 query/filter 并刷新结果。
- [x] 键盘选择、Enter 粘贴、Cmd/Ctrl+Enter 复制在搜索结果中继续工作。
- [x] 文本、HTML、图片 metadata 和文件记录的匹配边界有测试说明。
- [x] 图片详情可显示获准的 `tfile:` 原图，加载失败时显示缩略图降级，不出现空白预览。
- [x] 来源应用解析按精确 id 返回有界 DTO；详情显示图标和名称，失败时保留原 id，且不会泄露可执行文件路径或原始图像字节。
- [x] 未授予 `fs.tfile` / `system.applications` 时宿主拒绝对应能力，插件保持可理解的安全降级。
- [x] Clipboard 测试、SDK/权限契约测试、类型检查、构建和插件校验通过。

## Out of Scope

- 通用插件 SearchSDK、fuzzy/typo/语义搜索或 CoreBox SearchEngine 接入。
- Quick/Detail 双模式、全历史渐进扫描、Top-K 合并和覆盖进度状态机。
- 重写宿主剪贴板采集、持久化或索引管线；来源应用图标通过现有 app provider 投影，不把图标写入剪贴板记录。
