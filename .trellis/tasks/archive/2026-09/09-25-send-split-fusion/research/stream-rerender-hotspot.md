# 研究：发送腾位置滚动期间，消息流每帧重渲染可见行（2026-09-25，代码阅读结论，待 CDP 实测量化）

## 链路

1. `HomePage.submit()` 发送后调用 `streamRef.tweenToBottom(280)`（`HomePage.vue:603`）。
2. `use-stick-to-bottom.ts` 的 `tweenToBottom` 用 rAF 每帧写 `scroller.scrollTop`（280ms，约 17 帧）；回复流式输出时 `followIfSticking(220)` 的弹簧同样每帧写 `scrollTop`。
3. 每次写 `scrollTop` 触发 `scroll` 事件 → `TxConversationStream.onScroll` 写 `scrollTop.value`。
4. `range` 计算属性依赖 `scrollTop.value`，每次都 `return cache.visibleRange(...)`——**新对象**。Vue 的计算属性按引用比较，于是每帧都判定变化。
5. `windowItems` 依赖 `range`，每帧产出新数组 → 组件模板的 `v-for="entry in windowItems"` 每帧重新渲染：每个可见行的 `<slot name="item">` 重新调用，HomePage 的整段消息模板（`segmentsOf(message)`、各种 `v-if`、子组件 props diff）每帧执行一遍。可见行数 = 视口内行数 + 上下各 4 行 overscan。

## 为什么这会伤害发送动画

`playSend` 的飞行替身、`tweenToBottom`、Vue 的每帧重渲染都在同一条主线程上，发送那一刻还叠加了新行挂载与测高、请求发起；任何一帧超过 16.7ms，飞行就丢帧。

## 修法（写进 design §4）

`range` 改为 `computed((previous) => { const next = …; return previous && previous.start === next.start && previous.end === next.end ? previous : next })`（Vue 3.4+ 支持带旧值的 getter）。起止下标不变时引用不变，`windowItems` 不重算，滚动帧不再触发插槽重渲染；只有跨过行边界时才更新。偏移量 `offset` 由 `layoutVersion` 驱动，不受影响。

## 待实测

用 CDP 性能录制对比修复前后：280ms 腾位置期间主线程脚本时间、长任务数、丢帧数。
