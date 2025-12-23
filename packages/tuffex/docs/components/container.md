# Container 容器

容器组件是页面布局的基础，提供了灵活的布局选项和响应式设计支持。TouchX UI 的容器组件帮助您快速构建结构化的页面布局。

## 基础用法

最简单的容器用法：

```vue
<template>
  <TxContainer>
    <p>这是容器内的内容</p>
  </TxContainer>
</template>
```

## 容器类型

### 流体容器
占满整个父容器的宽度：

```vue
<template>
  <TxContainer fluid>
    <p>流体容器，宽度100%</p>
  </TxContainer>
</template>
```

### 固定宽度容器
根据断点设置最大宽度：

```vue
<template>
  <TxContainer max-width="1200px">
    <p>最大宽度1200px的容器</p>
  </TxContainer>
</template>
```

### 响应式容器
在不同断点下有不同的最大宽度：

```vue
<template>
  <TxContainer responsive>
    <p>响应式容器</p>
  </TxContainer>
</template>
```

## 容器间距

### 内边距
```vue
<template>
  <div class="padding-demo">
    <TxContainer padding="small">小间距容器</TxContainer>
    <TxContainer padding="medium">中等间距容器</TxContainer>
    <TxContainer padding="large">大间距容器</TxContainer>
    <TxContainer :padding="32">自定义间距容器</TxContainer>
  </div>
</template>
```

### 外边距
```vue
<template>
  <TxContainer margin="auto">
    <p>水平居中的容器</p>
  </TxContainer>
</template>
```

## 栅格系统

### 基础栅格
```vue
<template>
  <TxContainer>
    <TxRow>
      <TxCol :span="12">
        <div class="col-content">左侧内容</div>
      </TxCol>
      <TxCol :span="12">
        <div class="col-content">右侧内容</div>
      </TxCol>
    </TxRow>
  </TxContainer>
</template>

<style scoped>
.col-content {
  background: var(--tx-color-surface);
  padding: 16px;
  text-align: center;
  border-radius: 8px;
}
</style>
```

### 栅格间距
```vue
<template>
  <TxContainer>
    <TxRow :gutter="24">
      <TxCol :span="8">
        <div class="col-content">列1</div>
      </TxCol>
      <TxCol :span="8">
        <div class="col-content">列2</div>
      </TxCol>
      <TxCol :span="8">
        <div class="col-content">列3</div>
      </TxCol>
    </TxRow>
  </TxContainer>
</template>
```

### 响应式栅格
```vue
<template>
  <TxContainer>
    <TxRow :gutter="{ xs: 8, sm: 16, md: 24, lg: 32 }">
      <TxCol :xs="24" :sm="12" :md="8" :lg="6">
        <div class="col-content">响应式列1</div>
      </TxCol>
      <TxCol :xs="24" :sm="12" :md="8" :lg="6">
        <div class="col-content">响应式列2</div>
      </TxCol>
      <TxCol :xs="24" :sm="12" :md="8" :lg="6">
        <div class="col-content">响应式列3</div>
      </TxCol>
      <TxCol :xs="24" :sm="12" :md="8" :lg="6">
        <div class="col-content">响应式列4</div>
      </TxCol>
    </TxRow>
  </TxContainer>
</template>
```

## 布局组合

### 页面布局
```vue
<template>
  <div class="page-layout">
    <!-- 页头 -->
    <TxContainer class="header" fluid>
      <TxRow align="middle" justify="space-between">
        <TxCol>
          <div class="logo">Logo</div>
        </TxCol>
        <TxCol>
          <nav class="nav">导航菜单</nav>
        </TxCol>
      </TxRow>
    </TxContainer>
    
    <!-- 主要内容 -->
    <TxContainer class="main-content">
      <TxRow :gutter="32">
        <TxCol :span="18">
          <main>主要内容区域</main>
        </TxCol>
        <TxCol :span="6">
          <aside>侧边栏</aside>
        </TxCol>
      </TxRow>
    </TxContainer>
    
    <!-- 页脚 -->
    <TxContainer class="footer" fluid>
      <footer>页脚内容</footer>
    </TxContainer>
  </div>
</template>

<style scoped>
.header {
  background: var(--tx-color-surface);
  padding: 16px 0;
  border-bottom: 1px solid var(--tx-color-border);
}

.main-content {
  min-height: 500px;
  padding: 32px 0;
}

.footer {
  background: var(--tx-color-surface);
  padding: 24px 0;
  border-top: 1px solid var(--tx-color-border);
  text-align: center;
}
</style>
```

