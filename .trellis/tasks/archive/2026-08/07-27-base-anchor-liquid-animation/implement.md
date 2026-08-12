# Implement — BaseAnchor liquid drop animation

前置：`prd.md`（需求 / 验收）、`design.md`（技术设计）。本文件只管执行顺序、验证命令与回退点。

## 命令速查

```bash
# 组件单测（只跑 base-anchor）
corepack pnpm -C packages/tuffex exec vitest run packages/components/src/base-anchor

# 文档结构 + demo 注册完整性
pnpm -C apps/nexus exec vitest run test/docs/tuffex-component-docs-coverage.test.ts app/components/content/demo-client-boundary.test.ts

# 组件文档分类校验（dry run，不加 --apply）
python3 apps/nexus/scripts/recategorize-component-docs.py

# lint / typecheck
pnpm lint:changed
pnpm -C packages/tuffex exec vue-tsc --noEmit -p tsconfig.json   # 若无此脚本改用包内 typecheck

# 人工看效果
pnpm -C apps/nexus dev      # 访问 /docs/dev/components/base-anchor
```

---

## Stage 1 — 纯几何内核（无 DOM，先把数学锁死）

**目标**：`base-anchor-liquid.ts` 的纯函数部分可单测通过，再碰任何渲染。

- [ ] 1.1 新建 `packages/tuffex/packages/components/src/base-anchor/src/base-anchor-liquid.ts`
- [ ] 1.2 实现 `createCubicBezier(x1, y1, x2, y2) => (t: number) => number`（牛顿迭代 + 二分兜底），以及 `parseCubicBezier(css: string)`（解析 `cubic-bezier(a,b,c,d)`，失败返回 `null`）
- [ ] 1.3 实现 `easeOutQuad` / `easeOutCubic` / `clamp01`
- [ ] 1.4 实现 `geometryAt(p, metrics)`：
      - `top = topStart + (topEnd - topStart) * easeOutQuad(clamp01(p / DETACH_AT))`，`DETACH_AT = 0.45`
      - `height = seedHeight + (panelH - seedHeight) * easeOutCubic(clamp01(p))` ← **独立公式，绝不写成 `bottom - top`**
      - `bottom = top + height`（派生量，仅供阴影与逐项揭示用）
- [ ] 1.5 导出 `LIQUID_DEFAULTS`（duration 260 / closeDuration 150 / 两条曲线 / gooBlur 4.5 / threshold 20,-9 / seedHeight 12 / itemSelector）

**门禁 G1** — 新增测试文件 `__tests__/base-anchor-liquid.test.ts`，必须覆盖：

- [ ] G1.1 `createCubicBezier(0.23,1,0.32,1)` 在 `t=0 → 0`、`t=1 → 1`、单调递增
- [ ] G1.2 稿值 metrics（`topStart:-28, topEnd:0, seedHeight:12, panelH:146`，即稿子坐标系 20→48 / 12→146）下：
      - `p=0` → `{top: -28, height: 12}`（稿值 `{20, 12}`）
      - `p=1` → `{top: 0, height: 146}`（稿值 `{48, 146}`）
      - `p=0.45` → `top` 已到 `0`（稿值 48），`height ≈ 12 + 134 × 0.833625 = 123.71`（±0.5）
- [ ] G1.3 **反交叉断言**：构造 `topEnd` 远大于 `topStart + panelH` 的畸形 metrics，断言 `height` 仍 `>= seedHeight`（证明高度不是 `bottom - top`，不会塌成细线 → AC6）
- [ ] G1.4 `parseCubicBezier('back.out(2)')`、`parseCubicBezier('spring(...)')` 返回 `null`（拒绝弹簧 → AC7）

> 这一阶段结束时数学已定型。后面出问题只可能出在渲染，排查面直接砍半。

**回退点 R1**：仅新增两个文件，删掉即回到原状。

---

## Stage 2 — 类型与默认值

- [ ] 2.1 `types.ts`：`BaseAnchorAnimationType` 追加 `'liquid'`
- [ ] 2.2 `types.ts`：`BaseAnchorAnimationOptions` 追加 `gooBlur` / `gooThreshold` / `gooThresholdOffset` / `outlineColor` / `triggerRadius` / `seedHeight` / `itemSelector`（全部可选，逐个写 JSDoc 说明仅 liquid 生效）
- [ ] 2.3 `base-anchor-motion.ts`：`resolvedAnimation` 按 `type === 'liquid'` 切到 `LIQUID_DEFAULTS`；**确认既有四种类型的默认合并结果逐字段不变**
- [ ] 2.4 `base-anchor-motion.ts`：`shouldAdaptSurfaceFor` 对 liquid 返回 `false`

**门禁 G2**

