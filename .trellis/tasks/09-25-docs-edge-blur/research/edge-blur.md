# 研究：Nexus 文档页顶/底边缘渐变模糊（`docs-edge-blur`）

- **Query**：老板反馈 Tuffex 文档页（暗色，如 `/docs/dev/components/base-suite`）顶/底"渐变模糊"坏了：① header 药丸上方能看到滚上去的半截文字（如 "Working"）；② 视口底部约 64px 内 FilterChips 文字发灰发虚，同高度的彩色图片却很清晰。要求查清现状标记/CSS/变体与层叠、TheHeader 几何与背景色、其它 layout 的做法、TxGradualBlur / TxEdgeFadeMask、相关测试门禁、已知技术坑，并给修复建议。
- **Scope**：mixed（代码阅读 + 规范 / MDN / Chrome Status / 技术文章）
- **Date**：2026-09-25
- **说明**：全部为代码阅读与文献结论，**未在浏览器实测**；需要实测的项集中在 §8.4。

---

## 0. 结论速览

1. **两个症状同一根因**：`.docs-edge-blur` 是**单层** `backdrop-filter` + `opacity: 0.72` + 线性 mask，且（非 tutorial 变体）**没有页面色渐隐**。规范原文："any opacity applied to element B will be applied to the filtered backdrop image as well" → 视口最边缘仍有 28% 的清晰原图叠在 8.8px 模糊上（重影、半透字）；mask 渐变段只是"清晰图 ↔ 同一档模糊图"的交叉淡化，不是渐进模糊。
2. **"文字发虚、图片清晰"不是层叠问题**：`.docs-layout-foreground` 是 `relative + z-index: 2` 的层叠上下文，里面任何东西（ImageGallery 缩略图、`z-30` 的左右栏、页内 fixed 演示）都画在 `z-index: 20` 的遮罩条**下面**，图片同样被模糊；只是约 9px 模糊对低频的渐变色块图几乎无感，对 12–13px 文字和 1px 描边破坏明显，又没有颜色渐隐统一压暗 → 观感不一致。
3. **门禁**：`apps/nexus/app/layouts/docs.performance.test.ts:38-43` 禁止 docs.vue 引入 `TxGradualBlur`（ff3a50a10 "perf(nexus): staticize docs edge blur" 专门把它换成静态 div），并要求两段 class 字符串原样存在。修复应是**静态 CSS 多层渐进模糊**（照搬 TxGradualBlur 的层结构/公式），不是换回组件。
4. **推荐**：保留两个容器及其 class 串；容器本身不带任何效果属性；内含 4 个全尺寸、带状 mask、模糊逐层翻倍、**不设 opacity** 的子层；最上层 `::after` 画页面色渐隐（顶部在药丸上方 16px 内不透明）。z 序维持现状（stage 内 z 20）。详见 §8。

---

## 1. 现状：标记、CSS、变体、层叠

### 1.1 标记（`apps/nexus/app/layouts/docs.vue`）

| 行 | 内容 |
|---|---|
| 398-401 | `.docs-layout-root relative min-h-screen flex flex-col bg-white text-black dark:bg-dark dark:text-light`；tutorial 路由加 `docs-layout-root--tutorial` |
| 402 | `.docs-layout-stage relative flex-1` |
| 403-420 | `.docs-layout-background`（fixed 背景层）：tuffex 文档 → `.docs-tuffex-hero-bg-frame` + `<TuffexDocsHeroBackground>`（idle/意图后挂载）；tutorial → `.docs-tutorial-background`；其它 → `.docs-background` |
| 421-422 | `<div class="docs-edge-blur docs-edge-blur--top" aria-hidden="true" />`、`--bottom`（无子节点） |
| 423 | `<TheHeader title="Tuff Docs" class="z-30" />` |
| 424 | `.docs-layout-foreground relative flex flex-1 justify-center pb-20 pt-20` |
| 427 | 左栏 `.docs-sidebar sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto … relative z-30`（底边正好贴视口底，最后 64px 在底部遮罩条下） |
| 446-450 | 右栏 "On this page"：`sticky top-24`；`#docs-outline-tools … relative z-30`；`.docs-outline-panel max-h-[calc(100vh-12rem)] … relative z-30` |
| 500-502 | `.docs-footer-sentinel`、`<LazyTuffFooter class="docs-layout-footer">`、`<LazyBackToTop>`——都在 stage 之外、root 之内 |
| 503-528 | 移动端 `DocsDrawer`（`ui/Drawer.vue` → `TxDrawer`，`TxDrawer.vue:221` teleport 到 body） |

路由判定：`isTuffexDocs` = `/docs/dev/components*` 或 `/docs/dev/tools/tuffex*`（84-87）；`isTutorialDocs` = `/docs/guide*`（89-92）。报障页 base-suite 属 tuffex 文档，走基础规则（有 backdrop-filter）。

### 1.2 CSS（docs.vue）

