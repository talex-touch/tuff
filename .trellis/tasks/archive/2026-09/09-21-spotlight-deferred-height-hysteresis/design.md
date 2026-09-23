# Design — Spotlight deferred + 高度滞回 + stagger 上限

## 1. Spotlight 层级与 predicate

- `native-file-search-provider.ts` `BaseNativeFileSearchProvider.priority` → `'deferred'`。Everything（win32）是独立 provider，不受影响。
- `MacSpotlightFileProvider.searchNative` predicate 改为 `kMDItemFSName == "*q*"cd`。结果集在本机两例完全一致；显示名与文件名不同的极少数 localized 应用包已由 app-provider 覆盖，不是文件搜索的目标。
- `search-gather.ts` 注释更新：darwin fast provider 6 个，`fastLayerConcurrency: 6` 恰好覆盖；不改数值。
- deferred 层已有 `file-provider`，并发 2，Spotlight 与索引并行跑。

## 2. 高度滞回（渲染端 `useResize.ts`）

在 `sendLayoutUpdate` 组装 payload 前：

```ts
// A streaming search replaces the list layer by layer. Shrinking on the fast-layer
// snapshot and growing back when the deferred layer lands is the "bounce" users see
// on every pause; hold the last height while results are still arriving.
if (isLoading && lastPayload && lastPayload.resultCount > 0 && resultCount > 0 && height < lastPayload.height) {
  height = lastPayload.height
}
```

- `loading=false` 的下发不受影响，因此列表最终稳定后仍会缩到真实高度。
- `resultCount === 0`（清空查询）不受影响，保持既有塌陷逻辑。
- forceMax 分支在 `if (measuredHeight < 0)` 之后，滞回放在其后、payload 前。

## 3. stagger 上限（`CoreBox.vue`）

`getStaggerDelay` 抽到 `views/box/stagger-delay.ts`：

```ts
export const STAGGER_MAX_TOTAL_DELAY_S = 0.18
export function getStaggerDelay(index, total): number {
  ...原公式...
  return Math.min(index * delay, STAGGER_MAX_TOTAL_DELAY_S)
}
```

`newItemIds` 清理窗口 320ms，动画 140ms + 最大延迟 180ms = 320ms，尾行不再被打断。

## 4. 测试

- `native-file-search-provider.test.ts`：priority 为 deferred；execFile 参数中的 predicate 不含 `kMDItemDisplayName`。
- `useResize.test.ts`：模拟 `.CoreBoxRes-ScrollContent` 子节点高度，loading=true 时第二次下发高度不小于第一次；loading=false 后按测量值缩小。
- `stagger-delay.test.ts`：index 79/total 80 ≤ 0.18；index 0 为 0；单调不减。
