# Input 输入框

Input 输入框组件用于接收用户输入，支持多种类型和状态，具有流畅的动画效果和现代化的设计风格。

## 基础用法

最简单的输入框使用：

```vue
<template>
  <div class="input-demo">
    <TxInput v-model="value" placeholder="请输入内容" />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
</script>
```

## 输入框类型

支持多种 HTML5 输入类型：

```vue
<template>
  <div class="input-types">
    <TxInput type="text" placeholder="文本输入" />
    <TxInput type="password" placeholder="密码输入" />
    <TxInput type="email" placeholder="邮箱输入" />
    <TxInput type="number" placeholder="数字输入" />
    <TxInput type="tel" placeholder="电话输入" />
    <TxInput type="url" placeholder="网址输入" />
  </div>
</template>
```

## 输入框尺寸

提供多种预设尺寸：

```vue
<template>
  <div class="input-sizes">
    <TxInput size="small" placeholder="小尺寸" />
    <TxInput size="medium" placeholder="中等尺寸" />
    <TxInput size="large" placeholder="大尺寸" />
  </div>
</template>
```

## 输入框状态

不同的输入框状态：

```vue
<template>
  <div class="input-states">
    <TxInput placeholder="默认状态" />
    <TxInput placeholder="禁用状态" disabled />
    <TxInput placeholder="只读状态" readonly />
    <TxInput placeholder="错误状态" error />
    <TxInput placeholder="成功状态" success />
  </div>
</template>
```

## 带图标的输入框

在输入框前后添加图标：

```vue
<template>
  <div class="input-icons">
    <TxInput placeholder="搜索">
      <template #prefix>
        <TxIcon name="search" />
      </template>
    </TxInput>
    
    <TxInput placeholder="用户名">
      <template #suffix>
        <TxIcon name="user" />
      </template>
    </TxInput>
    
    <TxInput type="password" placeholder="密码">
      <template #prefix>
        <TxIcon name="lock" />
      </template>
      <template #suffix>
        <TxIcon name="eye" />
      </template>
    </TxInput>
  </div>
</template>
```

## 带标签的输入框

添加输入框标签：

```vue
<template>
  <div class="input-labels">
    <TxInput 
      v-model="username"
      label="用户名"
      placeholder="请输入用户名"
    />
    
    <TxInput 
      v-model="email"
      label="邮箱地址"
      type="email"
      placeholder="请输入邮箱"
      required
    />
  </div>
</template>
```

## 带帮助文本的输入框

添加帮助文本和错误提示：

```vue
<template>
  <div class="input-help">
    <TxInput 
      v-model="password"
      type="password"
      label="密码"
      placeholder="请输入密码"
      help-text="密码长度至少8位，包含字母和数字"
      :error="passwordError"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const password = ref('')

const passwordError = computed(() => {
  if (password.value && password.value.length < 8) {
    return '密码长度不能少于8位'
  }
  return ''
})
</script>
```

## 可清空的输入框

添加清空按钮：

```vue
<template>
  <TxInput 
    v-model="value"
    placeholder="可清空的输入框"
    clearable
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
</script>
```

## 密码输入框

带显示/隐藏密码功能：

```vue
<template>
  <TxInput 
    v-model="password"
    type="password"
    placeholder="请输入密码"
    show-password
  />
</template>

<script setup>
import { ref } from 'vue'

const password = ref('')
</script>
```

## 文本域

多行文本输入：

```vue
<template>
  <div class="textarea-demo">
    <TxInput 
      v-model="content"
      type="textarea"
      placeholder="请输入多行文本"
      :rows="4"
      resize="vertical"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const content = ref('')
</script>
```

## 字符计数

显示输入字符数量：

