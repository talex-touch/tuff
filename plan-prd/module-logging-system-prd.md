# 模块日志系统 PRD

## 概述

为 Talex Touch 的各个模块提供统一的、可配置的日志输出系统，支持按模块独立控制日志开关，便于开发调试和问题排查。

## 背景

### 当前问题
- 各模块使用 `console.log/debug/warn/error` 直接输出日志，无法统一管理
- `SearchLogger` 提供了日志开关功能，但其他模块的日志无法控制
- 日志输出混乱，难以过滤和定位问题
- 缺乏统一的日志格式和颜色编码
- 在生产环境中日志仍会输出，影响性能

### 用户痛点
1. **开发者**：调试时日志太多，难以找到关键信息
2. **运维**：生产环境日志无法按需开启/关闭
3. **支持团队**：用户反馈问题时难以收集有效日志

## 目标

### 核心目标
1. **统一日志接口**：所有模块通过统一的 Logger 实例输出日志
2. **独立开关控制**：每个模块可独立启用/禁用日志输出
3. **分级日志**：支持 debug/info/warn/error 等不同级别
4. **格式化输出**：统一的日志格式，包含时间戳、模块名、颜色编码
5. **性能优化**：日志禁用时零性能开销
6. **持久化配置**：日志开关配置持久化到用户设置中

### 非目标（本期不做）
- 日志文件持久化存储
- 远程日志上报
- 日志分析和可视化

## 架构设计

### 1. ModuleLogger 类

提供单个模块的日志功能。

```typescript
interface ModuleLoggerOptions {
  /** 模块名称（唯一标识） */
  module: string
  /** 日志颜色（chalk 颜色名） */
  color?: string
  /** 初始启用状态 */
  enabled?: boolean
  /** 最低日志级别 */
  level?: LogLevel
  /** 自定义前缀 */
  prefix?: string
}

enum LogLevel {
  DEBUG = 0,   // 详细调试信息
  INFO = 1,    // 一般信息
  WARN = 2,    // 警告信息
  ERROR = 3,   // 错误信息
  NONE = 4     // 禁用所有日志
}

class ModuleLogger {
  constructor(options: ModuleLoggerOptions)

  // 基础日志方法
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

  // 条件日志
  assert(condition: boolean, message: string, ...args: any[]): void

  // 表格输出
  table(data: any[]): void

  // 控制方法
  setEnabled(enabled: boolean): void
  setLevel(level: LogLevel): void
  isEnabled(): boolean
  getLevel(): LogLevel
}
```

### 2. LoggerManager 单例

管理所有模块的 Logger 实例。

```typescript
class LoggerManager {
  private static instance: LoggerManager
  private loggers: Map<string, ModuleLogger>
  private globalEnabled: boolean
  private globalLevel: LogLevel

  static getInstance(): LoggerManager

  // 创建或获取模块 logger
  getLogger(module: string, options?: Partial<ModuleLoggerOptions>): ModuleLogger

  // 全局控制
  enableAll(): void
  disableAll(): void
  setGlobalEnabled(enabled: boolean): void
  setGlobalLevel(level: LogLevel): void

  // 批量控制
  enableModules(modules: string[]): void
  disableModules(modules: string[]): void
  setModulesLevel(modules: string[], level: LogLevel): void

  // 配置管理
  async loadConfig(): Promise<void>
  async saveConfig(): Promise<void>
  getConfig(): LoggingConfig
  updateConfig(config: Partial<LoggingConfig>): Promise<void>

  // 查询功能
  listLoggers(): Array<{ module: string; enabled: boolean; level: LogLevel }>
  getLogger(module: string): ModuleLogger | undefined
}

export const loggerManager = LoggerManager.getInstance()
```

### 3. 配置结构

配置存储在 `app-setting.ini` 中的 `logging` 字段：

