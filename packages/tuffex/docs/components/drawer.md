# Drawer 抽屉

从屏幕边缘滑出的面板组件，支持四个方向、自适应尺寸、可选全屏、移动端底部弹出、Header/Footer 插槽与遮罩视觉配置。

<script setup>
import { ref } from 'vue'

const visible1 = ref(false)
const visibleLeft = ref(false)
const visibleRight = ref(false)
const visibleTop = ref(false)
const visibleBottom = ref(false)
const visibleSizePx = ref(false)
const visibleSizeRem = ref(false)
const visibleSizePercent = ref(false)
const visibleFull = ref(false)
const visibleHeaderFooter = ref(false)
const visibleNoChrome = ref(false)
const visibleMaskBlur = ref(false)
const visibleMaskOpacity = ref(false)
const visibleMaskTransparent = ref(false)
const visibleTransparentPanel = ref(false)
const visibleMobileDefault = ref(false)
const visibleMobileDisabled = ref(false)
const visibleCloseControl = ref(false)
</script>

## 基础用法

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visible1 = true">打开抽屉</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visible1" title="设置">
  <p>这是抽屉的内容区域，你可以在这里放置任何内容。</p>
  <p>支持自定义尺寸、方向、Header/Footer、遮罩和关闭行为。</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxButton @click="visible = true">打开抽屉</TxButton>

  <TxDrawer v-model:visible="visible" title="设置">
    <p>抽屉内容</p>
  </TxDrawer>
</template>
```
:::

## 四个方向

`direction` 支持 `left`、`right`、`top`、`bottom`。`size` 会自动按方向判定：左右方向是宽度，上下方向是高度。

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visibleLeft = true">Left</TxButton>
    <TxButton @click="visibleRight = true">Right</TxButton>
    <TxButton @click="visibleTop = true">Top</TxButton>
    <TxButton @click="visibleBottom = true">Bottom</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visibleLeft" title="左侧抽屉" direction="left" size="360px" :mobile-adapt="false">
  <p>从左侧滑入，size 作为宽度。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleRight" title="右侧抽屉" direction="right" size="360px" :mobile-adapt="false">
  <p>从右侧滑入，size 作为宽度。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleTop" title="顶部抽屉" direction="top" size="18rem" :mobile-adapt="false">
  <p>从顶部滑入，size 作为高度。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleBottom" title="底部抽屉" direction="bottom" size="45%">
  <p>从底部滑入，适合移动端 Bottom Sheet。</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="left" direction="left" size="360px" :mobile-adapt="false" />
  <TxDrawer v-model:visible="right" direction="right" size="360px" :mobile-adapt="false" />
  <TxDrawer v-model:visible="top" direction="top" size="18rem" :mobile-adapt="false" />
  <TxDrawer v-model:visible="bottom" direction="bottom" size="45%" />
</template>
```
:::

## 尺寸与全屏

统一使用 `size` 配置尺寸，支持 `px`、`rem`、百分比、任意 CSS 长度、number(px) 和 `full`。为了更容易发现全屏能力，也支持 `full` boolean prop，等价于 `size="full"`。

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visibleSizePx = true">size px</TxButton>
    <TxButton @click="visibleSizeRem = true">size rem</TxButton>
    <TxButton @click="visibleSizePercent = true">size %</TxButton>
    <TxButton @click="visibleFull = true">full</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visibleSizePx" title="size = 420px" size="420px" :mobile-adapt="false">
  <p>左右方向时，`size="420px"` 会作为宽度。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleSizeRem" title="size = 24rem" size="24rem" :mobile-adapt="false">
  <p>支持 rem 等 CSS 长度。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleSizePercent" title="bottom + size = 55%" direction="bottom" size="55%">
  <p>上下方向时，百分比 size 会作为高度。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleFull" title="全屏抽屉" full>
  <p>`full` prop 会让抽屉在当前方向上 100% 打开。</p>
  <p>也可以写成 `size="full"`。</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="pxVisible" size="420px" />
  <TxDrawer v-model:visible="remVisible" size="24rem" />
  <TxDrawer v-model:visible="percentVisible" direction="bottom" size="55%" />

  <!-- 推荐：直观全屏 -->
  <TxDrawer v-model:visible="fullVisible" full />

  <!-- 等价写法 -->
  <TxDrawer v-model:visible="fullVisible2" size="full" />
