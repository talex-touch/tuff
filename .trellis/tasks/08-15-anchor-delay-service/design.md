# 技术设计 — TuffEx Anchor 延迟服务与组合动画

## 1. 落点与模块边界

**位置：`packages/tuffex/packages/utils/anchor-delay.ts`（+ `__tests__/anchor-delay.test.ts`），
经 `packages/utils/index.ts` 出口。不是 `components/src/` 下的组件目录。**

这不是风格选择，是两个门禁逼出来的：

- `scripts/audit-package-exports.mjs:89-93` 对 `components.ts` 里的**每一个**条目断言
  `dist/es/<name>/index.d.ts`、`index.js`、**`style.css`**，以及 `dist/lib` 下同名产物。
  一个无样式的纯 TS 服务放进组件目录会直接挂在 `style.css` 这条上。
- `scripts/audit-readme-inventory.mjs` 要求 `components.ts` 与根 README / README_ZHCN 的
  组件清单及计数行三方一致 —— 服务不是组件，塞进去会污染组件计数。

`packages/utils/` 已有完全同类的先例：`z-index-manager.ts`（浮层 z-index 分配）、
`dialog-manager.ts`（对话框优先级栈）。本服务与它们是同一层的东西。

公共出口：

| 导出 | 用途 |
|---|---|
| `createAnchorDelayService(policy?)` | 工厂 |
| `TX_ANCHOR_DELAY_KEY` | `InjectionKey`，per-app 实例的注入键 |
| `provideAnchorDelayService(app, policy?)` | 由 `install()` 调用，每个 app 一份 |
| `useAnchorDelayService()` | 组件侧取实例，未被 provide 时回落到模块级 fallback |
| `useAnchorDelay(options)` | 组件接入点，返回 `scheduleOpen / scheduleClose / cancel / dispose` |
| `configureAnchorDelay(patch)` | 应用侧全局覆盖预设 |
| `ANCHOR_DELAY_PRESETS` | 内置预设表 |

沿用「delay service」这个叫法（与讨论中的用词一致）。抢占逻辑同样放在这里而不是单开一个模块：
延迟的取值离开「此刻还有谁开着」就无法计算，拆成两个服务只会制造一个必须同步的双向依赖。

### 1.1 实例作用域：per-app，不是模块级单例

注册表持有「当前哪些浮层开着」，是**请求相关状态**。Vue SSR 每个请求建一个 app，
模块级单例会让状态跨请求泄漏 —— `components/src/index.ts:10-12` 的注释正是为此存在：

> One allocator per app. Vue SSR builds an app per request, so this is what
> keeps overlay z-indexes from leaking across requests in a server process.

因此严格照抄 `z-index-manager` 的形态：`create*` 工厂 + `InjectionKey` + 在插件 `install()` 里
`provideAnchorDelayService(app)` + `use*()` 取不到时回落到模块级 fallback 实例
（供未经 `app.use()` 挂载的独立组件使用）。

`dialog-manager.ts` 用的是模块级 `getDialogManager()` 单例 —— 那是更松的先例，本设计不跟。

### 1.2 与 DialogManager 的边界

`DialogManager` 管的是 TxDialog / TxModal 的优先级栈，与 anchor 无关。
本服务矩阵里的 `dialog` 层指的是**行为像对话框的 anchor**，两者不互通。
打通留作后续，本轮列为 Non-Goal。

## 2. 角色与预设

`AnchorDelayLayer = 'hint' | 'menu' | 'dialog'`

预设值**直接取自今天各组件的实际默认值**，使得「把实现下沉到服务」这一步是逐字段行为等价的：

| layer | openDelay | closeDelay | skipDelay | 来源 |
|---|---|---|---|---|
| `hint` | 200 | 120 | 300 | `TxTooltip` 现值；skipDelay 为新增 |
| `menu` | 120 | 100 | 0 | `TxPopover` 现值；点击驱动，预热不适用 |
| `dialog` | 0 | 0 | 0 | 点击驱动，无 hover 延迟 |

