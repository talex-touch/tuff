# Usage Logging Plan - 精简版

## 概述

已实现的搜索和执行操作日志记录功能，支持会话关联。

## 核心要求

1. 从 `item.id` 直接获取 `itemId`，不存在时抛出错误
2. 搜索完成后返回 `sessionId` 到前端
3. 执行时传递 `sessionId` 和 `itemId`，关联搜索和执行操作

## 实现状态

- [x] 扩展 `TuffSearchResult` 接口，添加 `sessionId`
- [x] 修改 `SearchEngineCore` 生成和返回 `sessionId`
- [x] 分别记录 `search` 和 `execute` 操作
- [x] 更新数据库模式支持新字段

## 数据模型

- `usageLogs` 表: 记录详细操作日志
- `usageSummary` 表: 记录聚合统计信息

## 当前状态

- [x] 基础日志记录已实现
- [ ] 前端交互跟踪 (悬停、预览等)
- [ ] 详细的AI模块日志
- [ ] 插件生命周期日志