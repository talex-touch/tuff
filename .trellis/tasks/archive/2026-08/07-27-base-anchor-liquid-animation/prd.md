# BaseAnchor liquid drop animation

## Goal

给 `TxBaseAnchor` 增加两种共用一套引擎的打开动效 `animation.type = 'drip'` 与 `'bead'`：面板像一滴水从触发器自身"淌"出来 —— 触发器本体与面板处于同一个 SVG goo 滤镜内，起初完全融合，随着面板下沿下落，两者之间的颈部变细、收紧、最终断裂。灰色描边由**合并后的轮廓**推导，形成一条连续的环，而不是分别画在两个元素上。

同时在 Nexus 文档站补一个按稿复刻的 demo，并同步 `base-anchor.en.mdc` / `base-anchor.zh.mdc`。

## Scope

**In scope**

- `packages/tuffex/packages/components/src/base-anchor/` — 新增 `liquid` 动画类型（类型、动效驱动、SFC 渲染层）
- `apps/nexus/app/components/content/demos/BaseAnchorLiquidDemo.vue` — 新 demo（按稿几何）
- `apps/nexus/app/components/content/demo-registry.ts` — 注册 demo
- `apps/nexus/content/docs/dev/components/base-anchor.{en,zh}.mdc` — 文档同步
- `packages/tuffex/packages/components/src/base-anchor/__tests__/base-anchor.test.ts` — 测试补充

**Out of scope**

- 不改动 `transfer` / `boom` / `opacity` / `none` 四种既有动画的任何行为
- 不新建独立组件（不做 `TxLiquidDropdown`）
- 不改 `TxCard` / `TxBaseSurface`
- 不改 `since: 2.5.0`，不动 `index.{en,zh}.mdc` 组件索引

## Requirements

### R1 — 单一 goo 滤镜合并触发器与面板

- 触发器**本体**（一个按 reference 实测矩形绘制的形状）与面板形状必须位于**同一个** SVG 滤镜内，滤镜链为 `feGaussianBlur(stdDeviation 4.5)` → `feColorMatrix` 硬 alpha 阈值。
- 面板必须是从触发器上**撕下来**的（经由一个变细、收紧的颈部），不能是从触发器背后滑出来的。
- 触发器可见的填充与文字必须**不透明地叠在滤镜层之上**，不参与 goo。
- reference 插槽内容本身不得被移动、克隆或改变（goo 层画的是几何幽灵，不是 DOM 拷贝）。

### R2 — 描边由合并轮廓推导

- 灰色描边（约 `#DFE2E8`）必须从**阈值化后的合并轮廓**推导：腐蚀 1px，对差集做 flood。
- 结果必须是一条连续的环：包住触发器 → 沿颈部延伸 → 合拢在面板四周。
- 禁止在触发器或面板任一元素上单独绘制 border / outline。

### R3 — 阴影走滤镜外的孪生元素

- 阴影必须由一个位于滤镜**外部**的孪生元素承载。
- 理由：`box-shadow` 若经过 goo，会被 alpha 阈值切成一块硬边黑板。

### R4 — 单一进度值驱动的几何

- 所有几何由**一个**进度值 `p` 推导（0 = 关闭，1 = 打开）。
- 面板由**两条下落的边**描述，不是一个变大的盒子：
  - 上沿：`triggerH/2` → `triggerH + offset`，快速下落，用 ease-out-quad 作用于 `clamp(p / 0.45, 0, 1)`，到达后**停住**。
  - 高度：`seed` → 实测面板高度，用 ease-out-cubic 作用于 `p`，**贯穿并越过断裂时刻**。
- 高度必须**直接定义**，绝不能写成 `bottom - top`（两条独立的边会交叉，把面板夹成一条线）。
- 验证锚点：`p = 0.45`（颈部断裂时刻）高度必须为 `easeOutCubic(0.45) = 83.4%`，即"已经长出大半个身子且仍在填充"。

### R5 — 时序

- 打开：**260ms**，`cubic-bezier(0.23, 1, 0.32, 1)`。
  - *需求变更（用户，实测后）*：原定 190ms。因主曲线极度前载，`p` 在 `t≈0.1155` 就到达断裂阈值，下坠段仅占约 22ms —— 60Hz 下约 1.3 帧，几乎看不见。用户要求打开再慢一点，遂调至 260ms（下坠段约 30ms）。关闭时长不变。
- 关闭：150ms，`cubic-bezier(0.25, 0.46, 0.45, 0.94)`。必须明显快于打开，曲线与打开**不同**且更短，**不是打开曲线的反向**，**不是 ease-in**。
- 全流程**不得出现任何弹簧**（不用 `back.*` / `elastic.*` / 物理弹簧）。

### R6 — 菜单项淡入锚定面板生长

- 每个菜单项的淡入必须锚定**面板自身的生长量**，而不是原始时钟。
- 硬约束：任何一项都不能在面板长到足以容纳它之前出现。

### R7 — 通用化与稿值一致

