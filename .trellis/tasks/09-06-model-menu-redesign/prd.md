# 模型切换弹窗重做 + 锚定面板 max-height 修复

## Goal

Home 会话界面（HomePage 底部 composer 与 HomeTopBar）共用的模型切换弹窗，按参考图重做成
「provider 分栏 + 搜索 + 收藏 + ⌘数字快捷键」的选择器；同时修掉弹窗盖住输入框的根因
（TuffEx 锚定面板的 `maxHeight` 被 Vue 样式绑定抹掉）。

## 需求来源

- 用户参考图 1（第三方 IDE 的模型选择器）：顶部 tab 条（★ 收藏 + 每个 provider 一个图标）、
  搜索框、行 = 模型名 + "Provider · source" 副标题 + ⌘1…⌘5 徽标 + 星标、选中行高亮。
- 用户截图 2/3（当前实现）：`HomeModelMenu.vue` 的 Auto + 按 provider 分组的平铺列表；
  列表滚到底时面板盖住 composer 与 pill，箭头掉到建议 chips 下方。

## 任务地图

| 子任务 | 交付物 | 类型 |
|---|---|---|
| `09-06-tuffex-anchor-max-height` | TxBaseAnchor 不再抹掉 `--tx-ba-max-height`；回归测试；docs review notes | 轻量（PRD-only） |
| `09-06-home-model-menu-v2` | 新的 HomeModelMenu：tab / 搜索 / 收藏 / 快捷键 / 副标题；pill 显示名 + 图标 | 复杂（prd + design + implement） |
| `09-06-local-cli-model-providers` | pi / pie / omp / codex / claude 作为 text.chat provider；模型家族图标 | 复杂（prd + design + implement） |

顺序：先做 max-height 修复。重做后的面板高度依赖 `maxHeight` 真正生效，否则新面板同样会盖住 composer；
子任务 2 的验收建立在子任务 1 已合入的前提上。

## 跨子任务验收

- [x] 在 HomePage composer（placement `top-end`）与 HomeTopBar（`bottom-start`）两个入口打开新弹窗，
      面板在任何滚动位置都不与触发 pill 重叠，且不超出窗口可视区。（用户真机验收 2026-09-06，提交 1be2a206f / 8da334466 / 00a6de331）
- [x] 两个入口是同一份选择状态（`useModelOptions` 模块级 state），任一处切换，另一处 pill 同步。（`useModelOptions.test.ts` 跨实例共享用例）
- [x] `pnpm -C apps/core-app run typecheck`、相关 vitest、`pnpm -C packages/tuffex test`（base-anchor 相关）全绿；
      `git diff --check` 无告警。（check-menu 2026-09-06：core-app 271 + tuffex 53 测试；check-menu-fixups：308 测试）

## Out of scope

- 推理强度（effort）选择：pill 上的 "High" 目前是静态文案 `home.effortHigh`，不在本次范围。
- provider 的配置 / 新增（属于 Intelligence 设置页）。
- CoreBox 内的模型选择（不同入口，不复用此弹窗）。

## Integration review

两个子任务归档前，父任务做一次整合复查：跨子任务验收逐条勾选，记录到本文件。

## 实现期间标记的后续项（不在本任务范围）

- `TxDropdownSubmenu.onPanelKeydown` 与 `TxContextMenuPanel` 在可编辑目标内仍会劫持 Home / End；两者都不承载输入框，暂不改。
- `isEditableTarget`（TxDropdownMenu）与 `isTypingTarget`（TxSidebarNav）是两份私有副本；出现第三份时按 code-reuse guide 上提。
- 虚拟引用（TxContextMenu）的面板在打开状态切换 `unlimitedHeight` true → false 时，`--tx-ba-max-height` 保持 `none` 直到下一次定位（修复前是回落 420px）；子任务 1 检查时标记，未改。
- 本机 nexus dev server（:3200）的内容 watcher 已停止更新（contents.sqlite 不再刷新），需要 owner 重启 `pnpm -C apps/nexus dev:pure` 才能看到 dropdown-menu 文档的改动。
- `TxDropdownMenu.focusFirstItem()` 只等一个 `nextTick`，而 TxBaseAnchor 的 clip 在 `animateOpen` 前一直是 `visibility: hidden`，Chromium 会拒绝对隐藏子树 `focus()`；默认下拉「打开即聚焦首项」在真机上大概率不成立（jsdom 忽略 visibility 所以测试仍绿）。需要单独任务：改成等可见后再聚焦，并用真机验证。
