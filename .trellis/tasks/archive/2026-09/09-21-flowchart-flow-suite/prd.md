# TxFlowchart 与 flow 文档套件

父任务：`.trellis/tasks/09-21-bui-parity-and-interaction/`

## 背景

老板 2026-09-21：「尤其是 flowchart 可以单开一个 ai data 后面的 flow」。

beautifului.dev 的 `#16 Flowchart`（"Workflow trigger and condition steps on a dotted canvas"）在 2026-08 首次移植时尚不存在，是上游此后新增的案例，我们没有对应实现。

## 需求

1. 新增 `TxFlowchart` 组件，还原上游的点阵工作流画布。
2. 在 nexus 文档站新增第六个套件 `flow`，位置排在 `ai`、`data` 之后。
3. 走完 tuffex 新组件的注册链条与文档链条。

## 上游实测规格（`/tmp/tuff-ref/bui-shots/flowchart.png` + 计算样式提取）

| 项 | 值 |
|---|---|
| 画布 | 480×333，`border-radius: 10px`，背景 `oklch(0.985 0.001 286.376)` |
| 点阵 | `radial-gradient(oklch(0.912…) 1px, transparent 1.25px)`，`background-size: 22px 22px` |
| 连线 | SVG path，`stroke-width: 1.25px`，三次贝塞尔 `M 240 110 C 240 161.7, 240 152.3, 240 204` |
| 分类胶囊 | 高 24px，`border-radius: 6px`，**11.5px** / 500 |
| 节点卡片 | `border-radius: 18px`，白底 + `shadow-card` |
| 节点定位 | `position: absolute` + `-translate-x-1/2`（`x` 是水平中心），`touch-none`（可拖拽） |

连线控制点从路径反推：两点都越过中点且交叉，偏移 = 垂距 × 0.55。竖直对齐的一对因此读作直线。

## 设计决策

- **`flow` 只是文档套件，不新增组件桶。** 组件桶固定 base/pro/ai 三分，且 `suite-barrels.test.ts` 守卫「三者并集 == components.ts 且无重叠」。文档套件 `data` 的成员本来就散在 `pro`（charts/spark-chart/allocation-bar）和 `base`（data-table），两套体系早已不是一一对应。`TxFlowchart` 归 `ai` 桶。
- **纯受控原语。** 组件不写 `nodes`：拖拽时内部记临时偏移让卡片跟手，松手清偏移并发 `node-move`，宿主不写回就弹回原位。撤销栈 / 自定义吸附 / 服务端持久化都留给宿主。
- **连线端点实测而非假设。** 卡片高度由内容决定（两行条件比一行触发器高），用 `ResizeObserver` 测量后再算路径，否则线头会插进卡片里或悬在下方。
- **指向不存在节点的连线跳过**，不画到原点——否则一条线横穿整个画布。

## 交付清单（已完成）

组件层：
- `packages/tuffex/packages/components/src/flowchart/src/{TxFlowchart.vue,types.ts}`、`index.ts`
- `components.ts`（`floating` 与 `form` 之间，全路径 ASCII 序）
- `ai/index.ts` barrel
- `README.md` + `README_ZHCN.md`：新增 `Flow (1)` / `流程编排 (1)` 分类，计数 153 → 154

nexus 层：
- demo `FlowchartFlowchartDemo.vue` + `demo-registry.ts`
- 文档页 `flowchart.{zh,en}.mdc`（各 11 个 heading）
- **flow 套件**：`docs-suites.ts`（三张表 + `DocsSuiteKey`）、`DocsSidebar.vue`（suite 定义 + 页面顺序）、`i18n/locales/{zh,en}.ts`（suites.flow + categories.flow）、`flow-suite.{zh,en}.mdc`
- `ai-suite.{zh,en}.mdc` 映射表改为上游现编号 21 行

> 全局注册**无需手动接线**：`apps/nexus/modules/tuffex-components.ts` 会扫描组件目录自动 `addComponent`。`bui-component-family.md` 里「改 `app/plugins/tuffex.ts`」那一站已过时，该文件不存在。

## 验收结果

| 项 | 结果 |
|---|---|
| `flowchart.test.ts` | 19 passed |
| tuffex 全量 vitest | 234 文件 / 2436 测试 passed |
| `vue-tsc --noEmit` | exit 0；正控制：注入类型错误 → 精确报 `types.ts:153`，还原 → 0 |
| `check:doc-parity` | exit 0；正控制：删一个 en heading → 报 `zh 11 / en 10`，还原 → 0 |
| `check:mdc-fences` / `check:demo-registry` / `audit:readme` | 全过（154 modules 双语一致） |
| eslint（tuffex / nexus 各自配置） | 双 exit 0 |
| 浏览器实测 | 无扩展 headless Chrome，点阵、双色胶囊、环阴影卡片、连线、条件 token、闪电图标全部正确渲染 |

## 过程中修正的事实

- `i-carbon-ice-cream` **不存在**于 carbon 图标集，会静默渲染成空块；改用 `i-carbon-flash`。同类风险见 [[nexus-icon-collections]]。
- demo 需要把画布宽度钉到 480px（上游 `max-w-120`），否则绝对坐标 `x: 240` 在全宽画布上不再居中。
- `pnpm -C packages/tuffex build` 会被 mise 安装 pnpm 时的 GitHub 403 限流打断，**且退出码仍是 0**（管道吞掉）。绕行：直接 `node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts`。
