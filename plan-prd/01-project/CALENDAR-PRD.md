# 日历插件 PRD

## 概述

为 Talex Touch 开发一个轻量级日历插件,提供事件管理、日程提醒等功能。

## 核心功能

### 1. 日历视图
- 月视图: 显示当月所有日期和事件
- 周视图: 显示一周的详细日程
- 日视图: 显示单日的时间轴安排

### 2. 事件管理
- 创建事件: 标题/时间/描述/标签
- 编辑事件: 修改事件信息
- 删除事件: 删除不需要的事件
- 事件搜索: 按标题/标签搜索

### 3. 提醒功能
- 系统通知: 在事件开始前提醒
- 提醒时间: 可配置(5分钟/15分钟/1小时/1天前)
- 重复事件: 支持每天/每周/每月重复

### 4. 快捷操作
- 通过 CoreBox 快速创建事件
- 通过命令快速查看今日/本周日程
- 与剪贴板集成,快速添加文本为事件

## 技术实现

### 数据存储

使用 SQLite 存储事件数据:

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  tags TEXT,
  reminder_time INTEGER,
  repeat_type TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
```

### 插件架构

```typescript
interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  tags?: string[]
  reminderTime?: Date
  repeatType?: 'none' | 'daily' | 'weekly' | 'monthly'
}

class CalendarPlugin {
  // 事件管理
  createEvent(event: CalendarEvent): Promise<void>
  updateEvent(id: string, event: Partial<CalendarEvent>): Promise<void>
  deleteEvent(id: string): Promise<void>
  getEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]>

  // 提醒管理
  scheduleReminder(event: CalendarEvent): void
  cancelReminder(eventId: string): void
}
```

### CoreBox 集成

注册以下 Feature:

```json
{
  "id": "calendar-today",
  "name": "今日日程",
  "commands": [{ "type": "over", "value": ["今天", "today"] }]
}
```

## UI 设计

### 日历主界面

```
┌─────────────────────────────────────┐
│ 2025 年 10 月          [今天] [+]   │
├─────────────────────────────────────┤
│ 日 一 二 三 四 五 六                │
│         1  2  3  4  5  6           │
│  7  8  9 10 11 12 13               │
│ 14 15 16 17 18 19 20               │
│ 21 22 23 24 25 26 27               │
│ 28 29 30 31                        │
├─────────────────────────────────────┤
│ 今日事件                            │
│ • 10:00 团队会议                    │
│ • 14:30 项目评审                    │
│ • 18:00 健身                        │
└─────────────────────────────────────┘
```

### 创建事件界面

```
┌─────────────────────────────────────┐
│ 新建事件                            │
├─────────────────────────────────────┤
│ 标题: [________________]            │
│ 开始: [2025-10-30] [10:00]         │
│ 结束: [2025-10-30] [11:00]         │
│ 描述: [________________]            │
│ 标签: [工作] [会议]                │
│ 提醒: [15分钟前 ▼]                 │
│ 重复: [不重复 ▼]                   │
├─────────────────────────────────────┤
│           [取消]  [保存]            │
└─────────────────────────────────────┘
```

## 实施计划

### Phase 1: 核心功能 (3-4天)
- [ ] 数据库设计与实现
- [ ] 事件 CRUD 操作
- [ ] 月视图日历组件

### Phase 2: 提醒系统 (2-3天)
- [ ] 提醒调度器
- [ ] 系统通知集成
- [ ] 重复事件支持

### Phase 3: CoreBox 集成 (1-2天)
- [ ] 注册 Feature
- [ ] 快速创建事件
- [ ] 搜索事件

### Phase 4: UI优化 (2天)
- [ ] 周视图/日视图
- [ ] 事件拖拽
- [ ] 主题适配

**总工期**: 8-11 天

## 后续优化方向

1. 日历同步: 支持 Google Calendar/Outlook 同步
2. 智能建议: AI 分析日程,提供时间安排建议
3. 协作功能: 团队共享日历
4. 统计分析: 时间使用分析报告
