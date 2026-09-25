# Research: FlipOverlay 格子"这个问题严重"的根因与 specimen 方案

- **Query**: 老板点击 FlipOverlay 格子的触发按钮后，卡片出现在页面中间、压在网格上且整页变暗，标注"问题严重"。从代码推断定位、source、mask、关闭/复原、滚动锁、泄漏等可能问题；给出紧凑 specimen。
- **Scope**: internal + external（MDN containment 定义）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue` | 组件（HEAD 953 行；**工作区已有未提交修改：包 `<Teleport to="body">`**） |
| `packages/tuffex/packages/components/src/flip-overlay/src/flip-overlay-motion.ts` | GSAP FLIP 开/关动画（视口坐标数学） |
| `packages/tuffex/packages/components/src/flip-overlay/src/flip-overlay-body-scroll-lock.ts` | body overflow 锁 + 计数 |
| `packages/tuffex/packages/components/src/flip-overlay/src/flip-overlay-stack.ts` | 多实例叠层；≥2 层时往 body 追加共享 GlobalMask |
| `packages/tuffex/packages/components/src/flip-overlay/src/types.ts` | Props/Emits/SlotProps |
| `packages/tuffex/packages/components/src/flip-overlay/__tests__/flip-overlay.test.ts` | 697 行，大量 `wrapper.find(...)`（工作区也在改） |
| `apps/nexus/app/components/content/demos/FlipOverlayFlipOverlayDemo.vue` | 文档 demo |
| `apps/nexus/content/docs/dev/components/flip-overlay.{en,zh}.mdc` | 文档页 |
| `apps/nexus/app/pages/docs/[...slug].vue` | `:deep(.docs-prose) { content-visibility: auto; contain-intrinsic-size: 1200px }`（~2596 行）；`.docs-surface { position: relative; isolation: isolate }` |
| `apps/nexus/app/layouts/docs.vue` | `.docs-layout-root`/`.docs-layout-stage` `isolation: isolate`；`TheHeader class="z-30"`、侧栏/outline `relative z-30`、`.docs-edge-blur` fixed z-20 |

### 结论：两件事叠加

1. **HEAD 版 TxFlipOverlay 不 Teleport**。模板根就是 `<Transition>`，`.TxFlipOverlay-Mask`（`position: fixed; inset: 0; display:flex; padding:12px`，~721 行）与 `.TxFlipOverlay-Card`（`position: fixed; left: 50%; top: 50%; max-width: calc(100vw - 24px); max-height: calc(90dvh - 24px)`，~781 行）都原地渲染在画廊格子里。对照：tuffex 里所有其他浮层都 teleport 到 body —— `TxModal`、`TxDrawer`、`TxBlowDialog/TxPopperDialog/TxBottomDialog/TxTouchTip`、`TxCommandPalette`、`TxBaseAnchor`（Tooltip/Popover）、`TxFlatDropdown`、`TxPicker`、`TxLoadingOverlay`、`TxToastHost`（`grep -rli "<teleport"`）。`.trellis/spec/frontend/tuffex-design-rules.md` "Overlays use an open/visible prop" 一节给的正确结构也是 `Teleport > Transition > v-if`。
2. **Nexus 文档正文 `.docs-prose` 带 `content-visibility: auto`**。MDN：`auto` 让元素开启 layout、style、paint containment；`contain: layout/paint` 会创建 (1) absolute **和 fixed** 后代的新 containing block，(2) 新 stacking context，(3) 新 BFC；paint containment 还按 padding box 裁切后代。SSR 取证（`curl http://[::1]:3200/en/docs/dev/components/pro-suite`）：`<div class="docs-prose markdown-body … docs-prose--hero" data-v-33996fb2>` 包含 `<div class="docs-gallery">`。

### 现象逐条对应

