# BaseAnchor 裂缝弹出层

`TxBaseAnchor` 是 Tooltip、Popover、Select 等浮层组件共享的底座，负责 reference 包装、Floating UI 定位、GSAP 裂缝式动效、外部点击/Escape 关闭与面板 surface 适配。

默认浮层内容会包裹在 `TxCard` 中。需要完全自定义内容容器时可设置 `useCard=false`。

## 基础用法

<DemoBlock title="BaseAnchor">
<template #preview>
<TxBaseAnchor placement="bottom-start">
  <template #reference>
    <TxButton>Click</TxButton>
  </template>

  <div style="width: 220px;">Floating content</div>
</TxBaseAnchor>
</template>

<template #code>

```vue
<template>
  <TxBaseAnchor placement="bottom-start">
    <template #reference>
      <TxButton>Click</TxButton>
    </template>

    <div style="width: 220px;">Floating content</div>
  </TxBaseAnchor>
</template>
```

</template>
</DemoBlock>

## 设计说明

- `modelValue` 支持受控与非受控用法；reference 点击会切换打开状态并触发 `update:modelValue`。
- `disabled` 阻断打开；已打开的非受控实例在禁用后会关闭。
- `closeOnClickOutside`、`closeOnEsc`、`toggleOnReferenceClick` 分别控制外部点击、Escape 与 reference 点击切换。
- `class`、`style` 和普通 attrs 会透传到浮层面板；reference 包装层样式使用 `referenceClass`。
- `surfaceMotionAdaptation` 为真实三态策略：`auto` 使用 Anchor 内部运动态，`manual` 读取 `panelCard.surfaceMoving`，`off` 强制关闭 surface moving。

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean` | - | 是否打开（v-model） |
| `disabled` | `boolean` | `false` | 禁用 |
| `eager` | `boolean` | `false` | 初始即挂载浮层节点 |
| `placement` | `BaseAnchorPlacement` | `'bottom-start'` | Floating placement |
| `offset` | `number` | `8` | 与 reference 的距离 |
| `width` | `number` | `0` | 固定浮层宽度；0 表示按内容/其他规则计算 |
| `minWidth` | `number` | `0` | 最小宽度 |
| `maxWidth` | `number` | `360` | 最大宽度 |
| `maxHeight` | `number` | `420` | 最大高度 |
| `unlimitedHeight` | `boolean` | `false` | 不限制浮层高度 |
| `matchReferenceWidth` | `boolean` | `false` | 宽度跟随 reference |
| `referenceClass` | `BaseAnchorClassValue` | - | reference 包装层 class |
| `duration` | `number` | `432` | 动画时长 |
| `ease` | `string` | `'back.out(2)'` | GSAP 打开缓动 |
| `useCard` | `boolean` | `true` | 使用 `TxCard` 包裹内容 |
| `panelVariant` | `'solid' \| 'dashed' \| 'plain'` | `'plain'` | `TxCard` variant |
| `panelBackground` | `'pure' \| 'mask' \| 'blur' \| 'glass' \| 'refraction'` | `'refraction'` | `TxCard` background |
| `panelShadow` | `'none' \| 'soft' \| 'medium'` | `'soft'` | `TxCard` shadow |
| `panelRadius` | `number` | `18` | 面板圆角 |
| `panelPadding` | `number` | `10` | 面板内边距 |
| `panelCard` | `BaseAnchorPanelCardProps` | - | 透传给 `TxCard` 的高级 surface 参数 |
| `surfaceMotionAdaptation` | `'auto' \| 'manual' \| 'off'` | `'auto'` | surface moving 策略 |
| `showArrow` | `boolean` | `false` | 显示箭头 |
| `arrowSize` | `number` | `10` | 箭头尺寸 |
| `keepAliveContent` | `boolean` | `false` | 关闭后保留内容挂载 |
| `closeOnClickOutside` | `boolean` | `true` | 外部点击关闭 |
| `closeOnEsc` | `boolean` | `true` | Escape 关闭 |
| `toggleOnReferenceClick` | `boolean` | `true` | reference 点击切换 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `boolean` | 打开状态变化 |
| `open` | - | 打开时触发 |
| `close` | - | 关闭时触发 |

### Slots

| 插槽名 | 说明 |
|------|------|
| `reference` | 触发元素 |
| `default` | 浮层内容，slot props 包含 `side` |

### Exposes

| 方法 | 说明 |
|------|------|
| `toggle()` | 切换打开状态 |
| `close()` | 关闭浮层 |