```typescript
interface LoggingConfig {
  /** 全局日志开关 */
  enabled: boolean

  /** 全局日志级别 */
  globalLevel: 'debug' | 'info' | 'warn' | 'error' | 'none'

  /** 各模块配置 */
  modules: Record<string, {
    /** 模块是否启用日志 */
    enabled: boolean
    /** 模块日志级别 */
    level: 'debug' | 'info' | 'warn' | 'error' | 'none'
  }>
}
```

示例配置：

```json
{
  "logging": {
    "enabled": true,
    "globalLevel": "debug",
    "modules": {
      "search-engine": { "enabled": true, "level": "debug" },
      "search-gatherer": { "enabled": true, "level": "info" },
      "plugin-system": { "enabled": true, "level": "info" },
      "file-provider": { "enabled": false, "level": "debug" },
      "app-provider": { "enabled": false, "level": "debug" },
      "clipboard": { "enabled": false, "level": "info" },
      "database": { "enabled": false, "level": "warn" },
      "storage": { "enabled": false, "level": "warn" },
      "plugin-loader": { "enabled": false, "level": "info" },
      "channel-system": { "enabled": false, "level": "warn" }
    }
  }
}
```

## 使用示例

### 基础使用

```typescript
// 1. 导入 loggerManager
import { loggerManager } from '@talex-touch/utils/common/logger'

// 2. 创建模块 logger
const logger = loggerManager.getLogger('search-engine', {
  color: 'blue',
  enabled: true,
  level: LogLevel.DEBUG
})

// 3. 使用 logger
logger.debug('开始搜索', { query: 'test' })
logger.info('搜索完成', { results: 10, duration: 150 })
logger.warn('Provider 搜索超时', { providerId: 'files' })
logger.error('搜索失败', error)

// 4. 计时功能
logger.time('provider-search')
await provider.onSearch(query)
logger.timeEnd('provider-search') // 输出: [search-engine] provider-search: 125ms

// 5. 分组功能
logger.group('搜索会话')
logger.info('会话 ID', sessionId)
logger.info('查询文本', query.text)
logger.groupEnd()
```

### 替换现有日志

#### SearchEngine 模块迁移

```typescript
// === 之前 ===
console.debug('[SearchEngineCore] search', query)
searchLogger.searchSessionStart(query.text, sessionId)

// === 之后 ===
const logger = loggerManager.getLogger('search-engine')

logger.debug('开始搜索', query)
logger.group('搜索会话')
logger.info('会话 ID', sessionId)
logger.info('查询文本', query.text)
```

#### FileProvider 迁移

```typescript
// === 之前 ===
console.debug('[FileProvider] Performing search:', query.text)
searchLogger.fileSearchStart(query.text)

// === 之后 ===
const logger = loggerManager.getLogger('file-provider', { color: 'green' })

logger.debug('执行搜索', { query: query.text })
logger.time('file-search')
// ... 搜索逻辑
logger.timeEnd('file-search')
```

### 条件日志（性能优化）

```typescript
// 对于计算开销大的日志，使用条件检查
if (logger.isEnabled() && logger.getLevel() <= LogLevel.DEBUG) {
  const expensiveData = computeExpensiveDebugInfo()
  logger.debug('详细信息', expensiveData)
}
```

## 实现计划

### Phase 1: 核心实现 ✨（优先级：高）

**目标**：实现基础的日志系统

- [ ] 实现 `LogLevel` 枚举
- [ ] 实现 `ModuleLogger` 类
  - [ ] 基础日志方法（debug/info/warn/error）
  - [ ] 计时功能（time/timeEnd）
  - [ ] 分组功能（group/groupEnd）
  - [ ] 启用状态控制
- [ ] 实现 `LoggerManager` 单例
  - [ ] Logger 实例管理
  - [ ] 全局开关控制
  - [ ] 配置读取/保存
- [ ] 在 `packages/utils/common/logger/` 中实现
- [ ] 导出到 `@talex-touch/utils`

**时间估计**：2-3 天

### Phase 2: 迁移 SearchEngine 模块 🔍（优先级：高）

**目标**：将搜索引擎模块迁移到新日志系统

