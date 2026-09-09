# tuffex 文本形变引擎（移植 torph）

## Goal

把 [lochie/torph](https://github.com/lochie/torph)（MIT）的文本形变引擎移植进 tuffex，成为库内**唯一**的「文本值变化」动效实现，并让现有文本组件全部改用它。

torph 的核心不是「换一种淡入淡出」，而是把字符串当作一组**有身份的段（segment）**：

- 分段 → diff → 存活段走 FLIP 位移、进入段从最近锚点淡入、退出段脱离文档流后淡出；
- 数字额外按**位值（place value）**匹配，digit 从上方滑入、分隔符从下方滑入，千分位逗号跟着量级走；
- 容器宽高与字符同一条曲线过渡，中途打断可携带速度继续（carry）。

现状 tuffex 只有整串交叉淡化（`TxTextTransformer`）与第三方数字滚动（`TxBadge` → `@number-flow/vue`），两套动效语言并存且都做不到上述效果。

## Scope

用户已确认（2026-09-08）：**源码移植**（不引 npm 包）+ **全量替换文本变化动效**。

范围定义为客观规则：**tuffex 中今天已有「为文本/数字值变化而写的动效代码」的每一处**，全部改走新引擎。逐项枚举：

| 位置 | 现状 | 目标 |
|---|---|---|
| `text-transformer/` | 整串交叉淡化 + blur 双层叠加 | 默认走 morph 引擎，保留 `mode="fade"` 旧行为 |
| `badge/` | `@number-flow/vue` + ResizeObserver 量宽 + CSS width 过渡 | 走 morph 引擎（位值滚动 + 内建容器宽高过渡），删除 `@number-flow/vue` 依赖与量宽管线 |
| `switch/` | 经 `TxTextTransformer` 间接获得 | 随 transformer 自动升级，需验证紧凑标签下的版式不塌 |

**不在范围**：今天静态渲染文本的组件（stat-card、version-capsule、signal-meter 等）。给它们加动效是「新增」而非「替换」，会让消费方无预期地动起来。

## Requirements

### R1 引擎移植

- R1.1 引擎落在 tuffex 源码内，无新增运行时依赖；保留 MIT 出处标注（比照 `liquid/src/spring.ts` 的移植头注释体例）。
- R1.2 与 tuffex 既有能力**融合**而非重复造：弹簧与缓动求值复用库内已有的 `liquid/src/spring.ts`（`resolveTransition` / `easingFunction`），删除 torph 自带的 `spring.ts` 与 `easing.ts` 的重叠部分。
- R1.3 通过 tuffex 的 `strict` + `noUncheckedIndexedAccess`；`vue-tsc --noEmit` 零错误。
- R1.4 不向 `document.head` 注入 `<style>`：样式走组件 SFC 的 `<style lang="scss">`（不 scoped，因为段元素是命令式创建、拿不到 scope 属性），由 tuffex 构建产出按需 CSS。
- R1.5 DOM 属性前缀 `torph-*` 改为 `tx-morph-*`。

### R2 新组件 `TxTextMorph`

- R2.1 承载完整形变能力：分段形变、位值数字、容器尺寸过渡、打断续跑。
- R2.2 属性命名遵循 tuffex 既有词汇（`tag` 而非 `as`、时长用 `*Ms` 后缀）。
- R2.3 无障碍：完整值以视觉隐藏的纯文本节点存在，段元素全部 `aria-hidden`；不得让屏幕阅读器读到被切碎的字符。
- R2.4 `prefers-reduced-motion: reduce` 下退化为直接换文本，且退化后再次开启动效不能从已消失的元素起算。
- R2.5 SSR / 无 DOM 环境不抛错。

### R3 现有组件改造

- R3.1 `TxTextTransformer` 新增 `mode?: 'morph' | 'fade'`，默认 `'morph'`；`fade` 保留今天逐像素一致的行为。既有 props（`text` / `durationMs` / `blurPx` / `tag` / `wrap`）语义与默认值不变。
- R3.2 `TxBadge` 数字值改走引擎；`@number-flow/vue` 从 `packages/tuffex/package.json` 与 `packages/components/package.json` 移除。
- R3.3 `TxSwitch` 标签在 morph 下垂直居中、不溢出，与今天视觉基线一致。

### R4 文档与守卫

- R4.1 nexus 侧补齐 `text-morph` 双语文档 + demo + 侧边栏 + 分类 + 套件 barrel + hub 索引（`tuffex-component-docs-coverage` 是硬门）。
- R4.2 `text-transformer` / `badge` 文档同步新 API 与新行为。
- R4.3 引擎关键分支有单测：分段、diff 配对、位值匹配、弹簧融合、reduced-motion 退化。

## Acceptance Criteria

- [ ] AC1 `pnpm -C packages/tuffex typecheck` 通过。
- [ ] AC2 `pnpm -C packages/tuffex test` 通过，且新增引擎单测覆盖 R4.3 列出的五类分支。
- [ ] AC3 `pnpm -C packages/tuffex lint` 对本次改动零新增告警（按 delta 判，不判零）。
- [ ] AC4 `pnpm -C packages/tuffex build` 成功；`audit:exports` / `audit:types` / `audit:readme` / `audit:size` 全绿。
- [ ] AC5 `pnpm -C apps/nexus test` 通过（含 `tuffex-component-docs-coverage`）。
- [ ] AC6 `pnpm -C apps/nexus typecheck` 通过。
- [ ] AC7 仓库内 `@number-flow/vue` 引用归零（源码、package.json、文档）。
- [ ] AC8 headless Chrome 实机核验：`text-morph` 文档页可见字符级形变与数字位值滚动；`text-transformer` / `badge` / `switch` 演示无版式塌陷。
- [ ] AC9 `prefers-reduced-motion: reduce` 下三个组件均直接换值、无动画残留。

## Constraints

- tuffex 是已发布包：现有 props 的名称、类型、默认值不得变更（只允许新增）。
- 类型名不得叫 `Transition`／`Segment` 这类通用名——星号桶会静默丢弃重名导出（见 `tuffex-new-component-wiring`）。
- 不整文件跑 `eslint --fix`（会把同源 value import 合并成 `import type`，静默炸运行时）。
- commitlint 无 `refactor` 类型，用 `ref`。
