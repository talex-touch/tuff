# DivisionBox Manifest 配置文档

## 概述

插件可以在 `manifest.json` 中声明 DivisionBox 配置,系统会自动解析并应用这些配置。这简化了插件的接入流程,无需在代码中手动配置每个参数。

## 配置位置

在插件的 `manifest.json` 文件中添加 `divisionBox` 配置块:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "divisionBox": {
    // DivisionBox 配置
  }
}
```

---

## 配置选项

### 完整配置示例

```json
{
  "name": "smart-summary",
  "version": "1.0.0",
  "divisionBox": {
    "defaultSize": "medium",
    "keepAlive": true,
    "header": {
      "show": true,
      "title": "智能总结",
      "icon": "ri:magic-line",
      "actions": [
        {
          "id": "refresh",
          "label": "刷新",
          "icon": "ri:refresh-line"
        },
        {
          "id": "settings",
          "label": "设置",
          "icon": "ri:settings-line"
        }
      ]
    },
    "shortcuts": [
      {
        "key": "Cmd+Shift+S",
        "description": "打开智能总结"
      }
    ],
    "triggers": {
      "command": true,
      "flow": true
    }
  }
}
```

---

## 配置字段详解

### `defaultSize`

**类型:** `'compact' | 'medium' | 'expanded'`  
**默认值:** `'medium'`  
**描述:** DivisionBox 的默认尺寸预设

**尺寸定义:**
- `compact`: 320x400 (紧凑模式,适合简单工具)
- `medium`: 600x500 (中等模式,适合大多数场景)
- `expanded`: 800x600 (扩展模式,适合复杂界面)

**示例:**
```json
{
  "divisionBox": {
    "defaultSize": "compact"
  }
}
```

---

### `keepAlive`

**类型:** `boolean`  
**默认值:** `false`  
**描述:** 是否启用缓存模式。启用后,DivisionBox 在隐藏时不会销毁,而是保持在内存中以便快速恢复

**优点:**
- 快速恢复 (≤ 120ms)
- 保留用户状态(滚动位置、草稿内容等)
- 提升用户体验

**缺点:**
- 占用内存
- 受 LRU 缓存限制(最多 10 个实例)

**示例:**
```json
{
  "divisionBox": {
    "keepAlive": true
  }
}
```

**建议使用场景:**
- 频繁访问的工具
- 需要保留用户状态的应用
- 加载时间较长的页面

---

### `header`

**类型:** `object`  
**描述:** Header 区域配置

#### `header.show`

**类型:** `boolean`  
**默认值:** `true`  
**描述:** 是否显示 Header。设置为 `false` 进入沉浸模式

**示例:**
```json
{
  "divisionBox": {
    "header": {
      "show": false
    }
  }
}
```

---

#### `header.title`

**类型:** `string`  
**默认值:** 插件名称  
**描述:** Header 显示的标题

**示例:**
```json
{
  "divisionBox": {
    "header": {
      "title": "智能翻译"
    }
  }
}
```

---

#### `header.icon`

**类型:** `string`  
**默认值:** 插件图标  
**描述:** Header 显示的图标,支持 iconify 格式

**Iconify 格式:** `<collection>:<icon-name>`

**常用图标集:**
- `ri:` - Remix Icon
- `mdi:` - Material Design Icons
- `heroicons:` - Heroicons
- `lucide:` - Lucide Icons

**示例:**
```json
{
  "divisionBox": {
    "header": {
      "icon": "ri:translate-2"
    }
  }
}
```

**查找图标:** [https://icon-sets.iconify.design/](https://icon-sets.iconify.design/)

---

#### `header.actions`

**类型:** `array`  
**描述:** Header 自定义操作按钮

**按钮配置:**
```typescript
interface HeaderAction {
  id: string          // 按钮唯一标识
  label: string       // 按钮标签
  icon?: string       // 按钮图标 (iconify 格式)
}
```

**示例:**
```json
{
  "divisionBox": {
    "header": {
      "actions": [
        {
          "id": "refresh",
          "label": "刷新",
          "icon": "ri:refresh-line"
        },
        {
          "id": "copy",
          "label": "复制",
          "icon": "ri:file-copy-line"
        },
        {
          "id": "settings",
          "label": "设置",
          "icon": "ri:settings-3-line"
        }
      ]
    }
  }
}
```

**处理按钮点击:**
```typescript
// 在插件代码中
plugin.divisionBox.onHeaderAction((actionId, sessionId) => {
  switch (actionId) {
    case 'refresh':
      // 刷新逻辑
      break
    case 'copy':
      // 复制逻辑
      break
    case 'settings':
      // 打开设置
      break
  }
})
```

---

### `shortcuts`

**类型:** `array`  
**描述:** 快捷键配置

**快捷键配置:**
```typescript
interface Shortcut {
  key: string           // 快捷键组合
  description: string   // 快捷键描述
}
```

**快捷键格式:**
- 修饰键: `Cmd` (macOS) / `Ctrl` (Windows/Linux), `Shift`, `Alt`, `Option`
- 组合: 使用 `+` 连接,如 `Cmd+Shift+S`
- 大小写不敏感

**示例:**
```json
{
  "divisionBox": {
    "shortcuts": [
      {
        "key": "Cmd+Shift+T",
        "description": "打开翻译工具"
      },
      {
        "key": "Cmd+Alt+S",
        "description": "打开智能总结"
      }
    ]
  }
}
```

**注意事项:**
- 避免与系统快捷键冲突
- 建议使用 `Cmd+Shift+<Key>` 或 `Cmd+Alt+<Key>` 组合
- 快捷键会自动注册到系统

---

### `triggers`

**类型:** `object`  
**描述:** 触发方式配置

#### `triggers.command`

**类型:** `boolean`  
**默认值:** `true`  
**描述:** 是否在命令面板中显示

**示例:**
```json
{
  "divisionBox": {
    "triggers": {
      "command": true
    }
  }
}
```

启用后,用户可以通过命令面板搜索并打开 DivisionBox。

---

#### `triggers.flow`

**类型:** `boolean`  
**默认值:** `false`  
**描述:** 是否支持 Flow 触发

**示例:**
```json
{
  "divisionBox": {
    "triggers": {
      "flow": true
    }
  }
}
```

启用后,DivisionBox 可以作为 Flow 的一部分被触发。

---

## 配置验证

系统会自动验证 Manifest 配置:

### 有效配置

```json
{
  "divisionBox": {
    "defaultSize": "medium",
    "keepAlive": true,
    "header": {
      "show": true,
      "title": "我的工具"
    }
  }
}
```

✅ 配置有效,系统会应用所有设置

---

### 无效配置

```json
{
  "divisionBox": {
    "defaultSize": "invalid-size",  // ❌ 无效的尺寸
    "keepAlive": "yes",             // ❌ 应该是 boolean
    "header": {
      "show": 1                     // ❌ 应该是 boolean
    }
  }
}
```

❌ 配置无效,系统会:
1. 记录警告日志
2. 使用默认值替代无效字段
3. 继续创建 DivisionBox

---

## 默认值

如果 Manifest 中未配置或配置无效,系统会使用以下默认值:

```json
{
  "defaultSize": "medium",
  "keepAlive": false,
  "header": {
    "show": true,
    "title": "<插件名称>",
    "icon": "<插件图标>"
  },
  "triggers": {
    "command": true,
    "flow": false
  }
}
```

---

## 完整示例

### 示例 1: 简单工具

```json
{
  "name": "quick-note",
  "version": "1.0.0",
  "description": "快速笔记工具",
  "divisionBox": {
    "defaultSize": "compact",
    "keepAlive": true,
    "shortcuts": [
      {
        "key": "Cmd+Shift+N",
        "description": "打开快速笔记"
      }
    ]
  }
}
```

---

### 示例 2: 复杂应用

```json
{
  "name": "ai-assistant",
  "version": "2.0.0",
  "description": "AI 智能助手",
  "divisionBox": {
    "defaultSize": "expanded",
    "keepAlive": true,
    "header": {
      "show": true,
      "title": "AI 助手",
      "icon": "ri:robot-line",
      "actions": [
        {
          "id": "new-chat",
          "label": "新对话",
          "icon": "ri:chat-new-line"
        },
        {
          "id": "history",
          "label": "历史记录",
          "icon": "ri:history-line"
        },
        {
          "id": "settings",
          "label": "设置",
          "icon": "ri:settings-3-line"
        }
      ]
    },
    "shortcuts": [
      {
        "key": "Cmd+Shift+A",
        "description": "打开 AI 助手"
      }
    ],
    "triggers": {
      "command": true,
      "flow": true
    }
  }
}
```

---

### 示例 3: 沉浸式工具

```json
{
  "name": "focus-timer",
  "version": "1.0.0",
  "description": "专注计时器",
  "divisionBox": {
    "defaultSize": "compact",
    "keepAlive": true,
    "header": {
      "show": false  // 沉浸模式
    },
    "shortcuts": [
      {
        "key": "Cmd+Shift+F",
        "description": "打开专注计时器"
      }
    ]
  }
}
```

---

## 运行时覆盖

即使在 Manifest 中配置了默认值,插件仍然可以在运行时覆盖这些配置:

```typescript
// Manifest 中配置了 defaultSize: 'medium'
// 但可以在代码中覆盖
const { sessionId } = await plugin.divisionBox.open({
  url: 'https://example.com',
  size: 'expanded',  // 覆盖 Manifest 配置
  keepAlive: false   // 覆盖 Manifest 配置
})
```

**优先级:** 运行时配置 > Manifest 配置 > 系统默认值

---

## 最佳实践

### 1. 选择合适的尺寸

- **compact**: 简单工具(计算器、颜色选择器)
- **medium**: 通用工具(翻译、笔记)
- **expanded**: 复杂应用(AI 助手、代码编辑器)

### 2. 合理使用 keepAlive

✅ **适合启用:**
- 频繁访问的工具
- 需要保留状态的应用
- 加载时间 > 1 秒的页面

❌ **不适合启用:**
- 一次性工具
- 内存占用大的应用
- 很少使用的功能

### 3. 设计清晰的 Header

- 使用有意义的图标
- 标题简洁明了(≤ 10 个字符)
- 操作按钮不超过 5 个
- 常用操作放在前面

### 4. 避免快捷键冲突

- 使用 `Cmd+Shift+<Key>` 组合
- 避免单个字母快捷键
- 在文档中说明快捷键

### 5. 提供多种触发方式

```json
{
  "shortcuts": [...],
  "triggers": {
    "command": true,  // 命令面板
    "flow": true      // Flow 集成
  }
}
```

---

## 故障排查

### 配置未生效

**问题:** Manifest 配置没有应用到 DivisionBox

**解决方案:**
1. 检查 JSON 格式是否正确
2. 查看控制台警告日志
3. 确认字段名称拼写正确
4. 验证值类型是否匹配

---

### 快捷键不工作

**问题:** 注册的快捷键无法触发

**解决方案:**
1. 检查快捷键格式是否正确
2. 确认没有与系统快捷键冲突
3. 查看快捷键注册日志
4. 尝试使用不同的组合键

---

### Header 操作按钮无响应

**问题:** 点击 Header 按钮没有反应

**解决方案:**
1. 确认已注册 `onHeaderAction` 监听器
2. 检查 `actionId` 是否匹配
3. 查看控制台错误日志

```typescript
// 正确的监听器注册
plugin.divisionBox.onHeaderAction((actionId, sessionId) => {
  console.log('Action clicked:', actionId)
  // 处理逻辑
})
```

---

## 相关文档

- [API 文档](./DIVISION_BOX_API.md)
- [开发者指南](./DIVISION_BOX_GUIDE.md)
- [使用示例](../examples/division-box/)
