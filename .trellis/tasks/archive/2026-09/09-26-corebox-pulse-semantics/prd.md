# CoreBox 搜索脉冲语义修正

## Goal

搜索脉冲（`TxPrismGlow` 光晕 + "正在搜索…"状态文案）目前绑定的是"整个搜索会话尚未 complete"，而会话要等延迟层（文件 provider、Spotlight）跑完才 complete，单个 provider 上限 3 秒。结果是应用已经上屏、光晕仍然亮着，老板把它读成"搜索很慢"。
本任务把脉冲改为只表达"当前查询还没有任何结果上屏"，并在已有结果、后台仍在补充时给一个更弱的提示。

## Requirements

- R1 主脉冲（光晕 + `corebox.searching`）只在当前查询 loading 且尚无任何该查询的结果上屏时显示；仍保留 600ms 延迟 / 400ms 最短显示的防闪烁。
- R2 当前查询已有结果上屏、会话仍在进行（延迟层未完成）时，提供 settling 状态 `corebox.searchingMore`（`role="status"`）。老板 2026-09-26 决定：它遵循主提示同一规则，默认 `sr-only`，仅在 reduced-motion / 低电量降级时可见（延续 09-25 "默认去掉，降级时显示" 的决定）。不改变头部尺寸、不触发布局位移。
- R3 `loading` 对外语义不变（`aria-busy`、index-commit refresh 判断、send 按钮 gating 均继续依赖它）。
- R4 推荐（空查询）路径同样适用：推荐快照上屏后不再亮主脉冲。
- R5 reduced-motion / 低电量：主脉冲回退为文案（现状）；弱提示本身无动画依赖。
- R6 i18n：`zh-CN.json` / `en-US.json` 只新增 `corebox.searchingMore` 一个键，紧跟 `searching`，不重排、不重格式化（另一会话在这两个文件里有未提交键）。

## Acceptance Criteria

- [ ] useSearch 单测：快照带结果 → `awaitingFirstResults` 变 false 而 `loading` 仍为 true；`complete` 后两者均 false。
- [ ] useSearch 单测：快照 0 条 + 后续 `update` 带结果 → `awaitingFirstResults` 在 update 后变 false。
- [ ] useSearch 单测：新查询开始时 `awaitingFirstResults` 重新变 true（上一查询的结果留在屏幕上也不算）。
- [ ] CoreBox.vue 中光晕 `active` 与状态文案绑定到新的延迟标志；弱提示元素在 `settling` 时渲染。
- [ ] `pnpm -C apps/core-app run typecheck:web` 通过；`vitest run useSearch` 相关测试通过；`git diff --check` 干净。
- [ ] 真实 dev 应用：输入应用名，应用上屏后光晕不再持续亮；文件仍在搜时可见弱提示。

## Notes

- 不动主进程；主进程的 `complete` 时序由其他子任务改善。
- 执行归属：`CoreBox.vue` / `useSearch.ts` 由会话 talex-touch-40 拥有（任务 09-25-corebox-search-pulse-beam 等），该会话已接受按本任务 design.md 在其区域内实现并回 ping；本会话负责规格与最终验证。