- [ ] 迁移 `search-core.ts`
  - [ ] 替换所有 `console.debug/log`
  - [ ] 保留 `searchLogger` 的特殊功能（会话跟踪）
- [ ] 迁移 `search-gatherer.ts`
- [ ] 迁移 `search-logger.ts`（作为 ModuleLogger 的包装器）
- [ ] 迁移 `search-index-service.ts`
- [ ] 测试搜索日志功能完整性

**时间估计**：1-2 天

### Phase 3: 迁移 Provider 模块 📦（优先级：高）

**目标**：迁移各个搜索 Provider

- [ ] FileProvider (`file-provider.ts`)
- [ ] AppProvider (`app-provider.ts`)
- [ ] PluginFeaturesAdapter (`plugin-features-adapter.ts`)
- [ ] ClipboardProvider (`clipboard.ts`)

**时间估计**：1 天

### Phase 4: 迁移核心模块 🏗️（优先级：中）

**目标**：迁移应用核心模块

- [ ] DatabaseModule
- [ ] StorageModule
- [ ] ClipboardModule
- [ ] PluginModule
- [ ] TerminalModule
- [ ] ChannelCore
- [ ] TouchCore

**时间估计**：2-3 天

### Phase 5: UI 配置界面 🎨（优先级：低）

**目标**：提供用户友好的日志配置界面

- [ ] 设计配置界面 UI
- [ ] 实现日志设置页面
  - [ ] 全局开关
  - [ ] 全局级别选择
  - [ ] 模块列表展示
  - [ ] 单个模块开关/级别控制
- [ ] 实时生效（不需要重启）
- [ ] 导出日志配置功能
- [ ] 重置为默认配置

**时间估计**：2 天

### Phase 6: 高级功能 🚀（优先级：低，可选）

**目标**：增强日志系统功能

- [ ] 日志文件输出（写入 `logs/` 目录）
- [ ] 日志轮转（按大小/时间分割）
- [ ] 日志搜索和过滤（在 UI 中）
- [ ] 日志导出（用于 bug 报告）
- [ ] 性能监控集成

**时间估计**：按需实施

## 技术细节

### 日志格式

```
[时间] [模块名] [级别] 消息 ...数据

示例：
[14:23:45.123] [search-engine] DEBUG 开始搜索 { query: "test" }
[14:23:45.234] [file-provider] INFO 搜索完成 { results: 10, duration: 111ms }
[14:23:45.345] [app-provider] WARN 搜索超时 { timeout: 1000ms }
[14:23:45.456] [plugin-system] ERROR 插件加载失败 Error: ...
```

### 颜色编码

使用 `chalk` 库实现：

- **DEBUG**: 灰色 (gray)
- **INFO**: 蓝色 (blue)
- **WARN**: 黄色 (yellow)
- **ERROR**: 红色 (red)
- **模块名**: 自定义颜色

### 性能优化策略

1. **条件检查优先**：
```typescript
debug(message: string, ...args: any[]): void {
  // 最快的退出路径
  if (!this.enabled || this.level > LogLevel.DEBUG) return

  // 实际日志输出
  this._output('DEBUG', message, args)
}
```

2. **惰性参数求值**：
```typescript
// ❌ 不推荐：即使日志禁用也会计算
logger.debug(`结果: ${JSON.stringify(largeObject)}`)

// ✅ 推荐：只在启用时计算
if (logger.isEnabled()) {
  logger.debug(`结果: ${JSON.stringify(largeObject)}`)
}
```

3. **避免字符串拼接**：
```typescript
// ❌ 不推荐
logger.debug('用户 ' + userId + ' 执行操作 ' + action)

// ✅ 推荐
logger.debug('用户执行操作', { userId, action })
```

### 向后兼容

1. **保留 SearchLogger**：
```typescript
// SearchLogger 作为 ModuleLogger 的包装器
class SearchLogger {
  private logger: ModuleLogger

  constructor() {
    this.logger = loggerManager.getLogger('search-engine')
  }

  // 保留原有 API
  searchSessionStart(query: string, sessionId: string): void {
    if (!this.logger.isEnabled()) return

    this.logger.group('搜索会话')
    this.logger.info('会话开始', { query, sessionId })
  }

  // ... 其他方法
}
```