</template>
```
:::

## Header / Footer 插槽

`header` 与 `footer` 支持完全自定义，也可以通过 `show-header="false"` 或 `show-footer="false"` 关闭。Drawer 内置 Header/Footer 分割线使用 `TxDivider`。

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visibleHeaderFooter = true">自定义 Header / Footer</TxButton>
    <TxButton @click="visibleNoChrome = true">关闭 Header / Footer</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visibleHeaderFooter" title="发布策略" size="420px" :mobile-adapt="false">
  <template #header="{ close }">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
      <div>
        <strong>发布策略</strong>
        <p style="margin: 4px 0 0; color: var(--tx-text-color-secondary);">自定义 Header slot</p>
      </div>
      <TxButton variant="ghost" @click="close">关闭</TxButton>
    </div>
  </template>

  <p>Header 与 Body 之间、Body 与 Footer 之间的分割线都来自 TxDivider。</p>

  <template #footer="{ close }">
    <div style="display: flex; justify-content: flex-end; gap: 12px;">
      <TxButton @click="close">取消</TxButton>
      <TxButton type="primary" @click="close">保存</TxButton>
    </div>
  </template>
</TxDrawer>

<TxDrawer v-model:visible="visibleNoChrome" title="纯内容抽屉" :show-header="false" :show-footer="false" size="420px" :mobile-adapt="false">
  <p>这个抽屉关闭了 Header 和 Footer，只保留内容区域。</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="visible" title="发布策略" size="420px">
    <template #header="{ close }">
      <div class="drawer-custom-header">
        <strong>发布策略</strong>
        <TxButton variant="ghost" @click="close">关闭</TxButton>
      </div>
    </template>

    <p>抽屉主内容</p>

    <template #footer="{ close }">
      <TxButton @click="close">取消</TxButton>
      <TxButton type="primary" @click="close">保存</TxButton>
    </template>
  </TxDrawer>

  <TxDrawer v-model:visible="plainVisible" :show-header="false" :show-footer="false">
    <p>无 Header / Footer 的纯内容抽屉。</p>
  </TxDrawer>
</template>
```
:::

## 遮罩与透明面板

`mask-effect` 控制遮罩视觉：`blur` 表示模糊遮罩，`opacity` 表示仅透明度遮罩，`transparent` 表示透明遮罩。`panel-transparent` 控制抽屉面板是否透出背部内容。

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visibleMaskBlur = true">mask blur</TxButton>
    <TxButton @click="visibleMaskOpacity = true">mask opacity</TxButton>
    <TxButton @click="visibleMaskTransparent = true">mask transparent</TxButton>
    <TxButton @click="visibleTransparentPanel = true">panel transparent</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visibleMaskBlur" title="maskEffect = blur" mask-effect="blur" size="420px" :mobile-adapt="false">
  <p>默认效果：遮罩带透明度和 backdrop blur。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleMaskOpacity" title="maskEffect = opacity" mask-effect="opacity" size="420px" :mobile-adapt="false">
  <p>仅保留黑色透明度遮罩，不启用 blur。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleMaskTransparent" title="maskEffect = transparent" mask-effect="transparent" size="420px" :mobile-adapt="false">
  <p>遮罩透明，但仍可点击遮罩关闭。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleTransparentPanel" title="透明面板" mask-effect="opacity" panel-transparent size="420px" :mobile-adapt="false">
  <p>`panel-transparent` 会让抽屉面板半透明，并启用面板自身 blur。</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="blur" mask-effect="blur" />
  <TxDrawer v-model:visible="opacity" mask-effect="opacity" />
  <TxDrawer v-model:visible="transparent" mask-effect="transparent" />
  <TxDrawer v-model:visible="panel" mask-effect="opacity" panel-transparent />
