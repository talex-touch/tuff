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

顺序：先做 max-height 修复。重做后的面板高度依赖 `maxHeight` 真正生效，否则新面板同样会盖住 composer；
子任务 2 的验收建立在子任务 1 已合入的前提上。

## 跨子任务验收

- [ ] 在 HomePage composer（placement `top-end`）与 HomeTopBar（`bottom-start`）两个入口打开新弹窗，
      面板在任何滚动位置都不与触发 pill 重叠，且不超出窗口可视区。
- [ ] 两个入口是同一份选择状态（`useModelOptions` 模块级 state），任一处切换，另一处 pill 同步。
- [ ] `pnpm -C apps/core-app run typecheck`、相关 vitest、`pnpm -C packages/tuffex test`（base-anchor 相关）全绿；
      `git diff --check` 无告警。

## Out of scope

- 推理强度（effort）选择：pill 上的 "High" 目前是静态文案 `home.effortHigh`，不在本次范围。
- provider 的配置 / 新增（属于 Intelligence 设置页）。
- CoreBox 内的模型选择（不同入口，不复用此弹窗）。

## Integration review

两个子任务归档前，父任务做一次整合复查：跨子任务验收逐条勾选，记录到本文件。