- [ ] G2.1 `corepack pnpm -C packages/tuffex exec vitest run packages/components/src/base-anchor` 全绿（既有 7 个用例一个都不能挂 → AC1）
- [ ] G2.2 新增用例：`animation: { type: 'liquid' }` 解析出 `duration: 260` / `closeDuration: 150` / 两条 cubic-bezier 串
- [ ] G2.3 新增用例：`animation: { type: 'transfer' }` 仍解析出 `duration: 432` / `closeDuration: 194.4` / `back.out(2)`（防污染）

**回退点 R2**：类型是纯扩展，回退不影响调用方。

---

## Stage 3 — 渲染层（goo 舞台）

- [ ] 3.1 `TxBaseAnchor.vue`：新增 `usesLiquidMotion` computed 与 `liquidStageRef` / `liquidShapesRef` / `liquidShadowRef` / `liquidPanelRectRef`
- [ ] 3.2 新增 `liquidMetrics` computed：由 `readReferenceRect()` + 浮层 rect 算 `triggerLocal`；`triggerRadius` 取 `animation.triggerRadius ?? getComputedStyle(referenceRef.firstElementChild ?? referenceRef).borderTopLeftRadius`
- [ ] 3.3 新增 `liquidRegion` computed：union bbox 外扩 `pad = ceil(gooBlur * 3)`，产出 `{x, y, w, h}` 供 `viewBox` 与 `filterUnits="userSpaceOnUse"` 的 region 共用
- [ ] 3.4 模板：`v-if="usesLiquidMotion"` 渲染 `.tx-base-anchor__liquid`，内含
      - `.tx-base-anchor__liquid-shadow`（div，**在 svg 之外**）
      - `svg.tx-base-anchor__liquid-goo` → `<defs>`（`<g id="shapes-{uid}">` 两个 `<rect>` + 两个 `<filter>`）+ 两个 `<use>`
- [ ] 3.5 两个 filter 逐字节共享前两级（`feGaussianBlur` + `feColorMatrix`），outline 链再追加 `feMorphology[erode,1]` → `feComposite[out]` → `feFlood` → `feComposite[in]`；全部标 `color-interpolation-filters="sRGB"`
- [ ] 3.6 `outlineColor` 解析：`getComputedStyle(document.documentElement).getPropertyValue('--tx-border-color')`，trim 后为空则回落 `#dcdfe6`（`feFlood` 不吃 `var()`）
- [ ] 3.7 liquid 下抑制既有 `__outline` 圆角矩形描边（`v-if` 加 `&& !usesLiquidMotion`），避免双描边
- [ ] 3.8 liquid 下抑制 `__arrow`
- [ ] 3.9 样式：`.tx-base-anchor__liquid` 为 `absolute` + `pointer-events: none`；z 序 shadow(0) < svg(1) < `__clip`(2)；`__liquid-shadow` 用 `box-shadow: 0 10px 26px rgba(0,0,0,0.14)`（对齐 `TxCard` `is-shadow-soft`）
- [ ] 3.10 liquid 下 `panelCardProps.background` 强制 `'pure'`；`.tx-base-anchor__clip` 的 `overflow` 置 `visible`
- [ ] 3.11 `prefers-reduced-motion` 检测（照 `TxFloating.vue:235-246` 的 `matchMedia` 写法，含 `hasWindow()` + `typeof window.matchMedia !== 'function'` 守卫与 `onBeforeUnmount` 拆卸）

**门禁 G3**

- [ ] G3.1 `eager: true` + `animation: {type:'liquid'}` 挂载后，`document.body` 内可查到 `feGaussianBlur[stdDeviation="4.5"]` 与含 `20 -9` 的 `feColorMatrix`（AC2）
- [ ] G3.2 outline 滤镜链含 `feMorphology[operator="erode"]` + `feComposite[operator="out"]` + `feFlood`（AC3）
- [ ] G3.3 触发器幽灵 `<rect>` 与面板 `<rect>` 是**同一个** `<g>` 的兄弟节点（AC2）
- [ ] G3.4 **阴影孪生在滤镜外**：从 `.tx-base-anchor__liquid-shadow` 向上遍历祖先，断言无节点带 `filter: url(#…)`，且它不是 `svg` 的后代（AC4）
- [ ] G3.5 liquid 下无 `.tx-base-anchor__arrow`、无 `.tx-base-anchor__outline`；`TxCard` 收到 `background: 'pure'`（AC9）
- [ ] G3.6 `transfer` 下 `.tx-base-anchor__liquid` 不存在（防污染）

**回退点 R3**：模板新增块全在 `v-if="usesLiquidMotion"` 内，摘掉该块即恢复。

---

## Stage 4 — 驱动接线

