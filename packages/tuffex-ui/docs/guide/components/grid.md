# Grid 栅格

栅格组件提供了现代化的 CSS Grid 布局解决方案，支持响应式设计和灵活的网格配置。相比传统的 Flexbox 栅格，Grid 栅格在处理二维布局时更加强大和直观。

## 基础用法

最简单的网格布局：

```vue
<template>
  <TxGrid :cols="3" gap="16">
    <TxGridItem>项目 1</TxGridItem>
    <TxGridItem>项目 2</TxGridItem>
    <TxGridItem>项目 3</TxGridItem>
    <TxGridItem>项目 4</TxGridItem>
    <TxGridItem>项目 5</TxGridItem>
    <TxGridItem>项目 6</TxGridItem>
  </TxGrid>
</template>
```

## 响应式网格

### 响应式列数
根据屏幕尺寸自动调整列数：

```vue
<template>
  <TxGrid :cols="{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }" gap="20">
    <TxGridItem v-for="i in 10" :key="i">
      <TxCard>项目 {{ i }}</TxCard>
    </TxGridItem>
  </TxGrid>
</template>
```

### 自适应网格
根据项目最小宽度自动调整：

```vue
<template>
  <TxGrid min-item-width="250px" gap="24">
    <TxGridItem v-for="item in items" :key="item.id">
      <TxCard>
        <h3>{{ item.title }}</h3>
        <p>{{ item.description }}</p>
      </TxCard>
    </TxGridItem>
  </TxGrid>
</template>
```

## 网格间距

### 统一间距
```vue
<template>
  <TxGrid :cols="3" gap="32">
    <TxGridItem v-for="i in 6" :key="i">
      项目 {{ i }}
    </TxGridItem>
  </TxGrid>
</template>
```

### 不同方向间距
```vue
<template>
  <TxGrid :cols="3" :gap="{ row: 24, col: 16 }">
    <TxGridItem v-for="i in 6" :key="i">
      项目 {{ i }}
    </TxGridItem>
  </TxGrid>
</template>
```

### 响应式间距
```vue
<template>
  <TxGrid 
    :cols="{ xs: 1, md: 2, lg: 3 }"
    :gap="{ xs: 16, md: 24, lg: 32 }"
  >
    <TxGridItem v-for="i in 6" :key="i">
      项目 {{ i }}
    </TxGridItem>
  </TxGrid>
</template>
```

## 网格项配置

### 跨列布局
```vue
<template>
  <TxGrid :cols="4" gap="16">
    <TxGridItem>普通项目</TxGridItem>
    <TxGridItem :col-span="2">跨2列项目</TxGridItem>
    <TxGridItem>普通项目</TxGridItem>
    <TxGridItem :col-span="3">跨3列项目</TxGridItem>
    <TxGridItem>普通项目</TxGridItem>
  </TxGrid>
</template>
```

### 跨行布局
```vue
<template>
  <TxGrid :cols="3" gap="16">
    <TxGridItem>项目 1</TxGridItem>
    <TxGridItem :row-span="2">跨2行项目</TxGridItem>
    <TxGridItem>项目 3</TxGridItem>
    <TxGridItem>项目 4</TxGridItem>
    <TxGridItem>项目 5</TxGridItem>
  </TxGrid>
</template>
```

### 复杂布局
```vue
<template>
  <TxGrid :cols="6" :rows="4" gap="16">
    <TxGridItem :col-span="2" :row-span="2">大项目</TxGridItem>
    <TxGridItem :col-span="2">项目 2</TxGridItem>
    <TxGridItem :col-span="2">项目 3</TxGridItem>
    <TxGridItem>项目 4</TxGridItem>
    <TxGridItem>项目 5</TxGridItem>
    <TxGridItem :col-span="4">宽项目</TxGridItem>
  </TxGrid>
</template>
```

## 对齐方式

### 网格对齐
```vue
<template>
  <TxGrid 
    :cols="3" 
    gap="16"
    justify="center"
    align="center"
    style="height: 400px;"
  >
    <TxGridItem v-for="i in 3" :key="i">
      项目 {{ i }}
    </TxGridItem>
  </TxGrid>
</template>
```

### 项目对齐
```vue
<template>
  <TxGrid :cols="3" gap="16">
    <TxGridItem justify-self="start">左对齐</TxGridItem>
    <TxGridItem justify-self="center">居中对齐</TxGridItem>
    <TxGridItem justify-self="end">右对齐</TxGridItem>
  </TxGrid>
</template>
```

## 实际应用示例

### 图片画廊
```vue
<template>
  <TxGrid 
    :cols="{ xs: 1, sm: 2, md: 3, lg: 4 }"
    gap="16"
    class="image-gallery"
  >
    <TxGridItem 
      v-for="image in images" 
      :key="image.id"
      :col-span="image.featured ? 2 : 1"
      :row-span="image.featured ? 2 : 1"
    >
      <div class="image-item">
        <img :src="image.url" :alt="image.title" />
        <div class="image-overlay">
          <h3>{{ image.title }}</h3>
        </div>
      </div>
    </TxGridItem>
  </TxGrid>
</template>

<style scoped>
.image-item {
  position: relative;
  height: 200px;
  border-radius: 12px;
  overflow: hidden;
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: white;
  padding: 16px;
}
</style>
```

