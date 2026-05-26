# ContextMenu 右键菜单

<DocSourceLink slug="context-menu" />

`TxContextMenu` 是可右键触发、可坐标控制、可嵌入 Popover 的通用菜单浮层。它通过 `TxBaseAnchor` 的 virtual anchor 模式承载定位、碰撞处理、Card surface 与动画，支持连续右键跟随最新坐标，并提供 `TxContextMenuPanel` / `TxContextMenuItem` / `TxContextMenuDivider` 复用菜单内容。

<script setup>
import ContextMenuBasicDemo from '../.vitepress/theme/components/demos/ContextMenuBasicDemo.vue'
import ContextMenuBasicDemoSource from '../.vitepress/theme/components/demos/ContextMenuBasicDemo.vue?raw'
</script>

## 基础用法与组合

<DemoBlock title="ContextMenu" :code="ContextMenuBasicDemoSource">
  <ContextMenuBasicDemo />
</DemoBlock>

## 常见场景

### 右键绑定

```vue
<TxContextMenu>
  <template #trigger>
    <div class="file-row">Right click file row</div>
  </template>

  <template #menu>
    <TxContextMenuItem shortcut="⌘O">Open</TxContextMenuItem>
    <TxContextMenuItem shortcut="↩">Rename</TxContextMenuItem>
    <TxContextMenuDivider />
    <TxContextMenuItem danger shortcut="⌘⌫">Delete</TxContextMenuItem>
  </template>
</TxContextMenu>
```

### 锚点模式：跟随鼠标或跟随触发区域

默认 `anchorMode="pointer"`，右键菜单会跟随鼠标坐标；如果需要像 Popover/Dropdown 一样贴着触发区域，改成 `anchorMode="reference"`。

```vue
<!-- 跟随鼠标/传入坐标，适合标准右键菜单 -->
<TxContextMenu anchor-mode="pointer" />

<!-- 跟随触发区域，适合更接近 Dropdown 的菜单 -->
<TxContextMenu anchor-mode="reference" />
```

### 自定义触发 / 坐标控制

```vue
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
const x = ref(0)
const y = ref(0)

function openFromButton(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  x.value = rect.left
  y.value = rect.bottom + 8
  open.value = true
}
</script>

<template>
  <TxButton @click="openFromButton">Open menu</TxButton>
  <TxContextMenu v-model="open" trigger="manual" :x="x" :y="y">
    <template #menu>
      <TxContextMenuItem shortcut="⌘N">New</TxContextMenuItem>
    </template>
  </TxContextMenu>
</template>
```

### 嵌入 Popover / 二级菜单

```vue
<TxPopover v-model="submenuOpen" placement="right-start" :close-on-click-outside="false" :show-arrow="false" reference-full-width>
  <template #reference>
    <TxContextMenuItem submenu :close-on-select="false" @select="submenuOpen = true">
      More actions
    </TxContextMenuItem>
  </template>

  <TxContextMenuPanel :close="() => { submenuOpen = false }" outside-guard>
    <TxContextMenuItem shortcut="⌘D">Duplicate</TxContextMenuItem>
    <TxContextMenuItem color="var(--tx-color-primary)">Share link</TxContextMenuItem>
  </TxContextMenuPanel>
</TxPopover>
```

`TxContextMenuPanel` 也可直接放进普通 Popover：

```vue
<TxPopover placement="bottom-start" :width="240" :panel-padding="6">
  <template #reference>
    <TxButton>More</TxButton>
  </template>

  <TxContextMenuPanel>
    <TxContextMenuItem shortcut="⌘P">Pin</TxContextMenuItem>
    <TxContextMenuItem color="#10b981">Approve</TxContextMenuItem>
    <TxContextMenuDivider />
    <TxContextMenuItem danger>Reject</TxContextMenuItem>
  </TxContextMenuPanel>
</TxPopover>
```

### Divider / Disabled / Danger / 自定义颜色 / 快捷键

```vue
<TxContextMenuItem shortcut="⌘C">Copy</TxContextMenuItem>
<TxContextMenuItem disabled shortcut="⌘V">Paste</TxContextMenuItem>
<TxContextMenuDivider dashed />
<TxContextMenuItem color="#8b5cf6" shortcut="⌘K">Run command</TxContextMenuItem>
<TxContextMenuItem danger shortcut="⌘⌫">Delete</TxContextMenuItem>
```

### 自动定位与动画

`TxContextMenu` 通过 `TxBaseAnchor` 内置 `flip + shift + size`：靠近边缘会自动翻转/平移，菜单最大高度会跟随可用视口收缩。`anchorMode="pointer"` 时同一个 trigger 多次右键会更新 virtual anchor 到最新鼠标坐标；`anchorMode="reference"` 时菜单跟随触发区域。

```vue
<TxContextMenu
  :animation="{
    type: 'boom',
    duration: 180,
    closeDuration: 120,
    scale: 0.92,
    blur: 10
  }"
/>
```

## API