因此 `TxTooltip` / `TxPopover` 的 `openDelay` / `closeDelay` prop 默认值要从字面数字改为 `undefined`，
由预设兜底 —— 显式传值仍然覆盖预设。对外行为不变，机制换掉。

> Q1 已定（2026-08-15）：**tooltip 需要延迟，不按 `interactive` 分叉。**
> `hint` 保持单一预设 200/120/300，不引入 `hintInteractive`。
> 原提案（不可交互面板 closeDelay 降至近 0）作废，预设表里不留该分支。

## 3. 注册表与父链

```ts
interface AnchorNode {
  id: symbol
  layer: AnchorDelayLayer
  parent: AnchorNode | null
  isOpen: () => boolean
  close: (immediate: boolean) => void
}
```

父链**不是**靠 DOM 查询建立的 —— 面板会 teleport 到 body，DOM 上的包含关系已经断掉，
`closest()` 一类做法必然误判。改用 Vue 的 provide/inject：每个 `TxBaseAnchor`
`inject` 上层 anchor 节点作为 `parent`，再 `provide` 自己。组件树的嵌套关系不受 teleport 影响，这是唯一可靠的来源。

## 4. 抢占算法

`open(node)` 时遍历注册表中所有 `n.isOpen() && n !== node`：

1. **若 `n` 是 `node` 的祖先 → 跳过。** 沿 `node.parent` 链上溯做身份比较。
   这条是整个设计的安全阀：没有它，子菜单会关掉父菜单，面板内的 tooltip 会关掉承载它的面板。
2. 若 `n.layer === node.layer` → `n.close(immediate = true)`。
3. 否则查矩阵 `policy.preempts[node.layer]`，命中则 `n.close(true)`。

被抢占节点的后代随其自身关闭而自然收起，不需要单独遍历。

跨角色矩阵默认值：

```ts
preempts: {
  hint:   [],                    // 提示不抢占任何东西
  menu:   ['hint', 'menu'],      // 打开菜单会清掉提示，也会关掉兄弟菜单
  dialog: ['hint', 'menu'],
}
suppress: {
  hint: ['menu', 'dialog'],      // 菜单/对话框开着时，提示不再出现
}
```

`suppress` 与 `preempts` 是两件事：前者管「不许开」，后者管「已经开的要关」。只做后者会出现
菜单开着时提示仍能冒出来。

## 5. 预热（skip delay）

服务按 layer 维护 `warmUntil: Record<AnchorDelayLayer, number>`：

- 某节点打开 → 该 layer 标记为热。
- 某节点关闭 → `warmUntil[layer] = now + skipDelay`。
- `scheduleOpen` 时若仍在热窗口内 → 延迟取 0，立即打开。

`menu` / `dialog` 的 `skipDelay` 为 0，等于对它们关闭该机制，无需额外分支。

## 6. 组合动画

`BaseAnchorAnimationOptions` 新增两个可选字段，全部向后兼容：

```ts
interface BaseAnchorAnimationOptions {
  type?: BaseAnchorAnimationType
  /** 消失阶段的类型；缺省回落到 `type`，因此不传即为今天的行为。 */
  closeType?: BaseAnchorAnimationType
  /** 消失阶段的几何覆盖；逐字段回落到共享字段。 */
  exit?: Pick<BaseAnchorAnimationOptions, 'scale' | 'distance' | 'blur' | 'opacity'>
  // ...现有字段不动
}
```

`exit` 子对象是必要的，不是锦上添花：`scale` 在不同类型下语义不同
（`boom` 是缩放起点 1.08，`expand` 是收敛起点 0.95），出现与消失用不同类型时共享一个 `scale` 必然有一端不对。

### 6.1 先重构再加字段（阶段 2 的前置）

实测 `base-anchor-motion.ts` 共 1088 行，其中：

```
animateOpen    668–882   215 行
animateClose   883–1088  206 行     合计 421 行 = 39%
```

