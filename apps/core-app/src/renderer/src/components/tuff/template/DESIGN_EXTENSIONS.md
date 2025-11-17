# TuffItemTemplate 扩展设计思路

## 已实现的核心功能

### 1. 标准布局 ✅
- 左侧：TuffIcon（固定尺寸，圆角容器）
- 右侧：上下两排文本（标题 + 副标题）
- 自动截断：文本溢出使用 `text-overflow: ellipsis`

### 2. Badge 系统 ✅
- **右上角 Badge**：错误提示、警告信息
- **右下角 Badge**：状态标识（Beta、New、版本号）
- **标题内联 Badge**：通过插槽实现

### 3. 状态指示器 ✅
- **右侧状态点**：4 种预设状态（active、inactive、error、warning）
- 支持自定义颜色和 ARIA 标签

## 可扩展的功能点

### 1. 更多 Badge 位置

```typescript
// 扩展 Props
type TuffItemTemplateProps = {
  // ... 现有 props
  leftTopBadge?: TuffItemBadge      // 左上角（优先级）
  leftBottomBadge?: TuffItemBadge   // 左下角（分类）
  iconBadge?: TuffItemIconBadge     // 图标角标（数量）
}

type TuffItemIconBadge = {
  count?: number
  dot?: boolean
  max?: number  // 最大显示数量，超过显示 99+
}
```

**使用场景：**
- 左上角：优先级标识（P0、P1、P2）
- 左下角：分类标签（类型、标签）
- 图标角标：未读消息数、通知数量

### 2. 多状态组合

```typescript
type TuffItemMultiStatus = {
  primary: TuffItemStatusDot    // 主状态
  secondary?: TuffItemStatusDot // 次状态
  layout?: 'horizontal' | 'vertical'
}
```

**使用场景：**
- 同时显示在线状态 + 同步状态
- 显示健康状态 + 性能状态

### 3. 进度指示器

```typescript
type TuffItemProgress = {
  value: number        // 0-100
  status?: 'success' | 'warning' | 'danger'
  showText?: boolean   // 显示百分比文本
  position?: 'bottom' | 'overlay'  // 底部条或覆盖层
}
```

**使用场景：**
- 下载/上传进度
- 任务完成度
- 配额使用情况

### 4. 动画状态

```typescript
type TuffItemAnimation = {
  type: 'pulse' | 'spin' | 'bounce' | 'shimmer'
  target: 'icon' | 'badge' | 'border' | 'background'
  duration?: number
}
```

**使用场景：**
- 加载中：图标旋转
- 处理中：边框脉冲
- 新内容：背景闪烁

### 5. 交互增强

```typescript
// 扩展 Emits
const emit = defineEmits<{
  click: [event: MouseEvent | KeyboardEvent]
  'long-press': [event: MouseEvent | TouchEvent]
  'context-menu': [event: MouseEvent]
  'drag-start': [event: DragEvent]
  'drag-end': [event: DragEvent]
  'swipe-left': [event: TouchEvent]
  'swipe-right': [event: TouchEvent]
}>()
```

**使用场景：**
- 长按：显示快捷菜单
- 右键：上下文菜单
- 拖拽：重新排序
- 滑动：快捷操作（删除、归档）

### 6. 内容扩展

```typescript
type TuffItemTemplateProps = {
  // ... 现有 props
  
  // 多行副标题
  subtitles?: string[]  // 支持多行
  
  // 图标组
  icons?: string[]      // 多个图标
  iconLayout?: 'stack' | 'grid'
  
  // 缩略图
  thumbnail?: string    // 图片 URL
  thumbnailShape?: 'square' | 'circle'
  
  // 标签列表
  tags?: Array<{ text: string; color?: string }>
}
```

**使用场景：**
- 多行副标题：显示更多信息
- 图标组：显示支持的平台
- 缩略图：用户头像、文件预览
- 标签列表：分类、属性标签

### 7. 尺寸和密度

```typescript
type TuffItemSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'auto'
type TuffItemDensity = 'compact' | 'comfortable' | 'spacious'

type TuffItemTemplateProps = {
  // ... 现有 props
  size?: TuffItemSize
  density?: TuffItemDensity
}
```

**尺寸映射：**
- xs: 2.5rem - 超紧凑列表
- sm: 3.5rem - 紧凑列表
- md: 5rem - 标准列表（默认）
- lg: 6rem - 宽松列表
- xl: 7rem - 卡片式
- auto: 自适应内容

