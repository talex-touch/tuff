# Design — anchor 浮层滚动跟手

## 改动边界

单点改动：`packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue:178-186`

```ts
const { floatingStyles, ... } = useFloating(floatingReference, floatingRef, {
  placement: computed(() => props.placement),
  strategy: 'fixed',
  transform: false,   // → true
  middleware,
  open,
})
```

`transform: true` 后 `floatingStyles` 的产出从 `{ position, left, top }` 变成 `{ position, top: 0, left: 0, transform: 'translate(Xpx, Ypx)' }`。绑定点不变，仍是模板上的 `:style="[floatingStyle, floatingStyles, { zIndex, ... }]"`。

## `transform: false` 是否是刻意设计

不是。`git log -S` 追到最早的真实提交是 `3d2123679`（组件初版），不是任何一次定位修复；源码该处没有解释性注释；`.trellis/spec/` 全库不含 `floating-ui` / `useFloating` 的约定。因此这是默认值遗留，不是被锁定的契约。

`base-anchor-flip.test.ts:96` 的 `expect(capturedOptions[0]?.transform).toBe(false)` 也不是规格：该用例名为 *"does not disturb the other positioning options"*，意图是"加 `disableFlip` 时没顺手改坏别的选项"，而不是"这三个值必须是这些"。改方向的同时更新该断言是正当的，但**必须同步改用例意图注释**，否则下一个人会把它当成规格。

## transform 会不会和现有动画打架

不会。动画写入的 transform 全在**子节点**上：

- `base-anchor-motion.ts` 只写 `clipRef` / `contentRef` / `arrowRef`（486 / 597 / 611 / 1076 / 1279 行）
- `base-anchor-liquid.ts` 写 liquid stage 内部节点

浮层根 `floatingRef` 上除了 Vue 的 `:style` 绑定，没有任何命令式 transform 写入。

## 真正需要盯的三个副作用

1. **`backdrop-filter` 的采样基准。** 面板走 glass / refraction，大量依赖 `backdrop-filter`。根节点新增 transform 会改变 backdrop 的采样空间。规范里创建 Backdrop Root 的是 `filter` / `opacity < 1` / `mask` / `mix-blend-mode`，`transform` **不在**其中，Chromium 实测也不断裂——但这是本次改动风险最高的一项，必须实机看，不能只靠规范推断。

2. **`size` middleware 的命令式写入。** middleware 直接写 `elements.floating.style.maxWidth / minWidth` 和 `--tx-ba-max-height`（145-172 行）。Vue 的 style patch 只增删它自己管的 key，命令式写入的其它属性得以存活——这是**现状已有的行为**，`transform: true` 不改变它。但 `floatingStyles` 新增 `transform` key 后，Vue 会开始管理 `transform`，需确认没有别处命令式写根节点 transform（已确认没有）。

3. **亚像素模糊。** `translate()` 接受非整数 px，会让面板内文字在非整数位置上发虚；`left/top` 同样是亚像素但布局阶段有取整机会。若实机看到发虚，用 middleware 对 `x/y` 取整解决，而不是回退方案。

## 不做的事

- 不改 `strategy`。`fixed` 规避了裁剪/transform 祖先问题，动它是另一个数量级的风险（方案 B，留档未采用）。
- 不消除结构性的一帧延迟。那是 `computePosition` 异步 + Vue flush 的固有代价，本任务不追。
- 不动 `hasActiveTimeline()` 对展开期间重定位的抑制逻辑。
- 不动 `virtualReference` 分支的 window scroll/resize 监听路径——但要验证它没被连带影响。

## 回滚形状

单行改回 `transform: false` + 还原测试断言即可，无数据迁移、无 API 变化。
