# Implement — 首页 shell 弹层迁移 TuffEx 原语

## Checklist

1. [ ] **TuffEx 巡航选择器**:`packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue` 选择器扩为 menuitem/menuitemradio/menuitemcheckbox;`__tests__` 补巡航用例(radio 行参与、disabled 跳过)。
   - 验证:tuffex 内 vue-tsc + `vitest run dropdown-menu`;确认 core-app 对 tuffex 的解析形态,若走 dist 则 build。
2. [ ] **三方 typecheck 前哨**:nexus typecheck + core-app `npm run typecheck`(改 tuffex 源后的硬性双下游校验)。
3. [ ] **HomeModelMenu 重写**:TxDropdownMenu + #trigger 转发 + menuitemradio 行;HomePage / HomeTopBar 两调用位适配(删 openMenu 中模型菜单的开合管理与 `[data-model-pill]`);composer 位 `top-start`。
   - 验证:`npm run typecheck:web`;目验双调用位。
4. [ ] **HomePermissionMenu 抽出**:组件自带 pill(mode 派生 label/图标/警示态),三档 + hint + danger 行 + footer 重置(仅 review)+ 二步确认(焦点取消键,取消回列表);HomePage 删弹层内联代码与 document 监听、`[data-permission-pill]`;`agentToolsMode`/watch 留在 HomePage。
   - 验证:`npm run typecheck:web`;`npx vitest run src/renderer/src/modules/conversation/`
5. [ ] **手搓清零断言**:`rg "addEventListener\('pointerdown'|data-model-pill|data-permission-pill" apps/core-app/src/renderer/src/views/base/home/` 仅剩非弹层用途(预期:零残留)。
6. [ ] **回归**:core-app 双 typecheck、conversation vitest、lint delta;目验清单——两弹层开/关/键盘/Escape/外点/确认步/重置/警示态/z-index,截图结论记回任务。

## Review gates

- 步骤 1 后:tuffex 改动最小性复查(只动选择器一行 + 测试)。
- 步骤 4 后:trellis-check 一轮(a11y 等价性 + HomePage 瘦身无行为遗漏 + 视觉参数)。

## Rollback points

- commit 1:tuffex(选择器+测试);commit 2:HomeModelMenu + 调用位;commit 3:HomePermissionMenu + HomePage 瘦身。2/3 依赖 1。
