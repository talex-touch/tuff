# Card 卡片

Card 卡片组件是一个通用的内容容器，具有玻璃拟态效果，适用于展示各种类型的信息和内容。

## 基础用法

最简单的卡片使用：

```vue
<template>
  <TxCard>
    <h3>卡片标题</h3>
    <p>这是卡片的内容区域，可以放置任何内容。</p>
  </TxCard>
</template>
```

## 带标题的卡片

使用 header 插槽添加卡片标题：

```vue
<template>
  <TxCard>
    <template #header>
      <h3>卡片标题</h3>
    </template>
    <p>卡片内容区域</p>
  </TxCard>
</template>
```

## 带操作按钮的卡片

在卡片底部添加操作按钮：

```vue
<template>
  <TxCard>
    <template #header>
      <h3>用户信息</h3>
    </template>
    
    <div class="user-info">
      <TxAvatar src="avatar.jpg" />
      <div>
        <h4>张三</h4>
        <p>前端开发工程师</p>
      </div>
    </div>
    
    <template #footer>
      <TxButton variant="primary">编辑</TxButton>
      <TxButton variant="outline">删除</TxButton>
    </template>
  </TxCard>
</template>
```

## 卡片变体

提供不同的视觉样式：

```vue
<template>
  <div class="card-variants">
    <TxCard variant="default">默认卡片</TxCard>
    <TxCard variant="outlined">边框卡片</TxCard>
    <TxCard variant="elevated">阴影卡片</TxCard>
    <TxCard variant="glass">玻璃卡片</TxCard>
  </div>
</template>
```

## 可点击卡片

支持点击交互的卡片：

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

## 加载状态

显示加载中的卡片：

```vue
<template>
  <TxCard :loading="isLoading">
    <h3>数据加载中...</h3>
    <p>请稍候，正在获取最新数据</p>
  </TxCard>
</template>

<script setup>
import { ref } from 'vue'

const isLoading = ref(true)

// 模拟数据加载
setTimeout(() => {
  isLoading.value = false
}, 2000)
</script>
```

## 卡片尺寸

提供不同的卡片尺寸：

```vue
<template>
  <div class="card-sizes">
    <TxCard size="small">小尺寸卡片</TxCard>
    <TxCard size="medium">中等尺寸卡片</TxCard>
    <TxCard size="large">大尺寸卡片</TxCard>
  </div>
</template>
```

## 图片卡片

包含图片的卡片样式：

```vue
<template>
  <TxCard class="image-card">
    <template #cover>
      <img src="cover-image.jpg" alt="封面图片" />
    </template>
    
    <template #header>
      <h3>文章标题</h3>
    </template>
    
    <p>文章摘要内容...</p>
    
    <template #footer>
      <div class="card-meta">
        <span>2024-01-15</span>
        <span>阅读量: 1.2k</span>
      </div>
    </template>
  </TxCard>
</template>
```

## 统计卡片

用于展示数据统计的卡片：

```vue
<template>
  <div class="stats-cards">
    <TxCard class="stat-card">
      <div class="stat-content">
        <TxIcon name="users" class="stat-icon" />
        <div class="stat-info">
          <h3>1,234</h3>
          <p>总用户数</p>
        </div>
      </div>
    </TxCard>
    
    <TxCard class="stat-card">
      <div class="stat-content">
        <TxIcon name="shopping-cart" class="stat-icon" />
        <div class="stat-info">
          <h3>5,678</h3>
          <p>订单数量</p>
        </div>
      </div>
    </TxCard>
  </div>
</template>
```

## API 参考

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | `'default' \| 'outlined' \| 'elevated' \| 'glass'` | `'default'` | 卡片变体 |
| size | `'small' \| 'medium' \| 'large'` | `'medium'` | 卡片尺寸 |
| clickable | `boolean` | `false` | 是否可点击 |
| loading | `boolean` | `false` | 是否显示加载状态 |
| disabled | `boolean` | `false` | 是否禁用 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| click | `(event: MouseEvent)` | 点击卡片时触发 |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 卡片主要内容 |
| header | 卡片头部内容 |
| footer | 卡片底部内容 |
| cover | 卡片封面图片 |

## 样式定制

### CSS 变量

```css
.custom-card {
  --tx-card-background: rgba(255, 255, 255, 0.8);
  --tx-card-border: 1px solid rgba(255, 255, 255, 0.2);
  --tx-card-border-radius: 12px;
  --tx-card-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  --tx-card-backdrop-filter: blur(10px);
  --tx-card-padding: 24px;
}
```

### 主题定制

```css
:root {
  /* 卡片背景 */
  --tx-card-background-default: rgba(255, 255, 255, 0.8);
  --tx-card-background-glass: rgba(255, 255, 255, 0.1);
  
  /* 卡片边框 */
  --tx-card-border-default: 1px solid rgba(0, 0, 0, 0.1);
  --tx-card-border-outlined: 1px solid var(--tx-color-border);
  
  /* 卡片阴影 */
  --tx-card-shadow-default: 0 2px 8px rgba(0, 0, 0, 0.1);
  --tx-card-shadow-elevated: 0 8px 24px rgba(0, 0, 0, 0.15);
  
  /* 卡片尺寸 */
  --tx-card-padding-small: 16px;
  --tx-card-padding-medium: 20px;
  --tx-card-padding-large: 24px;
}
```

## 最佳实践

### 使用建议

1. **内容组织**：合理使用 header、body、footer 区域组织内容
2. **视觉层次**：通过不同的卡片变体创建视觉层次
3. **交互反馈**：为可点击卡片提供明确的视觉反馈
4. **响应式设计**：确保卡片在不同屏幕尺寸下的良好表现

### 布局示例

```vue
<template>
  <div class="card-grid">
    <TxCard 
      v-for="item in items" 
      :key="item.id"
      clickable
      @click="handleItemClick(item)"
    >
      <template #header>
        <h3>{{ item.title }}</h3>
      </template>
      
      <p>{{ item.description }}</p>
      
      <template #footer>
        <div class="card-actions">
          <TxButton size="small" variant="text">编辑</TxButton>
          <TxButton size="small" variant="text">删除</TxButton>
        </div>
      </template>
    </TxCard>
  </div>
</template>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}
</style>
```

TouchX UI 的 Card 组件提供了灵活的内容展示方案，结合玻璃拟态效果创造出现代感十足的用户界面。
