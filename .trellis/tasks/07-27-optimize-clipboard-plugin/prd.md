# 优化 Clipboard History 插件

## Goal

优化独立的 Clipboard History 插件，让用户更快找回并复用近期剪贴内容，同时保持现有详情与管理能力简单、稳定、可预测。

## Confirmed Facts

- Clipboard History 是完整插件，实现在 `plugins/clipboard-history`。
- 当前通过 Clipboard SDK 获取历史，支持类型/收藏筛选、分页、详情、复制、粘贴、收藏、删除和键盘导航。
- 当前每页 50 条，按时间倒序；历史变化会重载当前筛选第一页；图片原图按选择延迟解析。
- Clipboard SDK 已提供 `searchHistory/getHistory({ keyword, type, isFavorite, page, pageSize, sortOrder })`。
- 宿主查询使用 SQLite `LIKE` 匹配 content/rawContent/metadata，并按 timestamp 排序；单页上限 100。
- 基线测试 20 项全部通过。

## Product Requirements

- 保留一个历史管理界面，不新增 Quick/Detail 双模式。
- 在现有界面增加清晰的关键词搜索入口，搜索与类型/收藏筛选组合使用。
- 搜索结果按时间倒序，优先满足用户找回近期内容的真实需求。
- 默认每页继续使用 50 条，滚动按需加载更多匹配项；不预取或扫描全历史到插件内存。
- 输入搜索词时保留现有详情预览、复制、粘贴、收藏、删除和键盘选择能力。
- 空 query 恢复普通近期历史；清除搜索不丢失当前类型筛选。
- 覆盖文本、HTML、图片 OCR metadata 和文件记录的现有数据库匹配边界，UI 不宣称 typo/fuzzy 或语义搜索。

## Reliability Requirements

- 搜索输入使用轻量 debounce，query 或筛选变化时回到第一页。
- 使用请求代次保护；较早请求晚返回时不得覆盖最新 query/filter 结果。
- 历史变化时保留当前 query/filter 并刷新当前搜索，而不是退回无条件历史。
- 搜索、复制、粘贴、收藏和删除失败必须有明确反馈；失败后保留当前可用内容并允许重试。
- 保持 Clipboard SDK、权限、宿主应用恢复和 manifest 契约兼容。

## Acceptance Criteria

- [ ] 用户可组合关键词与类型/收藏筛选，结果按时间倒序分页返回。
- [ ] 搜索只通过现有 Clipboard SDK/SQLite 查询，不在插件内复制通用匹配算法或全量扫描历史。
- [ ] 空 query、清除 query、无结果、读取失败和重试状态明确。
- [ ] 快速输入或切换筛选时，旧请求不会覆盖最新结果。
- [ ] 历史更新后保留当前 query/filter 并刷新结果。
- [ ] 键盘选择、Enter 粘贴、Cmd/Ctrl+Enter 复制在搜索结果中继续工作。
- [ ] 文本、HTML、图片 metadata 和文件记录的匹配边界有测试说明。
- [ ] Clipboard 测试、类型检查、构建和插件校验通过。

## Out of Scope

- 通用插件 SearchSDK、fuzzy/typo/语义搜索或 CoreBox SearchEngine 接入。
- Quick/Detail 双模式、全历史渐进扫描、Top-K 合并和覆盖进度状态机。
- 重写宿主剪贴板采集、持久化或索引管线。
