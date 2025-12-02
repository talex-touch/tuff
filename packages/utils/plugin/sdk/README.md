# Plugin SDK 重构说明

## 概述

Plugin SDK 已重构为统一的工厂函数模式，参考 `DivisionBoxSDK` 的设计。旧版本 API 已废弃，调用时会抛出错误。

## 新的 SDK 结构

### 1. BoxSDK - CoreBox 窗口控制

控制 CoreBox 窗口的显示、大小和输入框状态。

```typescript
// 隐藏/显示 CoreBox
plugin.box.hide()
plugin.box.show()

// 扩展窗口（显示更多结果）
plugin.box.expand({ length: 10 })
plugin.box.expand({ forceMax: true })

// 收缩窗口
plugin.box.shrink()

// 控制输入框
plugin.box.hideInput()
plugin.box.showInput()

// 获取与设置输入
const input = await plugin.box.getInput()
await plugin.box.setInput('Hello Touch!')
await plugin.box.clearInput()
```

### 2. FeatureSDK - 搜索结果管理

管理插件推送的搜索结果项（TuffItems）。

```typescript
// 推送多个结果
plugin.feature.pushItems([
  { id: 'item-1', title: { text: 'Result 1' }, ... },
  { id: 'item-2', title: { text: 'Result 2' }, ... }
])

// 更新单个结果
plugin.feature.updateItem('item-1', {
  title: { text: 'Updated Title' }
})

// 删除单个结果
plugin.feature.removeItem('item-1')

// 清空所有结果
plugin.feature.clearItems()

// 获取所有结果
const items = plugin.feature.getItems()

// 监听输入变化（实时搜索）
const unsubscribe = plugin.feature.onInputChange((input) => {
  console.log('User typed:', input)
  // 执行实时搜索
  performSearch(input)
})

// 取消监听
unsubscribe()
```

## 废弃的 API

以下 API 已废弃，调用时会抛出错误：

### 旧的 Box API
```typescript
// ❌ 废弃
plugin.$box.hide()
plugin.$box.show()

// ✅ 使用新 API
plugin.box.hide()
plugin.box.show()
```

### 旧的 Feature API
```typescript
// ❌ 废弃
plugin.pushItems(items)
plugin.clearItems()
plugin.getItems()

// ✅ 使用新 API
plugin.feature.pushItems(items)
plugin.feature.clearItems()
plugin.feature.getItems()
```

## 迁移指南

### 1. 更新 Box 控制代码

**旧代码：**
```typescript
plugin.$box.hide()
plugin.$box.show()
```

**新代码：**
```typescript
plugin.box.hide()
plugin.box.show()
plugin.box.expand({ length: 10 })
plugin.box.shrink()
```

### 2. 更新搜索结果管理

**旧代码：**
```typescript
plugin.pushItems([...])
plugin.clearItems()
const items = plugin.getItems()
```

**新代码：**
```typescript
plugin.feature.pushItems([...])
plugin.feature.updateItem('id', { ... })
plugin.feature.removeItem('id')
plugin.feature.clearItems()
const items = plugin.feature.getItems()
```

### 3. 添加实时搜索支持

**新功能：**
```typescript
// 在插件初始化时注册监听器
onInit(context) {
  context.utils.feature.onInputChange((input) => {
    // 用户输入变化时触发
    this.performRealTimeSearch(input)
  })
}
```

## 完整示例

```typescript
export default {
  onInit(context) {
    const { feature, box } = context.utils
    
    // 监听输入变化
    feature.onInputChange((input) => {
      if (input.length > 2) {
        // 执行搜索
        const results = performSearch(input)
        feature.pushItems(results)
      } else {
        feature.clearItems()
      }
    })
  },
  
  onFeatureTriggered(featureId, query, feature) {
    const { feature: featureSDK, box } = this.context.utils
    
    // 推送结果
    featureSDK.pushItems([
      {
        id: 'result-1',
        title: { text: 'Search Result' },
        subtitle: { text: 'Description' },
        source: { id: this.pluginName, name: this.pluginName }
      }
    ])
    
    // 扩展窗口显示结果
    box.expand({ length: 5 })
    
    // 3秒后隐藏
    setTimeout(() => {
      box.hide()
    }, 3000)
  }
}
```

## 技术细节

### SDK 工厂函数

所有 SDK 都通过工厂函数创建：

- `createBoxSDK(channel)` - 创建 Box SDK 实例
- `createFeatureSDK(boxItems, channel)` - 创建 Feature SDK 实例
- `createDivisionBoxSDK(channel)` - 创建 DivisionBox SDK 实例

### IPC 通道

新增的 IPC 通道：

- `core-box:hide-input` - 隐藏输入框
- `core-box:show-input` - 显示输入框
- `core-box:get-input` - 获取当前输入值
- `core-box:set-input` - 设置输入框内容
- `core-box:clear-input` - 清空输入框
- `core-box:input-change` - 输入变化广播（主进程 → 插件）
- `core-box:set-input-visibility` - 设置输入框可见性（主进程 → 渲染进程）
- `core-box:request-input-value` - 请求输入值（主进程 → 渲染进程）

### 架构优势

1. **统一的 API 风格** - 所有 SDK 使用相同的工厂函数模式
2. **更好的类型安全** - TypeScript 类型定义完整
3. **功能分离** - Box 控制和 Feature 管理职责清晰
4. **扩展性强** - 易于添加新功能
5. **向后不兼容** - 强制迁移到新 API，避免技术债务
