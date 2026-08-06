# 设计：TuffEx 骨架原语基座与存量收敛

## 1. 核心设计问题

**如何让 TuffEx 的骨架精确贴合 CoreApp `SettingRow` 的版式，同时不让 TuffEx 依赖 CoreApp 的设计令牌？**

已核实的约束：

- `--shell-*` 令牌**只**定义在 `apps/core-app/src/renderer/src/styles/shell-tokens.scss`；
- TuffEx 组件全库**不引用** `--shell-*`（grep 零命中）；
- 但 CoreApp 反向使用 `--tx-*` 是既有事实（`StoreItemCard` 等 10+ 文件）。

若在 TuffEx 里硬写 `--shell-border`，对其他消费方（Nexus、插件）就是未定义变量，只会回落到 fallback，等于骨架在非 CoreApp 环境失真。

## 2. 方案：形状归 TuffEx，令牌归 CoreApp

分层如下，正好落在既有硬性规则「新的原语行为属于 TuffEx，CoreApp 业务组件保留为语义组合层」上：

```
TuffEx  TxRowSkeleton         行的形状 + 动画 + reduced-motion + aria-hidden
        useDeferredLoading    防闪烁时序
          ↑ 通过 CSS 自定义属性接收令牌，自带 --tx-* 默认值
CoreApp SettingSkeleton.vue   语义组合：SettingSection × N + TxRowSkeleton × M
                              注入 --shell-* 令牌值
```

**为什么行级原语放 TuffEx、分组放 CoreApp**：分组容器就是 `SettingSection`（CoreApp 自有，含标签外置与单层卡片），TuffEx 不该复制它；而「带可选前导图标、标题、可选描述、可选尾部控件的行」是通用形状，值得沉淀。这条切分线同时天然满足 P1 的「不自带卡片外壳」——外壳由 `SettingSection` 提供。

### 2.1 `TxRowSkeleton` 契约（新增）

位置：`packages/tuffex/packages/components/src/skeleton/src/TxRowSkeleton.vue`
（并入既有 `skeleton` 包，而非新建包——它与 `TxSkeleton` 共享动画与令牌，拆包会让动画收敛更难。）

```ts
interface RowSkeletonProps {
  rows?: number          // 渲染多少行，默认 1
  leading?: boolean      // 前导图标占位，默认 false
  description?: boolean  // 描述行占位，默认 false
  trailing?: boolean     // 尾部控件占位，默认 false
  titleWidth?: string | number  // 标题条宽度，默认 '38%'
  descWidth?: string | number   // 描述条宽度，默认 '62%'
}
```

**宽度可配是刻意的**：P1 指出 `TxCardSkeleton` 写死 40%/80% 正是它对不上真实版式的原因，新原语不能重蹈覆辙。同时给出默认值，避免每个调用点都要填。

多行时标题宽度应有轻微变化而非整齐划一（整齐的等宽条看起来像表格而不像文本）。采用**确定性**的宽度序列（按行索引取模），不使用随机数——随机会让快照测试不稳定。

### 2.2 令牌接口

`TxRowSkeleton` 读取以下自定义属性，各自带 `--tx-*` 回落：

| 自定义属性 | 用途 | TuffEx 默认 | CoreApp 注入 |
|---|---|---|---|
| `--tx-skeleton-row-padding-block` | 行垂直内边距 | `12px` | `12px` |
| `--tx-skeleton-row-padding-inline` | 行水平内边距 | `16px` | `16px` |
| `--tx-skeleton-row-text-gap` | 标题与描述间距 | `3px` | `3px` |
| `--tx-skeleton-base-color` | 骨架条底色 | `var(--tx-fill-color, #f0f2f5)` | 由 `--shell-*` 派生 |
| `--tx-skeleton-radius` | 骨架条圆角 | `6px` | 同左 |

默认值直接取自实测的 `SettingRow`（`padding: 12px 16px`、文本列 `gap: 3px`），因此 CoreApp 侧多数情况无需覆盖几何量，只需覆盖颜色——降低 AC3 的对齐成本。

### 2.3 CoreApp 组合层

`apps/core-app/src/renderer/src/components/settings/SettingSkeleton.vue`：

```
props: { groups: Array<{ label?: string; rows: number; description?: boolean; trailing?: boolean }> }
```

渲染 `SettingSection`（沿用 label 外置与 card 外壳）包裹 `TxRowSkeleton`，并在根节点注入 `--tx-skeleton-base-color` 等令牌值。子任务 C 的每个页面据此声明自己的真实分组结构，从而满足 C-R1「逐页贴合」而非通用糊弄。

## 3. reduced-motion 与动画收敛

### 现状
三套 keyframes 并存、时长不一：

