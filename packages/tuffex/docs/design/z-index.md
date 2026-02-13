# Z-Index / Layering

TouchX UI（Tuffex）对所有“全局浮层”（teleport 到 `body` 的 popper/overlay/dialog/toast 等）统一使用一个可外接的 Z-Index 管理器，目标是：

- 解决浮层被 `NavBar/TabBar` 等固定层级遮挡的问题
- 保证“后打开优先”：后打开的浮层永远能拿到更高的 z-index（默认单调递增）
- 支持接入宿主应用或其他 UI 框架的 z-index 体系（override + seedSource + refresh + listener）

## 核心语义

### `nextZIndex()`

- 在浮层“打开时”调用一次，获取一个新的 z-index
- 默认策略：`current` 单调递增（`current + 1`）
- 若通过 `configureZIndex({ overrides })` 覆盖分配逻辑，则由外部决定

### `refreshZIndex(seed?)`

- 安全刷新：只会把内部 `current` 抬高到 `>= seed`，不会降低
- 用于外部基准（seed）变高后通知内部系统，避免后续分配落在旧区间

### `resetZIndex(seed?)`

- 强制重置：直接把 `current` 重置到 `seed`
- 可能导致与“仍处于打开状态”的浮层发生层级冲突，仅提供显式 API（调用方自行承担风险）

> 默认行为：`refresh` 只影响后续分配，不会自动重排已打开浮层的 z-index（避免刷新导致浮层顺序意外变化）。

## 默认 seed 规则

默认常量：

```ts
export const DEFAULT_Z_INDEX_SEED = 2000
```

在未显式传入 `seed` 且未配置 `seedSource.getSeed` 时，管理器会在浏览器环境尝试读取：

```css
:root {
  --tx-index-popper: 2000;
}
```

并取：

```
resolvedSeed = max(DEFAULT_Z_INDEX_SEED, parsed(--tx-index-popper))
```

## 可外接（Pluggable）

### 1) override next/get（完全接入外部系统）

```ts
import { configureZIndex } from '@talex-touch/tuffex/utils'

configureZIndex({
  overrides: {
    next: () => externalZ.next(),
    get: () => externalZ.current(),
  },
})
```

### 2) 手动 refresh（外部 seed 变化后通知内部系统）

```ts
import { refreshZIndex } from '@talex-touch/tuffex/utils'

externalZ.setSeed(9000)
refreshZIndex(undefined, 'external seed updated')
```

### 3) seedSource + subscribe（监听外部 seed 自动 refresh）

```ts
import { configureZIndex } from '@talex-touch/tuffex/utils'

configureZIndex({
  seedSource: {
    getSeed: () => store.zIndexSeed,
    subscribe: (listener) => store.on('zIndexSeedChanged', listener),
  },
})
```

## 事件监听（Listener）

通过 `onZIndexEvent()` 可以订阅内部事件（`next/refresh/reset/configure`），便于外部或组件做二次联动：

```ts
import { onZIndexEvent } from '@talex-touch/tuffex/utils'

const off = onZIndexEvent((e) => {
  if (e.type === 'refresh') {
    console.log('z-index refreshed:', e.seed, e.current)
  }
})

// later: off()
```

