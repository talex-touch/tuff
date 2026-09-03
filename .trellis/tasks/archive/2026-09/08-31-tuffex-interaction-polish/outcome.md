# Outcome — 2026-08-31

三个子任务均已实现并验证。**未提交**（用户未要求），改动留在工作树。

## 1. slider 拖杆尺寸 — 完成

`.tx-slider__surface` 的状态通道从 `transform: scale()` 换成真实 `width`/`height`（`calc(基准 × --tx-slider-surface-extent)`），`transform` 只留 `translate(-50%, -50%)`，加 `contain: layout` 把布局作用域锁死在这个叶子内。按下回弹保留在 transform 通道（它逐帧跑），系数按 1.18 归一化后不变，末帧 `scale(1)` = 基础 transform。

`--tx-slider-surface-scale` → `--tx-slider-surface-extent`（全库确认无外部覆盖点）。

**实机实测（CDP，nexus dev :3200，transition 结束后取样）**

| 状态 | 宽 × 高 | 圆角 | transform |
|---|---|---|---|
| rest | 38 × 17 | **13px** | 纯 translate |
| hover | 68.39 × 30.59 | **13px** | 纯 translate |
| drag | 89.67 × 40.11 | **13px** | 纯 translate |
| 回到 rest | 38 × 17 | **13px** | 纯 translate |

盒子涨 2.36×，圆角恒定 13px。改前是 6.5 → 11.7 → 15.3（随 scale 一起缩），1px 内描边同理。`contain: layout` 未影响 `backdrop-filter`（实测仍为 `blur() saturate()`）。

## 2. cursor 全量排查 — 完成

扫 148 个组件目录，21 个候选，逐个核实：**真缺失 5 个，假阳性/不需要 16 个**。

**已修**

| 组件 | 改动 | 实测 cursor |
|---|---|---|
| `.tx-button` 基类 | `cursor: pointer` | `pointer`；`.disabled` 仍为 `not-allowed`（特异性实测确认，非推断） |
| `flat-dropdown` | 包装器即触发器，`cursor` 可继承到插槽内容 | `pointer` |
| `fusion` | `[role='button']` 限定（只有 click 触发才是按钮） | 6 个实例中 1 个 `pointer`，5 个 hover 型保持 `auto` |
| `status-badge` | `[role='button']` 限定 | 文档站无 interactive demo；运行时翻转属性验证：`status → auto`，`button → pointer`，还原 → `auto` |
| `spark-chart` scrubber | `crosshair`（读数游标，不是拖拽把手） | `crosshair` |

**守卫**：`packages/tuffex/scripts/audit-interactive-cursor.mjs`（`audit:cursor` / `audit:cursor:self-test`），报告型不阻塞，自带 4 例 self-test 与 16 条 REVIEWED 判定理由。

**假阳性的三种来源**（这是这次排查最重要的结论）：渲染 `TxCardItem :clickable` 的（agents / dropdown-menu / search-select / select / context-menu）、渲染 `TxButton` 的（dialog×4 / empty-state / chat）、`<a>` 带必填 href 由 UA 给指针的（cell-link / inline-citation）。按目录粒度扫会**漏掉** `.tx-button` 本身——阳性对照就是靠这条立起来的。

## 3. anchor 浮层跟手 — 完成（按真实成因修，非原始诊断）

用户诊断"动画结束后 transition 没干掉"在源码里**没有对应物**：整条 `TxTooltip → TxBaseAnchor → TxCard/TxBaseSurface` 链上没有任何 transform/left/top 的过渡。真实成因是 `useFloating({ transform: false })` 让定位走 `left`/`top`，而浮层是 `position: fixed`、靠 `autoUpdate({ animationFrame: true })` 每帧重写位置 —— 每帧都在使布局失效。

改为 `transform: true`。**实机实测**：`left: 0px / top: 0px` + `transform: matrix(1,0,0,1,901.5,67)` + `will-change: transform`，定位确认落在合成通道上。

design.md 标为最高风险的副作用（根节点 transform 是否打坏面板毛玻璃）**已排除**：开着的面板内两层 backdrop-filter 都在活 —— 琉光位移滤镜 `url(#tx-glass-filter-…) saturate(2.33)` 与 `blur(22px) saturate(2.56) contrast(1.18) brightness(1.10)`；截图目视确认边缘高光与折射正常。

**诚实的边界**：帧数延迟是结构性的（`computePosition` 异步 + Vue flush），本次改动不消除它，改善的是每次更新的代价（不再触发布局/重绘）。jsdom 无排版引擎，量不出这个代价差，所以没有前后帧偏差数字——implement.md 里那条度量步骤实际不可执行，这里如实记录。

## 验证

- `packages/tuffex` 全量单测 **1867 passed / 193 files**
- tuffex `vue-tsc` **exit 0**
- nexus typecheck **通过**，且用故意注入的类型错误做过阳性对照（捕获 + exit 2），确认不是假绿
- core-app typecheck **exit 0**
- 改动文件 eslint **0 问题**
- `audit:size` 预算全绿（对新鲜 dist）
- `audit:cursor:self-test` 4/4 通过

## 顺带发现（未修，按范围纪律只记录）

1. **`pnpm -C packages/tuffex build` 在 Node 26 上直接死** —— `packages/script/build/run.ts:9` 把 `pnpm` 硬编码解析成 `corepack`，而 Node 26 不再随发行版附带 corepack，报 `spawn corepack ENOENT`。既有断裂，与本次改动无关，但会让 dist 为空 → nexus 每页 500 + typecheck 假错。本次用一次性 PATH shim 绕过（已清理）。**建议单独开 issue**。
2. **`TxBaseAnchor` 每帧多做一次强制排版** —— `autoUpdate` 回调里的 `hasReferenceMoved()` 又调了一次 `getBoundingClientRect()`，叠在 autoUpdate 自己的读取之上。这是滚动期间另一份主线程开销，但超出本次批准的范围。
3. **`TxLoadingOverlay` 是全屏拦截层却没有 `cursor: progress`/`wait`** —— 它不是"可交互元素"，所以判定为不在本次范围；是否要加交给你定。
4. **`status-badge` 文档站没有 interactive demo** —— 所以 `[role='button']` 这条规则在文档里永远不会被展示到。加一个 demo 属于文档扩容，没做。
