# Card 卡片

卡片是承载内容和操作的容器组件。TouchX UI 的卡片组件采用玻璃态设计，提供优雅的视觉层次和丰富的交互效果。

## 基础用法

最简单的卡片用法：

```vue
<template>
  <TxCard>
    <p>这是一个基础卡片，包含简单的内容。</p>
  </TxCard>
</template>
```

## 卡片结构

### 完整结构
卡片支持头部、内容和底部三个区域：

```vue
<template>
  <TxCard>
    <template #header>
      <div class="card-header">
        <h3>卡片标题</h3>
        <TxButton type="text" icon="more" />
      </div>
    </template>
    
    <div class="card-content">
      <p>这里是卡片的主要内容区域。</p>
      <p>可以包含任意的内容和组件。</p>
    </div>
    
    <template #footer>
      <div class="card-actions">
        <TxButton type="secondary">取消</TxButton>
        <TxButton type="primary">确认</TxButton>
      </div>
    </template>
  </TxCard>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>
```

### 简化结构
只使用需要的部分：

```vue
<template>
  <!-- 只有标题和内容 -->
  <TxCard title="简单卡片">
    <p>卡片内容</p>
  </TxCard>
  
  <!-- 只有内容和底部 -->
  <TxCard>
    <p>卡片内容</p>
    <template #footer>
      <TxButton type="primary">操作</TxButton>
    </template>
  </TxCard>
</template>
```

## 卡片样式

### 基础样式
```vue
<template>
  <div class="card-styles">
    <TxCard variant="default">默认卡片</TxCard>
    <TxCard variant="outlined">轮廓卡片</TxCard>
    <TxCard variant="elevated">悬浮卡片</TxCard>
    <TxCard variant="glass">玻璃态卡片</TxCard>
  </div>
</template>
```

### 颜色主题
```vue
<template>
  <div class="card-themes">
    <TxCard color="primary">主色调卡片</TxCard>
    <TxCard color="success">成功主题卡片</TxCard>
    <TxCard color="warning">警告主题卡片</TxCard>
    <TxCard color="danger">危险主题卡片</TxCard>
  </div>
</template>
```

## 交互效果

### 悬停效果
```vue
<template>
  <TxCard hoverable>
    <h3>可悬停卡片</h3>
    <p>鼠标悬停时会有动画效果</p>
  </TxCard>
</template>
```

### 可点击卡片
```vue
<template>
  <TxCard 
    clickable
    @click="handleCardClick"
  >
    <h3>可点击卡片</h3>
    <p>点击整个卡片区域都会触发事件</p>
  </TxCard>
</template>

<script setup>
const handleCardClick = () => {
  console.log('卡片被点击了')
}
</script>
```

### 选中状态
```vue
<template>
  <TxCard 
    :selected="isSelected"
    @click="isSelected = !isSelected"
  >
    <h3>可选择卡片</h3>
    <p>点击切换选中状态</p>
  </TxCard>
</template>

<script setup>
import { ref } from 'vue'

const isSelected = ref(false)
</script>
```

## 卡片尺寸

### 预设尺寸
```vue
<template>
  <div class="card-sizes">
    <TxCard size="small">小尺寸卡片</TxCard>
    <TxCard size="medium">中等尺寸卡片</TxCard>
    <TxCard size="large">大尺寸卡片</TxCard>
  </div>
</template>
```

### 自定义尺寸
```vue
<template>
  <TxCard 
    :width="400"
    :height="300"
  >
    <h3>自定义尺寸</h3>
    <p>400px × 300px</p>
  </TxCard>
</template>
```

## 特殊卡片

### 图片卡片
```vue
<template>
  <TxCard class="image-card">
    <template #cover>
      <img 
        src="/card-image.jpg" 
        alt="卡片图片"
        class="card-image"
      />
    </template>
    
    <h3>图片卡片</h3>
    <p>带有封面图片的卡片样式</p>
    
    <template #footer>
      <TxButton type="primary">查看详情</TxButton>
    </template>
  </TxCard>
</template>

<style scoped>
.card-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
}
</style>
```

### 统计卡片
```vue
<template>
  <TxCard class="stat-card">
    <div class="stat-content">
      <div class="stat-icon">
        <TxIcon name="users" size="large" color="primary" />
      </div>
      <div class="stat-info">
        <div class="stat-value">1,234</div>
        <div class="stat-label">总用户数</div>
        <div class="stat-trend">
          <TxIcon name="trending-up" size="small" color="success" />
          <span class="trend-text">+12%</span>
        </div>
      </div>
    </div>
  </TxCard>
</template>

<style scoped>
.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: var(--tx-text-primary);
}

.stat-label {
  color: var(--tx-text-secondary);
  margin-bottom: 4px;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 4px;
}

.trend-text {
  color: var(--tx-color-success);
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
```