2. **逐步迁移**：
   - 先实现新系统，与旧系统并存
   - 逐个模块迁移，测试验证
   - 确认稳定后移除旧日志代码

3. **兼容期**：约 2-4 周，两套系统共存

## 配置示例

### 开发环境配置

```json
{
  "logging": {
    "enabled": true,
    "globalLevel": "debug",
    "modules": {
      "search-engine": { "enabled": true, "level": "debug" },
      "file-provider": { "enabled": true, "level": "debug" },
      "app-provider": { "enabled": true, "level": "debug" }
    }
  }
}
```

### 生产环境配置

```json
{
  "logging": {
    "enabled": false,
    "globalLevel": "error",
    "modules": {
      "search-engine": { "enabled": false, "level": "error" },
      "file-provider": { "enabled": false, "level": "error" },
      "app-provider": { "enabled": false, "level": "error" }
    }
  }
}
```

### 调试特定模块

```json
{
  "logging": {
    "enabled": true,
    "globalLevel": "warn",
    "modules": {
      "plugin-system": { "enabled": true, "level": "debug" },
      // 其他模块使用 globalLevel (warn)
    }
  }
}
```

## UI 设计

### 设置页面

```
┌─────────────────────────────────────────┐
│ 日志设置                                 │
├─────────────────────────────────────────┤
│                                         │
│ 全局设置                                 │
│ ┌─────────────────────────────────────┐ │
│ │ 启用日志 [✓]                         │ │
│ │ 日志级别 [Debug ▼]                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 模块日志                                 │
│ ┌─────────────────────────────────────┐ │
│ │ 模块名称        启用    级别         │ │
│ │ ─────────────────────────────────── │ │
│ │ 搜索引擎        [✓]   [Debug ▼]     │ │
│ │ 文件Provider    [✓]   [Info  ▼]     │ │
│ │ 应用Provider    [ ]   [Debug ▼]     │ │
│ │ 插件系统        [✓]   [Info  ▼]     │ │
│ │ 数据库          [ ]   [Warn  ▼]     │ │
│ │ 存储            [ ]   [Warn  ▼]     │ │
│ │ 剪贴板          [ ]   [Info  ▼]     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [全部启用] [全部禁用] [重置默认]         │
│                                         │
└─────────────────────────────────────────┘
```

### 实现代码

```vue
<template>
  <div class="logging-settings">
    <h2>日志设置</h2>

    <!-- 全局设置 -->
    <div class="global-settings">
      <h3>全局设置</h3>
      <el-switch
        v-model="config.enabled"
        active-text="启用日志"
        @change="handleConfigChange"
      />
      <el-select
        v-model="config.globalLevel"
        placeholder="全局日志级别"
        @change="handleConfigChange"
      >
        <el-option label="Debug" value="debug" />
        <el-option label="Info" value="info" />
        <el-option label="Warn" value="warn" />
        <el-option label="Error" value="error" />
        <el-option label="None" value="none" />
      </el-select>
    </div>

    <!-- 模块设置 -->
    <div class="module-settings">
      <h3>模块日志</h3>
      <el-table :data="moduleList" border>
        <el-table-column prop="name" label="模块名称" width="200" />
        <el-table-column label="启用" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              @change="handleModuleChange(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="日志级别" width="150">
          <template #default="{ row }">
            <el-select
              v-model="row.level"
              @change="handleModuleChange(row)"
            >
              <el-option label="Debug" value="debug" />
              <el-option label="Info" value="info" />
              <el-option label="Warn" value="warn" />
              <el-option label="Error" value="error" />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 批量操作 -->
    <div class="batch-actions">
      <el-button @click="enableAll">全部启用</el-button>
      <el-button @click="disableAll">全部禁用</el-button>
      <el-button @click="resetToDefault">重置默认</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

const config = ref({
  enabled: true,
  globalLevel: 'debug'
})

const moduleList = ref([])

onMounted(async () => {
  const loggingConfig = await touchChannel.send('logger:get-config')
  config.value = loggingConfig
  moduleList.value = Object.entries(loggingConfig.modules).map(([name, cfg]) => ({
    name,
    ...cfg
  }))
})

async function handleConfigChange() {
  await touchChannel.send('logger:update-config', { config: config.value })
}

async function handleModuleChange(row) {
  await touchChannel.send('logger:update-module', {
    module: row.name,
    config: { enabled: row.enabled, level: row.level }
  })
}

async function enableAll() {
  await touchChannel.send('logger:enable-all')
  // 刷新配置
  // ...
}

async function disableAll() {
  await touchChannel.send('logger:disable-all')
  // 刷新配置
  // ...
}

async function resetToDefault() {
  await touchChannel.send('logger:reset-config')
  // 刷新配置
  // ...
}
</script>
```

