# NavBar 导航栏

移动端顶部导航栏，支持标题、左右插槽与返回按钮。

<script setup lang="ts">
import NavBarBasicDemo from '../.vitepress/theme/components/demos/NavBarBasicDemo.vue'
import NavBarBasicDemoSource from '../.vitepress/theme/components/demos/NavBarBasicDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="NavBar" :code="NavBarBasicDemoSource">
  <template #preview>
    <NavBarBasicDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `title` | `string` | `''` | 标题 |
| `fixed` | `boolean` | `false` | 是否 sticky 顶部 |
| `safeAreaTop` | `boolean` | `true` | 是否预留顶部安全区 |
| `showBack` | `boolean` | `false` | 是否显示返回按钮（默认插槽） |
| `disabled` | `boolean` | `false` | 禁用 |
| `zIndex` | `number` | `2000` | z-index |

### Slots

| 名称 | 说明 |
|------|------|
| `left` | 左侧区域（默认返回按钮） |
| `title` | 标题区域 |
| `right` | 右侧区域 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `back` | - | 点击返回按钮 |
| `click-left` | - | 点击左侧区域 |
| `click-right` | - | 点击右侧区域 |
