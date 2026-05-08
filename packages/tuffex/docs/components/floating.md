# Floating 浮动层

`TxFloating` 提供容器级鼠标/触摸位置跟踪，`TxFloatingElement` 按 `depth` 参数产生不同方向和强度的缓动位移。适用于轻量视差、引导卡片、视觉装饰和状态面板，不适合作为关键布局的唯一机制。

## 基础用法

```vue
<template>
  <TxFloating class-name="stage" :sensitivity="0.55" :easing-factor="0.08">
    <TxFloatingElement class-name="status-rail" :depth="-0.06" />
    <TxFloatingElement class-name="status-panel" :depth="0.04">
      鼠标移动时，状态层会按 depth 缓动
    </TxFloatingElement>
  </TxFloating>
</template>
```

## API

### TxFloating Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `className` | `string` | `''` | 透传到容器的类名 |
| `sensitivity` | `number` | `1` | 整体位移敏感度 |
| `easingFactor` | `number` | `0.05` | 每帧靠近目标位置的比例 |
| `disabled` | `boolean` | `false` | 禁用动画、停止监听并重置子元素位置 |

### TxFloatingElement Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `className` | `string` | `''` | 透传到元素的类名 |
| `depth` | `number` | `1` | 位移深度，支持负数反向移动 |

## 交互契约

- `TxFloating` 监听 window `mousemove` / `touchmove`，并以容器左上角为原点计算指针位置。
- 每个元素位移目标为 `pointerPosition * (depth * sensitivity / 20)`，每帧按 `easingFactor` 缓动靠近。
- `disabled=true` 时停止事件监听和 RAF，取消当前动画帧，并将已注册元素重置为 `translate3d(0px, 0px, 0)`。
- `disabled=false` 后会重新启动事件监听和 RAF。
- `TxFloatingElement` 挂载时注册，`depth` 变化时重新注册，卸载时注销。
