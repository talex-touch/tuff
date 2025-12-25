# Card 卡片

Card 卡片组件是一个通用的内容容器，具有玻璃拟态效果，适用于展示各种类型的信息和内容。

<script setup lang="ts">
import CardBasicDemo from '../.vitepress/theme/components/demos/CardBasicDemo.vue'
import CardBasicDemoSource from '../.vitepress/theme/components/demos/CardBasicDemo.vue?raw'

import CardHeaderDemo from '../.vitepress/theme/components/demos/CardHeaderDemo.vue'
import CardHeaderDemoSource from '../.vitepress/theme/components/demos/CardHeaderDemo.vue?raw'

import CardActionsDemo from '../.vitepress/theme/components/demos/CardActionsDemo.vue'
import CardActionsDemoSource from '../.vitepress/theme/components/demos/CardActionsDemo.vue?raw'

import CardVariantsDemo from '../.vitepress/theme/components/demos/CardVariantsDemo.vue'
import CardVariantsDemoSource from '../.vitepress/theme/components/demos/CardVariantsDemo.vue?raw'

import CardBackgroundScrollDemo from '../.vitepress/theme/components/demos/CardBackgroundScrollDemo.vue'
import CardBackgroundScrollDemoSource from '../.vitepress/theme/components/demos/CardBackgroundScrollDemo.vue?raw'

import CardEmptyDemo from '../.vitepress/theme/components/demos/CardEmptyDemo.vue'
import CardEmptyDemoSource from '../.vitepress/theme/components/demos/CardEmptyDemo.vue?raw'

import CardCompositionsDemo from '../.vitepress/theme/components/demos/CardCompositionsDemo.vue'
import CardCompositionsDemoSource from '../.vitepress/theme/components/demos/CardCompositionsDemo.vue?raw'

import CardBasicSlotsDemo from '../.vitepress/theme/components/demos/CardBasicSlotsDemo.vue'
import CardBasicSlotsDemoSource from '../.vitepress/theme/components/demos/CardBasicSlotsDemo.vue?raw'

import CardSizeDemo from '../.vitepress/theme/components/demos/CardSizeDemo.vue'
import CardSizeDemoSource from '../.vitepress/theme/components/demos/CardSizeDemo.vue?raw'

import CardLayoutPropsDemo from '../.vitepress/theme/components/demos/CardLayoutPropsDemo.vue'
import CardLayoutPropsDemoSource from '../.vitepress/theme/components/demos/CardLayoutPropsDemo.vue?raw'

import CardStatesDemo from '../.vitepress/theme/components/demos/CardStatesDemo.vue'
import CardStatesDemoSource from '../.vitepress/theme/components/demos/CardStatesDemo.vue?raw'

import CardInertialDemo from '../.vitepress/theme/components/demos/CardInertialDemo.vue'
import CardInertialDemoSource from '../.vitepress/theme/components/demos/CardInertialDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="Basic" :code="CardBasicDemoSource">
  <template #preview>
    <CardBasicDemo />
  </template>
</DemoBlock>

<DemoBlock title="Basic slots" :code="CardBasicSlotsDemoSource">
  <template #preview>
    <CardBasicSlotsDemo />
  </template>
</DemoBlock>

## 惯性跟随回弹（inertial）

<DemoBlock title="inertial" :code="CardInertialDemoSource">
  <template #preview>
    <CardInertialDemo />
  </template>
</DemoBlock>

## 带标题的卡片

<DemoBlock title="Header" :code="CardHeaderDemoSource">
  <template #preview>
    <CardHeaderDemo />
  </template>
</DemoBlock>

## 带操作按钮的卡片

<DemoBlock title="Header + Footer actions" :code="CardActionsDemoSource">
  <template #preview>
    <CardActionsDemo />
  </template>
</DemoBlock>

## 卡片变体

提供不同的视觉样式：

<DemoBlock title="variants" :code="CardVariantsDemoSource">
  <template #preview>
    <div style="width: 100%;">
      <CardVariantsDemo />
    </div>
  </template>
</DemoBlock>

## 不同背景下的效果（blur / glass）

单卡片对比：背后提供文本与图形内容，通过开关切换 background（blur / glass / mask）。

<DemoBlock title="Card backgrounds (scroll)" :code="CardBackgroundScrollDemoSource">
  <template #preview>
    <div style="width: 100%;">
      <CardBackgroundScrollDemo />
    </div>
  </template>
</DemoBlock>

