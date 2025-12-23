# GroupBlock 分组块

用于组织相关内容的可折叠分组容器，带有平滑动画效果。

<script setup lang="ts">
import { ref } from 'vue'

const notifications = ref(true)
const language = ref<'en' | 'zh'>('en')

const enabled = ref(false)
const dummy = ref(false)
</script>

## 基础用法

<DemoBlock title="GroupBlock">
<template #preview>
<div style="width: 560px;">
  <TxGroupBlock
    name="通用设置"
    icon="i-carbon-settings"
    description="配置基本选项"
  >
    <TxBlockSwitch
      v-model="notifications"
      title="通知"
      description="启用推送通知"
      icon="i-carbon-notification"
    />
    <TxBlockSlot title="语言" description="选择显示语言" icon="i-carbon-translate">
      <select v-model="language" style="padding: 6px 10px; border-radius: 10px; border: 1px solid var(--tx-border-color); background: var(--tx-fill-color-blank);">
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </TxBlockSlot>
  </TxGroupBlock>
</div>
</template>

<template #code>
```vue
<template>
  <TxGroupBlock name="通用设置" icon="i-carbon-settings" description="配置基本选项">
    <TxBlockSwitch v-model="notifications" title="通知" description="启用推送通知" icon="i-carbon-notification" />
    <TxBlockSlot title="语言" description="选择显示语言" icon="i-carbon-translate">
      <select v-model="language">
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </TxBlockSlot>
  </TxGroupBlock>
</template>
```
</template>
</DemoBlock>

## 初始折叠

使用 `shrink` 属性使分组初始为折叠状态。


<DemoBlock title="GroupBlock (shrink)">
<template #preview>
<div style="width: 560px;">
  <TxGroupBlock name="高级设置" icon="i-carbon-tool-kit" shrink>
    <div style="padding: 12px;">高级内容</div>
  </TxGroupBlock>
</div>
</template>

<template #code>
```vue
<template>
  <TxGroupBlock name="高级设置" icon="i-carbon-tool-kit" shrink>
    <p>高级内容</p>
  </TxGroupBlock>
</template>
```
</template>
</DemoBlock>

## 展开填充

使用 `expandFill` 在展开时更改图标样式。


<DemoBlock title="GroupBlock (expandFill)">
<template #preview>
<div style="width: 560px;">
  <TxGroupBlock name="功能" icon="i-carbon-star" expand-fill>
    <div style="padding: 12px;">内容</div>
  </TxGroupBlock>
</div>
</template>

<template #code>
```vue
<template>
  <TxGroupBlock name="功能" icon="i-carbon-star" expand-fill>
    <p>内容</p>
  </TxGroupBlock>
</template>
```
</template>
</DemoBlock>

---

# BlockLine 块行

用于显示标题和描述的简单行项目。

## 基础用法

```vue
<template>
  <TxBlockLine title="版本" description="1.0.0" />
  <TxBlockLine title="构建日期" description="2024.01.15" />
</template>
```

## 链接样式

显示为可点击的链接。

```vue
<template>
  <TxBlockLine title="查看文档" link @click="openDocs" />
</template>
```

---

# BlockSlot 块插槽

带有图标、标题、描述和自定义控件插槽的块容器。

## 基础用法

```vue
<template>
  <TxBlockSlot 
    title="主题" 
    description="选择您偏好的主题" 
    icon="i-carbon-color-palette"
  >
    <select v-model="theme">
      <option value="light">浅色</option>
      <option value="dark">深色</option>
      <option value="auto">自动</option>
    </select>
  </TxBlockSlot>
</template>
```

## 自定义标签

```vue
<template>
  <TxBlockSlot icon="i-carbon-user">
    <template #label>
      <h3>自定义标题 <span style="color: red">*</span></h3>
      <p>必填字段</p>
    </template>
    <input type="text" />
  </TxBlockSlot>
</template>
```

---

# BlockSwitch 块开关

带有集成开关控件的块容器。

## 基础用法

<DemoBlock title="BlockSwitch">
<template #preview>
<div style="width: 560px;">
  <TxBlockSwitch
    v-model="enabled"
    title="深色模式"
    description="启用深色主题"
    icon="i-carbon-moon"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxBlockSwitch v-model="enabled" title="深色模式" description="启用深色主题" icon="i-carbon-moon" />
</template>
```
</template>
</DemoBlock>

## 禁用状态

```vue
<template>
  <TxBlockSwitch 
    v-model="value" 
    title="高级功能" 
    description="需要订阅" 
    icon="i-carbon-locked" 
    disabled 
  />
</template>
```

## 引导模式

显示为导航项而非开关。


<DemoBlock title="BlockSwitch (guidance)">
<template #preview>
<div style="width: 560px;">
  <TxBlockSwitch
    v-model="dummy"
    title="隐私设置"
    description="管理您的隐私选项"
    icon="i-carbon-security"
    guidance
    @click="() => {}"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxBlockSwitch v-model="dummy" title="隐私设置" description="管理您的隐私选项" icon="i-carbon-security" guidance />
</template>
```
</template>
</DemoBlock>

---

## API

### TxGroupBlock 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `name` | `string` | *必填* | 分组标题 |
| `icon` | `string` | `''` | 图标类名 |
| `description` | `string` | `''` | 描述文本 |
| `expandFill` | `boolean` | `false` | 展开时使用填充图标 |
| `shrink` | `boolean` | `false` | 初始为折叠状态 |

### TxGroupBlock 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `update:expanded` | `expanded: boolean` | 展开状态变化时触发 |
| `toggle` | - | 点击头部时触发 |

### TxBlockLine 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `title` | `string` | `''` | 标题文本 |
| `description` | `string` | `''` | 描述文本 |
| `link` | `boolean` | `false` | 显示为链接样式 |

### TxBlockSlot 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `title` | `string` | *必填* | 标题文本 |
| `description` | `string` | *必填* | 描述文本 |
| `icon` | `string` | *必填* | 图标类名 |
| `disabled` | `boolean` | `false` | 禁用交互 |

### TxBlockSwitch 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `modelValue` | `boolean` | *必填* | 开关值 (v-model) |
| `title` | `string` | *必填* | 标题文本 |
| `description` | `string` | *必填* | 描述文本 |
| `icon` | `string` | *必填* | 图标类名 |
| `disabled` | `boolean` | `false` | 禁用开关 |
| `guidance` | `boolean` | `false` | 显示为导航项 |

### TxBlockSwitch 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `update:modelValue` | `value: boolean` | 值变化时触发 |
| `change` | `value: boolean` | 值变化时触发 |
