# TuffEx 骨架原语基座与存量收敛

> 父任务：`08-05-skeleton-loading-default`（子任务 B）。复杂任务，需 `design.md` + `implement.md`。

## Goal

打好骨架屏的原语地基，让后续 C / D 的页面改造只是「接线」而不是「每页手搓一套」。

## 问题陈述（实测，非推测）

| # | 现状 | 后果 |
|---|------|------|
| P1 | tuffex 4 个骨架组件里只有 `TxSkeleton` 可配置；`TxCardSkeleton` / `TxListItemSkeleton` **零 props、版式硬编码**（写死 40% 标题宽、80% 描述宽），且自带 `padding: 1rem` + border + background 的卡片外壳 | 套进 `SettingSection`（自身已是 card：`1px solid var(--shell-border)` + `--shell-radius-lg`）会形成双层卡片，且行高对不上 `SettingRow` 的 `padding: 12px 16px`，加载完仍跳变 |
| P2 | `TxLayoutSkeleton` 是 app-shell 骨架（header + 200px sidebar + content），与设置页无关 | 不可复用，勿误选 |
| P3 | `StoreDetailSkeleton` / `CapabilitySkeleton` / `ProviderSkeleton` 三个 CoreApp 骨架**全部手搓 div，零复用 tuffex，各自复制一份 shimmer keyframes** | 视觉不一致、维护成本三倍 |
| P4 | skeleton 与 layout-skeleton **均无 `prefers-reduced-motion` 守卫** | 无限 shimmer/pulse 对前庭敏感用户无条件播放，a11y 缺陷 |
| P5 | `TxCardSkeleton` / `TxLayoutSkeleton` 各自定义 `tx-card-skeleton-shimmer` / `tx-skeleton-pulse`，与 `TxSkeleton` 的 `tx-skeleton-shimmer` 三套并存，动画时长 1.2s / 1.5s 不一 | 同屏多个骨架节奏不同步，观感杂乱 |

**关键约束（已核实）**：`--shell-*` 设计令牌只定义在 `apps/core-app/src/renderer/src/styles/shell-tokens.scss`，TuffEx 组件全库**不引用** `--shell-*`。因此贴合 `SettingRow` 版式所需的颜色/圆角不能在 TuffEx 里写死 `--shell-*`——否则 TuffEx 对其他消费方失真。原语的**形状**归 TuffEx，**令牌值**由 CoreApp 注入。

## 依赖与顺序

无前置依赖。**C 与 D 依赖本子任务完成**，因为它们要消费这里产出的原语。

## Requirements

- **R1 可配置的行/分组骨架原语**：TuffEx 提供能表达「N 个分组 × M 行」的骨架原语，行的高度、文本列宽度、是否含描述行、是否含尾部控件占位均可配置。
- **R2 令牌可注入**：原语的底色、圆角、行内边距通过 CSS 自定义属性暴露，CoreApp 侧可注入 `--shell-*` 值使其与 `SettingSection` / `SettingRow` 完全贴合，且 TuffEx 自身保留合理的 `--tx-*` 默认值。
- **R3 不自带冲突外壳**：原语默认不渲染卡片 border/background（由 `SettingSection` 提供），避免双层卡片。
- **R4 reduced-motion 守卫**：`prefers-reduced-motion: reduce` 下所有骨架动画停止（保留静态底色，不得整体隐藏骨架）。覆盖 `TxSkeleton`、`TxCardSkeleton`、`TxListItemSkeleton`、`TxLayoutSkeleton` 全部四个组件，不只是新增的那个。
- **R5 动画收敛**：统一 shimmer 实现与时长，消除 P5 的三套并存。
- **R6 存量收敛**：`StoreDetailSkeleton` / `CapabilitySkeleton` / `ProviderSkeleton` 改为复用共享原语，删除各自的手搓 keyframes。
- **R7 防闪烁能力**：提供统一的「延迟出现 + 最短展示时长」能力（组合式函数或原语内建），供 C / D 消费，避免骨架一闪而过。
- **R8 无回归**：不改动 `TxLayoutSkeleton` 的 app-shell 用途与现有对外导出签名；已有 `skeleton` / `layout-skeleton` 测试须继续通过。

## Non-goals

