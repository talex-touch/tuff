# Implement — slider 胶囊拖钮

文件：
- `packages/tuffex/packages/components/src/slider/src/TxSlider.vue`
- `packages/tuffex/packages/components/src/slider/__tests__/slider.test.ts`
- `apps/nexus/content/docs/dev/components/slider.{zh,en}.mdc`

## 顺序

1. **先算弹簧、锁字符串。** 用 `spring.ts` 的 `resolveTransition({ stiffness: 560, damping: 34 })`（stub `CSS.supports` 为 true）拿到 `linear(...)` 与 duration；同时跑一遍模拟确认过冲 / 反向次数 / settle 满足 PRD 4。数值记进 design.md 的表。**先写测试**：断言 SCSS `@supports` 分支里的 `--tx-slider-ease` 等于该字符串——此时应当红。

2. **重写测试里锁旧关键帧的用例。** `lands the press bounce back on the base transform` 改为断言：源码里**不存在** `tx-slider-thumb-press` / `tx-slider-surface-press`，`&__surface` 的 transition 列表含 `width` / `height` 且时长变量指向 `--tx-slider-state-duration`。`gives rest, hover and drag three distinct extents` 改为 rest = hover < drag ≤ rest × 1.10。加阳性对照：`ruleBody` 仍能取到 `&__surface` 与 `@supports` 块。这一步全部应当红。

3. **删除清单落地**（见 design.md）：两组关键帧、溶解块、相关变量、reduced-motion 里的 `animation: none`。跑测试，确认第 2 步的"不存在"断言转绿、其余仍红。

4. **胶囊配方 + 三态。** 改 `.tx-slider` 变量块与 `&.is-hovering, &.is-focused` / `&.is-dragging` 两处状态块；`&__surface` 加 `box-shadow` 三层、`border-radius: 999px`。`--tx-slider-surface-opacity` 三态皆 1。

5. **原生 thumb 退化为命中区。** `.has-surface .tx-slider__input::-webkit-slider-thumb`：透明、无边框、无阴影、`width: var(--tx-slider-thumb-size)`（现在 = 胶囊宽）、`height: var(--tx-slider-height)`。`.tx-slider` 基块里 `--tx-slider-thumb-size: 40px`，`&:not(.has-surface)` 覆盖回 `18px` 并保留旧圆钮样式。**这一步后实机拖一次**：填充条终点必须落在胶囊中心，两端不出界。

6. **焦点环追加到胶囊**（design.md「焦点环」）。实机 Tab 到滑块截图。

7. **弹簧曲线写入** `@supports` 分支；hover 用独立的短 ease-out。第 1 步的测试转绿。

8. **reduced-motion 段复核**：所有 `--tx-slider-*-duration` 归零后无过渡；不再需要 `animation: none`。

9. **tooltip 叠放核对**：拖拽时 tooltip 底边与胶囊顶边不重叠；若重叠只调 `tooltipStyle` 里的 `y` 常量，不动其他。

## 测试

在 `slider.test.ts`：

- `@supports` 分支 `--tx-slider-ease` 与 `resolveTransition` 输出逐字相等（导入 `../../liquid/src/spring`，测试前 `globalThis.CSS = { supports: () => true }`）
- 回退分支 `--tx-slider-ease` 是无过冲 bezier（y1 ≤ 1 且 y2 ≤ 1）
- 源码不含两组 press 关键帧、不含 `--tx-slider-thumb-blur` / `--tx-slider-thumb-opacity`
- rest = hover extent，drag ≤ 1.10
- `&__surface` 含 `border-radius: 999px`、`box-shadow` 含 `inset 0 0 0 1px`
- `.has-surface` 路径 `--tx-slider-thumb-size` 与 `--tx-slider-surface-width` 数值相等；`:not(.has-surface)` 为 18px
- 挂载：默认 props 下 `.tx-slider__surface` 存在且 `has-surface`；`thumbSurface: false` 时不存在（既有用例保留）

⚠️ 不要把改后的渲染结果快照成断言。每条新用例先在改动前跑一次红。

## 文档同步

触发 `.trellis/spec/frontend/tuffex-docs-sync.md`。wrapper 扫描：`rg -l "\.\./\.\./slider'" packages/tuffex/packages/components/src` 为空，只有组件自身两页。

- `slider.{zh,en}.mdc` Props 表 `thumbSurface` 一行：从"折射圆盘：hover 淡入、拖拽胀大"改为"常驻玻璃胶囊，拖拽时轻微放大；`false` 得到扁平圆钮并省掉 `backdrop-filter`"。
- `## 交互契约`：加一条"键盘焦点环绘制在胶囊上"，放在既有 a11y 条目旁，不追加到末尾。
- `## 审阅说明` 的实测覆盖句：改为描述弹簧曲线锁定、胶囊尺寸通道、无关键帧；覆盖句保持在段末。
- 若有 CSS 变量表，更新 `--tx-slider-surface-*` 的默认值与新增的 `--tx-slider-surface-rim`。
- zh / en 段数不变。5 个 slider demo（含 elastic tooltip）实机各看一眼。

## 验证命令

```bash
cd packages/tuffex && node $(ls -d ../../node_modules/.pnpm/vitest@*/node_modules/vitest | head -1)/vitest.mjs run packages/components/src/slider
cd packages/tuffex && node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts   # nexus 读 dist
# nexus typecheck 内含 `nuxt prepare`，会重生成运行中服务器的 .nuxt 并把它打成 503：
# 只在 :3200 停掉时跑，集成阶段统一一次。
cd apps/nexus && pnpm typecheck 2>&1 | grep "error TS" || echo "nexus typecheck clean"   # 服务器停掉后再跑
# core-app：分开跑两条。`npm run typecheck` 的 typecheck:web 会先无锁重建 tuffex dist，
# 会打掉别人的 dist 并让 nexus dev（从 dist 解析 tuffex）进入 503；集成阶段再统一跑。
cd apps/core-app && npx tsc --noEmit -p tsconfig.node.json --composite false
cd apps/core-app && node $(ls -d ../../node_modules/.pnpm/vue-tsc@*/node_modules/vue-tsc | head -1)/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false
cd apps/nexus && node build/check-doc-translation-parity.mjs && node build/check-mdc-fences.mjs
```

实机：`pnpm -C apps/nexus dev:pure`（:3200，若已在跑就复用）+ 父任务 `research/shoot.mjs`（改 `MODE=dark|light`）截 slider 与 Radio 两格。

## 回滚点

步骤 3（删除）与步骤 4–7（新配方）各自可独立还原；步骤 5 完成后先实机拖一次再继续。
