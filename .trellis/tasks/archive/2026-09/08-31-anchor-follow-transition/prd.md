# anchor 浮层滚动跟手：动画结束后清 transition

父任务：`08-31-tuffex-interaction-polish`

状态：方向已确认 —— **方案 A（`transform: true`）**。原始诊断与源码不符，改按真实成因修，见下。

## 用户报告

"tooltip 提示滚动的时候有延迟，你应该加载 mounted 动画结束之后 transition 干掉。"
截图：nexus 组件画廊 Tooltip 页，`Add` 浮层挂在 `+` 圆形按钮上方。

## 排查结论：源码里没有那条 transition

沿 `TxTooltip → TxBaseAnchor → TxCard / TxBaseSurface` 整条链查过：

| 检查项 | 结果 |
|---|---|
| `TxBaseAnchor.vue` `<style scoped>` | 全文件 `transition` 只出现在一条注释里（981 行），**样式块内零条 transition** |
| `base-anchor-motion.ts` 的内联写入 | 只有 transfer 动画对 card 写 `box-shadow` 过渡（557–582 行），且自带 stash/还原；不碰 transform / left / top |
| `TxBaseSurface` 外置样式 | 过渡属性只有 `opacity` / `background` / `backdrop-filter`（`base-surface/src/style/index.scss`） |
| `TxGlassSurface` | 只有 `transition: opacity 260ms ease-out` |
| `TxCard` / arrow | 无 |
| tuffex + nexus 全局 `*` 通配过渡 | 无 |

所以"动画结束后把 transition 干掉"这个修法没有作用对象——延迟不是过渡插值造成的。

## 真实成因

`packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue:178-186`

```ts
useFloating(floatingReference, floatingRef, {
  strategy: 'fixed',
  transform: false,   // ← 定位走 left/top，不走 transform
  ...
})
```

`transform: false` 时 floating-ui 输出的是 `{ position: fixed, left, top }`。于是：

1. 浮层是 `position: fixed`，页面滚动时它**自己不动**，必须靠 JS 每帧重写 `left/top` 才能贴住参考元素。
2. 重写路径是 `autoUpdate({ animationFrame: true })` → `update()` → `computePosition()`（异步）→ 响应式 ref → Vue flush → DOM 写入。整条链结构性地落后参考元素约一帧。
3. `left/top` 走的是布局通道，拿不到合成器快路径，代价也高于 transform。

快速滚动时这一帧的位移就是肉眼可见的"浮层在按钮后面游"。

## 方向

**采用方案 A：`transform: true`。** 定位从 `left/top` 改为 `translate()`，写入走合成器快路径，开销降一档，滚动拖尾显著收敛。仍存在结构性的一帧延迟——这是 floating-ui 异步 `computePosition` + Vue flush 的固有代价，本任务不追求消除它。

已评估并**暂不采用**的方向，留档备查：

| 方案 | 做法 | 不采用的原因 |
|---|---|---|
| B | `strategy: 'absolute'`（浮层已 teleport 到 `body`） | 滚动时随文档天然移动，零 JS 写入，理论上最彻底；但会重新暴露被 `fixed` 规避掉的裁剪 / transform 祖先问题，风险面远大于收益。A 的实测数据不理想时再回来评估 |
| C | 滚动期间冻结跟随、停止后归位 | 回避而非解决，观感从"游"变成"跳" |

## 验收标准
- [ ] 滚动中浮层与参考元素的位移偏差有可量化的前后对比（用假 rAF 时钟逐帧 diff 几何，不靠录屏）
- [ ] `flip` / `shift` / `size` / `arrow` 四个 middleware 的行为不回归
- [ ] 展开/收起时间线期间的 `hasActiveTimeline()` 抑制逻辑不被破坏
- [ ] `virtualReference` 分支（走 window scroll/resize 监听，非 autoUpdate）同步验证
- [ ] 依赖 anchor 的下游——tooltip / popover / dropdown-menu / context-menu / select —— 逐个复核未回归
