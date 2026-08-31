# 技术设计

## 1. 状态点裁切修复（TxAvatar.vue）

### 1.1 根因与修法

根节点同时承担「形状裁切」与「状态点定位容器」两个职责，这两者天然冲突：状态点必须能越出形状边界，而裁切要求所有子元素待在里面。

修法是**把裁切下沉一层**：

| | 改动前 | 改动后 |
|---|---|---|
| `.tx-avatar`（根） | `overflow: hidden` + `border-radius` | 只有 `border-radius`，`overflow` 恢复 `visible` |
| `.tx-avatar__image` | 无圆角 | `border-radius: inherit` |
| `.tx-avatar__fallback` | 无圆角 | `border-radius: inherit; overflow: hidden` |

根节点的**背景色仍然被自己的 `border-radius` 裁切**（背景默认按 border-box 圆角绘制），所以灰底圆形不会因为去掉 `overflow: hidden` 而变方 —— 这是 AC2 能成立而不需要额外包装层的关键。图片靠 `border-radius: inherit` 自己变圆，`object-fit: cover` 不变。

### 1.2 状态点定位

新增两个内部解析变量，避免三层 `var()` 回退链在每条规则里重复：

```css
.tx-avatar {
  --tx-avatar-status-diameter: var(--tx-avatar-status-size, var(--tx-avatar-status-size-preset, 12px));
  --tx-avatar-status-ring: var(--tx-avatar-status-border, var(--tx-avatar-status-border-preset, 2px));
}
```

按形状给不同 inset：

```css
/* 圆的 45° 切点：距边 (1 - (1+1/√2)/2) = 14.64% 直径，再把圆点自身半径扣掉，
   使圆点中心正好落在圆周上（半进半出，配白描边读起来最干净）。 */
.tx-avatar--circle {
  --tx-avatar-status-inset: calc(14.64% - var(--tx-avatar-status-diameter) * 0.5);
}
/* 方 / 圆角：贴角并轻微外溢，让圆点中心大致压在角上。 */
.tx-avatar--square,
.tx-avatar--rounded {
  --tx-avatar-status-inset: calc(var(--tx-avatar-status-diameter) * -0.25);
}

.tx-avatar__status {
  right: var(--tx-avatar-status-inset);
  bottom: var(--tx-avatar-status-inset);
  width: var(--tx-avatar-status-diameter);
  height: var(--tx-avatar-status-diameter);
  border: var(--tx-avatar-status-ring) solid #fff;
  box-sizing: border-box;   /* 见下 */
}
```

**`box-sizing` 的必要性**：现有规则里 `width/height` = 状态点尺寸，`border` 额外加在外面（默认 `content-box`），所以 medium 尺寸下实际直径是 10 + 2×2 = 14px，而不是文档写的 10px。定位算式要用真实直径，因此改为 `border-box`，让 `--tx-avatar-status-diameter` 就是外径。这会让状态点视觉上略小于改动前 —— 属于把尺寸变量的含义修正到与文档一致，需要在文档「交互契约」里写明。

`right`/`bottom` 的百分比按 containing block（`.tx-avatar`，`position: relative`）宽高解析，所以 `14.64%` 对预设与自定义尺寸都自动成立，AC1/AC3/R1.5 一次覆盖。

**校验（medium：D=40，s=10）**：inset = 0.1464×40 − 5 = 0.86px，圆点中心距右边 0.86 + 5 = 5.86px ≈ 40×0.1464 ✓，正落在 45° 切点。

## 2. 头像组布局：内联 style → CSS 变量

### 2.1 为什么必须重构

`hoverEffect` / `spreadOnHover` 都要在 `:hover` 时改 `z-index` 和 `margin-left`。这两个属性目前是**内联**注入的（`TxAvatarGroup.vue:52-58`），而内联样式的优先级高于任何选择器，`:hover` 规则永远打不过。所以先把它们从内联挪到 scoped CSS，才谈得上 hover 特效。

保留内联的只有 ring `border` —— 现有测试 `avatar.test.ts:146` 明确断言它是内联的（C2），且它没有 hover 态需求。

### 2.2 `:deep()` 能穿透插槽内容

组的 scoped 样式确实不会自动落到插槽子节点上（子节点带的是**父组件**的 scope id），但 `:deep()` 编译成 `.tx-avatar-group[data-v-h] .foo` —— 组根节点由组自己的 render 创建、带 `data-v-h`，后代选择器不要求子节点带 scope id。所以：

