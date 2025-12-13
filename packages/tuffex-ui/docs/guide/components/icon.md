# Icon 图标

图标是界面设计中重要的视觉元素。TouchX UI 提供了丰富的图标库和灵活的图标组件，支持多种样式和交互效果。

## 基础用法

最简单的图标用法：

```vue
<template>
  <div class="icon-demo">
    <TxIcon name="home" />
    <TxIcon name="user" />
    <TxIcon name="settings" />
  </div>
</template>
```

## 图标尺寸

提供多种预设尺寸：

```vue
<template>
  <div class="size-demo">
    <TxIcon name="star" size="small" />
    <TxIcon name="star" size="medium" />
    <TxIcon name="star" size="large" />
    <TxIcon name="star" size="extra-large" />
    <TxIcon name="star" :size="32" />
  </div>
</template>
```

## 图标颜色

### 预设颜色
使用语义化的颜色名称：

```vue
<template>
  <div class="color-demo">
    <TxIcon name="heart" color="primary" />
    <TxIcon name="heart" color="success" />
    <TxIcon name="heart" color="warning" />
    <TxIcon name="heart" color="danger" />
    <TxIcon name="heart" color="info" />
  </div>
</template>
```

### 自定义颜色
使用任意颜色值：

```vue
<template>
  <div class="custom-color-demo">
    <TxIcon name="star" color="#ff6b6b" />
    <TxIcon name="star" color="rgb(52, 152, 219)" />
    <TxIcon name="star" color="var(--my-custom-color)" />
  </div>
</template>
```

## 图标动画

### 旋转动画
```vue
<template>
  <div class="animation-demo">
    <TxIcon name="loading" spin />
    <TxIcon name="refresh" spin />
    <TxIcon name="gear" spin />
  </div>
</template>
```

### 脉冲动画
```vue
<template>
  <TxIcon name="heart" pulse />
</template>
```

### 摇摆动画
```vue
<template>
  <TxIcon name="bell" shake />
</template>
```

### 自定义动画
```vue
<template>
  <TxIcon name="star" class="custom-animation" />
</template>

<style scoped>
.custom-animation {
  animation: bounce 1s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-10px);
  }
  60% {
    transform: translateY(-5px);
  }
}
</style>
```

## 图标样式

### 填充样式
```vue
<template>
  <div class="style-demo">
    <TxIcon name="heart" variant="outline" />
    <TxIcon name="heart" variant="filled" />
    <TxIcon name="heart" variant="duotone" />
  </div>
</template>
```

### 线条粗细
```vue
<template>
  <div class="stroke-demo">
    <TxIcon name="circle" :stroke-width="1" />
    <TxIcon name="circle" :stroke-width="2" />
    <TxIcon name="circle" :stroke-width="3" />
  </div>
</template>
```

## 交互图标

### 可点击图标
```vue
<template>
  <TxIcon 
    name="heart" 
    clickable
    @click="handleClick"
  />
</template>

<script setup>
const handleClick = () => {
  console.log('图标被点击了')
}
</script>
```

### 切换状态图标
```vue
<template>
  <TxIcon 
    :name="isLiked ? 'heart-filled' : 'heart'"
    :color="isLiked ? 'danger' : 'default'"
    clickable
    @click="toggleLike"
  />
</template>

<script setup>
import { ref } from 'vue'

const isLiked = ref(false)

const toggleLike = () => {
  isLiked.value = !isLiked.value
}
</script>
```

## 图标组合

### 图标徽章
在图标上显示徽章：

```vue
<template>
  <div class="badge-demo">
    <TxIcon name="bell" badge="5" />
    <TxIcon name="message" badge="99+" />
    <TxIcon name="shopping-cart" :badge="cartCount" />
  </div>
</template>
```

### 图标堆叠
将多个图标堆叠显示：

```vue
<template>
  <TxIconStack>
    <TxIcon name="circle" size="large" color="primary" />
    <TxIcon name="user" size="medium" color="white" />
  </TxIconStack>
</template>
```

## 常用图标

### 导航图标
```vue
<template>
  <div class="navigation-icons">
    <TxIcon name="home" />
    <TxIcon name="search" />
    <TxIcon name="menu" />
    <TxIcon name="arrow-left" />
    <TxIcon name="arrow-right" />
    <TxIcon name="close" />
  </div>
</template>
```

