# Design — 筛选条改用 TxFilterChips

Task: `.trellis/tasks/09-06-model-menu-filter-chips`

## 1. 维度回退：tab 是 provider，分组是渠道

上一轮把渠道提到 tab 上，真机证明是错的：本机 pi 有 8 个渠道，加星标和另一个 provider 就是 10 个槽，
30px 一个的条子在 300px 面板上必然折行——用户看到的第二行只挂着一个 `T`。

改回两层分工，各自只做一件事：

| | 维度 | 承担者 |
|---|---|---|
| 选哪一堆 | provider | 筛选条（3 个 chip） |
| 堆里怎么分 | 渠道（`source`） | 列表分组头 |

`bucketOf` / `visibleGroups` / `showGroupHeaders` **原样保留**，只是不再喂筛选条。
`model-source-icons.ts` 也保留：组头仍要画 `codex` 的 OpenAI 标、认不出的画首字母。
上一轮那套渠道识别没有白做，它只是从 tab 换到了组头。

`ModelFilter` 回到 `{ kind: 'favorites' } | { kind: 'provider'; providerId: string }`，
`visibleChoices` 按 `providerId` 过滤，`defaultFilter()` 用钉住模型的 provider。

## 2. 为什么是 TxFilterChips，不是 TxTabs

| | TxFilterChips | TxTabs |
|---|---|---|
| ARIA | `role="toolbar"`，chip 是 `aria-pressed` 切换按钮 | `tablist` / `tab` |
| 放进 `role="menu"` 面板 | 合法：toolbar 是筛选控件 | 上一轮 design §4 已明确否掉 |
| 溢出 | `overflow-x: auto` + 隐藏滚动条，单行 | nav 有自己的滚动与换行策略 |
| 指示器 | 无（本任务补） | 有，但是 900 行组件里的内联实现，5×5 矩阵 |

选 TxFilterChips 并给它补一个指示器，比把 TxTabs 塞进菜单要小得多，也不用推翻上一轮定下的 ARIA 结论。

**不复制 TxTabs 的 pointer**：那套支持 line/pill/block/dot/outline × stretch/warp/glide/snap/spring，
还带纵向布局与 reveal 状态机。一条筛选条要的是「活动底色从这里挪到那里」，一种观感一种运动足够；
把 5×5 搬过来是给两个文档 demo 和一条菜单条背 900 行的债。

## 3. 指示器：把已有的 `.is-active` 底色挪到一个共享元素上

今天每个 chip 自己画活动态：

```scss
&.is-active {
  color: var(--tx-bui-ink, #1f2124);
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
}
```

改成：底色与阴影搬到一个 `tx-bui-filter-chips__indicator` 元素上，chip 的 `.is-active` 只留
`color`。**静止观感逐像素不变**，变的只是两个状态之间——从两处各自淡入淡出，变成一处平移。

```
.tx-bui-filter-chips            position: relative; (已有 overflow-x: auto)
  └─ __indicator                position: absolute; transform: translateX(x); width: w;
  └─ __chip * n                 position: relative; z-index: 1;
```

**指示器必须放在滚动容器内部，并且它跟着内容滚——这次是要的。**
绝对定位子元素的包含块随滚动容器的内容一起走（这正是上一轮 `TxBaseAnchor` 背景被滚走的机制，
`base-anchor.{zh,en}.mdc` 里记了）。那里是 bug，这里是特性：chip 横向滚动时指示器必须跟着它贴住。

测量：组件已有 `chipRefs`（每个 chip 的 button 元素）与 `activeIndex`，指示器读活动 chip 的
`offsetLeft` / `offsetWidth` 写进两个 CSS 变量。触发点：

- `modelValue` 变化（切换）
- `items` 变化（provider 增删，菜单每次打开都会重新拉）
- `ResizeObserver` 打在滚动容器上（面板宽度变化、字体加载完成后 chip 宽度会变）

**首帧不滑**：第一次落位与「元素刚挂上」这两种情况下写位置前先关掉 transition
（`__indicator--placing` 类，下一帧移除）。TxTabs 用 `indicatorRevealed` 解决同一个问题，
这里用同样的思路但只需要一个布尔。

**没有活动项时**（理论上不会——星标恒在，但 `modelValue` 可能一瞬间落空）指示器 `opacity: 0`，
不做位移，避免它飞到 0 号位再飞回来。

## 4. API

```ts
export interface FilterChipsProps {
  // …既有
  /** 活动底色是否作为一个滑块在 chip 之间平移。@default true */
  indicator?: boolean
}
```

默认开：静止观感不变，唯二的现存消费者是文档 demo，而「活动态会滑过去」正是这类筛选条的常规观感。
留 `indicator: false` 给不想要位移的宿主——关掉时退回今天的逐 chip 上色，不是「没有活动态」。

## 5. reduced motion（BUI 规则 2，硬性）

```scss
@media (prefers-reduced-motion: reduce) {
  .tx-bui-filter-chips__indicator { transition: none; }
}
```

规则 2 要求用**编译 SCSS 的契约测试**验证，不能只靠肉眼：照 `context-cards-motion.test.ts` 的做法，
`sass.compileString` 编译组件样式，断言 reduce 块里指示器的 `transition` 被归零、且静止态样式
（背景、阴影）**不在**任何动画里才可见（规则 2 的后半句：resting styles 必须可见）。