```css
.tx-avatar-group :deep(.tx-avatar-group__item) { /* 命中插槽头像 */ }
```

这条是整个方案的地基。源码里那句「Scoped styles never reach slot content」只对**直接**选择器成立，需要在注释里补正，否则下一个人还会绕回内联注入。

### 2.3 变量与规则

组根节点内联：

```js
{
  '--tx-avatar-group-overlap': overlapPx,        // 已有，保留（对外契约）
  '--tx-avatar-group-spread-overlap': spreadOverlapPx,
  '--tx-avatar-group-more-z': String(children.length + 1),
}
```

每个子项内联只剩：`{ '--tx-avatar-group-index': index + 1 }`（外加原有 ring border）。

scoped CSS：

```css
.tx-avatar-group { --tx-avatar-group-gap: var(--tx-avatar-group-overlap); }

.tx-avatar-group :deep(.tx-avatar-group__item) {
  z-index: var(--tx-avatar-group-index, 1);
  margin-left: calc(var(--tx-avatar-group-gap) * -1);
  transition: transform .18s ease, box-shadow .18s ease, margin-left .22s ease;
}
.tx-avatar-group :deep(.tx-avatar-group__item:first-child) { margin-left: 0; }
```

`--tx-avatar-group-gap` 定义在根、由子项继承，所以在**根**上换值即可整组联动（见 2.5）。子项上的 `--tx-avatar-group-index` 是内联的、不可被 CSS 覆盖，但 hover 规则直接写字面 `z-index`（不是改那个变量），所以不受影响。

### 2.4 lift

```css
.tx-avatar-group.is-hover-lift :deep(.tx-avatar-group__item:hover) {
  z-index: var(--tx-avatar-group-hover-z, 999);
  transform: translateY(-4px) scale(1.06);
  box-shadow: 0 6px 16px rgb(0 0 0 / 18%);
}
```

特异性 `.tx-avatar-group[data-v-h].is-hover-lift .x:hover` 高于 `TxAvatar` 自己的 `.tx-avatar--clickable:hover { transform: scale(1.05) }`，所以 `clickable` 头像在组里会走组的位移；`scale(1.06)` 是为了让这个覆盖读起来仍像 clickable 的放大反馈，而不是两套动效互相打架。

### 2.5 spread

```css
.tx-avatar-group.is-spread-hover:hover { --tx-avatar-group-gap: var(--tx-avatar-group-spread-overlap); }
```

根上换变量 → 子项的 `margin-left` 计算值变化 → 走 2.3 里已经声明的 `margin-left` transition。不需要给每个子项单独绑状态。

### 2.6 reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .tx-avatar-group :deep(.tx-avatar-group__item) { transition: none; }
  .tx-avatar-group.is-hover-lift :deep(.tx-avatar-group__item:hover) { transform: none; }
}
```

`z-index` 置顶与 `box-shadow` 保留 —— 它们是**信息**（谁在最上层 / 谁被指着），不是动效。

## 3. `+N` 溢出 popover

### 3.1 包装结构

`overflowPopover` 为真且 `extraCount > 0` 时，把 `+N` 头像塞进 `TxPopover` 的 `reference` 插槽：

```
.tx-avatar-group
└─ .tx-base-anchor__reference.tx-avatar-group__item.tx-avatar-group__more-ref   ← 负 margin / z-index 落在这
   └─ .tx-popover__reference
      └─ .tx-avatar.tx-avatar-group__more                                       ← 只剩 ring border
