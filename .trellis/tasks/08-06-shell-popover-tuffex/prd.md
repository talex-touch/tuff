# 首页 shell 弹层迁移 TuffEx 原语

## Goal

v2 shell 里两个手搓弹层(模型菜单、composer 权限弹层)迁移到 TuffEx 原语(TxDropdownMenu / TxPopover / TxBaseAnchor),消灭手写的定位/外点/Escape/焦点巡航;TuffEx 键盘导航缺口按硬规则回填;v2 shell 其余面盘点结论落档(已完成,见 research/)。

## Requirements

1. **模型菜单迁移**:`HomeModelMenu` 改为 TxDropdownMenu 承载——`#trigger` 槽接收调用方 pill(顶栏/ composer 双调用位),内容为「自动选择」行 + 按提供方分组的模型行(`menuitemradio` + aria-checked);行为等价:选中即关、选中项打勾、loading/空态文案、composer 位向上弹(`top-start`)。
2. **权限弹层迁移**:从 `HomePage.vue` 抽出 `HomePermissionMenu.vue` 组件,TxDropdownMenu 承载;三档 `menuitemradio` + hint、完全允许行 danger 标记、「重置已记住的授权」footer(仅自动审阅档)、完全允许二步确认(面板内容切换,焦点落取消键)。`v-model:mode` 对外,重置成功/失败提示留在调用方或组件内(与现 toast 行为一致)。
3. **TuffEx 回填**:dropdown-menu 键盘巡航选择器从 `[role="menuitem"]` 扩为 menuitem/menuitemradio/menuitemcheckbox(保留 closest-menu 校验),`__tests__` 补 menuitemradio 巡航用例。其余缺口(关闭焦点还原等)只记录不扩 scope。
4. **手搓清零**:迁移后 `views/base/home/` 无弹层用途的 `document.addEventListener` 与 `[data-*-pill]` closest 技巧;`.HomePage-PermissionMenu`/`.HomeModelMenu` 的手写定位样式删除。
5. **a11y 不倒退**:键盘全程可达(方向键/Home/End/Escape)、aria-checked/expanded 语义完整;接受「打开聚焦首项」与现「聚焦选中项」的模式差异;关闭后焦点还原 trigger——原语没有则组件层补。
6. **视觉**:面板走 TxPopover 变体(实现时目验与 --shell 视觉的贴近度,必要时 panel 参数/局部覆盖对齐);行内样式仍贴 --shell-* 语言,文案全留 CoreApp(tuffex 无 i18n)。

## Constraints

- tuffex 源码改动必须跑三方校验:tuffex 自身(build + vue-tsc + 组件测试)、nexus typecheck、core-app 双 typecheck(项目记忆:tuffex 自身 vue-tsc 弱于两个下游)。
- 权限档位/模型选择的业务语义零变化(本任务纯 UI 承载迁移);不迁 box 视图与设置页。
- 不引入新依赖;不动 TxDropdownItem 之外的 tuffex 组件行为。

## Acceptance Criteria

- [ ] 模型菜单:双调用位打开/选中/关闭/分组/勾选/空态与迁移前一致,composer 位向上弹。
- [ ] 权限弹层:三档切换、完全允许二步确认(取消不改档)、full 警示态 pill、重置入口(仅 review)全部保持;确认步焦点落取消键。
- [ ] 键盘:两弹层方向键/Home/End 巡航、Enter/Space 选中、Escape 关闭且档位不变。
- [ ] `views/base/home/` 无弹层手搓监听残留(rg 断言)。
- [ ] tuffex dropdown-menu 新增巡航测试绿;tuffex build + 三方 typecheck 绿;core-app conversation vitest 绿;lint delta 干净。
- [ ] 目验:面板视觉与 shell 语言协调(记录截图结论于任务内)。

## Notes

- 盘点结论:v2 shell 手搓弹层就这两处;TopBar/SidePanel 干净;工具确认卡已用 tuffex(research/tuffex-primitive-fit.md)。
- 记录不做:TxSelect(无 trigger 槽)、关闭焦点还原进原语、打开聚焦选中项。