- 几何全部从真实 reference 矩形与实测内容尺寸推导，不写死像素。
- 在 demo 的稿值条件下（触发器 200×40 / 圆角 11、`offset=8`、面板 200 宽、内容 146 高、`seed=12`）必须精确还原：上沿 `20 → 48`，高度 `12 → 146`。

### R9 — `bead`：宽度由速度驱动（用户后续追加）

- `bead` 与 `drip` **共用同一套引擎、几何与时序**，唯一区别是面板**宽度**。
- 宽度由 `p` 的**速度**驱动，而不是进度：`|dp/dt|` 越大，面板两侧收得越紧；速度衰减到 0 时回到全宽。
- 速度必须按**时间线占比**归一化（线性匀速恰好读作 `1.0`），使收腰量与时长、刷新率无关。
- 收腰绕面板**中线**对称 —— 是缩颈，不是侧移。
- 收腰**永不**把面板收成零宽：零宽矩形会整个掉出高斯场，颈部会提前断裂。
- 动画结束时必须回到全宽（运动停止 = 不再报告速度）。

### R8 — 文档同步

- `base-anchor.en.mdc` 与 `base-anchor.zh.mdc` 必须同步新增：liquid 章节 + demo 块 + API 表格行（`BaseAnchorAnimationType` 新值与新增 options 字段）+ 交互契约/降级说明。
- 两个 locale 的章节数量与结构必须对齐；`drip` 与 `bead` 各一节、各一个 demo。
- demo 必须注册进 `demo-registry.ts`。

## Constraints

- **C1** 面板 teleport 到 `<body>`，reference 留在原地 —— 两者天然不在同一滤镜上下文。goo 层必须在浮层内按 reference 的 fixed 矩形重绘触发器本体。floating-ui 用 `strategy: 'fixed'` + `transform: false`，视口坐标可直接对齐。
- **C2** `panelBackground` 默认 `'refraction'`，其四种非 `pure` 取值均带 `backdrop-filter`；`backdrop-filter` 在 SVG 滤镜内不生效，且毛玻璃经 alpha 阈值会被切成硬边。liquid 必须走不透明填充（`pure`）。
- **C3** `.tx-base-anchor__clip` 默认 `overflow: hidden`，会裁掉需要外溢的 goo 模糊，liquid 下必须放开。
- **C4** `showArrow` 与 goo 颈部语义冲突，liquid 下必须抑制箭头。
- **C5** `filter: url(#…)` 在 Safari / Firefox 均受支持（受限的是 `backdrop-filter: url(#…)`），因此不需要 `TxGlassSurface` 那套三级降级。
- **C6** 既有 `outlinePath` 圆角矩形描边（`TxBaseAnchor.vue`）在 liquid 下必须让位给 goo 推导的环，否则会出现双描边。
- **C7** demo 组件不参与 Nuxt 自动注册，必须在 `demo-registry.ts` 中以**单行** `Name: () => import('./demos/Name.vue'),` 形式登记（校验测试用正则逐行解析）。
- **C8** `:::TuffDemoWrapper{...}` 开启行必须保持单行（校验正则不跨行匹配）。

## Acceptance Criteria

- [x] **AC1** `BaseAnchorAnimationType` 包含 `'liquid'`，且 `transfer` / `boom` / `opacity` / `none` 的既有测试全部继续通过。
- [x] **AC2** liquid 打开时，DOM 中存在一个 goo 滤镜（`feGaussianBlur` `stdDeviation=4.5` + `feColorMatrix` 阈值矩阵），且触发器幽灵形状与面板形状是同一滤镜的兄弟节点。
- [x] **AC3** 描边滤镜链包含 `feMorphology[operator=erode]` + `feComposite[operator=out]` + `feFlood`，且 flood 颜色可配置、默认约 `#DFE2E8`；触发器与面板元素自身无 `border` / `outline` 声明。
- [x] **AC4** 承载阴影的元素不在任何 `filter: url(#…)` 子树内（测试断言其祖先链无 goo 滤镜）。
- [x] **AC5** 几何纯函数可单测：`geometryAt(p)` 在稿值输入下满足 `p=0 → {top: 20, height: 12}`、`p=1 → {top: 48, height: 146}`、`p=0.45 → {top: 48, height: 12 + 134*0.834}`（±0.5px）。
- [x] **AC6** `height` 由独立公式给出；构造 `top` 越过 `top + height` 的输入时高度仍 `>= seed`（不塌成细线）。
- [x] **AC7** 打开 260ms / `cubic-bezier(0.23,1,0.32,1)`，关闭 150ms / `cubic-bezier(0.25,0.46,0.45,0.94)`，两者可从解析后的动画配置读出；关闭时长严格小于打开；代码中不存在弹簧缓动。
- [x] **AC8** 菜单项透明度是面板当前高度的函数：给定 `fill < itemTop` 的状态，该项 opacity 为 0。
- [x] **AC9** liquid 下 `panelBackground` 被强制为不透明路径，`showArrow` 被抑制，`clip` 的 `overflow` 为 `visible`。
- [x] **AC10** `BaseAnchorLiquidDemo` 已注册且文档引用可解析：`pnpm -C apps/nexus exec vitest run test/docs/tuffex-component-docs-coverage.test.ts app/components/content/demo-client-boundary.test.ts` 通过。
- [x] **AC11** `corepack pnpm -C packages/tuffex exec vitest run packages/components/src/base-anchor` 通过。
- [x] **AC12** `pnpm lint:changed` 与 tuffex / nexus typecheck 通过。
- [x] **AC14** `bead` 的收腰在峰值速度达到 `beadPinch`（每侧），随后单调衰减，结束时归零回到全宽；`x + width/2` 恒等于面板中线。
- [x] **AC15** `normalizedVelocity` 对线性匀速返回 `1.0`，对 `dt <= 0` 与非有限输入返回 `0`；开关两个方向同样收腰（取绝对值）。
- [x] **AC13** en / zh 两份文档新增章节一一对应，API 表格同步，`syncStatus: reviewed` / `verified: true` / `since: 2.5.0` 保持不变。

