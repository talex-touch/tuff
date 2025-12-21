# Scroll 滚动

基于 `@better-scroll/scroll-bar` 的滚动容器，提供更一致的滚动条体验，并兼容 `TouchScroll` 组件名。

## 基础用法

<DemoBlock title="Scroll">
<template #preview>
<div class="demo-container" style="height: 220px;">
  <div style="height: 100%;">
    <TouchScroll style="height: 100%;">
      <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
        <div v-for="i in 24" :key="i" class="demo-scroll-item">
          Row {{ i }}
        </div>
      </div>
    </TouchScroll>
  </div>
</div>
</template>

<template #code>
```vue
<template>
  <div style="height: 220px;">
    <div style="height: 100%;">
      <TouchScroll style="height: 100%;">
        <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
          <div v-for="i in 24" :key="i" class="demo-scroll-item">
            Row {{ i }}
          </div>
        </div>
      </TouchScroll>
    </div>
  </div>
</template>
```
</template>
</DemoBlock>

## 使用原生滚动

当你不需要 BetterScroll 行为时，可以切换为原生滚动（仍保持统一容器结构）。

<DemoBlock title="Scroll (native)">
<template #preview>
<div class="demo-container" style="height: 220px;">
  <div style="height: 100%;">
    <TxScroll native style="height: 100%;">
      <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
        <div v-for="i in 24" :key="i" class="demo-scroll-item">
          Native Row {{ i }}
        </div>
      </div>
    </TxScroll>
  </div>
</div>
</template>

<template #code>
```vue
<template>
  <div style="height: 220px;">
    <div style="height: 100%;">
      <TxScroll native style="height: 100%;">
        <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
          <div v-for="i in 24" :key="i" class="demo-scroll-item">
            Native Row {{ i }}
          </div>
        </div>
      </TxScroll>
    </div>
  </div>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `native` | `boolean` | `false` | 使用原生滚动 |
| `noPadding` | `boolean` | `false` | 禁用内边距 |
| `options` | `Record<string, unknown>` | `{}` | BetterScroll 初始化参数 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `scroll` | `{ scrollTop: number; scrollLeft: number }` | 滚动事件 |
