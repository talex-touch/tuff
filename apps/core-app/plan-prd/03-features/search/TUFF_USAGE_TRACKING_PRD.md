# Tuff Usage Tracking - 精简PRD

## 1. 概述

已实现的使用跟踪功能，用于收集用户行为数据以改进搜索排名和推荐算法。

## 2. 已实现功能

- [x] 记录每个应用的执行次数
- [x] 生成和关联搜索/执行会话ID
- [x] 收集搜索和执行上下文数据
- [x] 数据存储在SQLite数据库中

## 3. 数据模型

### 3.1. `usageLogs` 表
记录详细的用户操作日志。

| Column      | Type    | Description                             |
| ----------- | ------- | --------------------------------------- |
| `id`        | INTEGER | 主键                                    |
| `sessionId` | TEXT    | 会话标识符                              |
| `itemId`    | TEXT    | 项目标识符                              |
| `source`    | TEXT    | 项目来源                                |
| `action`    | TEXT    | 操作类型 ('search' 或 'execute')        |
| `keyword`   | TEXT    | 搜索关键词                              |
| `timestamp` | INTEGER | 操作时间戳                              |
| `context`   | TEXT    | 包含上下文信息的JSON字符串               |

### 3.2. `usageSummary` 表
存储聚合的使用统计数据。

| Column       | Type    | Description                    |
| ------------ | ------- | ------------------------------ |
| `itemId`     | TEXT    | 主键，项目标识符               |
| `clickCount` | INTEGER | 项目被执行的次数               |
| `lastUsed`   | INTEGER | 项目最后使用时间戳             |

## 4. 核心组件

- **SearchEngineCore**: 负责搜索操作和使用跟踪
- **recordExecute**: 记录执行操作
- **TuffSearchResult**: 包含sessionId返回结果

## 5. 当前状态

- [x] MVP功能已实现 (搜索/执行跟踪)
- [ ] 增强跟踪 (悬停、预览等)
- [ ] 高级分析 (数据仪表板)