- [ ] 4.1 `base-anchor-liquid.ts` 增加 `createLiquidDriver({ ... })`：rAF 循环，每帧算 `geometryAt(p)` 并写
      - 面板 `<rect>` 的 `y` / `height`
      - 阴影孪生的 `top` / `height`（`transform` 或 `top`+`height`，二选一并保持一致）
      - 每个条目的 `opacity`
- [ ] 4.2 `base-anchor-motion.ts`：`animateOpen` / `animateClose` 在 `await loadGsap()` **之前**分派 liquid 并 `return`（liquid 不加载 gsap）
- [ ] 4.3 条目测量：`content.querySelectorAll(itemSelector)`，无匹配回落到卡片内容的直接元素子节点；`hold = offsetTop + offsetHeight * 0.5`，`opacity = clamp01((bottom - hold) / 18)`
- [ ] 4.4 `clearTimeline()` 追加：`cancelAnimationFrame` + 清空 liquid 写过的内联样式（形状属性、阴影、条目 opacity）
- [ ] 4.5 每帧 `isCurrentRun(runId)` 守卫；结束时调既有 `finishOpen` / `finishClose`，保持 `keepAliveContent` / `setMounted` / `setPanelSurfaceMoving` 语义
- [ ] 4.6 降级分支：横向 placement → 走 `opacity` 路径；`isUnlimitedHeight` → 既有落定分支；reduced-motion → 直接跳终态

**门禁 G4**

- [ ] G4.1 条目揭示：构造 `bottom < hold` 的状态，断言该条目 opacity 为 `0`（AC8）
- [ ] G4.2 liquid 打开时 `gsap.set` / `gsap.timeline` **未被调用**（证明没走 gsap 路径）
- [ ] G4.3 快速 open→close 打断：断言旧 rAF 不再写样式（`isCurrentRun` 生效）
- [ ] G4.4 `corepack pnpm -C packages/tuffex exec vitest run packages/components/src/base-anchor` 全绿（AC11）

> jsdom 无布局：`offsetTop` / `offsetHeight` / `getBoundingClientRect` 均为 0。条目揭示与几何断言走**纯函数**与**注入 metrics**，不依赖真实布局。rAF 在 jsdom 下需 `vi.useFakeTimers()` 或直接测驱动器的单帧 `applyFrame(p)` 函数 —— 优先把 `applyFrame` 拆成可独立调用的导出。

**回退点 R4**：驱动是 liquid 分支内的提前返回，摘掉分派即回到"liquid 直接落定"，不影响其余类型。

---

## Stage 5 — 文档 demo

- [ ] 5.1 新建 `apps/nexus/app/components/content/demos/BaseAnchorLiquidDemo.vue`
      - 按稿几何：触发器 `width: 200px; height: 40px; border-radius: 11px`，`:offset="8"`，`:width="200"`，面板内容实测 146 高
      - 条目带 `data-liquid-item`
      - 双语走 `const { locale } = useI18n()` + `locale.value.startsWith('zh')` 分支（对齐 `BaseAnchorAnimationDemo.vue` 的写法，**不用 `t()` key**）
- [ ] 5.2 `demo-registry.ts` 加**单行**：`BaseAnchorLiquidDemo: () => import('./demos/BaseAnchorLiquidDemo.vue'),`（放在 `BaseAnchorCustomEaseDemo` 与 `BaseAnchorPlacementDemo` 之间，保持字母序）
- [ ] 5.3 确认 demo 未使用 `app/plugins/tuffex.ts` 尚未注册的 `Tx*` 组件（`TxBaseAnchor` / `TxButton` 已注册，若新增别的需补 loader + map 条目）

**门禁 G5**

- [ ] G5.1 `pnpm -C apps/nexus exec vitest run test/docs/tuffex-component-docs-coverage.test.ts app/components/content/demo-client-boundary.test.ts` 全绿（AC10）

---

## Stage 6 — 文档同步

- [ ] 6.1 `base-anchor.zh.mdc`：在「动画模式」之后插入 `## 液滴动画` + `### 液滴下坠` + 单行 `:::TuffDemoWrapper{demo="BaseAnchorLiquidDemo" code-lang="vue"}` 块
- [ ] 6.2 `base-anchor.zh.mdc`：`### BaseAnchorAnimationOptions` 表格补 `type` 新值与 7 个新字段行
- [ ] 6.3 `base-anchor.zh.mdc`：`## 交互契约` 补 liquid 的硬约束（强制 `pure`、抑制箭头、横向降级、reduced-motion）
- [ ] 6.4 `base-anchor.zh.mdc`：`## 审阅说明` 补新增覆盖面
- [ ] 6.5 `base-anchor.en.mdc`：以上四处**逐节镜像**（章节数量与层级必须与 zh 一致）
- [ ] 6.6 保持 `since: 2.5.0` / `syncStatus: reviewed` / `verified: true` / `category: Feedback` 不变；**不动** `index.{en,zh}.mdc`

