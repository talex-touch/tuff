# TuffItemTemplate 组件文档

## 概述

`TuffItemTemplate` 是一个标准化的列表项模板组件，提供了统一的布局和交互模式。

## 设计特点

### 标准布局
- **左侧图标区域**：固定尺寸的图标容器，支持自定义图标
- **中间内容区域**：上下两排文本（标题 + 副标题），自动截断溢出
- **右侧尾部区域**：状态点、操作按钮等

### Badge 系统
1. **顶部右上角 Badge**：用于错误提示、警告信息
2. **底部右下角 Badge**：用于状态标识（Beta、New、版本号等）
3. **标题内联 Badge**：通过插槽在标题旁添加标签

### 状态管理
- **选中状态**：`selected` - 高亮显示当前选中项
- **禁用状态**：`disabled` - 降低透明度，禁止交互
- **错误状态**：`hasError` - 显示错误边框动画
- **状态点**：`statusDot` - 右侧圆点指示器（激活/未激活/错误/警告）

## Props

```typescript
interface TuffItemTemplateProps {
  // 主要内容
  title?: string // 标题文本
  subtitle?: string // 副标题文本
  icon?: string // 图标类名
  iconClass?: string // 图标容器额外类名

  // Badge 配置
  topBadge?: TuffItemBadge // 右上角 Badge
  bottomBadge?: TuffItemBadge // 右下角 Badge

  // 状态点
  statusDot?: TuffItemStatusDot

  // 状态
  selected?: boolean // 是否选中
  disabled?: boolean // 是否禁用
  clickable?: boolean // 是否可点击
  hasError?: boolean // 是否有错误

  // 尺寸
  size?: 'sm' | 'md' | 'lg' // 组件尺寸

  // 无障碍
  ariaLabel?: string // ARIA 标签
}

interface TuffItemBadge {
  text: string
  icon?: string
  status?: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  statusKey?: string
}

interface TuffItemStatusDot {
  color?: string // 自定义颜色
  class?: string // 预设类名：is-active, is-inactive, is-error, is-warning
  label?: string // ARIA 标签
}
```

## 插槽

```vue
<!-- 图标插槽 -->
<template #icon>
  <CustomIcon />
</template>

<!-- 标题插槽 -->
<template #title>
  <span>Custom Title</span>
  <el-tag>Pro</el-tag>
</template>

<!-- 标题内联 Badge -->
<template #title-badge>
  <el-tag size="small">New</el-tag>
</template>

<!-- 副标题插槽 -->
<template #subtitle>
  <span>Custom subtitle</span>
</template>

<!-- 右侧尾部插槽 -->
<template #trailing>
  <el-button>Action</el-button>
</template>

<!-- 顶部 Badge 插槽 -->
<template #badge-top>
  <CustomBadge />
</template>

<!-- 底部 Badge 插槽 -->
<template #badge-bottom>
  <CustomBadge />
</template>
```

## 事件

```typescript
{
  click: [event: MouseEvent | KeyboardEvent]  // 点击事件
}
```

## 使用示例

### 基础用法

```vue
<TuffItemTemplate
  title="OpenAI Provider"
  subtitle="openai"
  icon="i-simple-icons-openai"
  @click="handleClick"
/>
```

### 带状态点

```vue
<TuffItemTemplate
  title="Active Service"
  subtitle="Running"
  icon="i-carbon-server"
  :status-dot="{ class: 'is-active', label: 'Service is running' }"
  :selected="true"
/>
```

### 带错误提示

```vue
<TuffItemTemplate
  title="Provider"
  subtitle="Configuration error"
  icon="i-carbon-warning"
  :top-badge="{ text: 'Error', status: 'danger' }"
  :has-error="true"
/>
```

### 带状态标识

```vue
<TuffItemTemplate
  title="New Feature"
  subtitle="Beta version"
  icon="i-carbon-star"
  :bottom-badge="{ text: 'Beta', status: 'warning' }"
/>
```

### 完整配置

```vue
<TuffItemTemplate
  title="Custom Provider"
  subtitle="custom-api"
  icon="i-carbon-settings"
  :top-badge="{ text: 'New', status: 'info' }"
  :bottom-badge="{ text: 'v2.0', status: 'success' }"
  :status-dot="{ class: 'is-active' }"
  :selected="true"
  size="lg"
  @click="handleSelect"
/>
```

## 扩展性设计

### 1. Badge 位置扩展
当前支持：
- 右上角（错误、警告）
- 右下角（状态标识）
- 标题内联（标签）

可扩展：
- 左上角 Badge（优先级标识）
- 左下角 Badge（分类标签）
- 图标角标（未读数量）

### 2. 状态指示器扩展
当前支持：
- 右侧状态点（4 种预设状态）

可扩展：
- 进度条（加载状态）
- 动画图标（处理中）
- 多状态组合（同时显示多个状态）

### 3. 交互扩展
当前支持：
- 点击选中
- 键盘导航
- 悬停效果

可扩展：
- 长按菜单
- 拖拽排序
- 滑动操作（移动端）
- 右键菜单

### 4. 内容扩展
当前支持：
- 标题 + 副标题
- 单图标

可扩展：
- 多行副标题
- 图标组（多个图标）
- 缩略图（替代图标）
- 富文本内容

### 5. 尺寸扩展
当前支持：
- sm (3.5rem)
- md (5rem)
- lg (6rem)

可扩展：
- xs (2.5rem) - 紧凑列表
- xl (7rem) - 卡片式布局
- auto - 自适应内容高度

## 样式定制

### CSS 变量

```css
.TuffItemTemplate {
  --tuff-item-padding: 0.5rem;
  --tuff-item-gap: 1rem;
  --tuff-item-border-radius: 0.75rem;
  --tuff-item-icon-size: 3rem;
  --tuff-item-icon-radius: 0.75rem;
}
```

### 主题适配

组件使用 Element Plus 的 CSS 变量，自动适配明暗主题：
- `--el-fill-color-blank` - 背景色
- `--el-border-color` - 边框色
- `--el-color-primary` - 主题色
- `--el-text-color-primary` - 主文本色
- `--el-text-color-secondary` - 次文本色

## 无障碍支持

- ✅ 键盘导航（Enter/Space）
- ✅ ARIA 标签和状态
- ✅ 焦点可见性
- ✅ 屏幕阅读器支持
- ✅ 语义化 HTML

## 性能优化

- 使用 CSS transitions 而非 animations
- 避免不必要的重渲染
- 懒加载图标
- 虚拟滚动支持（配合 TuffListTemplate）

## 最佳实践

1. **保持一致性**：在同一列表中使用相同的尺寸和布局
2. **合理使用 Badge**：避免同时显示过多 Badge
3. **状态清晰**：确保状态点和 Badge 的含义明确
4. **无障碍优先**：始终提供 ariaLabel
5. **性能考虑**：大列表使用虚拟滚动

## 迁移指南

### 从 IntelligenceItem 迁移

**之前：**
```vue
<IntelligenceItem
  :provider="provider"
  :is-selected="isSelected"
  @click="handleClick"
/>
```

**之后：**
```vue
<TuffItemTemplate
  :title="provider.name"
  :subtitle="provider.type"
  :icon="getProviderIcon(provider.type)"
  :selected="isSelected"
  :top-badge="hasError ? errorBadge : undefined"
  :status-dot="{ class: provider.enabled ? 'is-active' : 'is-inactive' }"
  @click="handleClick"
/>
```

## 相关组件

- `TuffListTemplate` - 列表容器模板
- `TuffStatusBadge` - 状态徽章组件
- `TuffAsideTemplate` - 侧边栏模板
