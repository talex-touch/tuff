# DivisionBox 开发者指南

## 概述

本指南帮助插件开发者快速接入 DivisionBox 系统,提供最佳实践、常见模式和故障排查方法。

## 目录

- [快速开始](#快速开始)
- [插件接入指南](#插件接入指南)
- [最佳实践](#最佳实践)
- [常见模式](#常见模式)
- [性能优化](#性能优化)
- [故障排查](#故障排查)
- [调试技巧](#调试技巧)

---

## 快速开始

### 1. 最简单的 DivisionBox

在插件的 `manifest.json` 中添加配置:

```json
{
  "name": "my-first-divisionbox",
  "version": "1.0.0",
  "divisionBox": {
    "defaultSize": "medium"
  }
}
```

在插件代码中打开 DivisionBox:

```typescript
const { sessionId } = await plugin.divisionBox.open({
  url: 'https://example.com/tool',
  title: '我的工具'
})

console.log('DivisionBox opened:', sessionId)
```

### 2. 添加快捷键

在 `manifest.json` 中添加快捷键:

```json
{
  "divisionBox": {
    "shortcuts": [
      {
        "key": "Cmd+Shift+M",
        "description": "打开我的工具"
      }
    ]
  }
}
```

### 3. 监听状态变化

```typescript
plugin.divisionBox.onStateChange((data) => {
  console.log(`Session ${data.sessionId}: ${data.oldState} → ${data.newState}`)
  
  if (data.newState === 'active') {
    console.log('DivisionBox is now visible')
  }
})
```

---

## 插件接入指南

### 步骤 1: 配置 Manifest

创建或更新 `manifest.json`:

```json
{
  "name": "smart-translator",
  "version": "1.0.0",
  "description": "智能翻译工具",
  "divisionBox": {
    "defaultSize": "medium",
    "keepAlive": true,
    "header": {
      "show": true,
      "title": "智能翻译",
      "icon": "ri:translate-2",
      "actions": [
        {
          "id": "swap-languages",
          "label": "交换语言",
          "icon": "ri:arrow-left-right-line"
        },
        {
          "id": "copy-result",
          "label": "复制结果",
          "icon": "ri:file-copy-line"
        }
      ]
    },
    "shortcuts": [
      {
        "key": "Cmd+Shift+T",
        "description": "打开翻译工具"
      }
    ],
    "triggers": {
      "command": true,
      "flow": true
    }
  }
}
```

### 步骤 2: 实现插件逻辑

创建插件入口文件 `index.ts`:

```typescript
import { Plugin } from '@talex-touch/utils'

export default class SmartTranslator implements Plugin {
  private currentSessionId: string | null = null

  async onLoad() {
    // 注册 Header 操作按钮处理器
    this.plugin.divisionBox.onHeaderAction((actionId, sessionId) => {
      this.handleHeaderAction(actionId, sessionId)
    })

    // 监听状态变化
    this.plugin.divisionBox.onStateChange((data) => {
      console.log('State changed:', data)
    })
  }

  async onFeatureTriggered(featureId: string, query: string) {
    // 打开 DivisionBox
    const { sessionId } = await this.plugin.divisionBox.open({
      url: `https://translator.example.com?q=${encodeURIComponent(query)}`,
      title: '智能翻译',
      icon: 'ri:translate-2',
      size: 'medium',
      keepAlive: true
    })

    this.currentSessionId = sessionId
  }

  private async handleHeaderAction(actionId: string, sessionId: string) {
    switch (actionId) {
      case 'swap-languages':
        // 交换源语言和目标语言
        await this.swapLanguages(sessionId)
        break
      case 'copy-result':
        // 复制翻译结果到剪贴板
        await this.copyResult(sessionId)
        break
    }
  }

  private async swapLanguages(sessionId: string) {
    // 实现语言交换逻辑
    console.log('Swapping languages for session:', sessionId)
  }

  private async copyResult(sessionId: string) {
    // 实现复制逻辑
    console.log('Copying result for session:', sessionId)
  }

  async onUnload() {
    // 清理资源
    if (this.currentSessionId) {
      await this.plugin.divisionBox.close(this.currentSessionId)
    }
  }
}
```

### 步骤 3: 创建 UI 页面

创建 DivisionBox 加载的 HTML 页面 `translator.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>智能翻译</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .container {
      max-width: 100%;
    }
    textarea {
      width: 100%;
      min-height: 100px;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      resize: vertical;
    }
    .result {
      margin-top: 20px;
      padding: 15px;
      background: #f5f5f5;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <textarea id="input" placeholder="输入要翻译的文本..."></textarea>
    <div class="result" id="result">翻译结果将显示在这里</div>
  </div>

  <script>
    // 获取 URL 参数
    const params = new URLSearchParams(window.location.search)
    const query = params.get('q')
    
    if (query) {
      document.getElementById('input').value = query
      // 自动翻译
      translate(query)
    }

    async function translate(text) {
      // 调用翻译 API
      const result = await fetch(`/api/translate?text=${encodeURIComponent(text)}`)
      const data = await result.json()
      document.getElementById('result').textContent = data.translation
    }
  </script>
</body>
</html>
```

### 步骤 4: 测试插件

1. 将插件放到插件目录
2. 重启应用或热重载插件
3. 按下快捷键 `Cmd+Shift+T` 或在命令面板中搜索
4. 验证 DivisionBox 正常打开和工作

---

## 最佳实践

### 1. 生命周期管理

#### ✅ 正确做法

```typescript
class MyPlugin implements Plugin {
  private sessions: Set<string> = new Set()

  async onFeatureTriggered(featureId: string) {
    const { sessionId } = await this.plugin.divisionBox.open({...})
    this.sessions.add(sessionId)
  }

  async onUnload() {
    // 清理所有会话
    for (const sessionId of this.sessions) {
      await this.plugin.divisionBox.close(sessionId)
    }
    this.sessions.clear()
  }
}
```

#### ❌ 错误做法

```typescript
// 不跟踪会话,导致内存泄漏
async onFeatureTriggered(featureId: string) {
  await this.plugin.divisionBox.open({...})
  // 没有保存 sessionId,无法清理
}
```

### 2. 状态管理

#### ✅ 使用 SessionState 保存用户状态

```typescript
// 保存滚动位置
await this.plugin.divisionBox.updateState(sessionId, 'scrollPosition', {
  x: 0,
  y: 200
})

// 保存草稿内容
await this.plugin.divisionBox.updateState(sessionId, 'draft', {
  content: 'User draft...',
  timestamp: Date.now()
})

// 恢复状态
const scrollPos = await this.plugin.divisionBox.getState(sessionId, 'scrollPosition')
const draft = await this.plugin.divisionBox.getState(sessionId, 'draft')
```

#### ❌ 不保存状态

```typescript
// 用户关闭后重新打开,所有状态丢失
// 用户体验差
```

### 3. KeepAlive 使用

#### ✅ 适合启用 KeepAlive 的场景

```typescript
// 频繁访问的工具
{
  "divisionBox": {
    "keepAlive": true  // ✅ 用户会频繁打开/关闭
  }
}

// 需要保留状态的应用
// 例如: 笔记、聊天、编辑器
```

#### ❌ 不适合启用 KeepAlive 的场景

```typescript
// 一次性工具
{
  "divisionBox": {
    "keepAlive": false  // ✅ 用完就关,不需要缓存
  }
}

// 内存占用大的应用
// 例如: 视频播放器、大型图表
```

### 4. 错误处理

#### ✅ 完善的错误处理

```typescript
async openDivisionBox() {
  try {
    const { sessionId } = await this.plugin.divisionBox.open({
      url: 'https://example.com',
      title: '我的工具'
    })
    return sessionId
  } catch (error) {
    if (error instanceof DivisionBoxError) {
      console.error(`DivisionBox error [${error.code}]:`, error.message)
      
      // 根据错误类型处理
      switch (error.code) {
        case 'RESOURCE_ERROR':
          // 资源不足,提示用户
          this.showNotification('系统资源不足,请关闭一些窗口后重试')
          break
        case 'CONFIG_ERROR':
          // 配置错误,使用默认配置重试
          return this.openWithDefaultConfig()
        default:
          this.showNotification('打开失败,请重试')
      }
    }
    throw error
  }
}
```

#### ❌ 忽略错误

```typescript
// 不处理错误,用户不知道发生了什么
await this.plugin.divisionBox.open({...})
```

### 5. 性能优化

#### ✅ 延迟加载

```typescript
// 只在需要时加载资源
async onFeatureTriggered(featureId: string) {
  const { sessionId } = await this.plugin.divisionBox.open({
    url: 'about:blank',  // 先打开空白页
    title: '加载中...'
  })

  // 异步加载实际内容
  setTimeout(async () => {
    await this.loadContent(sessionId)
  }, 100)
}
```

#### ✅ 资源预加载

```typescript
// 在用户可能需要之前预加载
async onLoad() {
  // 预加载常用资源
  await this.preloadAssets()
}
```

#### ❌ 阻塞主线程

```typescript
// 不要在打开时执行耗时操作
async onFeatureTriggered(featureId: string) {
  // ❌ 阻塞主线程
  const data = await this.fetchLargeData()
  
  await this.plugin.divisionBox.open({
    url: `data:text/html,${data}`  // 数据太大
  })
}
```

---

## 常见模式

### 模式 1: 单例模式

确保同一时间只有一个 DivisionBox 实例:

```typescript
class SingletonPlugin implements Plugin {
  private currentSessionId: string | null = null

  async openDivisionBox() {
    // 如果已经打开,直接返回
    if (this.currentSessionId) {
      console.log('DivisionBox already open')
      return this.currentSessionId
    }

    const { sessionId } = await this.plugin.divisionBox.open({...})
    this.currentSessionId = sessionId

    // 监听关闭事件
    this.plugin.divisionBox.onStateChange((data) => {
      if (data.sessionId === this.currentSessionId && data.newState === 'destroy') {
        this.currentSessionId = null
      }
    })

    return sessionId
  }
}
```

### 模式 2: 多实例管理

管理多个 DivisionBox 实例:

```typescript
class MultiInstancePlugin implements Plugin {
  private sessions: Map<string, SessionInfo> = new Map()

  async createSession(type: string) {
    const { sessionId } = await this.plugin.divisionBox.open({
      url: `https://example.com/${type}`,
      title: `${type} 工具`
    })

    this.sessions.set(sessionId, {
      type,
      createdAt: Date.now()
    })

    return sessionId
  }

  async closeSession(sessionId: string) {
    await this.plugin.divisionBox.close(sessionId)
    this.sessions.delete(sessionId)
  }

  async closeAllSessions() {
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId)
    }
  }

  getSessionsByType(type: string): string[] {
    return Array.from(this.sessions.entries())
      .filter(([_, info]) => info.type === type)
      .map(([sessionId]) => sessionId)
  }
}
```

### 模式 3: 状态同步

在主插件和 DivisionBox 之间同步状态:

```typescript
class StateSyncPlugin implements Plugin {
  private sessionId: string | null = null

  async openDivisionBox() {
    const { sessionId } = await this.plugin.divisionBox.open({
      url: 'https://example.com/tool'
    })
    this.sessionId = sessionId

    // 初始化状态
    await this.syncState()

    // 监听状态变化
    this.watchStateChanges()
  }

  private async syncState() {
    const state = await this.getPluginState()
    await this.plugin.divisionBox.updateState(this.sessionId!, 'pluginState', state)
  }

  private watchStateChanges() {
    // 监听插件状态变化
    this.on('state-changed', async (newState) => {
      if (this.sessionId) {
        await this.plugin.divisionBox.updateState(this.sessionId, 'pluginState', newState)
      }
    })
  }

  private async getPluginState() {
    // 获取插件状态
    return {
      settings: await this.getSettings(),
      userData: await this.getUserData()
    }
  }
}
```

### 模式 4: 延迟关闭

给用户时间看到结果再关闭:

```typescript
async showResult(result: string) {
  const { sessionId } = await this.plugin.divisionBox.open({
    url: `data:text/html,<h1>${result}</h1>`,
    title: '结果'
  })

  // 3 秒后自动关闭
  await this.plugin.divisionBox.close(sessionId, {
    delay: 3000,
    animation: true
  })
}
```

### 模式 5: 条件渲染

根据条件决定是否显示 Header:

```typescript
async openDivisionBox(mode: 'normal' | 'immersive') {
  const { sessionId } = await this.plugin.divisionBox.open({
    url: 'https://example.com/tool',
    header: {
      show: mode === 'normal'  // 沉浸模式隐藏 Header
    }
  })
}
```

---

## 性能优化

### 1. 减少首帧渲染时间

#### 优化前 (慢)

```typescript
// ❌ 加载大量资源
await this.plugin.divisionBox.open({
  url: 'https://example.com/heavy-page',  // 包含大量 JS/CSS
  title: '工具'
})
```

#### 优化后 (快)

```typescript
// ✅ 先显示骨架屏
const { sessionId } = await this.plugin.divisionBox.open({
  url: 'about:blank',
  title: '加载中...'
})

// 异步加载实际内容
setTimeout(async () => {
  await this.loadContent(sessionId)
}, 50)
```

### 2. 使用 KeepAlive 提升恢复速度

```typescript
// 频繁访问的工具启用 keepAlive
{
  "divisionBox": {
    "keepAlive": true  // 恢复时间 < 120ms
  }
}
```

### 3. 批量状态更新

#### 优化前

```typescript
// ❌ 多次 IPC 调用
await this.plugin.divisionBox.updateState(sessionId, 'key1', value1)
await this.plugin.divisionBox.updateState(sessionId, 'key2', value2)
await this.plugin.divisionBox.updateState(sessionId, 'key3', value3)
```

#### 优化后

```typescript
// ✅ 一次性更新
await this.plugin.divisionBox.updateState(sessionId, 'state', {
  key1: value1,
  key2: value2,
  key3: value3
})
```

### 4. 资源清理

```typescript
class ResourceAwarePlugin implements Plugin {
  private sessions: Set<string> = new Set()
  private maxSessions = 3

  async openDivisionBox() {
    // 限制最大实例数
    if (this.sessions.size >= this.maxSessions) {
      // 关闭最旧的实例
      const oldestSession = this.sessions.values().next().value
      await this.plugin.divisionBox.close(oldestSession)
      this.sessions.delete(oldestSession)
    }

    const { sessionId } = await this.plugin.divisionBox.open({...})
    this.sessions.add(sessionId)
  }
}
```

---

## 故障排查

### 问题 1: DivisionBox 无法打开

**症状:** 调用 `open()` 后没有反应或抛出错误

**可能原因:**
1. 配置格式错误
2. URL 无效
3. 资源不足
4. 权限问题

**解决方案:**

```typescript
// 1. 检查配置
try {
  const { sessionId } = await this.plugin.divisionBox.open({
    url: 'https://example.com',  // 确保 URL 有效
    title: '测试'
  })
  console.log('Opened:', sessionId)
} catch (error) {
  console.error('Failed to open:', error)
  
  // 2. 查看错误类型
  if (error instanceof DivisionBoxError) {
    console.error('Error code:', error.code)
    console.error('Error message:', error.message)
  }
}

// 3. 检查活跃会话数
const sessions = await this.plugin.divisionBox.getActiveSessions()
console.log('Active sessions:', sessions.length)

// 4. 检查系统资源
console.log('Memory usage:', process.memoryUsage())
```

### 问题 2: 状态不同步

**症状:** 主进程和渲染进程状态不一致

**可能原因:**
1. IPC 通信延迟
2. 状态更新丢失
3. 监听器未注册

**解决方案:**

```typescript
// 1. 确保注册了状态监听器
this.plugin.divisionBox.onStateChange((data) => {
  console.log('State changed:', data)
  // 更新本地状态
  this.updateLocalState(data)
})

// 2. 手动同步状态
async syncState(sessionId: string) {
  const state = await this.plugin.divisionBox.getState(sessionId, 'key')
  console.log('Current state:', state)
}

// 3. 使用轮询作为备用方案
setInterval(async () => {
  await this.syncState(sessionId)
}, 5000)
```

### 问题 3: 内存泄漏

**症状:** 应用运行一段时间后内存持续增长

**可能原因:**
1. 未清理会话
2. 监听器未移除
3. KeepAlive 缓存过多

**解决方案:**

```typescript
class MemoryAwarePlugin implements Plugin {
  private sessions: Set<string> = new Set()
  private listeners: Array<() => void> = []

  async onLoad() {
    // 记录监听器
    const listener = this.plugin.divisionBox.onStateChange((data) => {
      console.log(data)
    })
    this.listeners.push(listener)
  }

  async onUnload() {
    // 1. 清理所有会话
    for (const sessionId of this.sessions) {
      await this.plugin.divisionBox.close(sessionId, { force: true })
    }
    this.sessions.clear()

    // 2. 移除所有监听器
    for (const removeListener of this.listeners) {
      removeListener()
    }
    this.listeners = []
  }

  // 3. 定期检查内存
  startMemoryMonitor() {
    setInterval(() => {
      const usage = process.memoryUsage()
      console.log('Memory usage:', {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
      })
    }, 60000)  // 每分钟检查一次
  }
}
```

### 问题 4: Header 操作按钮无响应

**症状:** 点击 Header 按钮没有反应

**可能原因:**
1. 未注册 `onHeaderAction` 监听器
2. `actionId` 不匹配
3. 回调函数有错误

**解决方案:**

```typescript
// 1. 确保注册了监听器
this.plugin.divisionBox.onHeaderAction((actionId, sessionId) => {
  console.log('Header action:', actionId, sessionId)
  
  // 2. 检查 actionId
  switch (actionId) {
    case 'refresh':
      this.handleRefresh(sessionId)
      break
    case 'settings':
      this.handleSettings(sessionId)
      break
    default:
      console.warn('Unknown action:', actionId)
  }
})

// 3. 添加错误处理
private async handleRefresh(sessionId: string) {
  try {
    await this.refresh(sessionId)
  } catch (error) {
    console.error('Refresh failed:', error)
    this.showError('刷新失败')
  }
}
```

### 问题 5: 快捷键不工作

**症状:** 注册的快捷键无法触发

**可能原因:**
1. 快捷键格式错误
2. 与系统快捷键冲突
3. 快捷键未注册

**解决方案:**

```json
// 1. 检查快捷键格式
{
  "shortcuts": [
    {
      "key": "Cmd+Shift+T",  // ✅ 正确格式
      "description": "打开工具"
    }
  ]
}

// ❌ 错误格式
{
  "shortcuts": [
    {
      "key": "cmd+shift+t",  // 小写可能不工作
      "description": "打开工具"
    }
  ]
}
```

```typescript
// 2. 检查快捷键是否注册
console.log('Registered shortcuts:', this.plugin.shortcuts)

// 3. 尝试不同的组合
// 避免: Cmd+T, Cmd+W (系统快捷键)
// 推荐: Cmd+Shift+<Key>, Cmd+Alt+<Key>
```

---

## 调试技巧

### 1. 启用详细日志

```typescript
// 在插件中启用调试日志
class DebugPlugin implements Plugin {
  private debug = true

  log(...args: any[]) {
    if (this.debug) {
      console.log('[DivisionBox Debug]', ...args)
    }
  }

  async openDivisionBox() {
    this.log('Opening DivisionBox...')
    
    try {
      const { sessionId } = await this.plugin.divisionBox.open({...})
      this.log('Opened successfully:', sessionId)
      return sessionId
    } catch (error) {
      this.log('Failed to open:', error)
      throw error
    }
  }
}
```

### 2. 监控状态变化

```typescript
// 记录所有状态变化
this.plugin.divisionBox.onStateChange((data) => {
  console.log(`[${new Date().toISOString()}] State change:`, {
    sessionId: data.sessionId,
    transition: `${data.oldState} → ${data.newState}`
  })
})
```

### 3. 检查会话信息

```typescript
async debugSession(sessionId: string) {
  // 获取会话状态
  const state = await this.plugin.divisionBox.getState(sessionId, 'state')
  console.log('Session state:', state)

  // 获取所有活跃会话
  const sessions = await this.plugin.divisionBox.getActiveSessions()
  console.log('Active sessions:', sessions)

  // 检查特定会话
  const session = sessions.find(s => s.sessionId === sessionId)
  console.log('Session info:', session)
}
```

### 4. 性能分析

```typescript
async measurePerformance() {
  // 测量打开时间
  const startTime = performance.now()
  
  const { sessionId } = await this.plugin.divisionBox.open({
    url: 'https://example.com',
    title: '性能测试'
  })
  
  const openTime = performance.now() - startTime
  console.log(`Open time: ${openTime.toFixed(2)}ms`)

  // 测量状态更新时间
  const updateStart = performance.now()
  await this.plugin.divisionBox.updateState(sessionId, 'test', { data: 'test' })
  const updateTime = performance.now() - updateStart
  console.log(`Update time: ${updateTime.toFixed(2)}ms`)

  // 测量关闭时间
  const closeStart = performance.now()
  await this.plugin.divisionBox.close(sessionId)
  const closeTime = performance.now() - closeStart
  console.log(`Close time: ${closeTime.toFixed(2)}ms`)
}
```

### 5. 使用 Chrome DevTools

DivisionBox 的 WebContentsView 可以使用 Chrome DevTools 调试:

```typescript
// 在开发模式下打开 DevTools
if (process.env.NODE_ENV === 'development') {
  const { sessionId } = await this.plugin.divisionBox.open({
    url: 'https://example.com',
    webPreferences: {
      devTools: true  // 启用 DevTools
    }
  })
  
  // 打开 DevTools
  const session = manager.getSession(sessionId)
  session?.getWebContentsView()?.webContents.openDevTools()
}
```

---

## 安全注意事项

### 1. URL 验证

```typescript
// ✅ 验证 URL
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'file:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

async openDivisionBox(url: string) {
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL')
  }
  
  await this.plugin.divisionBox.open({ url, title: '工具' })
}
```

### 2. 权限控制

```typescript
// 只允许访问自己创建的会话
class SecurePlugin implements Plugin {
  private ownedSessions: Set<string> = new Set()

  async openDivisionBox() {
    const { sessionId } = await this.plugin.divisionBox.open({...})
    this.ownedSessions.add(sessionId)
    return sessionId
  }

  async closeSession(sessionId: string) {
    // 检查权限
    if (!this.ownedSessions.has(sessionId)) {
      throw new Error('Permission denied')
    }
    
    await this.plugin.divisionBox.close(sessionId)
    this.ownedSessions.delete(sessionId)
  }
}
```

### 3. 数据清理

```typescript
// 清理敏感数据
async onUnload() {
  for (const sessionId of this.sessions) {
    // 清除 sessionState 中的敏感数据
    await this.plugin.divisionBox.updateState(sessionId, 'sensitiveData', null)
    
    // 关闭会话
    await this.plugin.divisionBox.close(sessionId, { force: true })
  }
}
```

---

## 进阶技巧

### 1. 自定义动画

```typescript
// 使用自定义关闭动画
await this.plugin.divisionBox.close(sessionId, {
  delay: 500,
  animation: true  // 启用动画
})
```

### 2. 动态更新 Header

```typescript
// 根据状态动态更新标题
async updateTitle(sessionId: string, newTitle: string) {
  await this.plugin.divisionBox.updateState(sessionId, 'title', newTitle)
  // 触发 UI 更新
  this.emit('title-changed', newTitle)
}
```

### 3. 会话恢复

```typescript
// 保存会话信息以便恢复
class PersistentPlugin implements Plugin {
  async saveSession(sessionId: string) {
    const state = await this.plugin.divisionBox.getState(sessionId, 'state')
    await this.storage.set(`session:${sessionId}`, {
      state,
      timestamp: Date.now()
    })
  }

  async restoreSession(sessionId: string) {
    const saved = await this.storage.get(`session:${sessionId}`)
    if (saved) {
      await this.plugin.divisionBox.updateState(sessionId, 'state', saved.state)
    }
  }
}
```

### 4. 批量操作

```typescript
// 批量关闭会话
async closeAllSessions() {
  const sessions = await this.plugin.divisionBox.getActiveSessions()
  
  await Promise.all(
    sessions.map(session => 
      this.plugin.divisionBox.close(session.sessionId)
    )
  )
}
```

---

## 相关资源

- [API 文档](./DIVISION_BOX_API.md) - 完整的 API 参考
- [Manifest 配置](./DIVISION_BOX_MANIFEST.md) - Manifest 配置详解
- [使用示例](../examples/division-box/) - 实际代码示例
- [设计文档](../.kiro/specs/division-box-interactive-container/design.md) - 系统设计

---

## 获取帮助

如果遇到问题:

1. 查看本指南的故障排查部分
2. 检查控制台日志
3. 查看 API 文档
4. 提交 Issue 到项目仓库

---

## 更新日志

- **v1.0.0** (2024-01-20) - 初始版本
  - 完整的插件接入指南
  - 最佳实践和常见模式
  - 故障排查和调试技巧