## 6. core-app 侧

```
筛选条（模板）      手搓 button 循环  →  <TxFilterChips :items :model-value @update:model-value>
筛选条（样式）      .HomeModelMenu-Filter / -Filters / -FilterInitial 全删
                    （首字母徽标随之下岗——它只服务图标 tab；组头的首字母是另一处，保留）
ModelFilter        {kind:'bucket'}  →  {kind:'provider'}
chip items         computed: [收藏, ...providerFilters]，label 取 providerName
i18n               home.modelSources 的措辞回到「按提供方筛选」/「Filter by provider」
```

`bucketFilters` 退化回 `providerFilters`（去重 provider，保留出现顺序），但**桶的 key/label/icon
仍由 `bucketOf` 提供给组头**，两者不再共用一个 computed。上一轮「一个函数喂两处」的理由消失了：
现在它们本就是两个维度，硬共用反而是错的。

## 7. 不做

- ~~不给 `FilterChipItem` 加图标字段~~ —— **真机后两次推翻**。第一次：三个纯文字 chip 排成一行读作一句话，于是加了 `iconClass`（与 `TabBarItem` / `CardItemProps` 同名同形）。第二次：图标 + 文字仍然连读（「☆ Favorites ▤ Local Model ▤ Pi (local CLI)」），且 Local Model 与 Pi 同为 `type: local`，两个服务器图标并排等于没放。最终落在 v2 归档设计的 R1：**纯图标**（`iconOnly`，label 转 `aria-label` + `title`，30px 方块），并新增 `providerIconForId`——pi 按其种子 id `pi-cli-default` 取 pi 品牌图标（`i-simple-icons-pi`；先前的终端图标是占位，用户指出应为各 CLI 品牌标），其它 local 仍取服务器图标。renderer 尚无 `origin` 字段（`09-06-local-cli-model-providers` 会补），在那之前种子 id 是唯一能区分 CLI 的东西，只在这一处读。
- 选中行去掉 `TxCardItem` 自带的 `primary 40%` 描边：在这个面板上它读作第二个焦点环，与搜索框真正的焦点环并排出现。选中只靠底色，环留给键盘。
- 不做 chip 的 `count` 徽标（每个 provider 有几个模型）：菜单打开即重新拉取，数字会跳。
- 不动列表侧任何东西：分组、快捷键、行组件都保持上一轮的样子。

## 8. 两个只有真机才暴露的缺陷（jsdom 全绿）

- **指示器首帧 0 宽**：`place()` 在同一帧写入新宽度并解除 `is-placing`，`width` 的 transition 在写入中途被重新
  武装，从 0 补间上来，首帧永远画 0 宽。改为 `nextTick` → 强制 recalc → 再 rAF 一帧才解除。变异验证：
  把顺序改回去，新用例变红。
- **`iconOnly` 永远为 false**：`defineProps<FilterChipsProps>()` 的接口在 `types.ts` 里，dev server 的 Vue 插件
  在 `types.ts` 变化时不重编译 SFC，编译产物的运行时 props 里没有 `iconOnly`，宿主传的 `icon-only` 被当未知
  属性丢弃。vitest 是冷编译所以全绿。改为运行时对象声明（`satisfies Record<keyof FilterChipsProps, unknown>`），
  并加用例断言运行时 props 与接口逐键一致。`TxCardItem` 仍用类型式声明，下次给 `CardItemProps` 加字段会踩同一坑。

**教训写进了记忆**：tuffex 的 prop 改动不能只靠 jsdom 断言"已生效"，必须拉 `:5173` 上编译后的模块看运行时 props。

## 8b. 筛选条为什么现在只有 pi 一个 CLI 图标

用户问「这里不应该是 pi / omp / codex / claude 的图标吗」。四个 CLI 本机都装了，但**主进程今天只把 pi 注册成
provider**（`PI_CLI_PROVIDER_ID` 是唯一的 CLI 种子），omp / codex / claude 不在 `getProviderModelOptions` 的
返回里——筛选条画不出数据里没有的东西。把它们变成 provider 属于 `09-06-local-cli-model-providers`
（in_progress，`providers/cli/` 已有运行时骨架，origin 尚未穿到 transport）。

本任务把 `providerIconForId` 的表做成那个任务设计里的形状（一张 CLI→图标表，导出 class 列表进 safelist），
届时按 origin 键入、每个 CLI 加一行即可；omp `i-carbon-machine-learning-model`、codex `i-simple-icons-openai`、
claude `i-simple-icons-claude` 是该设计已定的取值。

## 9. 风险

| 风险 | 处置 |
|---|---|
| 指示器与 chip 宽度不同步（字体加载后 chip 变宽） | ResizeObserver 打在容器上，字体加载会触发 chip 尺寸变化 |
| 首帧从 0 位滑到活动位 | `--placing` 类先关 transition，下一帧再开 |
| 面板每次打开重建 items 导致指示器闪 | items 变化的重测走同一条「首帧不滑」路径 |
| 两个文档 demo 观感变化 | 同一轮里跑起 nexus 文档确认；静止态本就不变 |
| BUI 规则 2 的编译 SCSS 测试被写成恒真 | 断言 reduce 块内确实出现 `transition: none`，并反向断言默认块里有 transition |