| 现象 | 代码原因 |
|---|---|
| 整页变暗，但只到文章为止 | GlobalMask/Mask 的 `inset: 0` 以 `.docs-prose` 盒为基准 = 整篇文章（画廊 + 目录 + 其余正文），不是视口 |
| header、侧栏、outline、上下 edge-blur 不被遮罩且压在浮层之上 | 浮层 z-index≈2000（`useZIndexAllocator`，`DEFAULT_Z_INDEX_SEED = 2000`）被困在 `.docs-surface`（`isolation: isolate`）与 `.docs-prose`（paint containment）的层叠上下文里；header/侧栏/outline 是 `.docs-layout-stage` 上下文里的 `z-30`，edge-blur 是 `z-20` |
| 卡片"开在页面中间、压在网格上" | Card `left/top: 50%` 相对文章盒 → 落在整篇文章的几何中心，即画廊中段 |
| 翻转不是从按钮飞出 | `flip-overlay-motion.ts:223-229` 用视口坐标：`from = source.getBoundingClientRect()`、`viewportCenterX/Y = window.innerWidth/2, innerHeight/2`，`translateX = fromCenter − viewportCenter`；而卡片静止中心是文章中心，二者差一个 (文章中心 − 视口中心) 的偏移 |
| 打开瞬间页面跳动 | `watch(visible)` 里 `nextTick(() => cardRef.value?.focus())`（~558 行，未传 `preventScroll`）→ 浏览器把离屏卡片滚进视口。并行修复会话在 Teleport 注释里记录实测"focusing it scrolled the page 870px" |
| 关闭后又跳回、落点不对 | 关闭时 `previouslyFocused.focus()`（~562 行）把触发按钮滚回视口；关闭动画飞向**打开时缓存**的 `sourceRect`（视口坐标，已被 focus 滚动作废） |
| 打开期间无法手动滚动寻找卡片 | `lockFlipOverlayBodyScroll()` 设 `body.style.overflow='hidden'`（+ 滚动条宽度补偿）。Nexus `app.vue` 未给 `html` 设 overflow，body 的 overflow 传播到视口，锁是**生效的**——所以只剩 focus 引起的程序化滚动 |

### 排查过、没有问题的点

- **source 元素**：TxButton 模板根是单个 `<button>`（`button/src/button.vue` ~255 行），`flipTriggerRef.value.$el` 就是按钮；`resolveSource()` 走 `instanceof HTMLElement` 分支取 rect 与 `borderRadius`。
- **滚动锁泄漏**：计数存在 `body.dataset.txFlipOverlayLockCount`，`watch(visible)` 与 `onBeforeUnmount` 成对解锁；画廊 reset（remount）会走 `onBeforeUnmount` 解锁。
- **共享遮罩**：`flip-overlay-stack.ts` 只在可见叠层 ≥2 时 `document.body.appendChild` 共享 `.TxFlipOverlay-GlobalMask`，<2 时移除。单实例用的是 mask 内自带的 GlobalMask。
- **beforeunload**：只在 `preventAccidentalClose` 时绑定。
- **gsap**：Nexus `package.json` 有 `gsap`（catalog），`nuxt.config.ts` optimizeDeps 已含 `gsap`；`prepareHiddenSourceOpen` 先把卡片设 `opacity:0` 再等 `import('gsap')`，gsap 可解析所以不会卡在隐形。
- **过渡类**：默认 `transitionName='TxFlipOverlay-Mask'`，组件样式里没有对应 `-enter-*/-leave-*` 规则 → mask 瞬时出现/消失，只有卡片有 GSAP 动画（事实，不是故障）。
- **关闭按钮图标**：`<span class="i-carbon-close w-4 h-4 text-lg inline-flex">`，`i-carbon-close` 在 Nexus 扫描到的 `.vue` 里出现过（如 `app/components/ui/ToastHost.vue`、画廊自身），能生成。

### 工作区现状（研究时刻，未提交）

`git diff` 显示 `TxFlipOverlay.vue` 已改为 `<Teleport to="body"><Transition>…</Transition></Teleport>`，`defineOptions({ inheritAttrs: false })` 并在 mask 上 `v-bind="$attrs"`；`flip-overlay.test.ts` 同步改动（diffstat 14 行）。与本结论一致。落地还需：