### 操作图标
```vue
<template>
  <div class="action-icons">
    <TxIcon name="edit" />
    <TxIcon name="delete" />
    <TxIcon name="copy" />
    <TxIcon name="download" />
    <TxIcon name="upload" />
    <TxIcon name="share" />
  </div>
</template>
```

### 状态图标
```vue
<template>
  <div class="status-icons">
    <TxIcon name="check-circle" color="success" />
    <TxIcon name="warning-triangle" color="warning" />
    <TxIcon name="x-circle" color="danger" />
    <TxIcon name="info-circle" color="info" />
  </div>
</template>
```

## 自定义图标

### 使用 SVG
```vue
<template>
  <TxIcon>
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  </TxIcon>
</template>
```

### 注册自定义图标
```javascript
// 全局注册
import { registerIcon } from '@talex-touch/touchx-ui'

registerIcon('custom-logo', {
  viewBox: '0 0 24 24',
  path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
})
```

```vue
<template>
  <TxIcon name="custom-logo" />
</template>
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| name | `string` | - | 图标名称 |
| size | `'small' \| 'medium' \| 'large' \| 'extra-large' \| number` | `'medium'` | 图标尺寸 |
| color | `string` | - | 图标颜色 |
| variant | `'outline' \| 'filled' \| 'duotone'` | `'outline'` | 图标样式 |
| strokeWidth | `number` | `2` | 线条粗细 |
| spin | `boolean` | `false` | 是否旋转 |
| pulse | `boolean` | `false` | 是否脉冲动画 |
| shake | `boolean` | `false` | 是否摇摆动画 |
| clickable | `boolean` | `false` | 是否可点击 |
| badge | `string \| number` | - | 徽章内容 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击图标时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 自定义图标内容（SVG） |

## 样式定制

### CSS 变量

```css
.custom-icon {
  --tx-icon-size: 24px;
  --tx-icon-color: #666;
  --tx-icon-hover-color: #333;
  --tx-icon-animation-duration: 0.3s;
}
```

### 主题定制

```css
:root {
  /* 图标尺寸 */
  --tx-icon-size-small: 16px;
  --tx-icon-size-medium: 20px;
  --tx-icon-size-large: 24px;
  --tx-icon-size-extra-large: 32px;
  
  /* 图标颜色 */
  --tx-icon-color-primary: var(--tx-color-primary);
  --tx-icon-color-success: var(--tx-color-success);
  --tx-icon-color-warning: var(--tx-color-warning);
  --tx-icon-color-danger: var(--tx-color-danger);
  --tx-icon-color-info: var(--tx-color-info);
}
```

## 图标库

TouchX UI 内置了丰富的图标库，包含以下分类：

### 基础图标
- home, user, settings, search, menu, close
- arrow-up, arrow-down, arrow-left, arrow-right
- plus, minus, check, x

### 文件图标
- file, folder, image, video, audio
- download, upload, attachment

### 通信图标
- mail, message, phone, chat
- send, reply, forward

### 商务图标
- shopping-cart, credit-card, wallet
- chart, graph, analytics

### 社交图标
- heart, star, share, like
- facebook, twitter, instagram

### 更多图标
查看完整的图标列表，请访问 [图标库页面](/icons/index)。

## 最佳实践

### 使用建议

1. **语义化**：选择与功能匹配的图标
2. **一致性**：在同一界面中保持图标风格一致
3. **尺寸适配**：根据使用场景选择合适的尺寸
4. **颜色搭配**：确保图标颜色与界面主题协调

### 无障碍设计

```vue
<template>
  <!-- 装饰性图标 -->
  <TxIcon name="star" aria-hidden="true" />
  
  <!-- 功能性图标 -->
  <TxIcon 
    name="search" 
    clickable
    aria-label="搜索"
    @click="handleSearch"
  />
  
  <!-- 带文字说明的图标 -->
  <button>
    <TxIcon name="save" aria-hidden="true" />
    保存
  </button>
</template>
```

### 性能优化

1. **按需加载**：只加载使用到的图标
2. **SVG 优化**：使用优化过的 SVG 文件
3. **缓存策略**：合理设置图标缓存

TouchX UI 的图标组件提供了丰富的视觉表达能力，让界面更加直观和美观。
