# Design — 文档页边缘渐进模糊

方案取自 research/edge-blur.md §8.1（静态多层渐进模糊 + 页面色渐隐，z 序不变），数值为起点，按浏览器实测调整后回写本文件。

## 标记（`apps/nexus/app/layouts/docs.vue:421–422`）

```vue
<div class="docs-edge-blur docs-edge-blur--top" aria-hidden="true">
  <span class="docs-edge-blur__layer" /> ×4
</div>
<div class="docs-edge-blur docs-edge-blur--bottom" aria-hidden="true">
  <span class="docs-edge-blur__layer" /> ×4
</div>
```

class 属性一字不改（门禁是精确子串）；子节点是纯标记，不引入任何 JS / tuffex。

## 样式

- **容器只定位**：`position: fixed; left: 0; right: 0; z-index: 20; height: 72px; pointer-events: none`。**不设** `opacity` / `mask` / `filter` / `backdrop-filter` / `will-change`——任何一个都会让容器成为 Backdrop Root，子层就模糊不到页面内容。去掉 `rotate(180deg)`，方向用变量 `--docs-edge-dir`（顶部 `to top`、底部 `to bottom`，指向视口边缘）。
- **4 个模糊子层**：全尺寸 `inset: 0`（模糊以边框盒为镜像边界，缩成窄带会出缝），`backdrop-filter: blur(1 / 2 / 4 / 8px)`，带状 mask 与 TxGradualBlur `divCount=4` 相同（相邻层重叠 25%，最强层在最外缘），**不设 opacity**。保留 `-webkit-` 前缀。
- **页面色渐隐**：容器 `::after` 画在所有子层之上，`linear-gradient(var(--docs-edge-dir), transparent → 半透页面色 → 页面色)`；顶部在药丸上方 16px（条的外侧 ~22%）内完全不透明，底部最外 ~6px 不透明。
- **页面色变量** `--docs-edge-color`：挂在 `.docs-layout-root` 上——亮 `#fff`（= `bg-white`）、暗 `#121212`（= uno `dark: '#121212'`，与 `dark:bg-dark` 同源，注释写明出处）、tutorial 亮 `var(--tx-bg-color, #fff)`、tutorial 暗取根渐变在视口边缘的色值（实测取样）。
- **tutorial**：删除现有容器级 background / backdrop 覆盖（`docs.vue:661–671`），改为 `.docs-layout-root--tutorial .docs-edge-blur__layer { display: none }`，只留颜色渐隐。
- **降级**：`@supports not (backdrop-filter …)` 时隐藏子层，只留颜色渐隐。

## 取舍

- 顶部经过遮罩带的只有与药丸同宽的正文列，且药丸滚动态自带 18px 毛玻璃：若 8 层 backdrop 的帧时间不理想，顶部减到 2–3 层（主要靠颜色渐隐挡住 0–16px）。
- 页脚（root 层 z 3）保持在遮罩条之上：页脚底色不是 #121212，盖上去反而会画出色带。
- 不换回 `<TxGradualBlur>`：门禁禁止，且它没有颜色层、`opacity` / `gpuOptimized` 会重新引入残影或 Backdrop Root 问题。
