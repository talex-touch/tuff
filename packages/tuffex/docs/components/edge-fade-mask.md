# EdgeFadeMask 边缘渐隐遮罩

用于给滚动容器加 `mask-image` 渐隐效果，避免内容在边缘被硬裁切。

## 基础用法（纵向）

<DemoBlock title="Vertical fade">
<template #preview>
<div style="width: 420px; max-width: 100%; border: 1px solid var(--tx-border-color); border-radius: 12px;">
  <TxEdgeFadeMask :size="32" style="height: 220px;">
    <div style="padding: 14px 16px; line-height: 1.7; color: var(--tx-text-color-secondary);">
      <div style="font-weight: 600; color: var(--tx-text-color); margin-bottom: 8px;">
        Scrollable Content
      </div>
      The edge fade appears only when there is hidden content outside the current viewport.
      <div style="height: 12px;" />
      This helps list/detail panels keep visual continuity on top and bottom boundaries.
      <div style="height: 12px;" />
      You can keep your own background, border, and radius on the wrapper.
      <div style="height: 180px;" />
      End
    </div>
  </TxEdgeFadeMask>
</div>
</template>

<template #code>
```vue
<template>
  <div style="width: 420px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxEdgeFadeMask :size="32" style="height: 220px;">
      <div style="padding: 14px 16px; line-height: 1.7;">
        <!-- long content -->
      </div>
    </TxEdgeFadeMask>
  </div>
</template>
```
</template>
</DemoBlock>

## 横向滚动

<DemoBlock title="Horizontal fade">
<template #preview>
<div style="width: 520px; max-width: 100%; border: 1px solid var(--tx-border-color); border-radius: 12px;">
  <TxEdgeFadeMask axis="horizontal" :size="40" style="height: 116px;">
    <div style="display: flex; align-items: center; gap: 12px; width: max-content; padding: 12px;">
      <div v-for="index in 10" :key="index" style="width: 120px; height: 84px; border-radius: 10px; border: 1px solid var(--tx-border-color-light); background: var(--tx-fill-color-light); display: flex; align-items: center; justify-content: center; color: var(--tx-text-color-secondary); font-size: 13px;">
        Item {{ index }}
      </div>
    </div>
  </TxEdgeFadeMask>
</div>
</template>

<template #code>
```vue
<template>
  <div style="width: 520px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxEdgeFadeMask axis="horizontal" :size="40" style="height: 116px;">
      <div style="display: flex; gap: 12px; width: max-content; padding: 12px;">
        <!-- horizontal cards -->
      </div>
    </TxEdgeFadeMask>
  </div>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `as` | `string` | `'div'` | 根元素标签 |
| `axis` | `'vertical' \| 'horizontal'` | `'vertical'` | 渐隐方向 |
| `size` | `string \| number` | `24` | 单侧渐隐长度 |
| `threshold` | `number` | `1` | 滚动边界判定阈值（px） |
| `disabled` | `boolean` | `false` | 禁用渐隐 |
| `observeResize` | `boolean` | `true` | 容器尺寸变化时自动刷新状态 |

## 使用建议

- 外层容器负责边框和圆角，`TxEdgeFadeMask` 负责滚动和渐隐。
- 横向场景建议内部内容使用 `display: flex` + `width: max-content`。
