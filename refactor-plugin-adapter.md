# Plugin Adapter 简化方案

## 当前问题

1. `plugin-adapter` 这一层有点冗余
2. `channel.ts` 只是做初始化和订阅，可以合并到其他地方
3. 架构层级过多

## 方案 A：完全去掉 Adapter，直接使用 SDK

**优点：** 架构简单，层级少
**缺点：** 失去集中的状态管理，组件需要各自管理状态

```typescript
// 组件中直接使用
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

const plugins = ref<ITouchPlugin[]>([])

onMounted(async () => {
  plugins.value = await pluginSDK.list()

  pluginSDK.subscribe((event) => {
    // 组件自己处理状态更新
    if (event.type === 'added') {
      plugins.value.push(event.plugin)
    }
    // ...
  })
})
```

## 方案 B：保留 Store，去掉 Adapter 层 ✅ 推荐

**优点：** 保留响应式状态管理，简化架构
**缺点：** 需要重构现有代码

### 1. 重命名 + 简化

```
apps/core-app/src/renderer/src/modules/
├── sdk/
│   └── plugin-sdk.ts          # SDK（RPC 调用）
└── stores/                     # 改为标准 Pinia stores 目录
    └── plugin.ts               # 插件状态管理（原 plugin-adapter/store.ts）
```

### 2. 合并 channel.ts 到 store

```typescript
// stores/plugin.ts
import { defineStore } from 'pinia'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

export const usePluginStore = defineStore('plugin', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())

  // ... 现有的 state 和 methods ...

  // 初始化逻辑（原 channel.ts）
  async function initialize() {
    // 订阅状态变化
    pluginSDK.subscribe((event) => {
      handleStateEvent(event)
    })

    // 加载初始数据
    const pluginList = await pluginSDK.list()
    initPlugins(pluginList)
  }

  return {
    plugins,
    setPlugin,
    getPlugin,
    initialize,  // ← 暴露初始化方法
    // ... other methods
  }
})
```

### 3. 在 main.ts 中初始化

```typescript
// main.ts
const pluginStore = usePluginStore()
await pluginStore.initialize()
```

## 方案 C：SDK 集成到 Store（更激进）

**思路：** Store 内部使用 SDK，外部只看到 Store

```typescript
export const usePluginStore = defineStore('plugin', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())

  // 所有操作都通过 SDK
  async function enable(name: string) {
    const success = await pluginSDK.enable(name)
    if (success) {
      // 状态已通过 subscribe 自动更新
    }
    return success
  }

  async function list(filters?: PluginFilters) {
    return pluginSDK.list(filters)
  }

  // ... 其他方法都是 SDK 的封装
})
```

## 推荐实施步骤

### 步骤 1：重命名和移动

```bash
# 1. 创建 stores 目录
mkdir -p apps/core-app/src/renderer/src/modules/stores

# 2. 移动并重命名 store
mv apps/core-app/src/renderer/src/modules/adapter/plugin-adapter/store.ts \
   apps/core-app/src/renderer/src/modules/stores/plugin.ts

# 3. 删除 adapter 目录
rm -rf apps/core-app/src/renderer/src/modules/adapter/plugin-adapter
```

### 步骤 2：合并 channel.ts 逻辑到 store

在 `stores/plugin.ts` 中添加 `initialize()` 方法

### 步骤 3：更新引用

全局替换：
```typescript
// 从
import { usePluginStore } from '~/modules/adapter/plugin-adapter'

// 到
import { usePluginStore } from '~/modules/stores/plugin'
```

### 步骤 4：在 main.ts 中初始化

```typescript
const pluginStore = usePluginStore()
await pluginStore.initialize()
```

---

## 总结

**推荐方案 B**：
- ✅ 保留 Pinia store 的响应式和集中管理优势
- ✅ 去掉 adapter 这个冗余的抽象层
- ✅ 简化目录结构，更符合标准 Vue 项目规范
- ✅ 初始化逻辑更清晰

这样架构就变成：
```
组件 → Pinia Store (plugin.ts) → Plugin SDK → IPC → 后端
                ↑
            (响应式状态)
```