**门禁 G6**

- [ ] G6.1 `pnpm -C apps/nexus exec vitest run test/docs/tuffex-component-docs-coverage.test.ts`（校验 `## API` / Props 标题 / `## 最佳实践` / `## Best Practices` / demo 引用可解析 → AC13）
- [ ] G6.2 `python3 apps/nexus/scripts/recategorize-component-docs.py` 无报错

---

## Stage 7 — 收尾验证

- [ ] 7.1 `pnpm lint:changed`
- [ ] 7.2 tuffex + nexus typecheck
- [ ] 7.3 `corepack pnpm -C packages/tuffex exec vitest run packages/components/src/base-anchor`
- [ ] 7.4 `pnpm -C apps/nexus exec vitest run test/docs app/components/content`
- [ ] 7.5 **人工验收（必须，jsdom 测不出视觉）**：`pnpm -C apps/nexus dev` → `/docs/dev/components/base-anchor`
      - [ ] 面板是从触发器**内部**淌出来的，不是从背后滑出
      - [ ] 颈部确实变细、收紧、断裂（不是整片平移）
      - [ ] 灰边是**一条连续的环**，包住触发器 → 沿颈延伸 → 合拢面板；无双描边、无黑色硬边块
      - [ ] 阴影是柔和的，没有被阈值切成硬边黑板
      - [ ] 断裂瞬间面板已长出大半身子且仍在填充
      - [ ] 关闭明显更快且不是打开的倒放
      - [ ] 条目不会在面板长到能容纳它之前出现
      - [ ] 暗色主题下描边与填充色正确（切 `data-theme="dark"`）
- [ ] 7.6 依 `AC1..AC13` 逐条对照勾验收

---

## 风险与预案

| 风险 | 征兆 | 预案 |
|---|---|---|
| 滤镜 region 裁剪 | 颈部出现直角截断 | 调大 `pad`（当前 `gooBlur * 3`）；确认两个 filter 的 region 与 `viewBox` 一致 |
| linearRGB 导致阈值漂移 | 边缘发灰、描边粗细不均 | 确认两条链都标了 `color-interpolation-filters="sRGB"` |
| `<use>` + filter 渲染异常 | 描边与填充错位 | 退到两份独立 `<g>` 源形状（design.md §13 已记权衡） |
| 颈部断得太早/太晚 | 断裂点与 `topEnd` 不吻合 | 调 `gooBlur`（4.5）与 `gooThreshold`（20/-9）；两者共同决定断裂间隙 |
| reference 移动时舞台错位 | 滚动/窗口变化后幽灵与真实触发器分离 | `liquidMetrics` 必须依赖已有的 `lastReferenceRect` 更新链（`hasReferenceMoved` → `autoUpdate`） |
| jsdom 无布局导致测试假绿 | 单测过但真机不对 | 几何断言全部走纯函数 + 注入 metrics；视觉必须走 7.5 真机验收 |

## 实测记录（Stage 7.5）

jsdom 全绿但真机三处不对，全部已修并补了回归测试：

1. **测量过早** —— `@floating-ui/vue` 的 `update()` 返回 void 不可 await，`prepareLiquid` 在浮层定位/定宽前就跑了，整个轮廓画在错误位置（幽灵 `(60,60)` 而非 `(0,-48)`，面板宽 149 而非 200）。改为 `measureLiquid()` 逐帧可重跑 + 签名短路。回归测试：`re-derives the stage when the panel is positioned after the drop starts`（已做变异验证：移除逐帧重测量后该用例失败）。
2. **模板绑定覆盖逐帧写入** —— `liquidTrigger` 变化触发重渲染时 Vue 把 `height` 重置回 `0`。面板 rect 的 `y` / `height` 改为只由 `applyLiquidFrame` 写。
3. **条目锚点取中线过早** —— 断裂瞬间条目下半截渲染在轮廓外。改取条目底边。

另外两处观感调整：reference 抬至 goo 层之上（否则触发器被盖住）、幽灵外扩 1px（否则触发器的环被压在底下看不见）。

验证方式：临时 Vite harness 直接挂载真实 `TxBaseAnchor` + playwright-core 驱动缓存的 chromium，用**受控时钟**（覆写 `performance.now`）把打开动画停在任意 p 上逐帧截图。注意 headless Chrome 默认 `prefers-reduced-motion: reduce`，必须显式设 `reducedMotion: 'no-preference'`，否则动画会被正确地跳过而看起来像没生效。
