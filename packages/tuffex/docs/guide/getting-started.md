# 快速开始

本指南假设您已经 [安装了 TuffEx](/guide/installation)。让我们开始使用您的第一个 TuffEx 组件吧！

## 使用方式

### 全量引入
```typescript
import { createApp } from 'vue'
import TuffUI from '@talex-touch/tuffex'
import '@talex-touch/tuffex/dist/style.css'

const app = createApp(App)
app.use(TuffUI)
app.mount('#app')
```

### 按需引入（推荐）
```typescript
import { createApp } from 'vue'
import { TxButton, TxTag } from '@talex-touch/tuffex'
import '@talex-touch/tuffex/dist/style.css'

const app = createApp(App)
app.use(TxButton)
app.use(TxTag)
app.mount('#app')
```

## 基础示例

这是一个简单的入门示例：

```vue
<template>
  <div>
    <TxButton type="primary" @click="handleClick">
      点击我！
    </TxButton>
    <TxTag label="标签" color="var(--tx-color-success)" />
  </div>
</template>

<script setup>
import { TxButton, TxTag } from '@talex-touch/tuffex'

const handleClick = () => {
  console.log('按钮被点击了！')
}
</script>
```


## 你的第一个组件

让我们从一个简单的按钮开始：

```vue
<template>
  <TxButton type="primary" @click="handleClick">
    你好 TuffEx！ ✨
  </TxButton>
</template>

<script setup>
import { TxButton } from '@talex-touch/tuffex'

const handleClick = () => {
  alert('欢迎使用 TuffEx！')
}
</script>
```

## 组合多个组件

以下是如何同时使用多个组件：

```vue
<template>
  <div class="user-card">
    <TxTag label="VIP" color="var(--tx-color-warning)" />
    <h3>{{ user.name }}</h3>
    <TxButton type="primary" @click="viewProfile">
      查看资料
    </TxButton>
  </div>
</template>

<script setup>
import { TxButton, TxTag } from '@talex-touch/tuffex'

const user = {
  name: '张三',
}

const viewProfile = () => {
  // 处理查看资料
}
</script>
```

## TypeScript 支持

TuffEx 开箱即用地提供完整的 TypeScript 支持：

```typescript
import type { TxButtonProps } from '@talex-touch/tuffex'

const buttonProps: TxButtonProps = {
  type: 'primary',
  size: 'large',
  disabled: false
}
```

## 组件属性和事件

TuffEx 组件完全类型化，提供优秀的智能提示：

```vue
<template>
  <!-- 属性完全类型化 -->
  <TxButton
    :type="buttonType"
    :size="buttonSize"
    :loading="isLoading"
    @click="handleClick"
  >
    {{ buttonText }}
  </TxButton>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
import type { TxButtonProps } from '@talex-touch/tuffex'

const buttonType = ref<TxButtonProps['type']>('primary')
const buttonSize = ref<TxButtonProps['size']>('medium')
const isLoading = ref(false)
const buttonText = ref('点击我！')

const handleClick = () => {
  isLoading.value = true
  // 模拟异步操作
  setTimeout(() => {
    isLoading.value = false
  }, 2000)
}
</script>
```

## 常用模式

### 表单组件
```vue
<template>
  <form @submit.prevent="handleSubmit">
    <TxInput
      v-model="form.name"
      placeholder="请输入您的姓名"
      :error="errors.name"
    />
    <TxButton type="primary" html-type="submit">
      提交
    </TxButton>
  </form>
</template>
```

### 布局组件
```vue
<template>
  <TxGroupBlock name="用户信息" icon="i-carbon-user">
    <TxBlockLine title="姓名" :description="user.name" />
    <TxBlockLine title="邮箱" :description="user.email" />
  </TxGroupBlock>
</template>
```

## 下一步

现在您已经掌握了基础知识，以下是可以探索的内容：

### 🧩 **探索组件**
- **[按钮 Button](/components/button)** - 带动画的交互按钮
- **[标签 Tag](/components/tag)** - 多功能标签组件
- **[输入框 Input](/components/input)** - 带平滑聚焦效果的表单输入
- **[分组块 GroupBlock](/components/group-block)** - 可折叠的分组容器

### 🎨 **自定义主题**
```vue
<template>
  <TxButton
    type="primary"
    class="custom-button"
  >
    自定义样式按钮
  </TxButton>
</template>

<style scoped>
.custom-button {
  --tx-primary-color: #6366f1;
  --tx-border-radius: 12px;
}
</style>
```

### 🚀 **进阶用法**
- **[设计系统](/design/)** - 了解我们的设计原则
- **[主题定制](/guide/theming)** - 深度自定义
- **[演练场](/playground/)** - 交互式组件探索器

### 💡 **获取帮助**
- 🐛 [问题反馈](https://github.com/talex-touch/touchx-ui/issues)
- 💬 [参与讨论](https://github.com/talex-touch/touchx-ui/discussions)
- 📖 [完整文档](https://touchx-ui.talex.cn)