两者是**近乎镜像的同构实现**：相同的守卫序列（unlimited height → null refs → `dur<=0||none` → liquid →
reduced motion）、相同的 `overflow / clipPath / willChange` 三件套、相同顺序的四路分支
`transfer → expand → boom → opacity`。差异只在方向与 close 独有的 refraction 预备。

若直接在 close 分支上追加 `closeType` 支持，等于把这份重复**做实**，而该文件已是 `audit:size` 报出的
最大产物（26.4 KiB，见 `research/baseline.md`）。

因此阶段 2 的正确顺序是：**先把 open/close 抽成按 `(type, direction)` 索引的描述表，再加 `closeType`。**
抽完之后 `closeType` 近乎免费（换一个索引而已），且文件应当**变小**而非变大 —— 这同时消掉基线里标记的体积风险。
若重构后体积未下降，说明抽象没抽对，回退重做，不要靠放宽预算过关。

### 6.2 字段改动

`base-anchor-motion.ts` 的改动：

- `resolvedAnimation` 目前用 `isExpand` 单一开关在 `EXPAND_DEFAULTS` 与 `DEFAULT_ANIMATION` 之间切表。
  改为按阶段查表：open 侧用 `type` 的表，close 侧（`closeDuration` / `closeEase` / 几何）用 `closeType` 的表。
- `animateClose` 的类型分发从 `type` 改为 `closeType`。因 `closeType` 缺省等于 `type`，该改动本身行为中性。
- `usesLiquidMotion` / `usesBeadMotion` 需同时考虑两个阶段。

**液态类型的硬约束**：`drip` / `bead` 的 open 与 close 共享 prepare/apply 的帧状态，
与非液态类型混搭会留下无人收拾的中间态。设计上直接拒绝：任一阶段为液态则两阶段必须同为液态，
否则 dev 环境 `console.warn` 并把 `closeType` 回落为 `type`。这条要有测试。

目标组合（作为文档示例与 nexus 头部的实际取值）：

```ts
animation: { type: 'boom', scale: 0.94, blur: 12, closeType: 'expand' }
```

## 7. TxBaseAnchor 的新增 props

```ts
layer?: AnchorDelayLayer          // 默认 'menu'（现有消费方都是菜单/浮层语义）
openDelay?: number                // 缺省走预设
closeDelay?: number               // 缺省走预设
delayPolicy?: Partial<AnchorDelayPolicy>   // 单点覆盖矩阵
```

`TxTooltip` 固定传 `layer: 'hint'`，`TxPopover` / `TxDropdownMenu` 传 `'menu'`。

## 8. SSR 与移动端

- 服务内所有定时器与注册表操作以 `typeof window !== 'undefined'` 兜底；SSR 下 `scheduleOpen` 同步生效、不排队。
- 移动端不做分支：无 hover 事件即无 `scheduleOpen`，`mouseleave` 缺失时靠既有的
  `closeOnClickOutside` 收起。符合 PRD R6。

## 9. 被否决的替代方案

- **DOM `closest()` 建父链** —— teleport 后 DOM 包含关系已断，必然误判。见 §3。
- **扁平单例（只允许一个 anchor 打开）** —— 实现最简，但直接破坏子菜单与面板内 tooltip 两个既有场景。
- **把 delay 留在各 wrapper、只加一个全局 bus** —— 值仍然分散，预设与全局覆盖无处安放，等于没解决 R1。
- **用 `closeType` 之外再加 `closeScale` / `closeDistance` / `closeBlur` 平铺字段** —— 前缀污染，
  且每新增一个几何字段都要再加一个 `close*`。用 `exit` 子对象一次性解决。

## 10. 兼容性与回滚

- 所有新增均为可选 props 与新模块，缺省路径逐字段等价于当前行为 → 无需消费方迁移。
- 唯一的行为变更点是 `TxTooltip` / `TxPopover` 的 delay 默认值来源（字面量 → 预设），
  预设取值与现值相同，故对外不可观测。
- 回滚即 revert，无持久化状态、无数据迁移。
- 分阶段落地（见 `implement.md`），每阶段自身可回滚且门禁独立可跑。