### 卡片布局
```vue
<template>
  <TxContainer>
    <TxRow :gutter="24">
      <TxCol :xs="24" :sm="12" :lg="8" v-for="item in items" :key="item.id">
        <TxCard>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </TxCard>
      </TxCol>
    </TxRow>
  </TxContainer>
</template>
```

## API 参考

### Container Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| fluid | `boolean` | `false` | 是否为流体容器 |
| maxWidth | `string \| number` | - | 最大宽度 |
| responsive | `boolean` | `false` | 是否响应式 |
| padding | `'small' \| 'medium' \| 'large' \| number` | `'medium'` | 内边距 |
| margin | `'auto' \| string \| number` | - | 外边距 |

### Row Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| gutter | `number \| object` | `0` | 栅格间距 |
| align | `'top' \| 'middle' \| 'bottom'` | `'top'` | 垂直对齐方式 |
| justify | `'start' \| 'end' \| 'center' \| 'space-around' \| 'space-between'` | `'start'` | 水平对齐方式 |
| wrap | `boolean` | `true` | 是否换行 |

### Col Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| span | `number` | `24` | 栅格占据的列数 |
| offset | `number` | `0` | 栅格左侧的间隔格数 |
| push | `number` | `0` | 栅格向右移动格数 |
| pull | `number` | `0` | 栅格向左移动格数 |
| xs | `number \| object` | - | 超小屏幕 (<576px) |
| sm | `number \| object` | - | 小屏幕 (≥576px) |
| md | `number \| object` | - | 中等屏幕 (≥768px) |
| lg | `number \| object` | - | 大屏幕 (≥992px) |
| xl | `number \| object` | - | 超大屏幕 (≥1200px) |
| xxl | `number \| object` | - | 超超大屏幕 (≥1600px) |

## 响应式断点

TouchX UI 使用以下断点：

```css
/* 超小屏幕 */
@media (max-width: 575px) { /* xs */ }

/* 小屏幕 */
@media (min-width: 576px) { /* sm */ }

/* 中等屏幕 */
@media (min-width: 768px) { /* md */ }

/* 大屏幕 */
@media (min-width: 992px) { /* lg */ }

/* 超大屏幕 */
@media (min-width: 1200px) { /* xl */ }

/* 超超大屏幕 */
@media (min-width: 1600px) { /* xxl */ }
```

## 样式定制

### CSS 变量

```css
.custom-container {
  --tx-container-max-width-sm: 540px;
  --tx-container-max-width-md: 720px;
  --tx-container-max-width-lg: 960px;
  --tx-container-max-width-xl: 1140px;
  --tx-container-max-width-xxl: 1320px;
  
  --tx-container-padding-small: 12px;
  --tx-container-padding-medium: 24px;
  --tx-container-padding-large: 48px;
}
```

## 最佳实践

### 使用建议

1. **响应式优先**：优先使用响应式栅格系统
2. **语义化布局**：使用语义化的HTML标签
3. **合理间距**：保持一致的间距规范
4. **性能考虑**：避免过度嵌套容器

### 常见布局模式

```vue
<template>
  <!-- 居中布局 -->
  <TxContainer max-width="800px" margin="auto">
    <div class="content">居中内容</div>
  </TxContainer>
  
  <!-- 两栏布局 -->
  <TxContainer>
    <TxRow :gutter="32">
      <TxCol :span="16">主内容</TxCol>
      <TxCol :span="8">侧边栏</TxCol>
    </TxRow>
  </TxContainer>
  
  <!-- 三栏布局 -->
  <TxContainer>
    <TxRow :gutter="24">
      <TxCol :span="6">左侧栏</TxCol>
      <TxCol :span="12">主内容</TxCol>
      <TxCol :span="6">右侧栏</TxCol>
    </TxRow>
  </TxContainer>
</template>
```

TouchX UI 的容器组件提供了灵活强大的布局能力，帮助您快速构建响应式的页面结构。