| 规则 | 行 | 值 |
|---|---|---|
| `.docs-edge-blur` | 646-659 | `position: fixed; left: 0; z-index: 20; width: 100vw; height: 64px; pointer-events: none; backdrop-filter: blur(0.55rem) saturate(1.05)`（0.55rem = 8.8px）；`opacity: 0.72`；`mask-image: linear-gradient(to bottom, black 0%, black 42%, transparent 100%)`（均带 `-webkit-`） |
| `.docs-layout-root--tutorial .docs-edge-blur` | 661-666 | `background: linear-gradient(to bottom, color-mix(in srgb, var(--tx-bg-color, #fff) 78%, transparent), transparent)`；`backdrop-filter: none`；`opacity: 1`（mask 仍继承基础规则） |
| 同上（暗色） | 668-671 | `background: linear-gradient(to bottom, rgba(7, 8, 10, 0.72), transparent)` |
| `.docs-edge-blur--top` | 673-675 | `top: 0` |
| `.docs-edge-blur--bottom` | 677-680 | `bottom: 0; transform: rotate(180deg)`（靠旋转翻转 mask/渐变方向） |
| root / stage | 533-535 / 554-556 | 都是 `isolation: isolate` |
| `.docs-layout-background` | 558-564 | `position: fixed; inset: 0; z-index: 0; width: 100vw; height: 100vh` |
| `.docs-layout-foreground` | 566-569 | `z-index: 2; padding-inline: var(--nexus-frame-gutter)` |
| `.docs-layout-footer` | 601-603 | `z-index: 3` |

变体一览：

| 变体 | 路由 | 边缘处理 |
|---|---|---|
| tuffex 文档 | `/docs/dev/components*`、`/docs/dev/tools/tuffex*` | 基础规则：单层 backdrop blur 8.8px + opacity .72 + mask，无底色 |
| 其它文档 | 其余 `/docs/**`（非 guide） | 同上（只有背景层不同） |
| tutorial | `/docs/guide*` | 无模糊；页面色半透渐变（亮 78% / 暗 .72）× mask，最外缘仍透出 22–28% 原内容 |

**历史**（`git log -S docs-edge-blur`）：

- ff3a50a10（2026-06-20，perf(nexus): staticize docs edge blur）：把 `<TxGradualBlur exponential :div-count="10" position="top|bottom" height="72px" :strength="1.3" :opacity="0.85" :z-index="-80" target="page" />` 换成单层静态 div（72px、blur 1.05rem、opacity .85、mask 0–48%），并加了 §6 的测试。
- f42d8d4e9（2026-07-19，quiet editorial docs reading surface）：改成现值（64px、0.55rem + saturate、opacity .72、mask 0–42%，注释 "Softer top/bottom fade instead of heavy frosted glass"），并新增 tutorial 变体。
- dffc31562（2026-07-19）：tutorial 不再强制暗色，补了亮色渐变。

即这次"柔化"把边缘清晰残影从 15%（opacity .85）提到了 28%（opacity .72）。

### 1.3 当前实际效果（可量化）

距视口边缘 d（px）处，模糊层实际不透明度 α(d) = 0.72 × mask(d)；mask 在 d ≤ 26.9px（64 × 42%）为 1，之后线性降到 d = 64px 处为 0。清晰原图占比 = 1 − α：

| d | α | 清晰原图占比 |
|---|---|---|
| 0–26.9px | 0.72 | 28% |
| 45px | ≈0.37 | ≈63% |
| 64px | 0 | 100% |

整条都是"清晰图 + 同一档 8.8px 模糊图"的叠影，不存在渐进模糊，也没有向页面色的淡出。

### 1.4 层叠上下文树

```
html（根元素 = Backdrop Root）
└ body > #__nuxt
  └ .docs-layout-root            relative + isolation:isolate → 层叠上下文（z:auto）   docs.vue:398, 533
    ├ .docs-layout-stage         relative + isolation:isolate → 层叠上下文（z:auto）   402, 554
    │  ├ .docs-layout-background fixed z:0（hero / tutorial / docs 背景）               403-420, 558-564
    │  ├ .docs-layout-foreground relative z:2 → 层叠上下文                               424, 566-569
    │  │   ├ .docs-sidebar  sticky, relative z-30（困在 z:2 内）                          427
    │  │   ├ main > .docs-content-column > <slot/>（画廊、ImageGallery…）                 431-445
    │  │   └ 右栏 #docs-outline-tools / .docs-outline-panel  relative z-30（困在 z:2 内）  446-496
    │  ├ .docs-edge-blur--top / --bottom   fixed z:20                                    421-422, 646-680
    │  └ <TheHeader> .TuffHeader  fixed z:10000                                          423；TheHeader.vue:220-231
    ├ <TuffFooter class="docs-layout-footer">  footer.relative + z:3 → 层叠上下文         501, 601-603；TuffFooter.vue:108
    └ <BackToTop> button.back-to-top  fixed z:40                                          502；BackToTop.vue:56-60
（teleport 到 body：TxDrawer、TheHeader 移动抽屉 z 10050、DocsAssistantDialog→FlipDialog（FlipDialog.vue:265）、
  TxModal、全局搜索、TemplateFrame 放大层 z 1900）
```

绘制顺序：stage 内 背景(0) → foreground(2) → 遮罩条(20) → header(10000)；root 内 stage(z:auto) → 页脚(3) → BackToTop(40)。

