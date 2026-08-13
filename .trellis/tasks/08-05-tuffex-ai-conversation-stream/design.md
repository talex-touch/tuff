# ② TxConversationStream 技术设计

PRD：`./prd.md`。本文定案父任务开放决策 1（触顶加载机制），并给出分区结构、位置缓存、锚定算法与组件契约。

## 0. 定案

| 决策 | 结论 | 理由 |
|---|---|---|
| 触顶加载机制 | **原生滚动 + 顶部 sentinel（IntersectionObserver）+ 手动 scroll anchoring**；不用 better-scroll pull-down | better-scroll 以 transform 接管滚动，与绝对定位虚拟窗口互相打架，且桌面端「拉出橡皮筋再松手」不是历史加载的直觉；IO sentinel 提前 200px 预取，体感是「滚上去历史已经在了」，更接近 ChatGPT/iMessage |
| 数据所有权 | 组件**完全受控**：`items` prop 是唯一数据源，loader 由消费方实现并自行 prepend | 组件持有数据副本会与 R2 transport 形成双源；锚定逻辑对「任何 prepend」生效，与触发来源解耦 |
| loader 签名 | `loadOlder?: () => Promise<{ hasMore: boolean }>`——消费方在 resolve 前把旧消息 unshift 进自己的 `items` | PRD 草签的 `{ items, hasMore }` 返回形态被否：返回 items 意味着组件替消费方管数据，违反上一行 |

## 1. 分区结构

```
┌─ scroll container（原生 overflow-y: auto, overflow-anchor: none）
│  ┌─ top zone      ── sentinel + loading/error/done 态（不虚拟化）
│  ├─ virtual zone  ── spacer(height=Σ settled heights)
│  │                   └─ 绝对定位窗口项 translateY(prefixOffset)
│  └─ live zone     ── 最后 1 条消息，永远真实挂载、正常文档流
└─
```

- **live zone = 恒为最后一条**，与是否流式无关。避免「流式开始/结束时在虚拟区↔实挂区搬家」的模式切换抖动；新消息 push 时旧的 live 项带着已实测高度进入位置缓存（key 继承，无重测跳动）。
- 流式增高只发生在 live zone（正常流），不触碰虚拟区的位置缓存。
- virtual zone 渲染窗口 = 可视范围 ± `overscan`，DOM 节点数有界（PRD 验收项）。

## 2. 位置缓存（`use-position-cache.ts`，纯 TS）

- `heights: Map<key, number>`：实测高度，**按 item key 存**（prepend 后索引平移不影响缓存命中）。
- `offsets: number[]`：前缀和，惰性重建（脏标记 + 首次读取时重算）；`total` 为末项。
- 未实测项用 `estimatedItemHeight`（prop，默认 96）。
- 每个窗口项外包一层测量 wrapper，单个 ResizeObserver 观察全部窗口项；`entry.target → key` 反查，高度变化写缓存、标脏。
- 可见范围：`scrollTop` 在 `offsets` 上二分。
- **测量修正的滚动补偿**：位于视口上方的项实测高度与估算的差值 `Δ`，同帧 `scrollTop += Δ`（防止修正把内容顶跑）。视口下方的修正不补偿。

## 3. 滚动行为

### 3.1 stick-to-bottom（`use-stick-to-bottom.ts`）

- `atBottom = scrollHeight - scrollTop - clientHeight < 80`（沿用 HomePage 现值），scroll 事件（passive）里更新；**程序化滚动期间置 guard 位**，不误判为用户离底。
- 跟随触发源：live zone 的 RO（流式增高）+ `items` 长度增长（新消息）。atBottom 时 rAF 内 `scrollTop = scrollHeight`。
- 用户上滚（wheel 上向 / scroll 距底超阈值）→ 停止跟随；回底浮钮点击 → `scrollToBottom('smooth')` + 恢复跟随。
- 浮钮态：`!atBottom` 显示；`!atBottom && 流式中` 附加「新内容」提示样式（prop `streaming?: boolean` 或由消费方经 slot 定制，取前者——组件需要知道流式与否来定浮钮语义）。

### 3.2 prepend 视口锚定

