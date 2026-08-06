# 骨架屏加载态规则写入 frontend spec

> 父任务：`08-05-skeleton-loading-default`（子任务 A）。轻量任务，PRD-only。

## Goal

把「骨架屏是默认加载态」写成仓库规范，让所有协作者与 agent 在动手前都能读到。

当前 `.trellis/spec/frontend/component-guidelines.md` 全文检索 `loading` / `skeleton` / `骨架` **零命中**——规则完全没有成文，只存在于一次口头约定和单个用户的 AI 记忆里。这是本子任务要补的唯一缺口。

## 依赖与顺序

无依赖，可与子任务 B 并行。**不依赖 B 的原语落地**：规则先成文，原语名称在 B 完成后再回填即可（见 R4）。

## Requirements

- **R1**：在 `.trellis/spec/frontend/component-guidelines.md` 增加「加载态 / Loading States」章节，至少覆盖：
  - 骨架屏是**默认**加载态，非可选优化；新页面在初版就要带上，不能留作后续优化。
  - 何时用骨架屏：页面/区块首次加载、版式已知且稳定。
  - 何时**不**用：版式未知（改用空态）、局部小范围操作反馈（用按钮内联 pending 态）、已有内容的后台刷新（不得把已渲染内容替换成骨架）。
  - 骨架必须贴合真实版式（分组数、行数、行高、间距一致），加载前后不得可见跳变——这是判定合格的标准，「页面上有骨架」不算达标。
  - 禁止各页面手搓 div 骨架，须复用共享原语。
  - 无障碍：骨架须 `aria-hidden`，动画须遵守 `prefers-reduced-motion`。
  - 防闪烁：极快返回的数据须走统一的延迟出现 / 最短展示时长策略。
- **R2**：在 `.trellis/spec/frontend/index.md` 的 **Hard Frontend Rules** 增加一条骨架屏硬性规则。
- **R3**：在 `.trellis/spec/frontend/index.md` 的 **Pre-Development Checklist** 增加触发项（改动含异步数据的页面/区块前须读加载态章节），并保持既有编号连续。
- **R4**：规则文本引用具体原语名时，须与子任务 B 的最终产物一致；若 B 尚未完成，先以「共享骨架原语」表述并在 B 完成后回填，不得写入臆造的组件名。

## Non-goals

- 不改任何组件代码或页面代码——本子任务只动 `.trellis/spec/frontend/`。
- 不制定 Nexus / 插件 surface 的加载态规则（父任务已列为 Non-goal）。

## Acceptance Criteria

- [x] `component-guidelines.md` 新增 `## Loading States` 章节（置于 Styling Patterns 与 Accessibility 之间），覆盖 R1 全部要点：默认非可选、适用/不适用场景、贴合真实版式、复用原语禁手搓、防闪烁、无障碍。
- [x] `index.md` 的 Hard Frontend Rules 增加骨架屏条目。
- [x] `index.md` 的 Pre-Development Checklist 插入为第 4 项并重排后续编号，实测序列为 1–13 连续无断号。
- [x] 防幻影逐项 grep 验证通过：`TxRowSkeleton` / `TxSkeleton` / `TxLayoutSkeleton` / `SettingSkeleton` / `useDeferredLoading` / `skeleton-surface` / `skeleton-keyframes` / `--tx-skeleton-base-color` / `delay` / `minDuration`，以及 `RowSkeletonProps` 的 5 个 props（`rows`/`leading`/`description`/`trailing`/`separated`）全部真实存在。
- [x] 与既有章节风格一致：英文、短 bullet、`---` 分隔、同层级标题。

### 说明

R4（原语名回填）**无需事后回填**：子任务 B 与本任务在同一轮完成，章节直接引用了最终名称并已逐项验证存在性。

## Notes

- 权威来源是仓库 spec，不是 AI 侧记忆——记忆只对单个用户的会话生效，其他协作者与 agent 读不到。
- 「幻影 API」（文档写出源码里不存在的组件/属性）是本仓库内容类改动的已知盲区，R4 与对应验收项即为此设。
