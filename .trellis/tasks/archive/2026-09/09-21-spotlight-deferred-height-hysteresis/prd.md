# Spotlight 改 deferred 层 + 窗口高度滞回 + stagger 上限

## Goal

消除每次停顿输入时 CoreBox 窗口「先缩到 242px 再涨回 600px」的抽动，并让开启交错动画时后排行不再钉住数秒才归位。

## Background（2026-09-21 真机测量）

- `height.mjs` 轨迹：输入 `ghostty` 后 171ms 列表被快层快照替换为 2 行，窗口 600→242px（约 200ms），约 1050ms 后 Spotlight 的 6 条结果到达，窗口再涨回 600px。`ghos→ghost`、`photosho→photoshop` 同样模式。
- 原因一：`macos-spotlight-provider` 声明为 fast 层，但每次 `mdfind` 需 840–1030ms（裸跑同样耗时，predicate 变体差异 <10%），必然超过 80ms 快层预算，作为「迟到结果」在近 1s 后重排列表；同时它占用第 7 个 fast 名额，`fastLayerConcurrency: 6` 让每次搜索都打出 `Fast layer timeout after 80ms`。
- 原因二：`useResize.ts` 在流式搜索进行中（`loading=true`）照常下发缩小后的高度，主进程 `applyLayoutUpdate` 对「有结果、高度变小」不做任何保留。
- 原因三：`CoreBox.vue getStaggerDelay` 为 `index * delay`（delay 25–55ms），第 79 行延迟约 4.3s，远超 `newItemIds` 320/500ms 清理窗口，动画被 `animation: none` 打断后从 `translateY(10px)` 突变归位（仅 `animation.listItemStagger` 开启时）。

## Requirements

### R1 Spotlight（及 Linux 原生）文件搜索进入 deferred 层

- `BaseNativeFileSearchProvider.priority` 改为 `'deferred'`；Windows 的 Everything / shell provider 不在本次范围。
- 快层预算不再因 Spotlight 超时；`search-gather.ts` 的并发注释同步更正（darwin fast provider 变为 6）。

### R1b Spotlight predicate 去掉 kMDItemDisplayName 子句

- `MacSpotlightFileProvider.searchNative` 的 predicate 只查 `kMDItemFSName`；本机同名结果集不变而耗时降到约三分之一。

### R2 搜索进行中窗口只增不减

- `useResize.sendLayoutUpdate`：当 `loading=true` 且当前与上一次下发都有结果时，下发高度取 `max(measured, lastSent)`。
- `loading` 变为 false 时按真实测量下发，允许缩小；结果为 0 的空闲态与 forceMax 分支行为不变。

### R3 交错动画延迟有上限

- `getStaggerDelay` 抽到纯函数模块，累计延迟上限 180ms（延迟 + 140ms 动画 ≤ 320ms 清理窗口）。

## Acceptance Criteria

- [x] 单测：provider priority 断言；Spotlight predicate 不含 `kMDItemDisplayName` 的断言；`useResize` 两条新用例（流式中保持高度 / 空闲时立即缩小）；stagger 上限用例。相关既有套件（`search-gather`、`search-core.*`、`useResize`、`native-file-search-provider`）通过。
- [x] `typecheck:node`、`vue-tsc`（web）通过。
- [x] 真机 `height.mjs`：`ghostty→gho`、`photosho→photoshop` 序列在搜索进行中 `innerHeight` 单调不减，最终高度与修复前一致；日志不再出现 `Fast layer timeout after 80ms`（无插件慢 provider 时）。
- [x] 真机 `type.mjs` 逐键无清零、无 DOM 重建回归。

## Notes

- 裸 `mdfind` 测量（本机，`-onlyin ~`）：`(kMDItemFSName == "*q*"cd || kMDItemDisplayName == "*q*"cd)` 900–1245ms；只保留 `kMDItemFSName == "*q*"cd` 300–350ms，且 ghostty/photoshop 两例结果数完全一致（6/14）；`mdfind -name q` 405–440ms。显示名子句是主要开销。
- 主进程侧不改；滞回放在渲染端是因为它拥有 `loading` 与测量值。

## Verification record (2026-09-21)

- 单测 8 个文件 71/71（含 6 条新用例）；`typecheck:node` 通过；`vue-tsc` 仅报 `packages/tuffex/.../TxFlowchart.vue` 一处未使用变量，属其他会话未提交的新文件，与本任务无关；eslint 通过；`git diff --check` 通过。
- 真机 `height.mjs`：`ghostty→gho` 554→554（快照 2 行时不再缩）→600；`photosho→photoshop` 全程 600；`gho→tuffbench-doc` 全程 600。修复前同序列为 600→242→600（约 1.1s 抽动）。
- 主进程日志：`Fast layer timeout` 0 次（修复前每次搜索一次）；Spotlight 在 `[D]` 层，耗时 304–322ms（修复前 `[F]` 层 840–1030ms）。
- `type.mjs` 逐键：无清零、无 DOM 重建；`ghostty` 200ms/键 stableAt 461ms（修复前 1061ms）。