| 元素 | 相对遮罩条 | 依据 |
|---|---|---|
| TheHeader（fixed，**实际 z 10000**） | 上 | 与遮罩条同在 stage 内。`class="z-30"` 不生效：scoped 选择器 `.TuffHeader[data-v-…]`（0,2,0）胜过 UnoCSS `.z-30`（0,1,0）。`apps/nexus/app/utils/layers.test.ts:6-8` 也把 10000 记为 header 契约（"Hardcoded in TheHeader.vue"） |
| TuffFooter（整块） | 上 | root 层里 z 3 高于整个 stage；页脚滚进底部 64px 时不被模糊 |
| BackToTop（fixed z 40，right/bottom 24px） | 上 | root 层 z 40；按钮落在底部遮罩条范围内但不被模糊 |
| body 级 teleport 浮层 | 上 | 不在 docs root 内 |
| `.docs-layout-foreground` 里的一切：左栏/右栏 `z-30`、画廊 label `z-index: 1`（`DocsComponentsGallery.css:99`）、ImageGallery 缩略图（`TxImageGallery.vue:125-146`，无定位、无 z）、页内 TxGradualBlur 演示（即便 `target="page"`、z 10099） | **下** | foreground 是 z:2 的层叠上下文，内部 z-index / fixed 都出不去 |
| `.docs-layout-background` | 下 | z 0 |

结论：**ImageGallery 缩略图不可能画在底部遮罩条之上**；截图里"图片清晰"不是层叠造成的。

旁支发现（与本任务无直接关系，需实测）：stage 是 z:auto、页脚在 root 层 z 3。若页脚被滚到 header 带内（页脚高度 > 视口高 − 88px，窄屏常见），页脚会盖住 header 药丸。`.trellis/spec/frontend/nexus-docs-templates.md:81` 记录了 root/stage 的 isolation 让 header 的 10000 出不了 docs layout。

### 1.5 两个症状的解释

- **顶部**：药丸 `top: 1rem`（TheHeader.vue:246），页面在 window 上滚动，foreground 不被裁切，内容能一路滚到视口 y=0。药丸上方 0–16px 只有顶部遮罩条：α = 0.72，28% 的清晰字叠在 8.8px 模糊上，一行字的上半截露在药丸上方 → "半截 Working"。药丸 24px 圆角外侧同理。非 tutorial 变体没有任何底色去盖。
- **底部**：同样的 opacity .72 + mask 斜坡（见 §1.3）。FilterChips 是 12–13px 文字 + 1px 描边（高频），模糊 + 28%–63% 残影 → 发灰发虚；暗色下亮字被模糊成一片灰雾，更显"洗白"。ImageGallery 三张图是代码生成的 SVG：线性渐变天空 + 圆形太阳 + 山形剪影（`DocsComponentsGallery.vue:511-527` 的 `tileImage` / `galleryItems`），大色块、低频，9px 模糊几乎看不出；没有颜色渐隐，彩色图保持全亮度全饱和度。FilterChips 和 ImageGallery 是 base 网格的第 73、74 格（`DocsComponentsGallery.vue:2493-2521`，网格从 951 开始，中间没有跨列或条件渲染的格子），在 `.docs-gallery__grid`（两列，`DocsComponentsGallery.css:79-82`；≤640px 变单列，644-653）里正好同一行。
- 画廊格子 `.docs-gallery__stage` 垂直居中内容（`min-height: 236px; padding: 56px 28px 40px`，CSS:114-120）；缩略图约 105px 高，筹码约 32px 高，两者中心同高时，缩略图大部分落在 mask 已衰减的区域——这也会放大"图片更清晰"的观感（推断，需实测）。

---

## 2. TheHeader 几何（`apps/nexus/app/components/TheHeader.vue`）

- **带**：`.TuffHeader`（220-231）`position: fixed; top: 0; left: 0; width: 100%; height: 88px; z-index: 10000; pointer-events: none`，透明，只是一条 88px 的"带"。**fixed，不是 sticky。**
- **药丸** `.TuffHeader-Main`（238-273）：`position: absolute; top: 1rem; left: 0; right: 0; margin-inline: auto`；宽 `min(var(--nexus-frame-max), calc(100vw − 2 × gutter))`，`--nexus-frame-max: 66rem`（app.vue:547）；`border-radius: 24px; overflow: hidden; isolation: isolate`；静止态 `background: transparent; backdrop-filter: none !important`；`transform: translate3d(var(--wm-jitter-*, 0px)…)`（jitter 变量全仓未赋值，恒为 0）；入场动画 `tuff-header-quick-reveal`（367-379，opacity 0→1、`filter: blur(4px)→blur(0)`，fill `both`，动画后 `filter: blur(0)` 留在元素上）。
- **滚动态**（`window.scrollY > 8`，22-24）`.TuffHeader-Main--scrolled`（275-283）：宽 `min(var(--nexus-frame-compact), calc(100vw − 2rem))`，`--nexus-frame-compact: 840px`（app.vue:550）；亮 `background-color: rgba(255,255,255,.58)`；暗 `rgba(8,10,12,.58)` + 边框 `rgba(255,255,255,.12)` + 阴影（285-289）；`backdrop-filter: blur(18px) saturate(180%) !important`。**只有滚动态才有自己的毛玻璃。**
- **≤960px**（387-417）：`left/right: var(--nexus-frame-gutter)`（1rem，app.vue:551），宽 auto；导航收起为 38px 汉堡按钮。`top` 仍是 1rem。
- **高度**：由内容决定——`py-2` + 1px 边框 + 最高子项（`TxIconButton size="sm"` 32px，`icon-button.vue:165-168`；品牌 `text-xl`；汉堡 38px）≈ 50–56px，所以药丸约占 y = 16 → 66~72px（**估算，需实测** `getBoundingClientRect()`）。顶部遮罩条 0–64px 基本被药丸覆盖，只露出上方 16px 和两侧/圆角。
- **横向露出范围**：正文列 `.docs-content-column { max-width: var(--nexus-frame-compact) }`（docs.vue:579-581，注释说明就是为了和滚动态药丸同宽）；lg/xl 下两侧 aside 是 `sticky top-24`（96px），不会经过顶部带。所以桌面端经过顶部带的只有与药丸同宽的正文列：露字只发生在药丸上方 0–16px 和圆角处。窄屏正文与药丸都是左右 1rem 内缩，同理。
- 药丸画在遮罩条之后，它的 backdrop 包含遮罩条的输出（药丸下方的内容被模糊两次，无害）。

