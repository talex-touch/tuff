# 优化 Clipboard History 插件

## Goal

优化独立的 Clipboard History 插件，使高频查找、预览、复制、粘贴和内容检查更快速、稳定且可预测，并作为插件 SearchSDK 的首个真实消费者。

## Confirmed Facts

- Clipboard History 是完整插件，实现在 `plugins/clipboard-history`，不是宿主 Clipboard 管理界面的附属模块。
- 当前插件通过 Clipboard SDK 读取自己获权访问的历史数据，支持类型/收藏筛选、分页、详情、复制、应用、收藏、删除和键盘导航。
- 当前每页加载 50 条；历史变化会重载当前筛选的第一页；图片原图按选择延迟解析。
- `clipboard.searchHistory/getHistory({ keyword })` 是 Clipboard 领域查询接口，不等于平台通用搜索算法。
- 共享层已有 `fuzzyMatch` / `matchFeature` 等快速匹配基础能力，但插件 SDK 尚无面向普通候选集合的高层 SearchSDK。
- 基线测试 20 项全部通过。

## Product Requirements

- 提供“快速找回”和“详情检查”两种并重的工作模式，共享同一份筛选、搜索、选择和历史状态，不形成两套数据逻辑。
- 首次打开默认进入快速模式，后续持久化并恢复用户上次使用的模式。
- 快速模式优先服务搜索、预览、复制和粘贴；详情模式承载元数据、拆词、颜色和 OCR 等内容洞察。
- 模式切换使用清晰的工具型控件，并保持当前 query、筛选与选中记录。
- 共享关键词搜索同时服务两种模式；快速模式首次进入时优先聚焦搜索。
- 覆盖文本、图片、文件和 HTML 的关键行为差异。
- 复制、粘贴、收藏、删除和搜索失败必须有明确、可恢复的反馈。

## Search Architecture Requirements

- Clipboard History 作为 SearchSDK 消费者：插件先通过 Clipboard SDK 获得自己有权访问的候选数据，再由进程内 SearchSDK 完成快速匹配、排序和高亮。
- SearchSDK 由子任务 `07-27-expose-plugin-search-sdk` 承接；其 API 必须保持领域无关，不绑定 Clipboard 类型。
- 有 query 时，插件按宿主允许的最大页长 100 条顺序拉取候选，逐批交给 SearchSDK 并稳定合并有界 Top-K；先展示最近批次命中，后台继续直到覆盖全部历史。
- query、筛选或模式变化时创建新搜索代次；旧代次的后续分页和结果不得覆盖新状态。
- 搜索 UI 必须展示“检索中/已覆盖 X 条/已覆盖全部”状态，不能把尚未完成的渐进结果表述为最终全历史结果。
- 不把 `clipboard.searchHistory({ keyword })` 冒充通用 SearchSDK，也不在 Clipboard 插件中复制现有快速匹配算法。
- 不通过 SearchSDK 绕过 Clipboard 权限、分页、数据所有权或宿主信任边界。
- 候选获取范围和分页策略必须在设计阶段明确，避免只搜索当前 50 条却向用户表现为全历史搜索。

## Reliability Requirements

- 验证高频历史更新是否导致重复请求、选择跳变或视觉闪烁，并用测试或复现证据决定修复。
- 搜索、筛选或模式快速切换时，过期异步结果不得覆盖最新状态。
- 保持 Clipboard SDK、权限和宿主应用恢复契约兼容。

## Acceptance Criteria

- [ ] 快速模式与详情模式职责清晰；首次进入快速模式，后续恢复上次模式。
- [ ] 两种模式共享 query、筛选、选择和历史状态，切换后上下文不丢失。
- [ ] Clipboard History 使用正式插件 SearchSDK 完成候选匹配、排序和高亮，不维护私有搜索算法。
- [ ] 搜索结果范围对用户真实，不把“当前页搜索”表述为“全历史搜索”。
- [ ] 搜索按每页最多 100 条渐进覆盖全历史，并显示真实覆盖进度与完成状态。
- [ ] query、筛选或模式快速切换时，旧搜索代次不能覆盖新结果。
- [ ] SearchSDK 结果集合保持有界，渐进批次合并后排序稳定。
- [ ] 实时更新、分页、搜索、筛选和选择状态具备可测试验收标准。
- [ ] 复制、粘贴、收藏、删除和搜索的成功/失败反馈明确。
- [ ] 文本、图片、文件和 HTML 的关键搜索与操作路径有覆盖。
- [ ] Clipboard 相关测试、类型检查和构建通过。

## Dependencies

- `07-27-expose-plugin-search-sdk` 必须先完成公共 SDK 契约，Clipboard History 再完成正式接入。

## Out of Scope

- 重写宿主剪贴板采集或持久化管线。
- 让插件访问其他插件或宿主私有搜索数据。
- 暴露完整 CoreBox SearchEngine、FTS、语义召回或行为学习排序。
