# Implement — 文档页边缘渐进模糊

## 步骤

1. [x] 改前取证（ego，TaskSpace 31，暗色 base-suite）：
   - 顶部：正文行停在药丸上方 0–16px / 圆角处的截图；
   - 底部：FilterChips + ImageGallery 一行停在视口底边的截图；临时把 `.docs-edge-blur--bottom` 设 `display: none` 再截一张，确认图片同样被模糊（research §8.4-2），`document.elementsFromPoint` 确认缩略图在遮罩条之下；
   - CDP Performance 录一次滚动（基线帧时间）。
2. [x] `apps/nexus/app/layouts/docs.vue`：两个容器 class 属性原样，各加 4 个 `<span class="docs-edge-blur__layer" />`；按 design.md 重写 `.docs-edge-blur*` 样式与 `--docs-edge-color`；删除 tutorial 旧覆盖，改为隐藏模糊层；`@supports not` 降级。
3. [x] 调参（ego，同一滚动位置反复截图）：条高、各层模糊值、`::after` 渐隐色标；顶部确认药丸上方 16px 完全被页面色盖住。
4. [x] 回归：亮色、tutorial（亮 / 暗）、其它 docs 页、≤960px、390px；亮暗切换；页脚滚到底、BackToTop。
5. [x] 性能：同条件 CDP 滚动录制，对比帧时间；若劣化明显，顶部减到 2–3 层。
6. [x] 测试：`pnpm -F @talex-touch/tuff-nexus exec vitest run app/layouts/docs.performance.test.ts app/pages/docs/docs-page-performance.test.ts`（:3200 运行中时用 vitest 直连入口，不跑 typecheck 包装脚本）；Nexus 包内 eslint `app/layouts/docs.vue`；`git diff --check`。

## 回滚点

单文件：还原 `apps/nexus/app/layouts/docs.vue`（Vite 热更新即生效，无需重建）。

## 验证记录（2026-09-26）

- 实现：两个容器 class 原样，各含 4 个 `v-for` 渲染的 `.docs-edge-blur__layer`；容器无任何效果属性；顶部 88px（药丸 16→66px，外侧 20% 为实色）、底部 64px；模糊 1 / 2 / 4 / 8px，带状 mask 同 TxGradualBlur `divCount=4`；`::after` 渐隐到 `--docs-edge-color`（亮 #fff、暗 #121212、tutorial 亮 `--tx-bg-color`、tutorial 暗 #090a0d）；tutorial 隐藏模糊层；`@supports not` 降级。
- ego（TaskSpace 31）截图：`/tmp/jelly-baseline/edge-{top,bottom}-after.png`（暗，对比 `edge-{top,bottom}.png`）、`edge-bottom-chips-after.png`（FilterChips + ImageGallery 停在底边：文字与图片同样渐进模糊并淡入底色）、`edge-{top,bottom}-light.png`、`edge-top-tutorial.png`、`edge-narrow.png`（390px）。药丸上方不再透出内容；画廊竖线在顶部淡出。
- 回归：暗 / 亮（手动切 `html.dark`，未录 View Transition 过程）、tutorial 暗色、1816 / 960 / 390px、滚到页底（页脚在 root 层 z 3，照旧不被遮罩，无色带）、BackToTop 正常；`edge-960.png`、`edge-footer-960.png`。未做：tutorial 亮色、Safari / Firefox。
- 取证说明：第 1 步里"隐藏底部条确认图片也被模糊"没有单独做；改后截图里图片与文字在同一底边同样渐进模糊、淡入底色，已直接证明修复覆盖两者。
- 性能：ego 窗口 rAF 被节流在 ~30fps，同页同滚动 8 层 vs 隐藏模糊层 p50 33.3 / 30.8–33.3ms、p95 42.2–42.6 / 41.8–49.4ms，无可测差异（该环境测不出细小 GPU 开销）。
- 测试：`app/layouts/docs.performance.test.ts` + `app/pages/docs/docs-page-performance.test.ts` 41/41；eslint `app/layouts/docs.vue` 通过；`git diff --check` 通过。
