# Tabs 标签页

用于在同一页面内切换不同内容区域（偏 Windows 风格的左侧导航 Tabs）。

<script setup lang="ts">
import { ref } from 'vue'

const active = ref('General')
</script>

## 基础用法

<DemoBlock title="Tabs">
<template #preview>
<div style="height: 320px;">
  <TxTabs v-model="active">
    <TxTabItem name="General" icon-class="i-carbon-settings" activation>
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 8px;">General</h3>
        <p style="margin: 0; color: var(--tx-text-color-secondary);">Basic settings content</p>
      </div>
    </TxTabItem>
    <TxTabItem name="Account" icon-class="i-carbon-user">
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 8px;">Account</h3>
        <p style="margin: 0; color: var(--tx-text-color-secondary);">Account settings content</p>
      </div>
    </TxTabItem>
    <TxTabItem name="About" icon-class="i-carbon-information">
      <div style="padding: 8px;">
        <h3 style="margin: 0 0 8px;">About</h3>
        <p style="margin: 0; color: var(--tx-text-color-secondary);">About content</p>
      </div>
    </TxTabItem>
  </TxTabs>
</div>
</template>

<template #code>
```vue
<template>
  <TxTabs v-model="active">
    <TxTabItem name="General" icon-class="i-carbon-settings" activation>
      General Content
    </TxTabItem>
    <TxTabItem name="Account" icon-class="i-carbon-user">
      Account Content
    </TxTabItem>
  </TxTabs>
</template>
```
</template>
</DemoBlock>

## API

### TxTabs Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `string` | - | 当前激活 tab（v-model） |
| `defaultValue` | `string` | - | 默认激活 tab（当未传 modelValue 时） |
| `offset` | `number` | `0` | 指示条定位偏移 |
| `navMinWidth` | `number` | `220` | 左侧导航最小宽度 |
| `navMaxWidth` | `number` | `320` | 左侧导航最大宽度 |
| `contentPadding` | `number` | `12` | 内容区 padding |
| `contentScrollable` | `boolean` | `true` | 内容区是否可滚动 |
| `autoHeight` | `boolean` | `false` | 内容区高度是否跟随内容并过渡（仅在 `contentScrollable=false` 时生效） |
| `autoHeightDurationMs` | `number` | `250` | 高度过渡时长(ms) |
| `autoHeightEasing` | `string` | `ease` | 高度过渡曲线 |

### TxTabItem Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `name` | `string` | - | tab 名称（唯一 key） |
| `iconClass` | `string` | `''` | 图标 class |
| `disabled` | `boolean` | `false` | 禁用 |
| `activation` | `boolean` | `false` | 是否作为初始激活项 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `change` | `string` | 切换时触发 |
| `update:modelValue` | `string` | v-model 更新 |