```vue
<template>
  <TxInput 
    v-model="message"
    placeholder="请输入消息"
    :maxlength="100"
    show-count
  />
</template>

<script setup>
import { ref } from 'vue'

const message = ref('')
</script>
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| modelValue | `string \| number` | - | 绑定值 |
| type | `string` | `'text'` | 输入框类型 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 输入框尺寸 |
| placeholder | `string` | - | 占位符文本 |
| disabled | `boolean` | `false` | 是否禁用 |
| readonly | `boolean` | `false` | 是否只读 |
| clearable | `boolean` | `false` | 是否可清空 |
| showPassword | `boolean` | `false` | 是否显示密码切换按钮 |
| showCount | `boolean` | `false` | 是否显示字符计数 |
| maxlength | `number` | - | 最大输入长度 |
| minlength | `number` | - | 最小输入长度 |
| label | `string` | - | 输入框标签 |
| helpText | `string` | - | 帮助文本 |
| error | `string \| boolean` | `false` | 错误状态或错误信息 |
| success | `boolean` | `false` | 成功状态 |
| required | `boolean` | `false` | 是否必填 |
| rows | `number` | `3` | 文本域行数 |
| resize | `'none' \| 'both' \| 'horizontal' \| 'vertical'` | `'vertical'` | 文本域缩放方向 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| update:modelValue | `(value: string \| number)` | 输入值变化时触发 |
| input | `(event: Event)` | 输入时触发 |
| change | `(event: Event)` | 值改变时触发 |
| focus | `(event: FocusEvent)` | 获得焦点时触发 |
| blur | `(event: FocusEvent)` | 失去焦点时触发 |
| clear | `()` | 点击清空按钮时触发 |
| keydown | `(event: KeyboardEvent)` | 按键按下时触发 |
| keyup | `(event: KeyboardEvent)` | 按键释放时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| prefix | 输入框前置内容 |
| suffix | 输入框后置内容 |
| prepend | 输入框前置元素 |
| append | 输入框后置元素 |

### Methods

| 方法名 | 参数 | 说明 |
|--------|------|------|
| focus | `()` | 使输入框获得焦点 |
| blur | `()` | 使输入框失去焦点 |
| select | `()` | 选中输入框文本 |
| clear | `()` | 清空输入框内容 |

## 样式定制

### CSS 变量

```css
.custom-input {
  --tx-input-height: 40px;
  --tx-input-padding: 0 12px;
  --tx-input-border-radius: 8px;
  --tx-input-border: 1px solid #d9d9d9;
  --tx-input-border-hover: 1px solid #40a9ff;
  --tx-input-border-focus: 1px solid #1890ff;
  --tx-input-background: #fff;
  --tx-input-color: #333;
  --tx-input-placeholder-color: #999;
  --tx-input-shadow-focus: 0 0 0 2px rgba(24, 144, 255, 0.2);
}
```

### 主题定制

```css
:root {
  /* 输入框尺寸 */
  --tx-input-height-small: 32px;
  --tx-input-height-medium: 40px;
  --tx-input-height-large: 48px;
  
  /* 输入框颜色 */
  --tx-input-border-color: var(--tx-color-border);
  --tx-input-border-color-hover: var(--tx-color-primary-light);
  --tx-input-border-color-focus: var(--tx-color-primary);
  --tx-input-background: var(--tx-color-background);
  --tx-input-color: var(--tx-color-text);
  
  /* 状态颜色 */
  --tx-input-border-color-error: var(--tx-color-danger);
  --tx-input-border-color-success: var(--tx-color-success);
}
```

## 最佳实践

### 表单验证

```vue
<template>
  <form @submit.prevent="handleSubmit">
    <TxInput 
      v-model="form.username"
      label="用户名"
      placeholder="请输入用户名"
      :error="errors.username"
      required
    />
    
    <TxInput 
      v-model="form.email"
      type="email"
      label="邮箱"
      placeholder="请输入邮箱"
      :error="errors.email"
      required
    />
    
    <TxButton type="submit">提交</TxButton>
  </form>
</template>

<script setup>
import { ref, reactive } from 'vue'

const form = reactive({
  username: '',
  email: ''
})

const errors = reactive({
  username: '',
  email: ''
})

const handleSubmit = () => {
  // 表单验证逻辑
  validateForm()
}

const validateForm = () => {
  errors.username = form.username ? '' : '用户名不能为空'
  errors.email = form.email ? '' : '邮箱不能为空'
}
</script>
```

TouchX UI 的 Input 组件提供了丰富的功能和优雅的交互体验，适用于各种表单场景。