---

## 3. 页面背景色

| 场景 | 值 | 位置 |
|---|---|---|
| docs 根（所有变体的底） | 亮 `bg-white` = #fff；暗 `dark:bg-dark` = **#121212** | docs.vue:399；`apps/nexus/uno.config.ts:67`（`dark: '#121212'`） |
| tutorial 根 | 亮：primary 7% 径向 + `var(--tx-bg-color, #fff)`；暗：径向 + `linear-gradient(180deg, #07080a 0%, #0b0c0f 48%, #07080a 100%)`（按文档总高铺开，视口边缘实际色在 #07080a–#0b0c0f 之间变化） | docs.vue:537-552 |
| tuffex 文档背景层 | `.docs-tuffex-hero-bg-frame`：absolute、100vh、两层极淡渐变，opacity .34（暗 .28，889-895）；内含 `TuffexDocsHeroBackground` 漂浮色块（cyan 在 top 4%、amber 在 top 8% 等，`TuffexDocsHeroBackground.vue` 样式区）。整层位于 fixed 的 `.docs-layout-background` 中，不随滚动 | docs.vue:403-409, 558-564, 682-693 |
| 其它文档背景层 | `.docs-background`：顶部 42vh（max 420px）径向淡色，opacity .55 / 暗 .7，`filter: blur(2px)` | docs.vue:414-418, 735-747 |
| tuffex token | `--tx-bg-color` 亮 #ffffff（`variables.scss:251`，`:root`）/ 暗 **#141414**（`:463`，`.dark`）；高对比 mixin #ffffff / #05070d（:45 / :136） | `packages/tuffex/packages/components/style/variables.scss` |

注意：暗色 docs 页底色是 #121212，而 `--tx-bg-color` 是 #141414——边缘渐隐色如果用 `--tx-bg-color`，会比页面亮 2 级，可能出现色带。

---

## 4. 其它 Nexus layout 的边缘处理

| layout | 做法 |
|---|---|
| `default.vue` | 无（`main.absolute.inset-0` + 页脚，没有 header） |
| `home.vue` | 无（TheHeader + `main.relative.z-1` + 页脚） |
| `store.vue` | 无边缘处理；fixed 的 TouchRay 背景用径向 mask 淡出（33-42）；`<TheHeader class="z-10">`（15，同样被 10000 覆盖） |
| `fullscreen.vue` | 无 |
| `dashboard.vue` / `admin.vue` | 无；admin 把滚动移进 `<main>`（admin.vue 注释第 2 点） |
| `license.vue` | **TxGradualBlur** 顶/底：`height="72px" :strength="1.3" :opacity="0.85" :z-index="-80" target="page"`（11-12）。默认 5 层线性：2.6 / 3.9 / 5.2 / 6.5 / 7.8px，每层 opacity .85；z = −80 + 100 = 20。与 ff3a50a10 之前 docs.vue 的用法同源（页面底色 `dark:bg-black`） |

其它可参考：`DocsOutline.vue:617-618` 在自己的滚动容器上用 mask 两端各淡出 16px；`pages/updates.vue:295` 用 TxEdgeFadeMask 做横向滚动淡出。**没有任何 layout 做"模糊 + 页面色渐隐"组合**；docs.vue 的 tutorial 变体是唯一的颜色渐隐先例。

---

## 5. TxGradualBlur 与 TxEdgeFadeMask

### 5.1 TxGradualBlur（`packages/tuffex/packages/components/src/gradual-blur/`）

- 来源：React Bits `GradualBlur` 的 Vue 移植（同名 presets，同一公式 `Math.pow(2, progress * 4) * 0.0625 * strength`；DavidHDev/react-bits `src/content/Animations/GradualBlur/GradualBlur.jsx`）。
- Props（`src/types.ts`；默认值 `TxGradualBlur.vue:11-27`）：`position`（top|bottom|left|right，默认 bottom）、`strength` 2、`height` '6rem'、`width`、`divCount` 5、`exponential` false、`zIndex` 1000、`animated`（false|true|'scroll'）、`duration`、`easing`、`opacity` 1、`curve`（linear|bezier|ease-in|ease-out|ease-in-out）、`responsive` + mobile/tablet/desktop Height/Width、`preset`（含 `page-header` / `page-footer` = 10rem、strength 3、target page，78-89）、`gpuOptimized`、`hoverIntensity`、`target`（'parent'|'page'）、`onAnimationComplete`、`className`、`style`；默认 slot（`.tx-gradual-blur__slot`，427）。
- 实现（`blurDivs` 228-276）：渲染 `divCount` 个 `.tx-gradual-blur__layer`，**全部 `position: absolute; inset: 0`（整条大小）**，每层：
  - 模糊：`exponential ? 2^(p·4)·0.0625·s : 0.0625·(p·N+1)·s` rem（244-246，p = curve(i/N)）；
  - mask：`linear-gradient(<dir>, transparent p1%, black p2%, black p3%, transparent p4%)`，p1..p4 = (i−1..i+2)·100/N，超过 100 的段省略（248-257）；`<dir>` 指向边缘（top → `to top`，134-141），最强层落在最外缘，相邻层带状重叠；
  - 每层 `opacity: config.opacity`（266）。
