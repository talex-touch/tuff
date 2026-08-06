# 研究:v2 shell 弹层 × TuffEx 原语贴合度(2026-08-06)

## 盘点结论(v2 shell 手搓弹层清单)

`rg addEventListener('pointerdown'|'keydown')|role="listbox"|role="radiogroup"` 扫 `views/base/home/`:

- `HomeModelMenu.vue` — 手搓:绝对定位、document 捕获态外点、Escape 监听、`[data-model-pill]` closest 技巧;listbox/option 语义。**迁移对象 1**。
- `HomePage.vue` 权限弹层 — 手搓:同上一套 + radiogroup roving tabindex + 二步确认焦点管理、`[data-permission-pill]`。**迁移对象 2**。
- `HomeTopBar.vue` / `HomeSidePanel.vue` — 干净,无手搓弹层。
- 会话内工具确认卡已是 TuffEx 组合(`tool-confirmation`)。

## TxDropdownMenu 能力面(components/src/dropdown-menu/)

- `#trigger` 槽 + 默认内容槽;`v-model` 开合;placement 含 `top-start`(composer 向上弹);底座 `TxPopover` → `TxBaseAnchor`。
- 键盘:ArrowUp/Down/Home/End 巡航 `[role="menuitem"]`(TxDropdownMenu.vue:59 硬编码选择器),打开自动聚焦首项。
- `provide('txDropdownMenu', { close, closeOnSelect })`;TxDropdownItem 有 `disabled/danger/arrow` + `#right` 槽。
- base-anchor 已内建:Escape 关闭(TxBaseAnchor.vue:778)、捕获态 pointerdown 外点关闭(:865,`close-on-click-outside`)——替代我们两处 document 监听。
- 面板变体:`panelVariant/Background/Shadow/Radius/Padding`(默认 refraction 背景,与 --shell 视觉的贴近度实现时目验)。

## 缺口

1. **键盘导航不认 `menuitemradio`**:选择器硬编码 `[role="menuitem"]`;权限三档、模型选中行的正确 ARIA menu 语义是 `menuitemradio`(aria-checked)。→ 回填 TuffEx:选择器扩为 `menuitem|menuitemradio|menuitemcheckbox`(保留 closest-menu 校验),补 __tests__。
2. **焦点开启落首项而非选中项**:现手搓版聚焦 checked 项。两者都是合法模式,接受差异(菜单模式普遍聚焦首项),不改原语。
3. **关闭后焦点还原 trigger**:base-anchor 未见显式实现,实现时验证;缺则在 CoreApp 层 close 回调里补(不动原语,先记录)。

## TxSelect 不选用的原因

原生分组很好(`group` 槽),但无 `#trigger` 槽(触发器即 select 控件本体),套不进现有 pill;模型菜单的「自动选择」特殊行 + 双调用位(顶栏/composer)用 TxDropdownMenu + 自组内容更贴。

## 构建/校验注意(来自项目记忆)

- core-app 依赖 `@talex-touch/tuffex: workspace:^`;tuffex 源码改动后按解析形态可能需 `packages/tuffex` build(audit:size 亦读 dist)。
- tuffex 自身 vue-tsc 弱于两个下游:改 tuffex 源后必须跑 nexus + core-app 双 typecheck。
- tuffex 无 i18n 体系:本任务行文案全部留在 CoreApp 层,不往 tuffex 塞文案。
