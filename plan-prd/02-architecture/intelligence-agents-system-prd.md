# Intelligence Agents 系统设计文档 (v1.2)

> 更新: 2025-12-10 - 详细实现规划

## 概述

Intelligence Agents 是 Talex Touch 的智能自动化功能模块，基于现有 IntelligenceSDK 扩展，提供可编程的智能智能体服务。

---

## 1. 系统架构

### 1.1 模块结构
```
modules/ai/agents/
├── index.ts                    # 模块入口
├── agent-manager.ts            # 智能体管理器
├── agent-registry.ts           # 智能体注册表
├── agent-executor.ts           # 任务执行器
├── agent-scheduler.ts          # 任务调度器
├── agents/                     # 内置智能体
│   ├── file-agent.ts           # 文件管理智能体
│   ├── search-agent.ts         # 搜索增强智能体
│   ├── data-agent.ts           # 数据处理智能体
│   └── workflow-agent.ts       # 工作流智能体
├── tools/                      # 智能体工具
│   ├── tool-registry.ts        # 工具注册
│   ├── file-tools.ts           # 文件操作工具
│   ├── search-tools.ts         # 搜索工具
│   └── system-tools.ts         # 系统工具
└── memory/                     # 记忆系统
    ├── memory-store.ts         # 记忆存储
    └── context-manager.ts      # 上下文管理
```

### 1.2 核心类型定义
```typescript
// packages/utils/types/agent.ts

export interface AgentDescriptor {
  id: string
  name: string
  description: string
  version: string
  capabilities: AgentCapability[]
  tools: AgentToolRef[]
  config?: AgentConfig
}

export interface AgentCapability {
  id: string
  type: 'action' | 'query' | 'workflow'
  inputSchema: JsonSchema
  outputSchema: JsonSchema
}

export interface AgentTask {
  id: string
  agentId: string
  type: 'execute' | 'plan' | 'chat'
  input: unknown
  context?: AgentContext
  priority?: number
  timeout?: number
}

export interface AgentResult {
  success: boolean
  output?: unknown
  error?: string
  usage?: AgentUsage
  trace?: AgentTrace[]
}

export interface AgentTool {
  id: string
  name: string
  description: string
  inputSchema: JsonSchema
  execute: (input: unknown, ctx: ToolContext) => Promise<unknown>
}

export enum AgentStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

---

## 2. 核心组件

### 2.1 AgentManager
```typescript
export class AgentManager {
  private registry: AgentRegistry
  private executor: AgentExecutor
  private scheduler: AgentScheduler

  // 智能体注册
  registerAgent(descriptor: AgentDescriptor, impl: AgentImpl): void
  unregisterAgent(agentId: string): void
  getAgent(agentId: string): Agent | null
  getAvailableAgents(): AgentDescriptor[]

  // 任务执行
  async executeTask(task: AgentTask): Promise<AgentResult>
  async planTask(task: AgentTask): Promise<AgentPlan>
  async chat(agentId: string, messages: Message[]): AsyncGenerator<string>

  // 状态管理
  getTaskStatus(taskId: string): AgentStatus
  cancelTask(taskId: string): Promise<void>
  pauseTask(taskId: string): Promise<void>
  resumeTask(taskId: string): Promise<void>
}
```

### 2.2 AgentScheduler
```typescript
export class AgentScheduler {
  private taskQueue: PriorityQueue<AgentTask>
  private activeWorkers: Map<string, AgentWorker>
  private maxConcurrent: number

  // 调度策略
  enqueue(task: AgentTask): string
  dequeue(): AgentTask | null
  updatePriority(taskId: string, priority: number): void

  // 并发控制
  async processQueue(): Promise<void>
  adjustConcurrency(count: number): void
}
```

### 2.3 ToolRegistry
```typescript
export class ToolRegistry {
  private tools: Map<string, AgentTool>

  // 工具管理
  registerTool(tool: AgentTool): void
  unregisterTool(toolId: string): void
  getTool(toolId: string): AgentTool | null
  getToolsForAgent(agentId: string): AgentTool[]