- 容器（`containerStyle` 278-306）：`target: 'page'` → `position: fixed`、`width: 100vw; max-width: 100vw; left: 0; right: auto`；page 时 `zIndex + 100`（290）；`opacity: isVisible ? 1 : 0`（286）；`gpuOptimized` → `will-change: backdrop-filter, opacity` + `transform: translateZ(0)`（291-292）。
- SSR：层和内联样式在服务端直接渲染；window 访问都在 `hasWindow()` / `onMounted` 之后（163、324、337）；`animated: 'scroll'` 在 onMounted 才把 `isVisible` 置 false，SSR 首帧可见后再隐藏（会闪一下）。
- **能否给 docs 复用**：层结构本身就是正确的渐进模糊结构，`:z-index="-80"` 即得 20。但是：
  1. `docs.performance.test.ts:38-43` 明确禁止（§6）；
  2. 没有页面色渐隐层（默认 slot 画在各层之后，可塞一个渐变 div，但样式仍要自己写）；
  3. `opacity` < 1 时每层都有残影（license.vue 用 .85）；
  4. `gpuOptimized` 的 `will-change: …opacity` 以及 `animated` 淡入期间容器 opacity < 1，都会让容器成为 Backdrop Root（§7.2），子层按规范就模糊不到页面内容——docs 场景不能开，需实测确认；
  5. 每层都是整条尺寸的 backdrop-filter，N 层 = N 次整条模糊；组件文档自己也写了 "very high layer counts multiply backdrop-filter work"（`apps/nexus/content/docs/dev/components/gradual-blur.en.mdc:319`）。
  → 照搬它的层结构/公式写成静态 CSS 最合适。

### 5.2 TxEdgeFadeMask（`packages/tuffex/packages/components/src/edge-fade-mask/`）

- Props（`TxEdgeFadeMask.vue:10-17`）：`as` 'div'、`axis` vertical|horizontal、`size` 24、`threshold` 1、`disabled`、`observeResize` true。
- 实现：自带滚动容器 `.tx-edge-fade-mask__viewport`（overflow-y / x auto，184 / 189），监听它自己的 scroll（142）+ ResizeObserver，按 scrollTop / scrollHeight 决定两端是否淡出，把 `mask-image: linear-gradient(dir, leading 0, black size, black calc(100% − size), trailing 100%)`（67）写到 viewport 上。
- 纯 mask（内容变透明、露出背后），**没有模糊**，只作用于元素级滚动容器。docs 页滚动在 window 上，不适用；给 foreground 加 mask 还会让它成为 Backdrop Root（页内 GlassSurface / GradualBlur 演示受影响），并且 mask 不会跟着 window 滚动。**不可复用。**

---

## 6. 相关测试 / 门禁

- **`apps/nexus/app/layouts/docs.performance.test.ts`**
  - 16-36：hero 背景异步挂载（`defineAsyncComponent`、`requestIdleCallback`、`<ClientOnly>` 等字符串）——改遮罩条不涉及，但不要动这些字符串。
  - **38-43**：`not.toContain('@talex-touch/tuffex/gradual-blur')`、`not.toContain('<TxGradualBlur')`、`toContain('class="docs-edge-blur docs-edge-blur--top"')`、`toContain('class="docs-edge-blur docs-edge-blur--bottom"')`。这是**精确子串**：class 属性里再加一个类（如 `class="docs-edge-blur docs-edge-blur--top foo"`）就会失败；额外的类要用 `:class` 或放到子元素上。
- **`apps/nexus/app/pages/docs/docs-page-performance.test.ts`**：读取 docs.vue（:14）和 TheHeader.vue（:15），没有 edge-blur 断言；但对 docs.vue 有大量字符串断言（302-375，如 `not.toContain('<TxButton')` :346、各 lazy import、计时常量），改模板时不要碰。
- `apps/nexus/app/components/HeaderUiContracts.test.ts`：只测主题菜单 / 登录按钮，不涉及几何。
- `apps/nexus/app/utils/layers.test.ts:6-8`：`HEADER_Z_INDEX = 10000`、`MOBILE_DRAWER_Z_INDEX = 10050`，全局搜索层必须高于二者。
- `apps/nexus/test/guards/sfc-size-budget.test.ts:35`：SFC 行数上限 3000（docs.vue 现 895 行）。
- tuffex `gradual-blur/__tests__/gradual-blur.test.ts`：只测组件本身（层数、page 目标、gpu 样式等）。
- 相关 spec：`.trellis/spec/frontend/nexus-docs-templates.md:81`（root/stage isolation，header 10000 出不了 docs layout；TemplateFrame 放大层 z 1900）——调整层级时保持这一点。
- 运行：`pnpm -F @talex-touch/tuff-nexus exec vitest run app/layouts/docs.performance.test.ts app/pages/docs/docs-page-performance.test.ts`

---

## 7. 已知技术坑