## 成功指标

### 定量指标
1. **覆盖率**：90% 以上的核心模块使用统一 Logger
2. **性能**：日志禁用时性能开销 < 1%
3. **配置响应**：配置修改后 < 100ms 生效
4. **日志准确性**：所有日志输出符合格式规范

### 定性指标
1. **开发体验**：开发者反馈调试效率提升
2. **问题定位**：支持团队反馈问题定位更容易
3. **代码质量**：日志代码更清晰、可维护

### 验收标准
- [ ] 所有 Phase 1-3 的功能完成并测试通过
- [ ] 文档完善（使用文档、迁移指南）
- [ ] 至少 3 个核心模块完成迁移并验证
- [ ] 性能测试通过（对比日志启用/禁用的性能差异）
- [ ] Code Review 通过

## 风险与应对

### 风险 1：性能影响
**描述**：日志系统可能影响应用性能

**应对**：
- 实现高效的条件检查机制
- 提供性能测试工具
- 支持完全禁用日志

### 风险 2：迁移成本高
**描述**：现有代码量大，迁移工作量大

**应对**：
- 提供自动化迁移脚本
- 分阶段迁移，逐步替换
- 新旧系统共存一段时间

### 风险 3：配置复杂
**描述**：模块太多，配置界面复杂

**应对**：
- 提供合理的默认配置
- 支持搜索和过滤模块
- 提供预设配置（开发/生产）

## 附录

### A. 预定义模块列表

| 模块名称 | 默认启用 | 默认级别 | 说明 |
|---------|---------|---------|------|
| search-engine | ✓ | DEBUG | 搜索引擎核心 |
| search-gatherer | ✓ | INFO | 搜索结果聚合器 |
| file-provider | ✗ | DEBUG | 文件搜索 Provider |
| app-provider | ✗ | DEBUG | 应用搜索 Provider |
| plugin-features | ✓ | INFO | 插件功能适配器 |
| clipboard | ✗ | INFO | 剪贴板模块 |
| database | ✗ | WARN | 数据库模块 |
| storage | ✗ | WARN | 存储模块 |
| plugin-loader | ✗ | INFO | 插件加载器 |
| channel-system | ✗ | WARN | IPC 通道系统 |
| terminal | ✗ | INFO | 终端模块 |
| ocr | ✗ | INFO | OCR 服务 |

### B. 参考资料

- [log4js 文档](https://log4js-node.github.io/log4js-node/)
- [winston 文档](https://github.com/winstonjs/winston)
- [pino 文档](https://getpino.io/)
- [Electron 日志最佳实践](https://www.electronjs.org/docs/latest/tutorial/application-debugging)

### C. 相关 Issue

- #XXX：搜索日志无法关闭
- #XXX：日志输出影响性能
- #XXX：调试时日志太多

---

**文档版本**：v1.0
**创建日期**：2025-01-30
**最后更新**：2025-01-30
**负责人**：TalexTouch Team
**状态**：待评审