  // 工具执行
  async executeTool(toolId: string, input: unknown, ctx: ToolContext): Promise<unknown>
}
```

---

## 3. 内置智能体

### 3.1 FileAgent - 文件管理智能体
**能力**:
- 文件搜索与筛选
- 批量重命名
- 文件整理与归档
- 重复文件检测

**工具**:
- `file.search` - 搜索文件
- `file.rename` - 重命名文件
- `file.move` - 移动文件
- `file.copy` - 复制文件
- `file.delete` - 删除文件
- `file.organize` - 自动整理

### 3.2 SearchAgent - 搜索增强智能体
**能力**:
- 语义搜索
- 搜索结果排序
- 搜索建议生成
- 上下文相关搜索

**工具**:
- `search.query` - 执行搜索
- `search.semantic` - 语义搜索
- `search.suggest` - 生成建议
- `search.rerank` - 结果重排

### 3.3 DataAgent - 数据处理智能体
**能力**:
- 数据提取与转换
- 格式转换
- 数据清洗
- 简单分析

**工具**:
- `data.extract` - 提取数据
- `data.transform` - 转换数据
- `data.format` - 格式化输出
- `data.analyze` - 简单分析

### 3.4 WorkflowAgent - 工作流智能体
**能力**:
- 多步骤任务编排
- 条件分支处理
- 循环执行
- 错误恢复

**工具**:
- `workflow.create` - 创建工作流
- `workflow.execute` - 执行工作流
- `workflow.pause` - 暂停执行
- `workflow.resume` - 恢复执行

---

## 4. 与现有系统集成

### 4.1 IntelligenceSDK 集成
```typescript
// 在 AgentExecutor 中使用 IntelligenceSDK
class AgentExecutor {
  private intelligenceSDK: IntelligenceSDK

  async executeWithLLM(task: AgentTask): Promise<AgentResult> {
    // 构建 system prompt
    const systemPrompt = this.buildAgentPrompt(task)

    // 调用 IntelligenceSDK
    const response = await this.intelligenceSDK.invoke('text.chat', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(task.input) }
      ]
    }, {
      strategy: 'adaptive-default',
      modelPreference: ['gpt-4o-mini', 'deepseek-chat']
    })

    return this.parseAgentResponse(response)
  }
}
```

### 4.2 SearchEngine 集成
```typescript
// SearchAgent 使用现有搜索引擎
class SearchAgent implements AgentImpl {
  async execute(task: AgentTask): Promise<AgentResult> {
    const searchCore = $app.getModule(SearchEngineCore.key)
    const results = await searchCore.search(task.input.query)

    // 使用 Intelligence 进行语义重排
    const reranked = await this.rerank(results, task.input.query)

    return { success: true, output: reranked }
  }
}
```

### 4.3 DownloadCenter 集成
```typescript
// FileAgent 使用下载中心
class FileAgent implements AgentImpl {
  async downloadFile(url: string, dest: string): Promise<string> {
    const downloadCenter = $app.getModule(DownloadCenterModule.key)

    const taskId = await downloadCenter.addTask({
      url,
      destination: dest,
      module: DownloadModule.RESOURCE,
      priority: DownloadPriority.NORMAL
    })

    return taskId
  }
}
```

---

## 5. IPC 通道

### 5.1 智能体管理
```typescript
// Renderer → Main
'agents:list'              → AgentDescriptor[]
'agents:get'               → AgentDescriptor | null
'agents:execute'           → { taskId: string }
'agents:cancel'            → { success: boolean }

// Main → Renderer
'agents:task-started'      → { taskId, agentId }
'agents:task-progress'     → { taskId, progress, step }
'agents:task-completed'    → { taskId, result }
'agents:task-failed'       → { taskId, error }
```

### 5.2 工具执行
```typescript
// Renderer → Main
'agents:tools:list'        → AgentTool[]
'agents:tools:execute'     → unknown

// Main → Renderer
'agents:tools:result'      → { toolId, result }
'agents:tools:error'       → { toolId, error }
```

---

## 6. 安全与权限

### 6.1 权限模型
```typescript
enum AgentPermission {
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  NETWORK_ACCESS = 'network:access',
  SYSTEM_EXEC = 'system:exec',
  INTELLIGENCE_INVOKE = 'intelligence:invoke'
}