1. **backdrop-filter 元素自身 opacity < 1 → 残影**。规范 §2.1 原文："any opacity applied to element B will be applied to the filtered backdrop image as well"。结果 = o·模糊 + (1−o)·原图。mask 的半透明段同理：单层 + 渐变 mask = 交叉淡化，不是渐进模糊。
2. **Backdrop Root**：祖先带 `filter`、`opacity < 1`、`mask` / `mask-image` / `mask-border` / `clip-path`、`backdrop-filter`、`mix-blend-mode`、对应的 `will-change`（以及根元素）时，子孙的 backdrop-filter **只能看到该祖先内部的内容**（Filter Effects 2 §3；MDN 用 `will-change: opacity` 的示例演示；SO 72780266 "Backdrop filter doesn't seem to work if a parent is masked"）。`z-index`、fixed / sticky、`transform`、`isolation` **不**触发。含义：多层方案的容器不能带 opacity / mask / backdrop-filter——现有 `.docs-edge-blur` 三样全有，不能直接往里塞子层。Chromium 偏差：issue 338250112 记录 `will-change: clip-path / mix-blend-mode / mask*` 未触发 Backdrop Root（偏离规范）；opacity / filter 在 MDN 示例中是触发的。
3. **模糊只采样元素边框盒内的像素**：规范规定 backdrop blur 使用 `edgeMode="mirror"`，边界为元素裁剪后的边框盒；Chrome 129 起改为 mirror（Chrome Status 5382638738341888）。→ 边框盒外的内容不会渗入（内容"进入"遮罩条时没有预兆，靠 mask 渐入来掩盖）；把每层缩成各自的窄带，会在每条带边界产生镜像缝，所以层要全尺寸 + mask（TxGradualBlur / Kenneth 的做法）。镜像边缘在滚动重复图案时仍会闪烁（Chromium 366415129），Kenneth 的文章用最外侧的页面色渐变盖住这种 "glitching"。
4. **多层叠加**：同一 backdrop root 内，后画的 backdrop-filter 兄弟层的输入包含先画层的输出 → 重叠带内模糊叠加（高斯近似 σ ≈ √(a² + b²)）。
5. **`transform: rotate(180deg)` + backdrop-filter**：规范的渲染步骤显式处理元素到 Backdrop Root 之间的 transform（先逆变换再滤镜），transform 也不是 Backdrop Root 触发条件；blur / saturate 对 180° 旋转对称，结果等价。没有检索到对应的浏览器 bug。它的问题在于 mask 只能写一份、方向靠旋转隐式翻转；子层方案用方向变量显式写两向更直观（Safari 仍需实测）。
6. **mask 与 backdrop-filter 在同一元素上**：mask 在滤镜之后应用，Chrome / Firefox / Safari 都可以（Josh Comeau；Kenneth 的渐进模糊依赖这一点）。`overflow` / `clip-path` 裁剪在 Chrome 里发生在滤镜之前（Josh），所以"扩展背板再裁掉"只能用 mask。兼容性（MDN BCD）：backdrop-filter 为 Chrome 76 / Firefox 103 / Safari 18（`-webkit-` 自 Safari 9）；mask-image 无前缀为 Chrome 120 / Safari 15.4 → 两者都保留 `-webkit-` 写法。
7. **fixed 元素的祖先**：带 `filter` / `backdrop-filter` / `transform` / `perspective` / `rotate` / `scale` / `translate` / `contain: layout|paint|strict|content` / `will-change: transform|filter` / `content-visibility: auto` 的祖先会成为 fixed 的包含块（MDN Containing block），遮罩条会跟着内容滚动；祖先的 `overflow` 本身不裁 fixed 元素（除非它就是包含块）。docs 现状：遮罩条的祖先只有 stage、root（relative + isolation）、`#__nuxt`、body、html，都没有上述属性（app.vue 的全局样式也没有）；docs 页 `pageTransition: false`（`pages/docs/[...slug].vue:40`）；`tuffex-docs-hero-bg-fade`（754-763）的 filter 在兄弟子树里，不影响。今后若给 root / stage 加 filter、transform 或动画，会同时破坏 fixed 定位和 backdrop root。
8. **其它**：
   - backdrop-filter 自身会创建层叠上下文，并成为 fixed / absolute 后代的包含块（规范）。
   - Safari 在 View Transition 期间禁用 backdrop-filter（WebKit 302256）；Nexus 暗色切换用的就是 View Transition，影响是瞬时的。
   - Firefox：sticky 元素 + 祖先同时有 overflow 和 border-radius 时 backdrop-filter 失效；滚动时模糊闪烁可用 `overscroll-behavior: none` 缓解（Josh）。
   - 性能：每层都要回读背景 + 模糊整块边框盒，fixed 条在滚动时每帧重算，成本 ≈ 层数 × 面积。现有 2 层，4 层 × 2 条 = 8 层，需要测帧。

---

## 8. 建议

### 8.1 方案（推荐）：静态多层渐进模糊 + 页面色渐隐，z 序不变

