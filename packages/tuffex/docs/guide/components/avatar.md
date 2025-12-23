# Avatar 头像

头像组件用于展示用户或实体的图像标识。TouchX UI 的头像组件支持图片、文字、图标三种显示模式，并提供了优雅的加载状态和回退机制。

## 基础用法

最简单的头像用法：

```vue
<template>
  <div class="avatar-demo">
    <TxAvatar src="/user-avatar.jpg" />
    <TxAvatar name="张三" />
    <TxAvatar icon="user" />
  </div>
</template>
```

## 显示模式

### 图片头像
使用图片作为头像：

```vue
<template>
  <TxAvatar 
    src="https://example.com/avatar.jpg" 
    alt="用户头像"
  />
</template>
```

### 文字头像
使用用户姓名的首字母作为头像：

```vue
<template>
  <div class="text-avatar-demo">
    <TxAvatar name="张三" />
    <TxAvatar name="李四" />
    <TxAvatar name="王五" />
    <TxAvatar name="John Doe" />
  </div>
</template>
```

### 图标头像
使用图标作为头像：

```vue
<template>
  <div class="icon-avatar-demo">
    <TxAvatar icon="user" />
    <TxAvatar icon="team" />
    <TxAvatar icon="company" />
  </div>
</template>
```

## 头像尺寸

提供多种尺寸规格：

```vue
<template>
  <div class="size-demo">
    <TxAvatar size="small" name="小" />
    <TxAvatar size="medium" name="中" />
    <TxAvatar size="large" name="大" />
    <TxAvatar size="extra-large" name="超" />
    <TxAvatar :size="64" name="自定义" />
  </div>
</template>
```

## 头像形状

### 圆形头像（默认）
```vue
<template>
  <TxAvatar src="/avatar.jpg" shape="circle" />
</template>
```

### 方形头像
```vue
<template>
  <TxAvatar src="/avatar.jpg" shape="square" />
</template>
```

## 头像组

### 基础头像组
将多个头像组合显示：

```vue
<template>
  <TxAvatarGroup>
    <TxAvatar src="/user1.jpg" />
    <TxAvatar src="/user2.jpg" />
    <TxAvatar src="/user3.jpg" />
    <TxAvatar name="张三" />
  </TxAvatarGroup>
</template>
```

### 限制显示数量
当头像数量过多时，可以限制显示数量：

```vue
<template>
  <TxAvatarGroup :max="3">
    <TxAvatar src="/user1.jpg" />
    <TxAvatar src="/user2.jpg" />
    <TxAvatar src="/user3.jpg" />
    <TxAvatar src="/user4.jpg" />
    <TxAvatar src="/user5.jpg" />
  </TxAvatarGroup>
</template>
```

### 自定义更多提示
```vue
<template>
  <TxAvatarGroup :max="2">
    <TxAvatar src="/user1.jpg" />
    <TxAvatar src="/user2.jpg" />
    <TxAvatar src="/user3.jpg" />
    
    <template #more="{ count }">
      <TxAvatar>+{{ count }}</TxAvatar>
    </template>
  </TxAvatarGroup>
</template>
```

## 状态指示

### 在线状态
显示用户的在线状态：

```vue
<template>
  <div class="status-demo">
    <TxAvatar src="/user.jpg" status="online" />
    <TxAvatar src="/user.jpg" status="offline" />
    <TxAvatar src="/user.jpg" status="busy" />
    <TxAvatar src="/user.jpg" status="away" />
  </div>
</template>
```

### 自定义状态指示器
```vue
<template>
  <TxAvatar src="/user.jpg">
    <template #status>
      <div class="custom-status">
        <TxIcon name="crown" size="12" />
      </div>
    </template>
  </TxAvatar>
</template>

<style scoped>
.custom-status {
  position: absolute;
  bottom: 0;
  right: 0;
  background: gold;
  border-radius: 50%;
  padding: 2px;
}
</style>
```

## 交互功能

### 可点击头像
```vue
<template>
  <TxAvatar 
    src="/user.jpg" 
    clickable
    @click="handleAvatarClick"
  />
</template>

<script setup>
const handleAvatarClick = () => {
  console.log('头像被点击了')
}
</script>
```

### 头像上传
结合文件上传功能：

