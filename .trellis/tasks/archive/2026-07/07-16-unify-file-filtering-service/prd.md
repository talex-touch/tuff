# Unify file filtering service

## Goal

建立单一、跨平台、Worker-safe 的文件过滤策略，阻止普通用户无价值的系统元数据、应用内部数据库和媒体资料库衍生文件进入文件索引或搜索结果，同时保留正常压缩包、截图、照片、文档和显式文件查询能力。

## Background

- 文件过滤规则当前分散在共享扫描工具、CoreApp 文件 Provider、Spotlight、Everything 和搜索聚合链路中。
- 全量扫描使用共享黑名单，增量扫描额外使用 CoreApp 扩展白名单，现有行为不一致。
- macOS Spotlight 当前仅过滤 `.app` 路径；Linux 原生搜索和 Everything 也没有统一的用户可见性门。
- `.itdb`、`.tvdb`、`.localized` 当前既不在共享扫描黑名单，也不在原生 Provider 过滤规则中。
- Provider 提前过滤只能优化成本，不能作为正确性边界；索引提交和搜索结果提交必须强制执行统一策略。

## Requirements

1. 提供一个无 Electron、数据库、日志和搜索引擎依赖的共享 `FileFilterService`，可在主进程和 Worker 中复用。
2. Service 必须返回结构化过滤原因，而不是只返回布尔值，并分别暴露目录遍历、索引写入和搜索可见性判断。
3. `.itdb`、`.tvdb`、`.localized`、macOS/Windows 元数据文件及媒体资料库包内部内容默认不得进入自动索引或普通搜索结果。
4. `.zip`、`.png`、`.jpg`、`.jpeg`、`.webp` 等普通用户文件必须继续可索引、可搜索。
5. 全量扫描、增量监听、reconciliation 和文件索引最终写入必须使用同一策略；最终写入边界不得依赖调用方主动过滤。
6. Spotlight、Linux 原生文件搜索和 Everything 必须在本地截断、`stat`、图标提取和 `TuffItem` 构造前尽早过滤。
7. 所有文件 Provider 结果必须在搜索聚合提交边界再次过滤；Provider 结果计数、排序和前端限制基于过滤后的结果。
8. 普通索引查询、类型/扩展查询和语义召回必须过滤已有数据库中的遗留噪声记录。
9. 推荐、缓存、语义召回和富化推送等非标准 Provider 旁路必须在出站前应用同一用户可见性策略。
10. 删除或收口 CoreApp 内重复、失效的 `BLACKLISTED_*` 定义，不引入第二套规则。
11. Spotlight 根目录边界、用户显式类型/扩展查询、Provider 路由、缩略图能力和资源存在性检查保持独立职责。

## Acceptance Criteria

- [x] 自动扫描和增量监听对同一文件给出一致的过滤结论。
- [x] `.itdb`、`.tvdb`、`.localized` 文件以及 `.musiclibrary`、`.tvlibrary` 等包内部文件不会写入新索引。
- [x] 旧索引中的上述文件不会出现在关键词、类型、扩展或语义召回结果中，并可被后续 reconciliation 清理。
- [x] Spotlight、Linux 原生搜索和 Everything 不会向聚合器提交上述噪声结果。
- [x] 任意遗漏早期过滤的文件 Provider 仍会被聚合提交门拦截。
- [x] Provider/source 统计中的结果数量与过滤后实际提交数量一致。
- [x] `.zip` 安装压缩包和 `.png/.jpg` 截图仍可返回。
- [x] 现有 Spotlight 根目录约束、Everything 独立后端语义及用户类型/扩展筛选不受破坏。
- [x] 聚焦测试、CoreApp Node typecheck 和实际过滤场景 smoke 均通过。

## Out of Scope

- 新增“显示系统文件”设置或高级模式。
- 将所有开发文件、安装包、磁盘镜像或通用数据库文件一概隐藏。
- 改变文件搜索排序权重、搜索根目录或 Provider 调度策略。