### 产品卡片
```vue
<template>
  <TxCard class="product-card">
    <template #cover>
      <div class="product-image">
        <img src="/product.jpg" alt="产品图片" />
        <div class="product-badge">热销</div>
      </div>
    </template>
    
    <div class="product-info">
      <h3 class="product-title">产品名称</h3>
      <p class="product-description">产品的简短描述信息</p>
      <div class="product-price">
        <span class="current-price">¥299</span>
        <span class="original-price">¥399</span>
      </div>
    </div>
    
    <template #footer>
      <TxButton type="outline" icon="heart">收藏</TxButton>
      <TxButton type="primary" icon="shopping-cart">加入购物车</TxButton>
    </template>
  </TxCard>
</template>

<style scoped>
.product-image {
  position: relative;
  height: 200px;
  overflow: hidden;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--tx-color-danger);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.product-title {
  margin: 0 0 8px 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.product-description {
  color: var(--tx-text-secondary);
  margin-bottom: 12px;
}

.product-price {
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-price {
  font-size: 1.25rem;
  font-weight: bold;
  color: var(--tx-color-danger);
}

.original-price {
  text-decoration: line-through;
  color: var(--tx-text-secondary);
}
</style>
```

## 卡片布局

### 卡片网格
```vue
<template>
  <div class="card-grid">
    <TxCard v-for="item in items" :key="item.id">
      <h3>{{ item.title }}</h3>
      <p>{{ item.description }}</p>
    </TxCard>
  </div>
</template>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}
</style>
```

### 响应式布局
```vue
<template>
  <div class="responsive-cards">
    <TxCard 
      v-for="card in cards" 
      :key="card.id"
      class="responsive-card"
    >
      <h3>{{ card.title }}</h3>
      <p>{{ card.content }}</p>
    </TxCard>
  </div>
</template>

<style scoped>
.responsive-cards {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .responsive-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }
}

@media (min-width: 1024px) {
  .responsive-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | `string` | - | 卡片标题 |
| variant | `'default' \| 'outlined' \| 'elevated' \| 'glass'` | `'default'` | 卡片样式变体 |
| color | `'default' \| 'primary' \| 'success' \| 'warning' \| 'danger'` | `'default'` | 卡片颜色主题 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 卡片尺寸 |
| width | `number \| string` | - | 卡片宽度 |
| height | `number \| string` | - | 卡片高度 |
| hoverable | `boolean` | `false` | 是否启用悬停效果 |
| clickable | `boolean` | `false` | 是否可点击 |
| selected | `boolean` | `false` | 是否选中 |
| loading | `boolean` | `false` | 是否显示加载状态 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击卡片时触发 |
| hover | `(event: MouseEvent)` | 鼠标悬停时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 卡片主要内容 |
| header | 卡片头部内容 |
| footer | 卡片底部内容 |
| cover | 卡片封面内容 |
| loading | 自定义加载状态 |

## 样式定制

### CSS 变量

```css
.custom-card {
  --tx-card-padding: 24px;
  --tx-card-border-radius: 16px;
  --tx-card-background: rgba(255, 255, 255, 0.1);
  --tx-card-border: 1px solid rgba(255, 255, 255, 0.2);
  --tx-card-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  --tx-card-backdrop-filter: blur(12px);
}
```

### 主题定制

```css
:root {
  /* 卡片基础样式 */
  --tx-card-background: var(--tx-color-background);
  --tx-card-border-color: var(--tx-color-border);
  --tx-card-shadow-color: rgba(0, 0, 0, 0.1);
  
  /* 悬停效果 */
  --tx-card-hover-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  --tx-card-hover-transform: translateY(-4px);
  
  /* 选中状态 */
  --tx-card-selected-border: var(--tx-color-primary);
  --tx-card-selected-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
```

## 最佳实践

### 使用建议

1. **内容组织**：合理使用头部、内容、底部区域
2. **交互反馈**：为可交互卡片提供明确的视觉反馈
3. **信息层次**：通过字体大小和颜色建立清晰的信息层次
4. **响应式设计**：确保卡片在不同屏幕尺寸下都能良好显示

### 无障碍设计

```vue
<template>
  <!-- 可点击卡片 -->
  <TxCard 
    clickable
    role="button"
    tabindex="0"
    aria-label="产品详情卡片"
    @click="viewProduct"
    @keydown.enter="viewProduct"
    @keydown.space="viewProduct"
  >
    <h3>产品名称</h3>
    <p>产品描述</p>
  </TxCard>
  
  <!-- 信息卡片 -->
  <TxCard role="article" aria-labelledby="card-title">
    <h3 id="card-title">文章标题</h3>
    <p>文章内容</p>
  </TxCard>
</template>
```

TouchX UI 的卡片组件提供了灵活的内容组织方式和优雅的视觉效果，是构建现代界面的重要基础组件。