```vue
<template>
  <TxAvatar 
    :src="avatarUrl" 
    name="用户"
    editable
    @upload="handleUpload"
  >
    <template #upload-icon>
      <TxIcon name="camera" />
    </template>
  </TxAvatar>
</template>

<script setup>
import { ref } from 'vue'

const avatarUrl = ref('')

const handleUpload = (file) => {
  // 处理文件上传
  const formData = new FormData()
  formData.append('avatar', file)
  
  // 上传到服务器...
  // avatarUrl.value = '新的头像URL'
}
</script>
```

## 加载和错误处理

### 加载状态
```vue
<template>
  <TxAvatar 
    :src="avatarUrl" 
    :loading="isLoading"
    name="用户"
  />
</template>
```

### 错误回退
当图片加载失败时，自动回退到文字或图标模式：

```vue
<template>
  <TxAvatar 
    src="/broken-image.jpg" 
    name="张三"
    @error="handleError"
  />
</template>

<script setup>
const handleError = (event) => {
  console.log('头像加载失败:', event)
}
</script>
```

## API 参考

### Avatar Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | `string` | - | 头像图片地址 |
| name | `string` | - | 用户姓名，用于生成文字头像 |
| icon | `string` | - | 图标名称 |
| size | `'small' \| 'medium' \| 'large' \| 'extra-large' \| number` | `'medium'` | 头像尺寸 |
| shape | `'circle' \| 'square'` | `'circle'` | 头像形状 |
| status | `'online' \| 'offline' \| 'busy' \| 'away'` | - | 状态指示 |
| clickable | `boolean` | `false` | 是否可点击 |
| editable | `boolean` | `false` | 是否可编辑（上传） |
| loading | `boolean` | `false` | 是否显示加载状态 |
| alt | `string` | - | 图片的 alt 属性 |

### Avatar Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击头像时触发 |
| error | `(event: Event)` | 图片加载失败时触发 |
| upload | `(file: File)` | 上传文件时触发 |

### Avatar Slots

| 插槽名 | 说明 |
|--------|------|
| default | 自定义头像内容 |
| status | 自定义状态指示器 |
| upload-icon | 自定义上传图标 |

### AvatarGroup Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| max | `number` | - | 最大显示数量 |
| size | `'small' \| 'medium' \| 'large' \| 'extra-large'` | `'medium'` | 头像尺寸 |
| spacing | `number` | `8` | 头像间距（负值表示重叠） |

### AvatarGroup Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| default | - | 头像列表 |
| more | `{ count: number }` | 自定义更多提示 |

## 样式定制

### CSS 变量

```css
.custom-avatar {
  --tx-avatar-size: 48px;
  --tx-avatar-border-radius: 12px;
  --tx-avatar-background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --tx-avatar-text-color: white;
  --tx-avatar-border: 2px solid #fff;
  --tx-avatar-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

### 主题定制

```css
:root {
  /* 头像尺寸 */
  --tx-avatar-size-small: 32px;
  --tx-avatar-size-medium: 40px;
  --tx-avatar-size-large: 48px;
  --tx-avatar-size-extra-large: 64px;
  
  /* 状态指示器颜色 */
  --tx-avatar-status-online: #52c41a;
  --tx-avatar-status-offline: #d9d9d9;
  --tx-avatar-status-busy: #ff4d4f;
  --tx-avatar-status-away: #faad14;
}
```

## 最佳实践

### 使用建议

1. **图片优化**：使用适当尺寸的图片，避免过大的图片影响加载速度
2. **回退机制**：始终提供 name 属性作为图片加载失败的回退
3. **无障碍**：为头像提供有意义的 alt 文本
4. **一致性**：在同一界面中保持头像尺寸和样式的一致性

### 颜色生成算法

TouchX UI 会根据用户姓名自动生成背景色：

```javascript
// 颜色生成示例
const generateAvatarColor = (name) => {
  const colors = [
    '#f56565', '#ed8936', '#ecc94b', '#48bb78',
    '#38b2ac', '#4299e1', '#667eea', '#9f7aea',
    '#ed64a6', '#a0aec0'
  ]
  
  const hash = name.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc)
  }, 0)
  
  return colors[Math.abs(hash) % colors.length]
}
```

### 响应式设计

```vue
<template>
  <TxAvatar 
    :size="avatarSize"
    :src="user.avatar"
    :name="user.name"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useBreakpoint } from '@talex-touch/touchx-ui'

const { isMobile } = useBreakpoint()

const avatarSize = computed(() => {
  return isMobile.value ? 'medium' : 'large'
})
</script>
```

TouchX UI 的头像组件提供了灵活的显示选项和优雅的交互体验，让用户身份展示更加生动和个性化。
