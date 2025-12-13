# Input 输入框

输入框是表单中最基础的组件之一。TouchX UI 的输入框提供了优雅的聚焦动画、丰富的验证状态和多样的输入类型支持。

## 基础用法

最简单的输入框用法：

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

### 文本输入
```vue
<template>
  <div class="input-types">
    <TxInput v-model="text" type="text" placeholder="文本输入" />
    <TxInput v-model="password" type="password" placeholder="密码输入" />
    <TxInput v-model="email" type="email" placeholder="邮箱输入" />
    <TxInput v-model="number" type="number" placeholder="数字输入" />
    <TxInput v-model="tel" type="tel" placeholder="电话输入" />
    <TxInput v-model="url" type="url" placeholder="网址输入" />
  </div>
</template>
```

### 搜索输入
```vue
<template>
  <TxInput 
    v-model="searchQuery"
    type="search" 
    placeholder="搜索内容"
    prefix-icon="search"
    clearable
  />
</template>
```

### 文本域
```vue
<template>
  <TxInput 
    v-model="content"
    type="textarea" 
    placeholder="请输入多行内容"
    :rows="4"
    resize="vertical"
  />
</template>
```

## 输入框尺寸

提供多种尺寸规格：

```vue
<template>
  <div class="size-demo">
    <TxInput v-model="value1" size="small" placeholder="小尺寸" />
    <TxInput v-model="value2" size="medium" placeholder="中等尺寸" />
    <TxInput v-model="value3" size="large" placeholder="大尺寸" />
  </div>
</template>
```

## 前缀和后缀

### 图标前缀后缀
```vue
<template>
  <div class="affix-demo">
    <TxInput 
      v-model="username"
      prefix-icon="user" 
      placeholder="用户名"
    />
    <TxInput 
      v-model="amount"
      suffix-icon="dollar" 
      placeholder="金额"
    />
    <TxInput 
      v-model="search"
      prefix-icon="search"
      suffix-icon="close"
      placeholder="搜索"
    />
  </div>
</template>
```

### 文字前缀后缀
```vue
<template>
  <div class="text-affix-demo">
    <TxInput 
      v-model="website"
      prefix="https://"
      suffix=".com"
      placeholder="网站地址"
    />
    <TxInput 
      v-model="price"
      prefix="¥"
      suffix="元"
      placeholder="价格"
    />
  </div>
</template>
```

### 自定义前缀后缀
```vue
<template>
  <TxInput v-model="value" placeholder="自定义前后缀">
    <template #prefix>
      <TxSelect v-model="countryCode" style="width: 80px;">
        <TxOption value="+86">+86</TxOption>
        <TxOption value="+1">+1</TxOption>
        <TxOption value="+44">+44</TxOption>
      </TxSelect>
    </template>
    
    <template #suffix>
      <TxButton type="text" size="small">发送</TxButton>
    </template>
  </TxInput>
</template>
```

## 输入框状态

### 禁用状态
```vue
<template>
  <TxInput 
    v-model="value"
    disabled
    placeholder="禁用状态"
  />
</template>
```

### 只读状态
```vue
<template>
  <TxInput 
    v-model="value"
    readonly
    placeholder="只读状态"
  />
</template>
```

### 加载状态
```vue
<template>
  <TxInput 
    v-model="value"
    loading
    placeholder="加载中..."
  />
</template>
```

## 验证状态

### 成功状态
```vue
<template>
  <TxInput 
    v-model="value"
    status="success"
    message="输入正确"
    placeholder="成功状态"
  />
</template>
```

### 警告状态
```vue
<template>
  <TxInput 
    v-model="value"
    status="warning"
    message="请注意格式"
    placeholder="警告状态"
  />
</template>
```

### 错误状态
```vue
<template>
  <TxInput 
    v-model="value"
    status="error"
    message="输入格式不正确"
    placeholder="错误状态"
  />
</template>
```

## 特殊功能

### 可清空
```vue
<template>
  <TxInput 
    v-model="value"
    clearable
    placeholder="可清空输入框"
  />
</template>
```

### 显示密码
```vue
<template>
  <TxInput 
    v-model="password"
    type="password"
    show-password
    placeholder="密码输入"
  />
</template>
```

### 字数统计
```vue
<template>
  <TxInput 
    v-model="content"
    type="textarea"
    :maxlength="200"
    show-count
    placeholder="请输入内容"
  />
</template>
```