- `watch(items)` 比对新旧首项 key：新列表中旧首 key 的索引 `n > 0` 即 prepend 了 `n` 条。
- 锚定算法（同步于 DOM 更新后、paint 前，`flush: 'post'` + 直接读写）：
  1. prepend 前记录 `anchorKey`（当前窗口第一个可见项）与其 `offsetBefore - scrollTop`；
  2. DOM 更新后新项以估算高度进入缓存，重算 offsets；
  3. `scrollTop = offsetAfter(anchorKey) - 记录的视口内偏移`；
  4. 后续 RO 实测新项时走 §2 的上方补偿。
- `overflow-anchor: none` 关掉浏览器原生锚定，避免双重补偿。

### 3.3 触顶加载

- sentinel 置于 top zone，IO `root = 容器`，`rootMargin: '200px 0px 0px 0px'`。
- 触发条件：`intersecting && !inFlight && hasMore && items.length > 0`。
- `inFlight` 并发闸；loader resolve → `hasMore` 更新；reject → `error` 态 + `load-error` emit，top zone 呈现重试（默认按钮，`top-error` slot 可换），重试重调 loader。
- 初始 `hasMore`：prop `hasMoreInitial?: boolean`（默认 `loadOlder` 存在即 true）；`hasMore=false` 后 IO 解绑。

## 4. 组件契约

```ts
// props
items: T[]
itemKey: string | ((item: T, index: number) => string | number)
estimatedItemHeight?: number   // 默认 96
overscan?: number              // 默认 4
loadOlder?: () => Promise<{ hasMore: boolean }>
hasMoreInitial?: boolean
streaming?: boolean            // 驱动浮钮「新内容」态
// emits
'at-bottom-change'(atBottom: boolean)
'load-error'(error: unknown)
// slots
item({ item, index })          // 必备，消息组件由消费方注入
empty / top-loading / top-error({ retry }) / top-done
scroll-to-bottom({ streaming })  // 浮钮内容可换，默认内置
// expose
scrollToBottom(behavior?: ScrollBehavior): void
scrollToIndex(index: number): void
atBottom: boolean   // 实现修订：公共实例代理会解包 exposed ref，vue-tsc 的 expose 面就是解包后类型；
                    // 手写 Instance 接口若声明 Ref 会对消费方撒谎（drift 契约实测抓出）。经模板 ref 读取仍具响应性
```

- 两个 zone 的 v-for 均以 `itemKey` 取 key，杜绝串位（PRD 验收项）。
- 空态：`items.length === 0` 渲染 `empty` slot。
- 滚出重进的项内部状态不承诺保留（PRD 已声明），高度因缓存命中不跳。

## 5. 已知边界与对策

| 边界 | 对策 |
|---|---|
| 容器宽度变化 → 全部高度失真 | 容器 RO：宽变时保留缓存渐进重测，上方修正走滚动补偿；一次性大改（如侧栏开合）允许轻微涟漪，不做全量同步重排 |
| jsdom 无布局，RO/IO 不生效 | 逻辑全部下沉纯 TS composable（§2 §3 算法均可无 DOM 单测）；组件层测试用手动触发的 RO/IO mock（沿用 `scroll.test.ts` 的 stubGlobal 模式） |
| `scrollToIndex` 目标未实测 | 按当前 offsets 跳，随实测补偿收敛；不承诺像素级精确落点 |
| loader 在无滚动条时（内容不满屏）连环触发 | 触发条件追加「容器可滚动或首屏后延迟一次」：`scrollHeight > clientHeight` 不满足时只允许一次自动加载，其后要求用户交互（滚轮上滚）再触发 |

## 6. 目录与导出

```
conversation-stream/
├── index.ts
├── __tests__/position-cache.test.ts
│            stick-to-bottom.test.ts
│            conversation-stream.test.ts
└── src/
    ├── TxConversationStream.vue
    ├── use-position-cache.ts
    ├── use-stick-to-bottom.ts
    └── types.ts
```

- `components.ts` 加一行；子路径走 `./*` 通配。
- 零新依赖（RO/IO/原生滚动均为平台能力）。
- TxVirtualList / TxScroll 不动。

## 7. 回滚

全部新增文件 + components.ts 一行，回滚 = 删目录删行。