interface AgentPermissionRequest {
  agentId: string
  permissions: AgentPermission[]
  reason: string
}
```

### 6.2 沙箱执行
- 文件操作限制在用户指定目录
- 网络请求白名单
- 执行超时控制
- 资源使用限制

---

## 7. 实现计划

### Phase 1: 基础框架 (v2.5.0) - 5天 🟢 大部分完成
- [x] **Day 1**: 类型定义 + AgentRegistry ✅ (2025-12-10)
  - [x] `packages/utils/types/agent.ts` - 完整类型定义 (300+ 行)
  - [x] `agent-registry.ts` - 智能体注册表
- [x] **Day 2**: AgentManager + Scheduler ✅ (2025-12-10)
  - [x] `agent-scheduler.ts` - 优先级任务调度
  - [x] `agent-manager.ts` - 智能体管理器
- [x] **Day 3**: AgentExecutor + IntelligenceSDK 集成 ✅ (2025-12-10)
  - [x] `agent-executor.ts` - 任务执行器
  - [x] LLM 调用封装 (IntelligenceSDKInterface)
- [x] **Day 4**: ToolRegistry + 基础工具 ✅ (2025-12-10)
  - [x] `tool-registry.ts` - 工具注册表
  - [x] `tools/file-tools.ts` - 文件操作工具 (8个工具)
- [x] **Day 5**: IPC 通道 + UI ✅ (2025-12-10)
  - [x] `agent-channels.ts` - IPC handlers
  - [x] 智能体列表界面 - `IntelligenceAgentsPage.vue`

**已实现文件**:
```
packages/utils/types/agent.ts           # 类型定义 (+300 行)
modules/ai/agents/
├── index.ts                            # 模块入口
├── agent-registry.ts                   # 智能体注册表
├── agent-scheduler.ts                  # 任务调度器
├── agent-executor.ts                   # 任务执行器
├── agent-manager.ts                    # 智能体管理器
├── agent-channels.ts                   # IPC 通道
├── tool-registry.ts                    # 工具注册表
└── tools/
    ├── index.ts                        # 工具入口
    └── file-tools.ts                   # 文件工具 (8个)

renderer/views/base/intelligence/
└── IntelligenceAgentsPage.vue          # 智能体列表页面

renderer/components/intelligence/agents/
├── AgentsList.vue                       # 智能体列表组件
├── AgentItem.vue                        # 智能体列表项
└── AgentDetail.vue                      # 智能体详情组件
```

**已实现工具**:
- `file.read` - 读取文件
- `file.write` - 写入文件
- `file.exists` - 检查文件是否存在
- `file.list` - 列出目录内容
- `file.delete` - 删除文件
- `file.copy` - 复制文件
- `file.move` - 移动/重命名文件
- `file.info` - 获取文件信息

### Phase 2: 核心智能体 (v2.6.0) - 8天
- [ ] **Day 1-2**: FileAgent 完整实现
- [ ] **Day 3-4**: SearchAgent + 语义搜索
- [ ] **Day 5-6**: DataAgent + 格式转换
- [ ] **Day 7-8**: 智能体市场 API + 文档

### Phase 3: 高级功能 (v2.7.0) - 10天
- [ ] **Day 1-3**: WorkflowAgent + 编辑器
- [ ] **Day 4-6**: 记忆系统 + 上下文管理
- [ ] **Day 7-8**: 用户自定义智能体
- [ ] **Day 9-10**: 智能体协作 + 测试

---

## 8. 成功指标

| 指标 | 目标值 |
|------|--------|
| 智能体执行成功率 | > 95% |
| 任务完成时间优化 | ≥ 50% |
| 智能体响应时间 | < 2s |
| 用户自动化采用率 | > 30% |
| 工具调用成功率 | > 98% |

---

## 9. 依赖关系

```
Intelligence Agents
    ├── IntelligenceSDK (必需)
    ├── IntelligenceCapabilityRegistry (必需)
    ├── SearchEngineCore (可选)
    ├── DownloadCenterModule (可选)
    └── StorageModule (必需)
```

---

**文档版本**: v1.2
**更新时间**: 2025-12-10
**负责人**: Development Team