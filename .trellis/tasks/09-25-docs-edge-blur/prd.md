# Nexus 文档页顶 / 底边缘渐变模糊修复

父任务：`09-25-tuffex-jelly-indicator-polish`。与其它子任务无依赖。

## Goal

老板（2026-09-25，截图 #3）："文档页面渐变模糊也有问题"——顶栏药丸上方能看到滚上去的半截文字，视口底部的内容被糊成半透明的灰雾（文字发虚、彩色图片却很艳）。让文档页的顶 / 底边缘真正做到"渐进模糊 + 淡入页面底色"：内容进入边缘时逐渐变糊、最终消失在页面色里，文字和图片一视同仁，任何位置都不透出清晰残影。

## 根因（research/edge-blur.md §0、§1）

- `.docs-edge-blur`（`apps/nexus/app/layouts/docs.vue:646–680`）是**单层** `backdrop-filter: blur(0.55rem)` + `opacity: 0.72` + 线性 mask：按规范，元素 opacity 同样作用在模糊结果上，最边缘仍有 28% 的清晰原图叠在模糊上（重影、半截字）；mask 斜坡只是"清晰 ↔ 同一档模糊"的交叉淡化，不是渐进模糊。非 tutorial 变体没有任何页面色渐隐。
- "字虚图清"不是层叠问题：`.docs-layout-foreground` 是 z 2 的层叠上下文，图片同样在遮罩条下被模糊，只是低频色块看不出 9px 模糊；没有颜色渐隐统一压暗，于是观感不一致。
- 7 月的"柔化"把 opacity 从 0.85 降到 0.72，残影从 15% 变成 28%。

## Requirements

- R1 顶部：药丸上方 0–16px 与药丸两侧圆角处，滚上去的内容不可读、无清晰残影；药丸下缘以下内容自然地渐进变糊、淡入页面底色。
- R2 底部：进入视口底边的内容（文字、描边、图片）同样渐进模糊并淡入页面底色，最外缘完全是页面色；不再出现"半透明灰雾"的文字。
- R3 渐隐色与页面实际底色一致：亮色 `bg-white`（#fff），暗色 `dark:bg-dark`（#121212，**不是** `--tx-bg-color` #141414）；tutorial 变体（`/docs/guide*`，根背景是渐变）保持"只做颜色渐隐、不做模糊"的原意，且最外缘不再透字。
- R4 结构约束（门禁 `app/layouts/docs.performance.test.ts:38–43`）：不引入 `TxGradualBlur`；两个容器的 class 属性原样保留；多层结构写成静态标记 + CSS。
- R5 层叠顺序不变：header（10000）在上，foreground（2）在下；页脚与 BackToTop 保持现状。
- R6 性能可接受：滚动 base-suite 页（演示最重）时帧时间与改前相比无明显劣化（CDP 录制对比）。
- R7 窄屏（≤960px 汉堡 header、390px）与亮 / 暗切换过程中都成立。

## Acceptance Criteria

- [ ] ego 浏览器：base-suite 暗色，正文行停在药丸上方与圆角处、FilterChips + ImageGallery 一行停在视口底边，改前 / 改后截图对比；亮色、tutorial 页、窄屏各抽查一张；层与层之间无分带 / 接缝，滚动时无边缘闪烁。
- [ ] 渐隐色与页面底色一致（取样像素对比，无色带）。
- [ ] CDP Performance 滚动录制，改前 / 改后帧时间对比写入任务记录。
- [ ] `vitest run app/layouts/docs.performance.test.ts app/pages/docs/docs-page-performance.test.ts` 通过；Nexus eslint（包内）与 `git diff --check` 通过。

## Out of Scope

- 页脚滚进 header 带时是否盖住 header（research §1.4 旁支发现）——单独记录，不在本任务修。
- 其它 layout（license.vue 仍用 TxGradualBlur）。
- TxGradualBlur 组件本身。
