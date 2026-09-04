# tuffex-charts 基座与色彩系统

父任务：`08-30-tuffex-charts`（总体设计见其 `design.md`，kumo 参考源码在其 `research/kumo-reference/`）。无前置依赖，是全部其余子任务的前置。

## Goal

建出可构建、可测试、可发布形态的 `packages/tuffex-charts` 包骨架，并交付 Colors 板块（ChartPalette + CSS 变量）与 `TxChartLegendItem`。

## Requirements

1. 包脚手架：`package.json`（name `@talex-touch/tuffex-charts`、peer vue ^3.5、exports `.`/`./style.css`）、vite lib 构建（es + cjs + dts + css 抽取）、tsconfig、vitest(jsdom)、eslint 接入（注意仓库教训：包内 eslint 配置可能与根配置规则相反，跟 tuffex 包内配置对齐）。
2. `style/tokens.scss`：design.md §3 的全套 `--tx-chart-*` 变量，`:root` + `.dark`/`[data-theme='dark']` 两选择器，色值从 kumo `Color.ts` 移植（含明暗差异：Yellow/Neutral/Disabled/Skeleton）。
3. `ChartPalette`：`categorical/semantic/sequential/text/mapColors`（与 kumo 同名同形，isDark 参数）+ 新增 `categoricalVar(index)`；附出处注释。
4. `TxChartLegendItem`：`variant: 'small'|'large'`，props `name/color/value/unit?/inactive?/loading?`，click/pointerenter/pointerleave 事件，loading 骨架行，键盘可点（Enter/Space）。
5. barrel `src/index.ts` 起步；d3 依赖本子任务先只装 `d3-scale`/`d3-array`（后续子任务按需加）。

## Acceptance Criteria

- [ ] `pnpm --filter @talex-touch/tuffex-charts build` 产出 es/lib/d.ts/css
- [ ] ChartPalette 单测：模 6 轮转、明暗取值、mapColors 结构；与 kumo `Color.ts` 色值逐一相符
- [ ] TxChartLegendItem 渲染测试：两 variant + loading + inactive 半透明
- [ ] typecheck/lint/test 全绿；无 echarts 依赖
