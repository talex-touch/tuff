# Icons 图标

TuffEx UI 统一使用 **UnoCSS + icones** 的图标方案。

## Usage

在组件/页面中直接使用 `<i>` 标签并写 `i-xxx` 类名即可：

```vue
<template>
  <i class="i-carbon-checkmark-filled" />
  <i class="i-lucide-loader-2" />
</template>
```

## Conventions

- 组件库内部使用 `i-carbon-*` 作为默认图标集合（示例：`TxStatusBadge`）。
- 如果业务侧希望统一图标包，只需要在项目的 UnoCSS 配置里启用 `presetIcons()` 并设置 `collections`。

## Notes

- 图标渲染依赖 UnoCSS 在构建时生成对应 CSS。
- 组件库不会内置 SVG 资源，也不会强依赖某一个 icon set。
