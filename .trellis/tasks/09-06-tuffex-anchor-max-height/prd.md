# 修复 TxBaseAnchor 的 max-height 被样式绑定抹掉

Parent: `.trellis/tasks/09-06-model-menu-redesign`

## Goal

让 `TxBaseAnchor`（及其包装 TxTooltip / TxPopover / TxDropdownMenu / TxSelectionActions）的 `maxHeight`
与视口裁剪真正生效：面板高度 = min(availableHeight, maxHeight)，不再回落到 CSS 默认 420px。

## 根因（已用单测 trace 确认）

- `packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue:1034` 根节点
  `:style="[floatingStyle, floatingStyles, { zIndex, '--tx-ba-max-height': isUnlimitedHeight ? 'none' : undefined }]"`。
- Vue 3.5 `runtime-dom` 的 `setStyle`：值为 `null/undefined` 时写 `''`，自定义属性走
  `style.setProperty(name, '')`，即删除该声明。
- `size` middleware（`TxBaseAnchor.vue:143-173`）通过 `elements.floating.style.setProperty('--tx-ba-max-height', …)`
  命令式写入。每次定位后 `floatingStyles` 变化触发重渲染，Vue 紧接着把刚写的值删掉。
- 结果：`.tx-base-anchor__card` / `__content` / `__liquid-panel` 的 `max-height: var(--tx-ba-max-height, 420px)`
  永远取 420px fallback；floating-ui 按裁剪后高度算出的 y 坐标与实际渲染高度不一致，面板底边向下溢出约
  (420 − 裁剪值) px，盖住触发元素。用户截图（2x）中面板约 420 CSS px，与此一致。
- 单测 trace（jsdom 无布局，middleware 写 0px）：`set("0px") ×12 … set("") set("")`，最终值 `""`；
  任意重渲染后再次 `set("")`。

## Requirements

- R1 删除根节点 `:style` 中的 `--tx-ba-max-height` 绑定。unlimited 情况由 middleware 已写的 `'none'`
  与 `.is-unlimited-height` 的 CSS（`TxBaseAnchor.vue:1385-1388`）覆盖，行为不变。
- R2 回归测试：打开面板并触发一次重渲染后，`.tx-base-anchor` 的 `--tx-ba-max-height` 非空且等于
  middleware 写入值；unlimited 时为 `none`。
- R3 按 `.trellis/spec/frontend/tuffex-docs-sync.md`：`base-anchor.{zh,en}.mdc` 的 Review Notes →
  实测覆盖 补一条本回归测试。`maxHeight` 语义文档（`base-anchor.en.mdc:336/418`）已描述正确行为，不改；
  包装组件（tooltip / popover / dropdown-menu / selection-actions）文档无行为描述变化，不改。

## Acceptance Criteria

- [ ] `pnpm -C packages/tuffex exec vitest run packages/components/src/base-anchor` 全绿，含新回归测试；
      把 R1 改动回退时新测试失败。
- [ ] 手动：HomePage composer 打开模型菜单，面板高度 ≤ 320px 且完全位于 pill 上方；列表滚到底不盖住 pill。
- [ ] `git diff --check` 无告警。

## Out of scope

- 面板动画 / liquid 路径的其他问题。
- HomeModelMenu 的视觉重做（子任务 `09-06-home-model-menu-v2`）。
