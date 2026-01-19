# Avatar 头像

Avatar 头像组件用于展示用户头像、品牌标识或其他圆形内容，支持图片、文字（slot / name）、图标等多种展示方式。

## 基础用法

<DemoBlock title="Avatar">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
  <TxAvatar name="Talex DreamSoul" />
  <TxAvatar icon="user" />
  <TxAvatar>U</TxAvatar>
</div>
</template>

<template #code>
```vue
<template>
  <div style="display: flex; gap: 12px; align-items: center;">
    <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
    <TxAvatar name="Talex DreamSoul" />
    <TxAvatar icon="user" />
    <TxAvatar>U</TxAvatar>
  </div>
</template>
```
</template>
</DemoBlock>

## 头像尺寸

提供多种预设尺寸：

<DemoBlock title="Sizes">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxAvatar size="small" src="https://avatars.githubusercontent.com/u/1?v=4" />
  <TxAvatar size="medium" src="https://avatars.githubusercontent.com/u/1?v=4" />
  <TxAvatar size="large" src="https://avatars.githubusercontent.com/u/1?v=4" />
  <TxAvatar size="xlarge" src="https://avatars.githubusercontent.com/u/1?v=4" />
</div>
</template>

<template #code>
```vue
<template>
  <div style="display: flex; gap: 12px; align-items: center;">
    <TxAvatar size="small" src="..." />
    <TxAvatar size="medium" src="..." />
    <TxAvatar size="large" src="..." />
    <TxAvatar size="xlarge" src="..." />
  </div>
</template>
```
</template>
</DemoBlock>

## 文字头像

使用文字作为头像内容：

<DemoBlock title="Text">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxAvatar>张</TxAvatar>
  <TxAvatar>AB</TxAvatar>
  <TxAvatar>User</TxAvatar>
</div>
</template>

<template #code>
```vue
<template>
  <TxAvatar>张</TxAvatar>
  <TxAvatar>AB</TxAvatar>
  <TxAvatar>User</TxAvatar>
</template>
```
</template>
</DemoBlock>

## 图标头像

使用图标作为头像内容：

<DemoBlock title="Icon">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxAvatar icon="user" />
  <TxAvatar icon="team" />
</div>
</template>

<template #code>
```vue
<template>
  <TxAvatar icon="user" />
  <TxAvatar icon="team" />
</template>
```
</template>
</DemoBlock>

## 头像组

展示多个头像叠放：

<DemoBlock title="AvatarGroup">
<template #preview>
<TxAvatarGroup :max="3" size="small" :overlap="10">
  <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
  <TxAvatar src="https://avatars.githubusercontent.com/u/2?v=4" />
  <TxAvatar src="https://avatars.githubusercontent.com/u/3?v=4" />
  <TxAvatar src="https://avatars.githubusercontent.com/u/4?v=4" />
  <TxAvatar src="https://avatars.githubusercontent.com/u/5?v=4" />
</TxAvatarGroup>
</template>

<template #code>
```vue
<template>
  <TxAvatarGroup :max="3" size="small" :overlap="10">
    <TxAvatar src="..." />
    <TxAvatar src="..." />
    <TxAvatar src="..." />
    <TxAvatar src="..." />
  </TxAvatarGroup>
</template>
```
</template>
</DemoBlock>

## 状态

在头像上显示在线状态：

<DemoBlock title="Status">
<template #preview>
<div style="display: flex; gap: 12px; align-items: center;">
  <TxAvatar status="online" name="Online" />
  <TxAvatar status="offline" name="Offline" />
  <TxAvatar status="busy" name="Busy" />
  <TxAvatar status="away" name="Away" />
</div>
</template>

<template #code>
```vue
<template>
  <TxAvatar status="online" name="Online" />
  <TxAvatar status="offline" name="Offline" />
  <TxAvatar status="busy" name="Busy" />
  <TxAvatar status="away" name="Away" />
</template>
```
</template>
</DemoBlock>

## 可点击头像

支持点击交互的头像：

```vue
<template>
  <TxAvatar
    name="Click"
    clickable
    @click="handleAvatarClick"
  />
</template>
```

## API 参考

### Avatar Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | `string` | - | 头像图片地址 |
| alt | `string` | - | 图片替代文本 |
| name | `string` | - | 名称（用于生成首字母 fallback） |
| icon | `string` | - | icon 名称（基于 TxIcon） |
| size | `'small' \| 'medium' \| 'large' \| 'xlarge'` | `'medium'` | 头像尺寸 |
| status | `'online' \| 'offline' \| 'busy' \| 'away'` | - | 状态 |
| clickable | `boolean` | `false` | 是否可点击 |
| backgroundColor | `string` | - | 自定义背景色 |
| textColor | `string` | - | 自定义文字色 |

### Avatar Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `()` | 点击头像时触发（仅 `clickable=true`） |

### Avatar Slots

| 插槽名 | 说明 |
|--------|------|
| default | 自定义头像内容（优先级高于 icon/name） |

### AvatarGroup Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| max | `number` | - | 最大显示数量（超出显示 `+N`） |
| size | `'small' \| 'medium' \| 'large' \| 'xlarge'` | - | 统一设置子头像尺寸（未显式设置时生效） |
| overlap | `number \| string` | `8` | 叠放重叠距离（px 或 css string） |

## 更多示例

- [Avatar Variants 头像变体](/components/avatar-variants)

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