- 不改 `SettingSection` / `SettingRow` 本身的视觉与交互（父任务 Non-goal）。
- 不接入任何设置页 / 业务页面——那是 C 与 D 的交付物。
- 不改 `TxSkeleton` 现有 props 的语义（向后兼容）。

## Acceptance Criteria

- [x] **AC1**：`TxRowSkeleton` 提供 `rows` / `leading` / `description` / `trailing` / `separated` / `titleWidth` / `descWidth`；分组由 CoreApp `SettingSkeleton` 的 `groups` 表达。测试：`row-skeleton.test.ts`。
- [x] **AC2**：测试 `draws no card chrome of its own` 直接守住；组件内注释说明外壳由消费方的卡片提供。
- [~] **AC3 部分达成**：`TxRowSkeleton` 的几何默认值与 `SettingRow` 逐项核对一致（`12px`/`16px` 内边距、文本列 `3px`），`SettingSkeleton` 因此只覆盖颜色不覆盖几何。**但没有测试守住这份一致性**——若日后有人改 `SettingRow` 的 padding，骨架会静默漂移。见下方「遗留缺口」。
- [x] **AC4**：`skeleton-motion.test.ts` 覆盖 5 个组件 × 3 组断言（16 用例）。断言基于**编译后 CSS** 而非源码文本，且要求「守卫数 === 动画数」，并禁止守卫里出现 `display:none` / `visibility:hidden` / `opacity:0`。
- [x] **AC5**：`@keyframes` 收敛到 `style/mixins.scss` 单一定义，并由测试 `routes every skeleton through the one shared shimmer definition` 守护。
- [x] **AC6**：`StoreDetailSkeleton` / `CapabilitySkeleton` / `ProviderSkeleton` 改为 tuffex 组件的薄封装，三者 `@keyframes` 计数为 0。
- [x] **AC7**：`useDeferredLoading` + 6 个用例，覆盖延迟内返回不显示、超时显示、最短时长保持、已达最短时长立即隐藏、显示中不重启延迟、scope 销毁清理定时器。
- [x] **AC8**：tuffex 测试 146 文件 / 1086 用例全过，与 HEAD 基线一致（同一个既存的 `TxCodeBlock` 未捕获异常导致 exit 1，与骨架无关）；tuffex typecheck 0 错误；CoreApp typecheck exit 0；相关文件 lint 清零。

### 实施中发现并修复的问题

1. **TS5097 回归**：`TxRowSkeleton.vue` / `TxSkeleton.vue` 从 `'./utils.ts'` 做值导入。tuffex 自身 tsconfig 开了 `allowImportingTsExtensions` 所以自检通过，但 CoreApp 编译 tuffex 源码时没开该 flag → `npm run typecheck` exit 2。已改为无扩展名导入（与仓库惯例一致）。**教训：改 tuffex 源码后只跑 tuffex typecheck 不够，必须跑下游消费方。**
2. **`style/comma-dangle` lint 错误** 4 处（本任务新增/修改的 CoreApp 文件）已修。

### 遗留缺口（未做，非本任务范围内静默跳过）

- **AC3 无自动守卫**：`TxRowSkeleton` 默认几何与 `SettingRow` 的一致性靠人工核对，无测试。建议后续加一个跨包契约测试或在 `SettingRow` 侧留注释指向骨架。
- **`--tx-skeleton-color` 是孤儿令牌**：`style/variables.scss` 明暗两处都定义了它，但全库无人消费（mixin 实际读的是 `--tx-skeleton-base-color`）。属既有问题，未改——重命名公开令牌是破坏性变更，应单独决策。
- **CoreApp `style/comma-dangle` 广泛为红**：未修改的 `SettingRow.vue` 同样报错，说明这是仓库既存状况而非本次引入。本任务只修了自己碰过的文件。

## Notes

- TuffEx 的 vue-tsc 比 Nexus 宽松：改完 TuffEx 源码后，若涉及泛型/索引访问，需用 Nexus 侧的严格档位复核（`--noUncheckedIndexedAccess`），否则问题会漏到 Nexus 才暴露。
- 若改动触及 tuffex 产物体积门禁，需先跑一次 `packages/tuffex` build 再跑体积审计——该审计读的是 `dist/`。
- 硬性规则：新的原语行为属于 TuffEx；CoreApp 侧只保留语义组合层。本子任务的形状/令牌拆分即为落实该规则。
