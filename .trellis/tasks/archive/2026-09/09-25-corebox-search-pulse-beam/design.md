# Design — CoreBox 搜索中棱镜光

## Boundaries

| 文件 | 变更 |
| --- | --- |
| `apps/core-app/src/renderer/src/views/box/CoreBox.vue` | 挂载 `TxPrismGlow`；门控计算；进度 chip 改为 `role="status"` 文字（动画时 sr-only，降级时可见）；`minDuration` 400；移除 `TxSpinner` 导入。**门控部分已在第一版完成，本次只把 `<SearchPulse>` 换成 `<TxPrismGlow>`。** |
| `apps/core-app/src/renderer/src/views/box/SearchPulse.vue` | 删除（第一版的单束扫光实现）。 |

视觉由 `@talex-touch/tuffex/prism-glow` 提供，CoreBox 只负责放置和门控。

## Placement

```vue
<!-- MainBox 头部分支第一个子节点 -->
<TxPrismGlow class="CoreBox-SearchGlow" :active="showSearchPulse" :intensity="…" />
```

```scss
// div.CoreBox 是 z-indexed 的定位元素（自成层叠上下文）：-1 画在头部内容之下、bar 自身透明背景之上
.CoreBox-SearchGlow {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
}
```

- `TxPrismGlow` 的根元素自带 `isolation: isolate`，光层只相对根元素叠放。CoreBox 覆盖根元素的定位，让它铺满 bar。
- `active` 始终绑定，`v-if` 在组件内部的 `Transition` 里，所以淡出过渡能完整播放。
- `intensity`：初值 0.85，按截帧调整，标准是占位文字始终清晰。`placement` / `palette` 用默认值（bottom / spectrum）。

## Gating（已实现，保持不变）

```ts
const showSearchProgress = useDeferredLoading(loading, { delay: 600, minDuration: 400 })
const prefersReducedMotion = usePreferredReducedMotion()
const searchPulseAnimated = computed(() => prefersReducedMotion.value !== 'reduce' && !lowBatteryMode.value)
const showSearchPulse = computed(
  () => showSearchProgress.value && shouldShowInput.value && !searchError.value && searchPulseAnimated.value
)
```

进度分支：保留 `v-else-if="shouldShowInput && showSearchProgress"`，只渲染一个 `role="status"` 元素，内容是 `t('corebox.searching')`，并绑定 `:class="{ 'sr-only': searchPulseAnimated }"`。

## Compatibility / rollback

- 无数据、协议、设置项变更；i18n 复用已有的 `corebox.searching`。
- 用户 `customCSS` 里的 `.tx-spinner` 相关样式会失效；`.CoreBox-SearchStatus--progress` 类名保留。
- 回滚：CoreBox.vue 里去掉 `TxPrismGlow` 的导入和挂载（门控可以保留，或一并还原）。
