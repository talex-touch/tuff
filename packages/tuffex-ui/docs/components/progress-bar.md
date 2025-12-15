# ProgressBar 进度条

多功能进度条组件，支持加载、错误和成功状态。

## 基础用法

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%;">
    <TxProgressBar :percentage="50" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar :percentage="50" />
</template>

<script setup>
import { TxProgressBar } from '@talex-touch/tuff-ui'
</script>
```
:::

## 加载状态

显示不确定进度的加载动画。

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%;">
    <TxProgressBar loading />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar loading />
</template>
```
:::

## 百分比进度

显示确定进度和百分比。

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%; gap: 16px;">
    <TxProgressBar :percentage="25" show-text />
    <TxProgressBar :percentage="50" show-text />
    <TxProgressBar :percentage="75" show-text />
    <TxProgressBar :percentage="100" show-text />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar :percentage="progress" show-text />
</template>

<script setup>
import { ref } from 'vue'

const progress = ref(0)

// 模拟进度
const interval = setInterval(() => {
  progress.value += 10
  if (progress.value >= 100) {
    clearInterval(interval)
  }
}, 500)
</script>
```
:::

## 状态

### 成功状态

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%;">
    <TxProgressBar success message="上传完成！" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar success message="上传完成！" />
</template>
```
:::

### 错误状态

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%;">
    <TxProgressBar error message="上传失败" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar error message="上传失败" />
</template>
```
:::

## 自定义高度

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%; gap: 16px;">
    <TxProgressBar :percentage="75" height="4px" />
    <TxProgressBar :percentage="75" height="10px" />
    <TxProgressBar :percentage="75" height="20px" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar :percentage="75" height="10px" />
  <TxProgressBar :percentage="75" height="20px" />
</template>
```
:::

## 自定义颜色

<div class="demo-container">
  <div class="demo-container__row" style="flex-direction: column; width: 100%; gap: 16px;">
    <TxProgressBar :percentage="60" color="#ff6b6b" />
    <TxProgressBar :percentage="80" color="linear-gradient(to right, #667eea, #764ba2)" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxProgressBar :percentage="60" color="#ff6b6b" />
  <TxProgressBar :percentage="80" color="linear-gradient(to right, #667eea, #764ba2)" />
</template>
```
:::

## 文件上传示例

文件上传的实际示例。

```vue
<template>
  <div class="upload-container">
    <input type="file" @change="handleFileSelect" />
    
    <TxProgressBar 
      v-if="uploading" 
      :loading="progress === 0"
      :percentage="progress"
      :success="progress === 100"
      :error="uploadError"
      :message="statusMessage"
      show-text
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { TxProgressBar } from '@talex-touch/tuff-ui'

const uploading = ref(false)
const progress = ref(0)
const uploadError = ref(false)

const statusMessage = computed(() => {
  if (uploadError.value) return '上传失败'
  if (progress.value === 100) return '完成！'
  if (progress.value === 0) return '准备中...'
  return `${progress.value}%`
})

async function handleFileSelect(event) {
  const file = event.target.files[0]
  if (!file) return
  
  uploading.value = true
  progress.value = 0
  uploadError.value = false
  
  try {
    await uploadFile(file, (p) => {
      progress.value = p
    })
  } catch (e) {
    uploadError.value = true
  }
}
</script>
```

## 下载进度示例

```vue
<template>
  <div class="download-item">
    <span>{{ fileName }}</span>
    <TxProgressBar 
      :percentage="downloadProgress" 
      :success="downloadProgress === 100"
      height="4px"
    />
  </div>
</template>
```

## API

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `loading` | `boolean` | `false` | 显示加载动画 |
| `error` | `boolean` | `false` | 显示错误状态 |
| `success` | `boolean` | `false` | 显示成功状态 |
| `message` | `string` | `''` | 显示的消息文本 |
| `percentage` | `number` | `0` | 进度百分比 (0-100) |
| `height` | `string` | `'5px'` | 进度条高度 |
| `showText` | `boolean` | `false` | 显示百分比文本 |
| `color` | `string` | `''` | 自定义颜色 |

### 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `complete` | - | 进度达到 100% 时触发 |

### CSS 变量

你可以使用 CSS 变量自定义进度条：

```css
.tx-progress-bar {
  --tx-progress-height: 5px;
  --tx-progress-color: var(--el-color-primary);
  --tx-progress-width: 100%;
}
```
