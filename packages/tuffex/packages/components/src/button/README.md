# TxButton 组件

TouchX UI 的标准按钮组件，符合设计规范并提供完整的功能支持。

## 特性

- ✅ **完整的类型支持**：基于 TypeScript 的完整类型定义
- ✅ **多种按钮类型**：primary、success、warning、danger、info、text
- ✅ **多种尺寸**：large、默认、small、mini
- ✅ **多种样式**：朴素、圆角、圆形按钮
- ✅ **状态管理**：禁用、加载状态
- ✅ **图标支持**：内置图标系统
- ✅ **无障碍支持**：键盘导航和屏幕阅读器支持
- ✅ **动画效果**：平滑的悬停和点击动画
- ✅ **响应式设计**：适配不同屏幕尺寸

## 文件结构

```
button/
├── src/
│   ├── button.vue      # 主组件文件
│   ├── types.ts        # TypeScript 类型定义
│   └── style/
│       └── index.scss  # 样式文件
├── __tests__/
│   └── button.test.ts  # 单元测试
├── index.ts            # 导出文件
└── README.md           # 说明文档
```

## 样式规范

- 所有样式类名使用 `tx-` 前缀
- 遵循 BEM 命名规范
- 使用 CSS 变量支持主题定制
- 支持暗色模式

## 使用示例

```vue
<template>
  <div>
    <!-- 基础用法 -->
    <TxButton>默认按钮</TxButton>
    <TxButton type="primary">主要按钮</TxButton>
    
    <!-- 不同尺寸 -->
    <TxButton size="large">大型按钮</TxButton>
    <TxButton size="small">小型按钮</TxButton>
    
    <!-- 不同状态 -->
    <TxButton disabled>禁用按钮</TxButton>
    <TxButton loading>加载中</TxButton>
    
    <!-- 不同样式 -->
    <TxButton plain>朴素按钮</TxButton>
    <TxButton round>圆角按钮</TxButton>
    <TxButton circle icon="edit"></TxButton>
    
    <!-- 图标按钮 -->
    <TxButton icon="search">搜索</TxButton>
  </div>
</template>

<script setup>
import { TxButton } from '@talex-touch/touchx-ui'
</script>
```

## API

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | `'primary' \| 'success' \| 'warning' \| 'danger' \| 'info' \| 'text'` | - | 按钮类型 |
| size | `'large' \| 'small' \| 'mini'` | - | 按钮尺寸 |
| plain | `boolean` | `false` | 是否为朴素按钮 |
| round | `boolean` | `false` | 是否为圆角按钮 |
| circle | `boolean` | `false` | 是否为圆形按钮 |
| loading | `boolean` | `false` | 是否显示加载状态 |
| disabled | `boolean` | `false` | 是否禁用 |
| icon | `string` | - | 图标名称 |
| autofocus | `boolean` | `false` | 是否自动聚焦 |
| nativeType | `'button' \| 'submit' \| 'reset'` | `'button'` | 原生 type 属性 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 按钮内容 |

## 测试

运行单元测试：

```bash
npm run test:unit
```

## 开发

本组件遵循 TouchX UI 的开发规范：

1. 使用 Vue 3 Composition API
2. 完整的 TypeScript 支持
3. 遵循无障碍设计原则
4. 支持主题定制
5. 包含完整的单元测试