- 重建 tuffex dist（Nexus 通过 `packages/tuffex/dist/es/<comp>` 解析；`.trellis/spec/frontend/tuffex-docs-sync.md` "Gates and their traps" 一节有构建命令与"typecheck 会杀 dev server"的坑）。
- 文档同步：`flip-overlay.{en,zh}.mdc` Interaction Contract 可补"渲染到 body"；现有 "`globalMask=true` uses a shared body-level mask" 的说法此后才名副其实。
- 同类隐患：`TxGradualBlur target="page"`（`position: fixed`，不 teleport）的文档 demo `GradualBlurTargetPageDemo.vue` 也在 `.docs-prose` 内，会同样相对文章盒定位（不在画廊里）。

### API（HEAD，`types.ts` + `withDefaults`）

| Prop | Type | Default |
|---|---|---|
| `modelValue` | `boolean` | `false` |
| `source` | `HTMLElement \| DOMRect \| null` | `null` |
| `sourceRadius` | `string \| null` | `null`（取 source 的 computed `borderRadius`） |
| `duration` | `number`(ms) | `480` |
| `rotateX` / `rotateY` / `tiltRange` | `number` | `6` / `8` / `2` |
| `perspective` | `number` | `1200` |
| `speedBoost` / `speedBoostAt` | `number` | `1.12` / `0.7` |
| `easeOut` / `easeIn` | `string`（GSAP ease） | `'back.out(1.25)'` / `'back.in(1)'` |
| `maskClosable` | `boolean` | `true` |
| `preventAccidentalClose` | `boolean` | `false` |
| `transitionName` | `string` | `'TxFlipOverlay-Mask'` |
| `maskClass` / `cardClass` | `string` | `''` |
| `cardStyle` | `CSSProperties` | — |
| `globalMask` | `boolean` | `true` |
| `border` | `'solid' \| 'dashed' \| 'dash' \| 'none'` | `'solid'` |
| `surface` | `'pure' \| 'mask' \| 'blur' \| 'glass' \| 'refraction'` | `'mask'` |
| `surfaceColor` | `string` | `''`（→ `var(--tx-bg-color-overlay, var(--tx-card-fake-background, #fff))`） |
| `surfaceOpacity` | `number` | `0.96` |
| `header` | `boolean` | `true` |
| `headerTitle` / `headerDesc` | `string` | `''` |
| `closable` | `boolean` | `true` |
| `closeAriaLabel` | `string` | `'Close'` |
| `scrollable` | `boolean` | `true` |
| `randomTilt` | `boolean` | `true` |
| `expanded` / `animating` | `boolean` | —（受控遥测） |

- **Slots**（slot props `{ close, expanded, animating, closable, headerTitle, headerDesc }`）：`default`、`header`、`header-display`、`header-actions`、`header-close`。
- **Emits**：`update:modelValue`、`update:expanded`、`update:animating`、`open`、`opened`、`close`、`closed`。
- **Expose**：`close()`。
- **CSS**：卡片 `--tx-flip-overlay-radius`(16px)；遮罩色 `--tx-overlay-mask`（默认 `rgba(8,10,16,0.52)`）；卡片边 `--tx-border-color-lighter`；表面 `--tx-bg-color-overlay` / `--tx-card-fake-background`。
- **卡片尺寸**：CSS 未给宽高，按内容 shrink-to-fit；文档 Best Practices 建议用 `cardStyle` 定 `width`/`maxHeight`。

### 渲染与动画

- `modelValue→true`：`requestOpen` 分配 z-index、记 `openSequence`、`resolveSource()`、随机 tilt、`nextTick` 后 `startOpenAnimation`：GSAP `set` 到源矩形（x/y 平移、scaleX/Y、rotateX/Y、`transformPerspective`、源圆角）再 `to` 回 0，`back.out(1.25)`，进度 >0.7 后 `timeScale(1.12)`。
- 关闭：反向飞回 `sourceRect`（`back.in(1)`），完成后 `visible=false`、emit `update:modelValue(false)`、`closed`。
- 无 source 时直接居中出现（单层）或叠层推入（y 10 → 0，0.22s）。
- 前提：`source` 必须在打开时位于视口内且浮层以视口为 containing block（即必须 teleport 或祖先无 transform/filter/contain/content-visibility）。

