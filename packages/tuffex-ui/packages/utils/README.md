# TouchX UI Utils

TouchX UI 的工具函数库，提供各种实用的工具方法。

## 震动工具 (Vibrate)

提供设备震动反馈功能，支持多种震动模式和自定义配置。

### 基础用法

```typescript
import { useVibrate, vibrate } from '@talex-touch/touchx-ui/utils'

// 使用预设震动类型
useVibrate('light')    // 轻微震动
useVibrate('medium')   // 中等震动
useVibrate('heavy')    // 重度震动
useVibrate('bit')      // 微震动

// 使用语义化震动类型
useVibrate('success')  // 成功反馈
useVibrate('warning')  // 警告反馈
useVibrate('error')    // 错误反馈

// 使用简化 API
vibrate.light()        // 轻微震动
vibrate.success()      // 成功震动
vibrate.stop()         // 停止震动
```

### 高级用法

```typescript
import { 
  useAutoVibrate, 
  VibrateManager, 
  createVibratePattern,
  isVibrateSupported 
} from '@talex-touch/touchx-ui/utils'

// 检查设备支持
if (isVibrateSupported()) {
  console.log('设备支持震动')
}

// 自定义震动模式
useAutoVibrate([100, 50, 100, 50, 200])

// 创建自定义震动模式
const customPattern = createVibratePattern(
  [50, 100, 50], 
  '自定义双击震动'
)

// 使用震动管理器
const vibrateManager = new VibrateManager({
  enabled: true,
  silent: false
})

vibrateManager.vibrate('heavy')
vibrateManager.stop()
```

### 在组件中使用

```vue
<template>
  <TxButton 
    type="primary" 
    :vibrate="true" 
    vibrate-type="medium"
    @click="handleClick"
  >
    点击震动
  </TxButton>
</template>

<script setup>
import { useVibrate } from '@talex-touch/touchx-ui/utils'

const handleClick = () => {
  // 手动触发震动
  useVibrate('success')
}
</script>
```

### API 参考

#### 震动类型 (VibrateType)

| 类型 | 模式 | 描述 |
|------|------|------|
| `light` | `[5]` | 轻微震动 - 适用于轻触反馈 |
| `medium` | `[10, 15]` | 中等震动 - 适用于一般操作反馈 |
| `heavy` | `[5, 30]` | 重度震动 - 适用于重要操作反馈 |
| `bit` | `[2, 1]` | 微震动 - 适用于细微交互反馈 |
| `success` | `[10, 50, 10]` | 成功震动 - 适用于成功操作反馈 |
| `warning` | `[15, 30, 15, 30, 15]` | 警告震动 - 适用于警告提示 |
| `error` | `[20, 100, 20, 100, 20]` | 错误震动 - 适用于错误提示 |

#### 主要方法

##### `useVibrate(type, options?)`

使用预设震动类型

- `type`: 震动类型
- `options`: 配置选项
  - `enabled`: 是否启用震动 (默认: `true`)
  - `pattern`: 自定义震动模式
  - `silent`: 是否静默失败 (默认: `true`)

##### `useAutoVibrate(duration, options?)`

自定义震动模式

- `duration`: 震动持续时间数组
- `options`: 配置选项

##### `stopVibrate()`

停止当前震动

##### `isVibrateSupported()`

检查设备是否支持震动 API

#### VibrateManager 类

震动管理器，提供更高级的震动控制功能。

```typescript
const manager = new VibrateManager({
  enabled: true,
  silent: true
})

// 方法
manager.setEnabled(boolean)     // 设置是否启用
manager.setSilent(boolean)      // 设置静默模式
manager.vibrate(type, pattern?) // 执行震动
manager.stop()                  // 停止震动
manager.isSupported()           // 检查支持状态
```

### 浏览器兼容性

震动 API 主要在移动设备上支持：

- ✅ Android Chrome
- ✅ Android Firefox
- ✅ Samsung Internet
- ❌ iOS Safari (不支持)
- ❌ Desktop browsers (大部分不支持)

### 最佳实践

1. **适度使用**: 震动反馈应该适度，避免过度使用影响用户体验
2. **语义化**: 使用语义化的震动类型，如成功、警告、错误
3. **可控制**: 提供用户控制震动开关的选项
4. **优雅降级**: 在不支持震动的设备上优雅降级
5. **性能考虑**: 避免频繁触发震动，可能影响电池续航

## 组件安装工具 (withInstall)

用于为 Vue 组件添加全局安装方法。

```typescript
import { withInstall } from '@talex-touch/touchx-ui/utils'
import MyComponent from './MyComponent.vue'

const TxMyComponent = withInstall(MyComponent)

export { TxMyComponent }
export default TxMyComponent
```