### 仪表板布局
```vue
<template>
  <TxGrid :cols="12" :rows="8" gap="24" class="dashboard">
    <!-- 统计卡片 -->
    <TxGridItem :col-span="3" :row-span="2">
      <TxCard class="stat-card">
        <TxStatistic title="总用户" :value="12345" />
      </TxCard>
    </TxGridItem>
    
    <TxGridItem :col-span="3" :row-span="2">
      <TxCard class="stat-card">
        <TxStatistic title="活跃用户" :value="8901" />
      </TxCard>
    </TxGridItem>
    
    <TxGridItem :col-span="3" :row-span="2">
      <TxCard class="stat-card">
        <TxStatistic title="收入" :value="234567" prefix="¥" />
      </TxCard>
    </TxGridItem>
    
    <TxGridItem :col-span="3" :row-span="2">
      <TxCard class="stat-card">
        <TxStatistic title="订单" :value="5678" />
      </TxCard>
    </TxGridItem>
    
    <!-- 图表区域 -->
    <TxGridItem :col-span="8" :row-span="4">
      <TxCard>
        <h3>销售趋势</h3>
        <div class="chart-placeholder">图表区域</div>
      </TxCard>
    </TxGridItem>
    
    <!-- 侧边信息 -->
    <TxGridItem :col-span="4" :row-span="4">
      <TxCard>
        <h3>最新动态</h3>
        <div class="activity-list">活动列表</div>
      </TxCard>
    </TxGridItem>
    
    <!-- 底部表格 -->
    <TxGridItem :col-span="12" :row-span="2">
      <TxCard>
        <h3>数据表格</h3>
        <div class="table-placeholder">表格区域</div>
      </TxCard>
    </TxGridItem>
  </TxGrid>
</template>

<style scoped>
.dashboard {
  height: 100vh;
  padding: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-placeholder,
.table-placeholder {
  height: 200px;
  background: var(--tx-color-surface);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-secondary);
}
</style>
```

### 产品展示
```vue
<template>
  <TxGrid 
    min-item-width="300px"
    gap="24"
    class="product-grid"
  >
    <TxGridItem 
      v-for="product in products" 
      :key="product.id"
      :col-span="product.featured ? 2 : 1"
    >
      <TxCard class="product-card" hoverable>
        <template #cover>
          <img :src="product.image" :alt="product.name" />
        </template>
        
        <h3>{{ product.name }}</h3>
        <p class="product-price">¥{{ product.price }}</p>
        <p class="product-description">{{ product.description }}</p>
        
        <template #footer>
          <TxButton type="primary" block>
            加入购物车
          </TxButton>
        </template>
      </TxCard>
    </TxGridItem>
  </TxGrid>
</template>
```

## API 参考

### Grid Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| cols | `number \| ResponsiveValue` | `1` | 列数 |
| rows | `number \| ResponsiveValue` | `auto` | 行数 |
| gap | `number \| string \| ResponsiveValue \| GapValue` | `0` | 网格间距 |
| minItemWidth | `string` | - | 项目最小宽度（自适应模式） |
| justify | `'start' \| 'end' \| 'center' \| 'stretch'` | `'stretch'` | 水平对齐 |
| align | `'start' \| 'end' \| 'center' \| 'stretch'` | `'stretch'` | 垂直对齐 |
| autoRows | `string` | `'auto'` | 自动行高 |
| dense | `boolean` | `false` | 是否使用密集布局 |

### GridItem Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| colSpan | `number \| ResponsiveValue` | `1` | 跨列数 |
| rowSpan | `number \| ResponsiveValue` | `1` | 跨行数 |
| colStart | `number` | - | 起始列 |
| colEnd | `number` | - | 结束列 |
| rowStart | `number` | - | 起始行 |
| rowEnd | `number` | - | 结束行 |
| justifySelf | `'start' \| 'end' \| 'center' \| 'stretch'` | - | 自身水平对齐 |
| alignSelf | `'start' \| 'end' \| 'center' \| 'stretch'` | - | 自身垂直对齐 |

### 类型定义

```typescript
interface ResponsiveValue {
  xs?: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
  xxl?: number
}

interface GapValue {
  row?: number | string
  col?: number | string
}
```

## 样式定制

### CSS 变量

```css
.custom-grid {
  --tx-grid-gap: 24px;
  --tx-grid-item-background: var(--tx-color-surface);
  --tx-grid-item-border-radius: 12px;
  --tx-grid-item-padding: 16px;
}
```

## 最佳实践

### 使用建议

1. **响应式优先**：始终考虑不同屏幕尺寸的布局
2. **合理间距**：保持一致的间距规范
3. **内容适配**：确保内容在不同网格尺寸下都能良好显示
4. **性能考虑**：避免过于复杂的网格布局

### 常见模式

```vue
<template>
  <!-- 等宽网格 -->
  <TxGrid :cols="4" gap="16">
    <TxGridItem v-for="i in 8" :key="i">项目 {{ i }}</TxGridItem>
  </TxGrid>
  
  <!-- 自适应网格 -->
  <TxGrid min-item-width="200px" gap="20">
    <TxGridItem v-for="i in 12" :key="i">项目 {{ i }}</TxGridItem>
  </TxGrid>
  
  <!-- 不规则网格 -->
  <TxGrid :cols="6" gap="16">
    <TxGridItem :col-span="2">宽项目</TxGridItem>
    <TxGridItem>项目</TxGridItem>
    <TxGridItem>项目</TxGridItem>
    <TxGridItem>项目</TxGridItem>
    <TxGridItem>项目</TxGridItem>
  </TxGrid>
</template>
```

TouchX UI 的栅格组件提供了现代化的网格布局解决方案，让复杂的布局变得简单直观。