| 定义 | 位置 | 时长 | 样式作用域 |
|---|---|---|---|
| `tx-skeleton-shimmer` | `TxSkeleton.vue` | 1.2s | **非 scoped** |
| `tx-card-skeleton-shimmer` | `TxCardSkeleton.vue` | 1.2s | scoped |
| `tx-skeleton-pulse` | `TxLayoutSkeleton.vue` | 1.5s | scoped |

### 方案
在 `packages/tuffex/packages/components/style/` 下新增共享 SCSS 片段，集中定义**单一** `tx-skeleton-shimmer` keyframes 与一个应用它的 placeholder/mixin，内含 reduced-motion 守卫：

```scss
@media (prefers-reduced-motion: reduce) {
  animation: none;
}
```

四个组件全部改用该共享片段。

**风险点（必须验证）**：`scoped` 样式下 Vue 会重写 `@keyframes` 名称与引用。把 keyframes 抽到共享非 scoped 片段后，scoped 组件内 `animation: tx-skeleton-shimmer ...` 的引用**不会**再被重写为局部名，需实测确认动画仍然生效——这是本设计最容易静默失效的地方，实施时优先验证，不要留到最后。

reduced-motion 下**保留静态底色**，不整体隐藏骨架：骨架的首要价值是占位稳版式，动画只是次要的「正在加载」暗示。

## 4. 防闪烁：`useDeferredLoading`

位置：`src/skeleton/src/use-deferred-loading.ts`，从 `skeleton/index.ts` 导出（与既有 `use-*.ts` 就近放置的约定一致，如 `stream-markdown/src/use-block-stream.ts`）。

```ts
useDeferredLoading(source: Ref<boolean>, options?: {
  delay?: number        // 加载超过该时长才显示骨架，默认 150ms
  minDuration?: number  // 骨架一旦显示，至少保持该时长，默认 400ms
}): Ref<boolean>
```

语义：
- `source` 在 `delay` 内结束 → 骨架**从不显示**（消除一闪而过）；
- 骨架已显示且 `source` 提前结束 → 保持到 `minDuration` 满足才隐藏（消除半帧闪烁）。

组件卸载时须清理定时器。测试用 vitest 假定时器验证三条路径：快返回不显示、慢返回显示、显示后提前结束仍保持最短时长。

## 5. 存量收敛

| 文件 | 处理 |
|---|---|
| `components/store/StoreDetailSkeleton.vue` | 改用 `TxRowSkeleton` / `TxSkeleton` 组合，删除自有 keyframes |
| `components/intelligence/skeleton/CapabilitySkeleton.vue` | 同上 |
| `components/intelligence/skeleton/ProviderSkeleton.vue` | 同上（当前为纯手搓 div，连 tuffex 组件都未引用） |

保留这三个文件作为语义命名的组合层（符合分层原则），只把内部实现换掉；**不删除文件**，避免波及其消费方——消费方的验证归子任务 D。

## 6. 兼容性与不改动项

- `TxSkeleton` 现有 props 语义与 `loading=false → <slot/>` 行为**不变**（向后兼容）。
- `TxCardSkeleton` / `TxListItemSkeleton` / `TxLayoutSkeleton` 的对外导出签名与用途不变，仅内部换用共享动画并补 reduced-motion。
- `TxLayoutSkeleton` 仍是 app-shell 骨架，不改用途。

## 7. 注册与契约维护

- `src/skeleton/index.ts` 增加 `TxRowSkeleton` 的 `withInstall` 导出与类型导出；
- `src/components.ts` 已有 `export * from './skeleton/index'`，无需改动；
- 子路径导入 `@talex-touch/tuffex/skeleton` 由 `exports` 的 `./*` 通配覆盖，无需改 `package.json`；
- **评估**是否需要把 `RowSkeletonProps` 等新公开类型登记进 `missing-export.contract.ts`——该文件的维护规则是「文档advertise 但可能从包入口不可达的公开类型」，若新类型会写进文档则须登记。

## 8. 验证策略

| 验收项 | 验证方式 |
|---|---|
| AC3 行高一致 | 单测断言注入令牌后的计算内边距，辅以实际渲染截图比对；不接受肉眼「差不多」 |
| AC4 reduced-motion | 单测 mock `matchMedia` 断言动画停止；**并实测 scoped keyframes 引用问题（第 3 节风险点）** |
| AC5 动画收敛 | grep 全库 `@keyframes.*skeleton` 应只剩单一定义 |
| AC7 防闪烁 | vitest 假定时器覆盖三条时序路径 |
| AC8 无回归 | 既有 `skeleton/__tests__` 与 `layout-skeleton/__tests__` 全绿 |

**TuffEx 的 vue-tsc 比 Nexus 宽松**：若新原语涉及泛型或索引访问，须额外用严格档位（`--noUncheckedIndexedAccess`）复核，否则问题会漏到 Nexus 侧才暴露。若改动影响产物体积门禁，需先 build 再跑体积审计（该审计读 `dist/`）。
