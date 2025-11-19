# 模块日志系统 PRD

## 概述

为 Talex Touch 各模块提供统一的、可配置的日志输出系统,支持按模块独立控制日志开关。

## 背景

### 当前问题
- 各模块直接使用 `console.log/debug/warn/error`
- `SearchLogger` 有日志开关,但其他模块无法控制
- 日志混乱,难以过滤定位
- 缺乏统一格式和颜色编码
- 生产环境日志仍输出,影响性能

### 核心目标
1. 统一日志接口
2. 独立模块开关
3. 分级日志 (debug/info/warn/error)
4. 格式化输出 (时间戳/模块名/颜色)
5. 日志禁用时零性能开销
6. 持久化配置

## 架构设计

### 1. ModuleLogger 类

```typescript
interface ModuleLoggerOptions {
  module: string // 模块名称(唯一标识)
  color?: string // 日志颜色
  enabled?: boolean // 初始启用状态
  level?: LogLevel // 最低日志级别
}

enum LogLevel {
  DEBUG = 0, // 详细调试
  INFO = 1, // 一般信息
  WARN = 2, // 警告
  ERROR = 3, // 错误
  NONE = 4 // 禁用
}

class ModuleLogger {
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void

  // 计时功能
  time(label: string): void
  timeEnd(label: string): void

  // 分组功能
  group(label: string): void
  groupEnd(): void

  // 控制
  setEnabled(enabled: boolean): void
  setLevel(level: LogLevel): void
}
```

### 2. LoggerManager 单例

```typescript
class LoggerManager {
  private static instance: LoggerManager
  private loggers: Map<string, ModuleLogger>

  // 获取模块 logger
  getLogger(module: string, options?: Partial<ModuleLoggerOptions>): ModuleLogger

  // 全局控制
  enableAll(): void
  disableAll(): void
  setGlobalLevel(level: LogLevel): void

  // 配置管理
  async loadConfig(): Promise<void>
  async saveConfig(): Promise<void>

  // 查询
  listLoggers(): Array<{ module: string, enabled: boolean, level: LogLevel }>
}
```

### 3. 配置结构

存储在 `app-setting.ini` 的 `logging` 字段:

```typescript
interface LoggingConfig {
  enabled: boolean // 全局开关
  globalLevel: 'debug' | 'info' | 'warn' | 'error' | 'none'
  modules: Record<string, {
    enabled: boolean
    level: 'debug' | 'info' | 'warn' | 'error' | 'none'
  }>
}
```

示例:
```json
{
  "logging": {
    "enabled": true,
    "globalLevel": "debug",
    "modules": {
      "search-engine": { "enabled": true, "level": "debug" },
      "plugin-system": { "enabled": true, "level": "info" },
      "database": { "enabled": false, "level": "warn" }
    }
  }
}
```

## 使用示例

### 基础使用

```typescript
import { loggerManager } from '@talex-touch/utils/common/logger'

const logger = loggerManager.getLogger('search-engine', {
  color: 'blue',
  level: LogLevel.DEBUG
})

logger.debug('开始搜索', { query: 'test' })
logger.info('搜索完成', { results: 10 })
logger.warn('Provider 超时', { providerId: 'files' })
logger.error('搜索失败', error)

// 计时
logger.time('provider-search')
await provider.onSearch(query)
logger.timeEnd('provider-search')

// 分组
logger.group('搜索会话')
logger.info('会话 ID', sessionId)
logger.groupEnd()
```

### 性能优化

```typescript
// 对于计算开销大的日志,使用条件检查
if (logger.isEnabled() && logger.getLevel() <= LogLevel.DEBUG) {
  const expensiveData = computeExpensiveDebugInfo()
  logger.debug('详细信息', expensiveData)
}
```

## 实现计划

### Phase 1: 核心实现 (2-3 天)
- [ ] 实现 `LogLevel` 枚举
- [ ] 实现 `ModuleLogger` 类
- [ ] 实现 `LoggerManager` 单例
- [ ] 配置读取/保存
- [ ] 导出到 `@talex-touch/utils`

### Phase 2: 迁移 SearchEngine (1-2 天)
- [ ] 迁移 `search-core.ts`
- [ ] 迁移 `search-gatherer.ts`
- [ ] 保留 `searchLogger` 特殊功能

### Phase 3: 迁移 Provider (1 天)
- [ ] FileProvider
- [ ] AppProvider
- [ ] PluginFeaturesAdapter

### Phase 4: 迁移核心模块 (2-3 天)
- [ ] DatabaseModule
- [ ] StorageModule
- [ ] PluginModule
- [ ] ChannelCore

### Phase 5: UI 配置界面 (2 天) - 可选
- [ ] 设计配置页面
- [ ] 模块列表展示
- [ ] 单个模块开关/级别控制

**总工期**: 8-11 天

## 日志格式

```
[时间] [模块名] [级别] 消息 ...数据

示例:
[14:23:45.123] [search-engine] DEBUG 开始搜索 { query: "test" }
[14:23:45.234] [file-provider] INFO 搜索完成 { results: 10 }
[14:23:45.345] [app-provider] WARN 搜索超时
[14:23:45.456] [plugin-system] ERROR 插件加载失败
```

## 颜色编码

- **DEBUG**: 灰色
- **INFO**: 蓝色
- **WARN**: 黄色
- **ERROR**: 红色
- **模块名**: 自定义颜色

## 预定义模块列表

| 模块名 | 默认启用 | 默认级别 |
|--------|---------|---------|
| search-engine | ✓ | DEBUG |
| file-provider | ✗ | DEBUG |
| plugin-system | ✓ | INFO |
| database | ✗ | WARN |
| storage | ✗ | WARN |
| clipboard | ✗ | INFO |

## 验收标准

- 90% 核心模块使用统一 Logger
- 日志禁用时性能开销 < 1%
- 配置修改 < 100ms 生效
- 所有日志符合格式规范

## 风险与应对

### 风险 1: 性能影响
**应对**: 高效的条件检查,完全禁用时零开销

### 风险 2: 迁移成本高
**应对**: 分阶段迁移,新旧系统共存

### 风险 3: 配置复杂
**应对**: 合理默认配置,提供搜索过滤