1. 模板（docs.vue:421-422）保留两个容器和**原样的 class 属性**，各加 4 个静态子节点 `<span class="docs-edge-blur__layer" />`（纯标记，不引入 JS / tuffex，符合 §6 门禁）。两个伪元素不够"4 层模糊 + 1 层渐隐"，所以需要子节点。
2. 容器只负责定位：`position: fixed; left: 0; right: 0; z-index: 20; height: 72px; pointer-events: none`，**不设** opacity / mask / filter / backdrop-filter / will-change（否则成为子层的 Backdrop Root）。去掉 `rotate(180deg)`，改用方向变量。
3. 子层：全尺寸（`inset: 0`），带状 mask 与 TxGradualBlur `divCount=4` 相同，模糊 1 / 2 / 4 / 8px 逐层翻倍（最外缘第 3、4 层完全重叠，≈ 9px，与现值相当但没有残影），**不设 opacity**。
4. `::after`（画在所有子层之后）做页面色渐隐：底部最外约 6px 不透明；顶部要在药丸上方 0–16px 内不透明。
5. 渐隐色必须等于 root 实际底色：亮 #fff、暗 #121212（不要用 `--tx-bg-color` = #141414）；tutorial 另设。
6. z 序保持：stage 内 z 20（高于 foreground 2、低于 header 10000；页脚 3 与 BackToTop 40 在 root 层，继续在上）。

### 8.2 CSS 草稿（起点，数值需在浏览器里调）

```css
/* 页面色：必须与 .docs-layout-root 的实际底色一致 */
.docs-layout-root { --docs-edge-color: #fff; }                                   /* = bg-white */
.dark .docs-layout-root,
[data-theme='dark'] .docs-layout-root { --docs-edge-color: #121212; }            /* = dark:bg-dark */
.docs-layout-root--tutorial { --docs-edge-color: var(--tx-bg-color, #fff); }
.dark .docs-layout-root--tutorial,
[data-theme='dark'] .docs-layout-root--tutorial { --docs-edge-color: #0a0b0d; }  /* 根渐变 #07080a–#0b0c0f 的折中 */

.docs-edge-blur {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 20;
  height: 72px;
  pointer-events: none;
  /* 保持"干净"：不要 opacity / mask / filter / backdrop-filter / will-change */
}
/* 方向指向视口边缘：0% = 内沿，100% = 视口边（与 TxGradualBlur 相同约定） */
.docs-edge-blur--top { top: 0; --docs-edge-dir: to top; }
.docs-edge-blur--bottom { bottom: 0; --docs-edge-dir: to bottom; }

.docs-edge-blur__layer {
  position: absolute;
  inset: 0; /* 全尺寸：模糊以边框盒为镜像边界，缩成窄带会出缝 */
  -webkit-backdrop-filter: blur(var(--docs-edge-b));
  backdrop-filter: blur(var(--docs-edge-b));
  -webkit-mask-image: linear-gradient(var(--docs-edge-dir), var(--docs-edge-m));
  mask-image: linear-gradient(var(--docs-edge-dir), var(--docs-edge-m));
}
.docs-edge-blur__layer:nth-child(1) { --docs-edge-b: 1px; --docs-edge-m: transparent 0%, #000 25%, #000 50%, transparent 75%; }
.docs-edge-blur__layer:nth-child(2) { --docs-edge-b: 2px; --docs-edge-m: transparent 25%, #000 50%, #000 75%, transparent 100%; }
.docs-edge-blur__layer:nth-child(3) { --docs-edge-b: 4px; --docs-edge-m: transparent 50%, #000 75%, #000 100%; }
.docs-edge-blur__layer:nth-child(4) { --docs-edge-b: 8px; --docs-edge-m: transparent 75%, #000 100%; }

/* 页面色渐隐，画在模糊层之上：文字与图片在最外缘一视同仁地消失 */
.docs-edge-blur::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(var(--docs-edge-dir),
    transparent 0%,
    color-mix(in srgb, var(--docs-edge-color) 55%, transparent) 55%,
    var(--docs-edge-color) 92%);
}
/* 顶部：药丸 top 16px ≈ 72px 条的 78%–100%，这一段必须不透明 */
.docs-edge-blur--top::after {
  background: linear-gradient(var(--docs-edge-dir),
    transparent 15%,
    color-mix(in srgb, var(--docs-edge-color) 70%, transparent) 55%,
    var(--docs-edge-color) 76%);
}

/* 不支持 backdrop-filter 时只保留颜色渐隐 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .docs-edge-blur__layer { display: none; }
}
```

同时删掉 docs.vue:661-671 的 tutorial 覆盖（它改的是容器的 background / backdrop-filter）；如果 tutorial 要保持"无模糊"（f42d8d4e9 的本意），改为 `.docs-layout-root--tutorial .docs-edge-blur__layer { display: none; }`，只留颜色渐隐（最外缘 α 变成 1，不再透字）。

### 8.3 取舍与备选

- **z 序不动的理由**：页脚底色是 `bg-black/80` 叠在 TouchAurora 上（TuffFooter.vue:109-125），与 #121212 不同。若让遮罩条盖住页脚，底部渐隐会在页脚上画出一条色带；现状"页脚在遮罩条之上"对颜色渐隐方案反而合适。如果一定要让页脚也被模糊：需要把遮罩条**连同 TheHeader** 一起移到 `.docs-layout-root` 直属（二者 fixed，不影响 flex 布局），得到 页脚 3 < 条 20 < BackToTop 40 < header 10000，顺带修掉"页脚盖 header"。代价是页脚区域的颜色匹配问题。
- **顶部层数**：经过顶部带的只有与药丸同宽的正文列，药丸本身有 18px 毛玻璃；顶部主要靠颜色渐隐挡住 0–16px，模糊层可减到 2–3 层省 GPU。
- **最省兜底**：去掉全部 backdrop-filter，只留页面色渐隐（tutorial 做法 + 最外缘 α=1）。零合成成本，但失去"渐变模糊"的质感。
- **不推荐**：换回 `<TxGradualBlur>`（门禁 + 无颜色层 + opacity / gpuOptimized 陷阱）；TxEdgeFadeMask / 给 foreground 加 mask（window 滚动不适用，且会产生 Backdrop Root 副作用）。