### Nexus demo

`FlipOverlayFlipOverlayDemo.vue`：`TxButton ref="triggerRef"` + `:source="triggerRef?.$el"`，`header-title`/`header-desc`，默认 slot 里 `div.space-y-3.p-6` 放一段说明和 `TxButton size="sm" @click="close"`。没有 `cardStyle`。它同样渲染在 `.docs-prose` 里，HEAD 下同样受影响。

### 当前画廊格子（研究时 ~2815–2838 行，锚点 `docPath('flip-overlay')`）

```vue
<TxButton ref="flipTriggerRef" @click="flipped = true">
  {{ copy.aboutTitle }}
</TxButton>
<TxFlipOverlay
  v-model="flipped"
  :source="flipTriggerEl"
  :header-title="copy.aboutTitle"
>
  <p class="docs-gallery__muted docs-gallery__flip-body">
    {{ copy.aboutBody }}
  </p>
</TxFlipOverlay>
```

脚本：`const flipped = ref(false)`、`const flipTriggerRef = ref<{ $el?: HTMLElement } | null>(null)`、`const flipTriggerEl = computed(() => flipTriggerRef.value?.$el ?? null)`（~543–546 行）。

### 方案（假设组件 Teleport 修复落地）

```vue
<!-- trigger 做成"卡片缩略"，翻转读起来就是"缩略卡展开成详情卡" -->
<button ref="flipTriggerRef" type="button" class="docs-gallery__flip-trigger" @click="flipped = true">
  <img :src="galleryItems[0].url" alt="">
  <span>{{ galleryItems[0].name }}</span>
</button>
<TxFlipOverlay
  v-model="flipped"
  :source="flipTriggerRef"
  source-radius="12px"
  :header-title="copy.aboutTitle"
  :header-desc="copy.aboutBody"
  :card-style="{ width: 'min(92vw, 360px)' }"
>
  <template #default="{ close }">
    <div class="docs-gallery__flip-panel">
      <img :src="galleryItems[0].url" alt="">
      <TxButton size="sm" @click="close">{{ copy.close }}</TxButton>
    </div>
  </template>
</TxFlipOverlay>
```

- 用原生 `<button>` 作 trigger 时 `flipTriggerRef` 直接是元素，不再需要 `$el`；保留 TxButton 也可以（维持 `flipTriggerEl`）。
- teleport 后卡片内容脱离 `.docs-root`：`--docs-muted` 等变量不存在，`.docs-gallery__muted` / `.docs-gallery__flip-body` 的颜色会退化为继承色。卡片内自定义样式只用 `--tx-*`（如 `--tx-text-color-secondary`、`--tx-fill-color-light`）。画廊 CSS 不 scoped，类名在 body 下仍命中。
- 尺寸：trigger ~160×100（缩略图 + 名称），在 ~364×140 舞台内居中；卡片 360px 宽。
- reset：画廊状态 `flipped` 跨 remount 保留；打开时遮罩盖住 reset 按钮，无冲突。翻转动画每次打开都会播放（`randomTilt` 每次随机方向）。
- `galleryItems` / `tileImage()`（~477–492 行）是内联 SVG 渐变风景图，暗/亮色都可读。

## Caveats / Not Found

- 未在 ego 浏览器目测（见 overview Caveats）。"870px 跳动"来自并行修复会话写在 Teleport 注释里的实测，不是本研究测得。
- Teleport 后，HEAD 测试里基于 `wrapper.find('.TxFlipOverlay-*')` 的断言查不到 teleport 节点（需 `attachTo` + `document.body.querySelector`，或 stub teleport）；工作区测试文件已在同步修改，未审阅其内容。