**密度映射：**
- compact: 减少内边距和间距
- comfortable: 标准间距（默认）
- spacious: 增加内边距和间距

### 8. 分组和层级

```typescript
type TuffItemTemplateProps = {
  // ... 现有 props
  level?: number        // 层级深度（0-5）
  indent?: boolean      // 是否缩进
  expandable?: boolean  // 是否可展开
  expanded?: boolean    // 展开状态
  hasChildren?: boolean // 是否有子项
}
```

**使用场景：**
- 树形列表
- 嵌套分组
- 可折叠列表

### 9. 虚拟化支持

```typescript
type TuffItemTemplateProps = {
  // ... 现有 props
  virtualIndex?: number    // 虚拟索引
  virtualHeight?: number   // 固定高度（虚拟滚动）
}
```

**使用场景：**
- 大数据列表（1000+ 项）
- 无限滚动
- 性能优化

### 10. 主题变体

```typescript
type TuffItemVariant = 
  | 'default'    // 标准样式
  | 'card'       // 卡片样式（更多阴影）
  | 'flat'       // 扁平样式（无阴影）
  | 'outlined'   // 轮廓样式（边框）
  | 'elevated'   // 悬浮样式（强阴影）

type TuffItemTemplateProps = {
  // ... 现有 props
  variant?: TuffItemVariant
}
```

## 实现优先级建议

### 高优先级（立即实现）
1. ✅ 基础布局和 Badge 系统
2. ✅ 状态点指示器
3. 图标角标（未读数量）
4. 进度指示器

### 中优先级（按需实现）
5. 多状态组合
6. 动画状态
7. 更多 Badge 位置
8. 内容扩展（多行、标签）

### 低优先级（未来考虑）
9. 交互增强（拖拽、滑动）
10. 分组和层级
11. 虚拟化支持
12. 主题变体

## 设计原则

### 1. 渐进增强
- 基础功能开箱即用
- 高级功能按需启用
- 保持 API 简洁

### 2. 性能优先
- 避免不必要的重渲染
- 使用 CSS 而非 JS 动画
- 支持虚拟滚动

### 3. 无障碍第一
- 完整的键盘支持
- ARIA 标签和状态
- 屏幕阅读器友好

### 4. 灵活可定制
- 丰富的插槽系统
- CSS 变量支持
- 主题适配

### 5. 类型安全
- 完整的 TypeScript 类型
- Props 验证
- 事件类型定义

## 使用建议

### 何时使用 TuffItemTemplate
✅ 列表项展示
✅ 选择器选项
✅ 配置项卡片
✅ 导航菜单项
✅ 通知列表

### 何时不使用
❌ 复杂的表单布局
❌ 数据表格行
❌ 自由布局的卡片
❌ 完全自定义的组件

## 示例：完整功能展示

```vue
<TuffItemTemplate
  <!-- 基础内容 -->
  title="OpenAI GPT-4"
  subtitle="High-performance AI model"
  icon="i-simple-icons-openai"
  
  <!-- Badge 系统 -->
  :top-badge="{ text: 'New', status: 'info' }"
  :bottom-badge="{ text: 'v4.0', status: 'success' }"
  :icon-badge="{ count: 3 }"
  
  <!-- 状态 -->
  :status-dot="{ class: 'is-active' }"
  :selected="true"
  
  <!-- 进度（扩展） -->
  :progress="{ value: 75, status: 'success' }"
  
  <!-- 动画（扩展） -->
  :animation="{ type: 'pulse', target: 'border' }"
  
  <!-- 尺寸和样式 -->
  size="lg"
  variant="card"
  
  <!-- 交互 -->
  @click="handleClick"
  @long-press="handleLongPress"
  @context-menu="handleContextMenu"
>
  <!-- 自定义插槽 -->
  <template #title-badge>
    <el-tag size="small">Pro</el-tag>
  </template>
  
  <template #trailing>
    <el-button size="small" text>Configure</el-button>
  </template>
</TuffItemTemplate>
```

## 总结

TuffItemTemplate 提供了一个强大且灵活的基础，通过渐进式的功能扩展，可以满足各种复杂的列表项展示需求。当前实现已经覆盖了最常见的使用场景，未来可以根据实际需求逐步添加更多功能。