### 自动完成
```vue
<template>
  <TxInput 
    v-model="value"
    :suggestions="suggestions"
    placeholder="输入城市名称"
    @search="handleSearch"
  />
</template>

<script setup>
import { ref } from 'vue'

const value = ref('')
const suggestions = ref([])

const handleSearch = (query) => {
  // 模拟搜索建议
  suggestions.value = [
    '北京市',
    '上海市',
    '广州市',
    '深圳市'
  ].filter(city => city.includes(query))
}
</script>
```

## 输入框组合

### 输入框组
```vue
<template>
  <TxInputGroup>
    <TxInput v-model="firstName" placeholder="姓" />
    <TxInput v-model="lastName" placeholder="名" />
  </TxInputGroup>
</template>
```

### 带按钮的输入框
```vue
<template>
  <TxInputGroup>
    <TxInput 
      v-model="searchQuery" 
      placeholder="搜索内容"
      @keydown.enter="handleSearch"
    />
    <TxButton type="primary" @click="handleSearch">
      搜索
    </TxButton>
  </TxInputGroup>
</template>
```

### 复合输入框
```vue
<template>
  <TxInputGroup>
    <TxSelect v-model="protocol" style="width: 100px;">
      <TxOption value="http">HTTP</TxOption>
      <TxOption value="https">HTTPS</TxOption>
    </TxSelect>
    <TxInput v-model="domain" placeholder="域名" />
    <TxInput v-model="port" placeholder="端口" style="width: 80px;" />
  </TxInputGroup>
</template>
```

## 表单集成

### 带标签的输入框
```vue
<template>
  <div class="form-item">
    <label for="username" class="form-label">用户名</label>
    <TxInput 
      id="username"
      v-model="username"
      placeholder="请输入用户名"
      required
    />
  </div>
</template>
```

### 表单验证
```vue
<template>
  <TxForm :model="form" :rules="rules">
    <TxFormItem label="邮箱" prop="email">
      <TxInput 
        v-model="form.email"
        type="email"
        placeholder="请输入邮箱"
      />
    </TxFormItem>
    
    <TxFormItem label="密码" prop="password">
      <TxInput 
        v-model="form.password"
        type="password"
        show-password
        placeholder="请输入密码"
      />
    </TxFormItem>
  </TxForm>
</template>

<script setup>
import { reactive } from 'vue'

const form = reactive({
  email: '',
  password: ''
})

const rules = {
  email: [
    { required: true, message: '请输入邮箱' },
    { type: 'email', message: '邮箱格式不正确' }
  ],
  password: [
    { required: true, message: '请输入密码' },
    { min: 6, message: '密码长度至少6位' }
  ]
}
</script>
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| modelValue | `string \| number` | - | 输入框的值 |
| type | `string` | `'text'` | 输入框类型 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 输入框尺寸 |
| placeholder | `string` | - | 占位符文本 |
| disabled | `boolean` | `false` | 是否禁用 |
| readonly | `boolean` | `false` | 是否只读 |
| loading | `boolean` | `false` | 是否显示加载状态 |
| clearable | `boolean` | `false` | 是否可清空 |
| showPassword | `boolean` | `false` | 是否显示密码切换按钮 |
| showCount | `boolean` | `false` | 是否显示字数统计 |
| maxlength | `number` | - | 最大输入长度 |
| prefixIcon | `string` | - | 前缀图标 |
| suffixIcon | `string` | - | 后缀图标 |
| prefix | `string` | - | 前缀文本 |
| suffix | `string` | - | 后缀文本 |
| status | `'success' \| 'warning' \| 'error'` | - | 验证状态 |
| message | `string` | - | 提示信息 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| update:modelValue | `(value: string \| number)` | 值改变时触发 |
| input | `(event: Event)` | 输入时触发 |
| change | `(event: Event)` | 值改变时触发 |
| focus | `(event: FocusEvent)` | 获得焦点时触发 |
| blur | `(event: FocusEvent)` | 失去焦点时触发 |
| clear | `()` | 清空时触发 |
| search | `(value: string)` | 搜索时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| prefix | 自定义前缀内容 |
| suffix | 自定义后缀内容 |

## 样式定制

### CSS 变量

```css
.custom-input {
  --tx-input-height: 48px;
  --tx-input-padding: 12px 16px;
  --tx-input-border-radius: 8px;
  --tx-input-border-color: #d1d5db;
  --tx-input-focus-border-color: var(--tx-color-primary);
  --tx-input-background: #ffffff;
  --tx-input-placeholder-color: #9ca3af;
}
```

TouchX UI 的输入框组件提供了丰富的功能和优雅的交互体验，是构建表单的重要基础组件。