```

`.tx-base-anchor__reference` 本身是 `position: relative; display: inline-flex; width: fit-content`（`TxBaseAnchor.vue:1194-1199`），在组的 flex 行里与头像等价，负 margin 直接生效 → AC10。

类名通过 `TxPopover` 的 `referenceClass` prop 传入（`PopoverProps.referenceClass` → `TxTooltip` → `TxBaseAnchor` 的 `:class="[props.referenceClass, ...]"`）。**不能**用 fallthrough attrs：`TxBaseAnchor` 是 `inheritAttrs: false` 且把 attrs 转给浮层（`TxBaseAnchor.vue:19,57`），class 会落到 teleport 出去的面板上而不是 reference。

`z-index` 走不了 `referenceClass`（那只是 class，没有 style），所以在组根上内联 `--tx-avatar-group-more-z`，由一条 `.tx-avatar-group :deep(.tx-avatar-group__more-ref) { z-index: var(--tx-avatar-group-more-z); }` 消费。

包装时内层 `+N` 头像**不再**带 `tx-avatar-group__item`，避免负 margin 被加两次。

`overflowPopover` 关闭时走原来那条 `h(TxAvatar, ...)` 分支，DOM 逐字节不变 → AC7。

### 3.2 面板内容

默认渲染被切掉的那批 VNode（`nodes.slice(maxVisible)`），它们没有在可见列表里渲染过，直接 `cloneVNode` 复用安全，零额外数据依赖：

```js
default: () => slots.overflow?.({ nodes: hiddenNodes, count: extraCount })
  ?? h('div', { class: 'tx-avatar-group__overflow-grid' },
       hiddenNodes.map(n => cloneVNode(n, { class: 'tx-avatar-group__overflow-item', ... })))
```

**样式作用域陷阱**：面板被 teleport 到 `body`，落在组根之外，所以 `.tx-avatar-group :deep(.foo)` 这类后代选择器**不会**命中面板内容。网格容器由组自己的 render 创建、带 `data-v-h`，因此必须写成独立选择器：

```css
.tx-avatar-group__overflow-grid { /* 编译成 .tx-avatar-group__overflow-grid[data-v-h]，命中 ✓ */ }
.tx-avatar-group__overflow-grid :deep(.tx-avatar-group__overflow-item) { /* 命中克隆的插槽头像 ✓ */ }
```

### 3.3 依赖图代价

avatar 静态引入 popover 后，`@talex-touch/tuffex/avatar` 的图会拖进 `popover` / `tooltip` / `base-anchor` / `base-surface` / `card` / `glass-surface` / `spinner`。这与 `button`、`select` 已有的做法一致（`audit-package-size.mjs:151-168` 两条 budget 都显式允许 popover + tooltip），所以选**静态 import**，不用 `defineAsyncComponent`（tuffex 源码里零先例，只在 tabs 测试里出现过）。

代价必须显式登记，否则以后谁再往 avatar 加依赖没人拦得住 —— 在 `onDemandImportBudgets` 补一条 `avatar` entry，`allowedComponentDirs` 列全上述目录 + `avatar` + `icon`。

三个套件桶不动：avatar / popover / tooltip 都在 `base`（`base/index.ts:7,61,92`），`base-anchor` 在 `pro` 但那是 popover 早就有的边，不是本次新增。

## 4. API

```ts
export interface AvatarGroupProps {
  max?: number
  size?: AvatarSize
  overlap?: number | string

  /** 单个头像悬浮时的反馈。默认 'lift'。 */
  hoverEffect?: 'none' | 'lift'
  /** 整组悬浮时是否展开间距。默认 false。 */
  spreadOnHover?: boolean
  /** 展开后的重叠量，仅在 spreadOnHover 为真时生效。默认 0。 */
  spreadOverlap?: number | string

  /** 是否在 `+N` 头像上挂溢出 popover。默认 false。 */
  overflowPopover?: boolean
  overflowPopoverTrigger?: 'hover' | 'click'      // 默认 'hover'
  overflowPopoverPlacement?: PopoverPlacement     // 默认 'top'
}
```

新增具名插槽 `overflow`，slot props `{ nodes: VNode[], count: number }`。

`TxAvatarGroup` 是 `defineComponent` + 运行时 `props` 声明（不是 `<script setup>`），所以 runtime props 表和 `AvatarGroupProps` 要**手工**保持同步；类型漂移不会被编译器抓到，靠单测断默认值兜底。

## 5. 兼容性与回滚

- 唯一有观察差异的破坏性改动是 **2.1 的内联 → CSS 变量**：外部若有人靠内联 `margin-left` / `z-index` 做覆盖会失效。三条现有单测都不依赖（已核 `avatar.test.ts:96-168`），文档里 `overlap` 的描述要从「作为负 margin 应用」改成「解析为 `--tx-avatar-group-overlap`，由组样式转成负 margin」。
- `box-sizing: border-box`（1.2）让状态点外径从 `size + 2×border` 变成 `size`，视觉略小。这是把实现修正到文档既有描述，写进交互契约。
- 全部改动限于 avatar 目录 + 一条 size budget + nexus 文档/demo；回滚 = revert 单个 commit。