### TxContextMenu Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean \| undefined` | `undefined` | 是否打开（v-model）；`undefined` 时为非受控模式 |
| `x` | `number` | `0` | 受控/手动打开坐标 X |
| `y` | `number` | `0` | 受控/手动打开坐标 Y |
| `width` | `number` | `220` | 菜单宽度；`0` 表示自动宽度 |
| `minWidth` | `number` | `0` | 最小宽度 |
| `maxWidth` | `number` | `360` | 最大宽度；`0` 表示不限制 |
| `maxHeight` | `number` | `420` | 最大高度；会结合可用视口高度自动收缩 |
| `unlimitedHeight` | `boolean` | `false` | 不限制高度 |
| `disabled` | `boolean` | `false` | 禁用触发与打开 |
| `eager` | `boolean` | `false` | 提前挂载菜单内容 |
| `trigger` | `'contextmenu' \| 'click' \| 'both' \| 'manual'` | `'contextmenu'` | 触发方式；`manual` 仅由外部坐标控制 |
| `anchorMode` | `'pointer' \| 'reference'` | `'pointer'` | 锚点模式：`pointer` 跟随鼠标/传入坐标，`reference` 跟随触发区域 |
| `preventDefault` | `boolean` | `true` | 右键触发时阻止浏览器默认菜单 |
| `placement` | `BaseAnchorPlacement` | `'bottom-start'` | 相对坐标点的初始方向 |
| `offset` | `number` | `2` | 与坐标点的距离 |
| `closeOnEsc` | `boolean` | `true` | ESC 关闭 |
| `closeOnClickOutside` | `boolean` | `true` | 点击菜单外部关闭 |
| `closeOnTriggerPointerDown` | `boolean` | `true` | 菜单打开后点击触发区域也关闭；`click` / `both` 触发模式下自动忽略，避免点击打开后马上关闭 |
| `closeOnAnyPointerDown` | `boolean` | `false` | 点击任意非菜单区域都关闭，包括触发区域和页面其它区域 |
| `closeOnSelect` | `boolean` | `true` | 菜单项选中后自动关闭 |
| `showArrow` | `boolean` | `false` | 显示指向坐标点的箭头 |
| `arrowSize` | `number` | `10` | 箭头尺寸 |
| `animation` | `BaseAnchorAnimationOptions` | `{}` | 打开/关闭动画，支持 `transfer` / `boom` / `opacity` / `none` |
| `duration` | `number` | `160` | 兼容快捷动画时长；优先使用 `animation.duration` |
| `keepAliveContent` | `boolean` | `true` | 关闭后保留内容状态 |
| `panelVariant` | `'solid' \| 'dashed' \| 'plain'` | `'solid'` | 面板边框样式 |
| `panelBackground` | `'pure' \| 'mask' \| 'blur' \| 'glass' \| 'refraction'` | `'refraction'` | 面板背景效果 |
| `panelShadow` | `'none' \| 'soft' \| 'medium'` | `'medium'` | 面板阴影 |
| `panelRadius` | `number` | `14` | 面板圆角 |
| `panelPadding` | `number` | `6` | 面板内边距 |
| `panelCard` | `BaseAnchorPanelCardProps` | - | 透传给内部 `TxCard` 的高级视觉参数 |

### TxContextMenu Events / Exposes

| 名称 | 参数/类型 | 说明 |
|------|------|------|
| `update:modelValue` | `boolean` | 打开状态变化 |
| `open` | `{ x: number; y: number }` | 打开时触发 |
| `close` | - | 关闭时触发 |
| `openAt` | `(target?: { x: number; y: number } \| MouseEvent \| PointerEvent) => void` | 按坐标或事件打开菜单 |
| `openFromEvent` | `(event: MouseEvent \| PointerEvent) => void` | 从鼠标/指针事件打开菜单 |
| `close` | `() => void` | 关闭菜单 |
| `updatePosition` | `() => void` | 手动刷新 Floating UI 定位 |

### TxContextMenuPanel Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `width` | `number \| string` | - | 面板宽度 |
| `minWidth` | `number \| string` | - | 最小宽度 |
| `maxWidth` | `number \| string` | - | 最大宽度 |
| `maxHeight` | `number \| string` | - | 最大高度 |
| `closeOnSelect` | `boolean` | `true` | 内部 item 选中后是否关闭 |
| `close` | `() => void` | - | 面板关闭回调，供 item 注入使用 |
| `dense` | `boolean` | `false` | 更紧凑的 item 间距 |
| `outsideGuard` | `boolean` | `false` | 标记为 ContextMenu 外部保护层，用于二级菜单/Teleport 组合 |
| `role` | `string` | `'menu'` | ARIA role |
| `ariaLabel` | `string` | - | ARIA label |

### TxContextMenuItem Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `disabled` | `boolean` | `false` | 是否禁用 |
| `danger` | `boolean` | `false` | 危险操作样式 |
| `color` | `string` | - | 自定义文字颜色，支持 CSS 变量 |
| `shortcut` | `string` | - | 右侧快捷键提示 |
| `submenu` | `boolean` | `false` | 显示二级菜单箭头 |
| `closeOnSelect` | `boolean` | - | 覆盖父级 `closeOnSelect` |

### TxContextMenuItem Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `select` | - | 选中条目；未禁用时触发 |

### TxContextMenuDivider Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `dashed` | `boolean` | `false` | 虚线分隔符 |
| `inset` | `boolean` | `false` | 左侧缩进 |
