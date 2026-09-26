# Design — CoreBox 搜索脉冲语义修正

## Boundary

渲染层 only：`modules/box/adapter/hooks/useSearch.ts`、`views/box/CoreBox.vue`、`modules/lang/{zh-CN,en-US}.json`、新增/扩展 useSearch 单测。

## State model (useSearch.ts)

现有：`loading: Ref<boolean>`，search 开始置 true，`applySearchEnd` / `applyNoResults` / 失败路径置 false。

新增：

```ts
/** The current query has at least one row of its own on screen. */
const hasFreshResults = ref(false)
/** Nothing from the current query has landed yet: the searching cue belongs here. */
const awaitingFirstResults = computed(() => loading.value && !hasFreshResults.value)
/** Rows are on screen and the session is still gathering (deferred file layer). */
const searchSettling = computed(() => loading.value && hasFreshResults.value)
```

转换点：

| 位置 | 动作 |
|---|---|
| `executeSearch` 把 `loading=true` 处 | `hasFreshResults=false` |
| 推荐路径把 `loading=true` 处 | `hasFreshResults=false` |
| `applySearchSnapshot` 末尾 | `hasFreshResults = searchResults.value.length > 0` |
| `applyRecommendationResult` 末尾 | 同上 |
| stream `update` 分支合并后 | 若 `res.value.length > 0` 则 `hasFreshResults=true` |
| `applySearchEnd` / `applyNoResults` / 失败 | 不需要改（loading=false 让两个 computed 归零） |

返回值新增 `awaitingFirstResults`、`searchSettling`（`adapter/types.ts` 的接口若声明了 `loading` 也同步补字段）。

## View (CoreBox.vue)

```ts
const showSearchProgress = useDeferredLoading(awaitingFirstResults, { delay: 600, minDuration: 400 })
const showSearchSettling = useDeferredLoading(searchSettling, { delay: 300, minDuration: 400 })
```

- `TxPrismGlow :active="showSearchPulse"` 不变（内部依赖 `showSearchProgress`）。
- 状态文案分支：`showSearchProgress` → 现有 `corebox.searching`；否则 `showSearchSettling` → 新元素 `.CoreBox-SearchStatus--settling` 显示 `corebox.searchingMore`，`role="status"`，视觉为次级文字色 + 更低 opacity，`white-space: nowrap`，不影响头部高度。
- `aria-busy` 仍绑 `loading`。

## Compatibility / Rollback

- 不改变主进程协议；不改变 `loading` 的取值。
- 回滚 = 还原两处绑定即可，i18n 键可留。

## Tradeoffs

- 不用"快照到达"作为熄灭条件而用"有结果上屏"：快照为空但延迟层可能补上结果时，用户仍然需要一个"在搜"的信号。
- 弱提示用文案而不是新动画：遵守 hidden renderer 暂停动画规则，且不引入新 keyframes。