## Empty 布局

<DemoBlock title="Card with Empty" :code="CardEmptyDemoSource">
  <template #preview>
    <CardEmptyDemo />
  </template>
</DemoBlock>

## 与组件结合方式（Popover / SearchSelect）

<DemoBlock title="Card compositions" :code="CardCompositionsDemoSource">
  <template #preview>
    <div style="width: 100%;">
      <CardCompositionsDemo />
    </div>
  </template>
</DemoBlock>

## 卡片尺寸

<DemoBlock title="size" :code="CardSizeDemoSource">
  <template #preview>
    <div style="width: 100%;">
      <CardSizeDemo />
    </div>
  </template>
</DemoBlock>

## 布局属性（padding / radius）

<DemoBlock title="layout props" :code="CardLayoutPropsDemoSource">
  <template #preview>
    <div style="width: 100%;">
      <CardLayoutPropsDemo />
    </div>
  </template>
</DemoBlock>

## 状态（clickable / loading / disabled）

<DemoBlock title="states" :code="CardStatesDemoSource">
  <template #preview>
    <div style="width: 100%;">
      <CardStatesDemo />
    </div>
  </template>
</DemoBlock>


## API 参考

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | `'solid' \| 'dashed' \| 'plain'` | `'solid'` | 边框与交互形态 |
| background | `'blur' \| 'glass' \| 'mask'` | `'blur'` | 背景风格（玻璃效果在 `glass` 中最明显） |
| shadow | `'none' \| 'soft' \| 'medium'` | `'none'` | 阴影强度 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 卡片尺寸 |
| radius | `number` | `18` | 圆角 |
| padding | `number` | - | 内边距（不传时由 `size` 决定） |
| clickable | `boolean` | `false` | 是否可点击（hover feedback） |
| loading | `boolean` | `false` | 是否显示加载状态 |
| loadingSpinnerSize | `number` | - | loading spinner 大小（px） |
| disabled | `boolean` | `false` | 是否禁用 |
| inertial | `boolean` | `false` | 是否启用惯性拖拽回弹 |
| inertialMaxOffset | `number` | `22` | 拖拽最大位移（px） |
| inertialRebound | `number` | `0.12` | 回弹弹性（0=更粘更稳，1=更弹簧） |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击卡片时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 卡片主要内容 |
| header | 卡片头部内容 |
| footer | 卡片底部内容 |
| cover | 卡片封面图片 |

## 样式定制

### CSS 变量

```css
.custom-card {
  --tx-card-fake-background: rgba(255, 255, 255, 0.8);
  --tx-card-padding: 24px;
}
```

### 主题定制

```css
:root {
  /* 卡片背景 */
  --tx-card-background-default: rgba(255, 255, 255, 0.8);
  --tx-card-background-glass: rgba(255, 255, 255, 0.1);
  
  /* 卡片边框 */
  --tx-card-border-default: 1px solid rgba(0, 0, 0, 0.1);
  --tx-card-border-outlined: 1px solid var(--tx-color-border);
  
  /* 卡片阴影 */
  --tx-card-shadow-default: 0 2px 8px rgba(0, 0, 0, 0.1);
  --tx-card-shadow-elevated: 0 8px 24px rgba(0, 0, 0, 0.15);
  
  /* 卡片尺寸 */
  --tx-card-padding-small: 16px;
  --tx-card-padding-medium: 20px;
  --tx-card-padding-large: 24px;
}
```

## 最佳实践

### 使用建议

1. **内容组织**：合理使用 header、body、footer 区域组织内容
2. **视觉层次**：通过不同的卡片变体创建视觉层次
3. **交互反馈**：为可点击卡片提供明确的视觉反馈
4. **响应式设计**：确保卡片在不同屏幕尺寸下的良好表现

### 布局示例

```vue
<template>
  <div class="card-grid">
    <TxCard 
      v-for="item in items" 
      :key="item.id"
      clickable
      @click="handleItemClick(item)"
    >
      <template #header>
        <h3>{{ item.title }}</h3>
      </template>
      
      <p>{{ item.description }}</p>
      
      <template #footer>
        <div class="card-actions">
          <TxButton size="small" variant="text">编辑</TxButton>
          <TxButton size="small" variant="text">删除</TxButton>
        </div>
      </template>
    </TxCard>
  </div>
</template>

TouchX UI 的 Card 组件提供了灵活的内容展示方案，结合玻璃拟态效果创造出现代感十足的用户界面。
```
