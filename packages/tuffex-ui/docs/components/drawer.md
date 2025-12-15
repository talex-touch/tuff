# Drawer 抽屉

从屏幕边缘滑出的面板组件。

<script setup>
import { ref } from 'vue'

const visible1 = ref(false)
const visible2 = ref(false)
const visible3 = ref(false)
const visible4 = ref(false)
</script>

## 基础用法

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visible1 = true">打开抽屉</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visible1" title="设置">
  <p>这是抽屉的内容区域，你可以在这里放置任何内容。</p>
  <p>支持自定义宽度、方向和关闭行为。</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxButton @click="visible = true">打开抽屉</TxButton>
  
  <TxDrawer v-model:visible="visible" title="设置">
    <p>抽屉内容</p>
  </TxDrawer>
</template>

<script setup>
import { ref } from 'vue'
import { TxDrawer, TxButton } from '@talex-touch/tuff-ui'

const visible = ref(false)
</script>
```
:::

## 方向

抽屉可以从左侧或右侧滑入。

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visible2 = true">左侧抽屉</TxButton>
    <TxButton @click="visible3 = true">右侧抽屉</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visible2" title="左侧抽屉" direction="left">
  <p>从左侧滑入的抽屉</p>
</TxDrawer>

<TxDrawer v-model:visible="visible3" title="右侧抽屉" direction="right">
  <p>从右侧滑入的抽屉（默认）</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="visible" title="左侧抽屉" direction="left">
    <p>内容</p>
  </TxDrawer>
  
  <TxDrawer v-model:visible="visible2" title="右侧抽屉" direction="right">
    <p>内容</p>
  </TxDrawer>
</template>
```
:::

## 自定义宽度

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visible4 = true">自定义宽度 (400px)</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visible4" title="固定宽度抽屉" width="400px">
  <p>这个抽屉的宽度是固定的 400px</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="visible" title="宽抽屉" width="80%">
    <p>宽内容区域</p>
  </TxDrawer>
  
  <TxDrawer v-model:visible="visible2" title="固定宽度" width="400px">
    <p>固定宽度内容</p>
  </TxDrawer>
</template>
```
:::

## 底部插槽

使用 `footer` 插槽添加底部内容。

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="visible" title="表单">
    <form>
      <input type="text" placeholder="姓名" />
    </form>
    
    <template #footer>
      <TxButton @click="visible = false">取消</TxButton>
      <TxButton type="primary" @click="handleSave">保存</TxButton>
    </template>
  </TxDrawer>
</template>
```
:::

## 关闭行为

控制抽屉的关闭方式。

::: details 查看代码
```vue
<template>
  <!-- 禁用点击遮罩关闭 -->
  <TxDrawer 
    v-model:visible="visible" 
    title="持久化" 
    :close-on-click-mask="false"
  >
    <p>只能通过关闭按钮关闭</p>
  </TxDrawer>
  
  <!-- 禁用 Escape 键关闭 -->
  <TxDrawer 
    v-model:visible="visible2" 
    title="禁用 Escape" 
    :close-on-press-escape="false"
  >
    <p>Escape 键不会关闭此抽屉</p>
  </TxDrawer>
</template>
```
:::

## 事件

::: details 查看代码
```vue
<template>
  <TxDrawer 
    v-model:visible="visible" 
    title="事件示例"
    @open="handleOpen"
    @close="handleClose"
  >
    <p>内容</p>
  </TxDrawer>
</template>

<script setup>
function handleOpen() {
  console.log('抽屉已打开')
}

function handleClose() {
  console.log('抽屉已关闭')
}
</script>
```
:::

## API

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `visible` | `boolean` | *必填* | 控制抽屉可见性 |
| `title` | `string` | `'Drawer'` | 头部显示的标题 |
| `width` | `string` | `'60%'` | 抽屉宽度 |
| `direction` | `'left' \| 'right'` | `'right'` | 抽屉出现的方向 |
| `showClose` | `boolean` | `true` | 是否显示关闭按钮 |
| `closeOnClickMask` | `boolean` | `true` | 点击遮罩时关闭 |
| `closeOnPressEscape` | `boolean` | `true` | 按 Escape 键时关闭 |
| `zIndex` | `number` | `1998` | 自定义 z-index |

### 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `update:visible` | `visible: boolean` | 可见性变化时触发 |
| `open` | - | 抽屉打开时触发 |
| `close` | - | 抽屉关闭时触发 |

### 插槽

| 插槽名 | 说明 |
|------|-------------|
| `default` | 抽屉主内容 |
| `footer` | 底部内容区域 |