## Open Questions

无。`p` 的读法已定案：detach 阈值 `p/0.45` 在 p 空间判定，`easeOutCubic(0.45) = 83.4%`，与"断裂时已长出大半身子"一致；p 到时间的映射由 R5 的 cubic-bezier 承担。

## Notes

- 稿值到通用参数的映射：`20 = triggerH/2`、`48 = triggerH + offset`、圆角 11 取自 reference 自身 `border-radius`、面板圆角取 `panelRadius`。
- 参考实现：`packages/tuffex/packages/components/src/fusion/src/TxFusion.vue`（goo 滤镜写法、per-instance filter id、测试断言约定）。

## 验收证据（2026-08-11 回填）

实测命令与结果，而非重述实现：

| AC | 证据 |
|---|---|
| AC10 | `pnpm -C apps/nexus exec vitest run test/docs/tuffex-component-docs-coverage.test.ts app/components/content/demo-client-boundary.test.ts` → **22 passed / 2 files**；`BaseAnchorDripDemo` / `BaseAnchorBeadDemo` 的 `.vue` 与 `demo-registry.ts` 单行登记均在位 |
| AC11 | `vitest run packages/components/src/base-anchor` → **53 passed / 2 files** |
| AC12 | tuffex `lint` RC=0、tuffex `typecheck` 0 errors、nexus `typecheck` 0 errors |
| AC13 | en / zh 各 6 个 `##`、13 个 `###`、8 个 `TuffDemoWrapper`；两份 frontmatter 同为 `since: 2.5.0` / `syncStatus: reviewed` / `verified: true` |
| AC1–AC8、AC14 | 对应断言存在于 `__tests__/base-anchor-liquid.test.ts` 与 `base-anchor.test.ts`，抽查过数值而非只看用例名：AC5 的 `p=0 → top≈20 / height≈12` 由 `reproduces the spec geometry at both ends of p` 直接断言 |
| AC15 | 「非有限输入返回 0」此前**无任何测试**，本次补齐（`reports no speed at all rather than a non-finite one`）。两个变异各自杀死它：移除 `Number.isFinite` 守卫 → 失败；移除 `Math.abs` → 失败 |

### 三处措辞与覆盖的偏差，勾选时按实际行为判定

1. **AC1 写 `'liquid'`**，`BaseAnchorAnimationType` 实际是 `'drip' | 'bead'`（`types.ts:11`）。按实现判定为满足。
2. **AC15 写 `normalizedVelocity` 与 `dt <= 0`**，源码里是 `liquidVelocityAt(p, t, ease)`，采闭式求导、不再有 `dt`（该设计正是它替换掉的，见函数注释）。`dt <= 0` 一项已不适用；其余按实际签名验证。
3. **AC9 的第三项**（`clip` 的 `overflow` 为 `visible`）由 `.tx-base-anchor.is-liquid .tx-base-anchor__clip` 的 CSS 提供，jsdom 不套用 SFC `<style>`，**无法在 vitest 中断言计算样式**。测试断言的是 `is-liquid` 这个类挂上了，即该规则的挂钩；规则本身经代码检视确认。另两项（抑制箭头、面板不透明）由 `suppresses the arrow, the rounded-rect outline, and the card surface` 覆盖。

### 一处排查中被推翻的判断

AC9 的「`panelBackground` 被强制为不透明」一度被判为未实现——`TxBaseAnchor.vue` 确实原样透传该 prop。但模板是 `v-if="usesLiquidMotion"` 走 liquid 面板、`v-else-if="props.useCard"` 才走 `TxCard`，**liquid 下 `TxCard` 不渲染，`panelCardProps` 从不被消费**。liquid 自己在 goo 层以 `feFlood`（`--tx-fill-color-lighter`）画不透明面，该 AC 的实质本就满足，只是不经过这个 prop。据此写的强制逻辑是死代码，已回退。
