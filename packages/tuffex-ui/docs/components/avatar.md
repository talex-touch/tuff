# Avatar 头像

Avatar 头像组件用于展示用户头像、品牌标识或其他圆形图像内容，支持图片、文字、图标等多种展示方式。

## 基础用法

最简单的头像展示：

```vue
<template>
  <div class="avatar-demo">
    <TxAvatar src="https://example.com/avatar.jpg" />
    <TxAvatar>U</TxAvatar>
    <TxAvatar>
      <TxIcon name="user" />
    </TxAvatar>
  </div>
</template>
```

## 头像尺寸

提供多种预设尺寸：

```vue
<template>
  <div class="size-demo">
    <TxAvatar size="small" src="avatar.jpg" />
    <TxAvatar size="medium" src="avatar.jpg" />
    <TxAvatar size="large" src="avatar.jpg" />
    <TxAvatar size="extra-large" src="avatar.jpg" />
    <TxAvatar :size="64" src="avatar.jpg" />
  </div>
</template>
```

## 头像形状

支持圆形和方形两种形状：

```vue
<template>
  <div class="shape-demo">
    <TxAvatar shape="circle" src="avatar.jpg" />
    <TxAvatar shape="square" src="avatar.jpg" />
  </div>
</template>
```

## 文字头像

使用文字作为头像内容：

```vue
<template>
  <div class="text-demo">
    <TxAvatar>张</TxAvatar>
    <TxAvatar>AB</TxAvatar>
    <TxAvatar>User</TxAvatar>
  </div>
</template>
```

## 图标头像

使用图标作为头像内容：

```vue
<template>
  <div class="icon-demo">
    <TxAvatar>
      <TxIcon name="user" />
    </TxAvatar>
    <TxAvatar>
      <TxIcon name="team" />
    </TxAvatar>
  </div>
</template>
```

## 头像组

展示多个头像的组合：

```vue
<template>
  <div class="group-demo">
    <TxAvatarGroup :max="3">
      <TxAvatar src="avatar1.jpg" />
      <TxAvatar src="avatar2.jpg" />
      <TxAvatar src="avatar3.jpg" />
      <TxAvatar src="avatar4.jpg" />
      <TxAvatar src="avatar5.jpg" />
    </TxAvatarGroup>
  </div>
</template>
```

## 带徽章的头像

在头像上显示状态徽章：

```vue
<template>
  <div class="badge-demo">
    <TxAvatar src="avatar.jpg" badge="online" />
    <TxAvatar src="avatar.jpg" badge="offline" />
    <TxAvatar src="avatar.jpg" badge="busy" />
    <TxAvatar src="avatar.jpg" badge="away" />
  </div>
</template>
```

## 加载状态

头像加载失败时的处理：

```vue
<template>
  <div class="fallback-demo">
    <TxAvatar 
      src="invalid-url.jpg"
      fallback="https://example.com/default-avatar.jpg"
    />
    <TxAvatar src="invalid-url.jpg">
      <TxIcon name="user" />
    </TxAvatar>
  </div>
</template>
```

## 可点击头像

支持点击交互的头像：

```vue
<template>
  <TxAvatar 
    src="avatar.jpg"
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

## API 参考

### Avatar Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | `string` | - | 头像图片地址 |
| alt | `string` | - | 图片替代文本 |
| size | `'small' \| 'medium' \| 'large' \| 'extra-large' \| number` | `'medium'` | 头像尺寸 |
| shape | `'circle' \| 'square'` | `'circle'` | 头像形状 |
| fallback | `string` | - | 加载失败时的备用图片 |
| badge | `'online' \| 'offline' \| 'busy' \| 'away'` | - | 状态徽章 |
| clickable | `boolean` | `false` | 是否可点击 |

### Avatar Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击头像时触发 |
| error | `(event: Event)` | 图片加载失败时触发 |
| load | `(event: Event)` | 图片加载成功时触发 |

### Avatar Slots

| 插槽名 | 说明 |
|--------|------|
| default | 自定义头像内容（文字或图标） |

### AvatarGroup Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| max | `number` | - | 最大显示数量 |
| size | `'small' \| 'medium' \| 'large' \| 'extra-large' \| number` | `'medium'` | 头像尺寸 |
| shape | `'circle' \| 'square'` | `'circle'` | 头像形状 |

## 样式定制

### CSS 变量

```css
.custom-avatar {
  --tx-avatar-size: 48px;
  --tx-avatar-border-radius: 50%;
  --tx-avatar-background: #f0f0f0;
  --tx-avatar-color: #666;
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
  
  /* 头像样式 */
  --tx-avatar-border-radius: 50%;
  --tx-avatar-background: var(--tx-color-fill-light);
  --tx-avatar-color: var(--tx-color-text-secondary);
  
  /* 徽章样式 */
  --tx-avatar-badge-size: 12px;
  --tx-avatar-badge-border: 2px solid #fff;
}
```

## 最佳实践

### 使用建议

1. **图片质量**：使用高质量的头像图片，建议尺寸至少为 128x128px
2. **备用方案**：为头像提供备用图片或文字内容
3. **无障碍性**：为头像图片提供有意义的 alt 文本
4. **一致性**：在同一界面中保持头像尺寸和形状的一致性

### 无障碍设计

```vue
<template>
  <!-- 用户头像 -->
  <TxAvatar 
    src="user-avatar.jpg"
    alt="张三的头像"
  />
  
  <!-- 装饰性头像 -->
  <TxAvatar 
    src="logo.jpg"
    alt=""
    aria-hidden="true"
  />
  
  <!-- 可点击头像 -->
  <TxAvatar 
    src="avatar.jpg"
    alt="用户头像"
    clickable
    aria-label="查看用户资料"
    @click="viewProfile"
  />
</template>
```

TouchX UI 的 Avatar 组件提供了灵活的头像展示方案，适用于各种用户界面场景。