### 8.4 必须在真实浏览器验证（暗 + 亮；Chrome + Safari，最好加 Firefox）

1. `/docs/dev/components/base-suite` 暗色：把一行正文滚到药丸上方 0–16px 和药丸圆角处 → 不可读、无残影。
2. 底部：FilterChips + ImageGallery 那一行停在视口底边 → 文字与图片同样淡出，不再"字灰图清"。**先用现状确认根因**：DevTools 里把 `.docs-edge-blur--bottom` 的 opacity 改为 1、或临时 `display: none`，对比截图，确认图片同样被模糊（验证 §1.5 的推断）；用 `document.elementsFromPoint` 确认缩略图在遮罩条之下。
3. 层与层之间无分带 / 接缝；滚动文字、代码块穿过遮罩条时无边缘闪烁（Chrome ≥129 为 mirror 边缘）。
4. 渐隐色与页面一致：tuffex 文档（fixed hero 背景）、其它文档、tutorial（根渐变）三种背景下都没有色带；静止态（未滚动）顶部色带会不会压到 hero 背景顶部的色块（cyan 在 top 4%）。
5. 滚动态药丸上半部是否因下方的颜色渐隐显得更深 / 更平。
6. 滚动性能：base-suite 页（演示最重）用 CDP Performance 录制滚动，对比改前后帧时间、GPU 耗时（2 → 8 个 backdrop 层）。
7. 页脚滚进底部时的表现（保持在遮罩条之上是否可接受）、BackToTop 不被模糊；顺便看窄屏滚到底时页脚是否盖住 header（§1.4 旁支发现）。
8. ≤960px（汉堡 header）和 390px 宽度。
9. 暗 / 亮切换（View Transition）过程与结束后的颜色变量是否正确（Safari 过渡期间 backdrop 失效属已知行为）。
10. 跑 §6 的两条 vitest。

---

## 9. Caveats / Not Found

- 全部为代码阅读结论，未在浏览器实测；药丸高度为估算；"图片清晰"的解释（低频内容 + 无颜色渐隐 + mask 衰减位置）是推断，需要按 §8.4 第 2 条确认。
- 没有检索到 `transform: rotate(180deg)` 与 backdrop-filter 组合的具体浏览器 bug。
- Chrome 对 `will-change` 触发 Backdrop Root 的完整行为未逐项核实（MDN 示例证明 `will-change: opacity` 触发；Chromium 338250112 记录 clip-path / mix-blend-mode / mask* 未触发，该 issue 当前状态未查）。
- 会话的 current task 指针是 `09-25-stat-card-glow-badge`；按调用方指示写入 `09-25-docs-edge-blur`。

---

## 外部参考

- [CSS Filter Effects Module Level 2（Editor's Draft）](https://drafts.csswg.org/filter-effects-2/)：§2.1 backdrop-filter 渲染步骤、"opacity 作用于滤过背景"注记、blur 的 mirror 边缘、backdrop-filter 创建层叠上下文与包含块；§3 Backdrop Root 定义与触发条件（注明 WG 尚未达成共识）。
- [MDN：backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)：Backdrop root 列表与 `will-change: opacity` 示例。
- [MDN：Containing block](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block)：fixed 元素包含块的触发属性。
- [Chrome Status：Update CSS backdrop-filter to use mirror edgeMode](https://chromestatus.com/feature/5382638738341888)：Chrome 129 默认开启。
- [Chromium issue 366415129](https://issuetracker.google.com/issues/366415129)：mirror 边缘在滚动内容上的闪烁。
- [Chromium issue 338250112](https://issues.chromium.org/issues/338250112)：部分 `will-change` 值未触发 Backdrop Root。
- [Kenneth Nym：progressive blur in css（2024-10-26）](https://kennethnym.com/blog/progressive-blur-in-css/)：重叠带状多层、模糊逐层翻倍、最外侧页面色渐变盖住 glitch。
- [Josh W. Comeau：Next-level frosted glass with backdrop-filter（2024-12，2026-04 更新）](https://www.joshwcomeau.com/css/backdrop-filter/)：只采样正后方像素、mask 在滤镜后应用、Chrome 中 overflow/clip-path 先于滤镜、Firefox 怪癖。
- [StackOverflow 72780266](https://stackoverflow.com/questions/72780266/why-doesnt-blur-backdrop-filter-work-together-with-mask-image)：父级 mask 使子级 backdrop-filter 失效。
- [WebKit bug 302256](https://bugs.webkit.org/show_bug.cgi?id=302256)：View Transition 期间 backdrop-filter 不生效。
- MDN browser-compat-data：`css/properties/backdrop-filter.json`、`css/properties/mask-image.json`。
- [React Bits GradualBlur](https://github.com/DavidHDev/react-bits/blob/main/src/content/Animations/GradualBlur/GradualBlur.jsx)：TxGradualBlur 的原型。