</template>
```
:::

## 移动端适配

默认 `mobile-adapt` 为 `true`：在移动端视口下，无论配置哪个方向，都会自动改为从底部弹出。若需要保留指定方向，设置 `:mobile-adapt="false"`。

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visibleMobileDefault = true">移动端默认适配</TxButton>
    <TxButton @click="visibleMobileDisabled = true">关闭 mobileAdapt</TxButton>
  </div>
</div>

<TxDrawer v-model:visible="visibleMobileDefault" title="移动端默认 bottom" direction="right" size="420px">
  <p>在移动端视口下，这个 right drawer 会自动以 bottom 方向打开。</p>
</TxDrawer>

<TxDrawer v-model:visible="visibleMobileDisabled" title="保持指定方向" direction="right" size="420px" :mobile-adapt="false">
  <p>关闭 mobileAdapt 后，即使在移动端也保持 right 方向。</p>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer v-model:visible="auto" direction="right" />
  <TxDrawer v-model:visible="fixed" direction="right" :mobile-adapt="false" />
</template>
```
:::

## 关闭行为

控制抽屉的关闭方式。

<div class="demo-container">
  <div class="demo-container__row">
    <TxButton @click="visibleCloseControl = true">关闭行为配置</TxButton>
  </div>
</div>

<TxDrawer
  v-model:visible="visibleCloseControl"
  title="持久化抽屉"
  :close-on-click-mask="false"
  :close-on-press-escape="false"
  :show-close="false"
  size="420px"
  :mobile-adapt="false"
>
  <p>这个抽屉禁用了遮罩点击、Escape 和默认关闭按钮。</p>
  <TxButton @click="visibleCloseControl = false">手动关闭</TxButton>
</TxDrawer>

::: details 查看代码
```vue
<template>
  <TxDrawer
    v-model:visible="visible"
    title="持久化"
    :close-on-click-mask="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <p>需要业务按钮手动关闭。</p>
  </TxDrawer>
</template>
```
:::

## API

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `visible` | `boolean` | *必填* | 控制抽屉可见性 |
| `title` | `string` | `'Drawer'` | 头部显示的标题；关闭 Header 时作为 aria label 兜底 |
| `size` | `number \| string \| 'full'` | `'60%'` | 抽屉当前轴尺寸；`left/right` 为宽度，`top/bottom` 为高度；number 按 px 处理 |
| `full` | `boolean` | `false` | 当前方向全屏打开，等价于 `size="full"` |
| `width` | `number \| string \| 'full'` | - | 已废弃兼容项，建议使用 `size` |
| `direction` | `'left' \| 'right' \| 'top' \| 'bottom'` | `'right'` | 抽屉出现的方向 |
| `showHeader` | `boolean` | `true` | 是否渲染 Header 区域 |
| `showFooter` | `boolean` | `true` | 是否渲染 Footer 插槽区域 |
| `showClose` | `boolean` | `true` | 是否显示默认关闭按钮 |
| `closeOnClickMask` | `boolean` | `true` | 点击遮罩时关闭 |
| `closeOnPressEscape` | `boolean` | `true` | 按 Escape 键时关闭 |
| `maskEffect` | `'blur' \| 'opacity' \| 'transparent'` | `'blur'` | 遮罩视觉效果 |
| `panelTransparent` | `boolean` | `false` | 面板是否半透明并透出背部内容 |
| `mobileAdapt` | `boolean` | `true` | 移动端是否强制从底部弹出 |
| `zIndex` | `number` | `1998` | 自定义 z-index |

### 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `update:visible` | `visible: boolean` | 可见性变化时触发 |
| `open` | - | 抽屉打开时触发 |
| `close` | - | 抽屉关闭时触发 |

### 插槽

| 插槽名 | 说明 |
|------|-------------|
| `default` | 抽屉主内容 |
| `header` | 自定义 Header；slot props: `{ close, title, titleId }` |
| `footer` | 底部内容区域；slot props: `{ close }` |

## 交互契约

- Drawer 根节点暴露 `role="dialog"`、`aria-modal="true"`，有 Header 时通过实例级 `aria-labelledby` 关联标题；关闭 Header 时使用 `title` 作为 `aria-label` 兜底。
- 打开时聚焦抽屉根节点；隐藏或卸载时恢复到打开前的焦点元素。
- 关闭按钮、遮罩点击和 Escape 默认都会触发 `update:visible(false)` 与 `close`。
- `closeOnClickMask=false` / `closeOnPressEscape=false` 分别阻断遮罩或 Escape 关闭；`showClose=false` 仅移除默认关闭按钮。
- 移动端默认使用 `bottom` 方向，以避免横向抽屉挤压小屏内容；需要保持原方向时设置 `:mobile-adapt="false"`。
