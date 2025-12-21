# Scroll 滚动

基于 `@better-scroll/scroll-bar` 的滚动容器，提供更一致的滚动条体验，并兼容 `TouchScroll` 组件名。

## 基础用法

<div class="demo-container" style="height: 220px;">
  <TouchScroll>
    <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
      <div v-for="i in 24" :key="i" class="demo-scroll-item">
        Row {{ i }}
      </div>
    </div>
  </TouchScroll>
</div>

::: details 查看代码
```vue
<template>
  <div style="height: 220px;">
    <TouchScroll>
      <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
        <div v-for="i in 24" :key="i" class="demo-scroll-item">
          Row {{ i }}
        </div>
      </div>
    </TouchScroll>
  </div>
</template>

<script setup>
import { TouchScroll } from '@talex-touch/tuff-ui'
</script>

<style scoped>
.demo-scroll-item {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 10px;
  background: var(--tx-fill-color, #f5f7fa);
}
</style>
```
:::

## 使用原生滚动

当你不需要 BetterScroll 行为时，可以切换为原生滚动（仍保持统一容器结构）。

<div class="demo-container" style="height: 220px;">
  <TxScroll native>
    <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
      <div v-for="i in 24" :key="i" class="demo-scroll-item">
        Native Row {{ i }}
      </div>
    </div>
  </TxScroll>
</div>

::: details 查看代码
```vue
<template>
  <div style="height: 220px;">
    <TxScroll native>
      <div style="height: 520px; display: flex; flex-direction: column; gap: 8px;">
        <div v-for="i in 24" :key="i" class="demo-scroll-item">
          Native Row {{ i }}
        </div>
      </div>
    </TxScroll>
  </div>
</template>

<script setup>
import { TxScroll } from '@talex-touch/tuff-ui'
</script>
```
:::

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
