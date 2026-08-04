# 执行计划 · ① 移除 layout 切换特性 + 固定 shell 骨架

## 检查清单

### A. token 层

- [x] A1 `styles/shell-tokens.scss`：`--shell-*` 按父 design.md 1.1 表落地为字面值（**不别名 `--tx-*`**，色板差异是实质性的），在 `main.ts` 于 tuffex base.css 之后引入
- [x] A2 light / dark 两套值定义完整；另补 `html.contrast` / `html.dark.contrast` 两块重定向到 tuffex 高对比色板，避免无障碍回归

### B. AppShell 落地（删除前先能跑）

- [x] B1 `AppShell.vue`：窗口效果类 + 壁纸层 + 侧栏 + 主区 + `router-view`（过渡、keep-alive、耗时上报、`triggerThemeTransition` 从 `AppLayout` 平移）
- [x] B2 `ShellSidebar.vue`：宽 260、`$surface`、右 1px 内描边、padding 14、gap 10
- [x] B3 `ShellTrafficLights.vue`：macOS 渲染 64×20 占位并 `-webkit-app-region: drag`；Win/Linux 整块不渲染
- [x] B4 `ShellNavItem.vue` / `ShellNavGroup.vue`：padding [7,10]、gap 10、radius-md、icon 16、label 13；选中态 `$primary-soft` + `$primary` + `fontWeight 500`。组标签 `fs-caption` + `letterSpacing 0.4` + padding [8,10,4,10]
- [x] B5 `ShellSearchEntry.vue`：高 32、`$bg` + 1px `$border`、radius-md、padding [0,10]、右侧 kbd（macOS `⌘E` / 其他 `Ctrl+E`），点击发 `CoreBoxEvents.ui.show`
- [x] B6 `ShellTopBar.vue`：高 52、padding [0,32]；leading 承载 `LayoutBackButton`，actions 为插槽
- [x] B7 主区并入 `AppShell.vue` 的 `.AppShell-Main`（`$bg`、vertical、fill），未单拆组件
- [x] B8 侧栏导航接线：智能 → `/intelligence`、市场 → `/store`、底部设置 → `/setting`；「新建对话」暂指 `/setting` 并标 TODO（等子任务 ④）
- [x] B9 `App.vue` 换用 `AppShell`，按 design.md §2 处置三个插槽；`PluginNavTree` 摘下并留去向注释
- [x] B9b i18n：新增 `shell.*` 键（zh-CN / en-US），移除仅被旧 `TouchMenu` 使用的 `flatNavBar.*`
- [ ] B10 跑一次应用，确认所有现有路由可达 —— **提交点 1**
  - 已过：`typecheck`（0 error）、core-app 内 `eslint --max-warnings=0`、`build:vite`；产物 CSS 含 4 组 `--shell-*`（light / dark / contrast / dark-contrast）
  - 待办：实机目视

### C. 删除（design.md §5 顺序）

- [ ] C1 `ThemeStyle.vue` 摘 `LayoutSection`
- [ ] C2 删 `views/layout/{simple,flat,compact,minimal,classic,card,dock,custom}/`
- [ ] C3 删 `views/layout/shared/{LayoutShell,LayoutAtomProvider,FloatingNav,LayoutFooter}.vue`
- [ ] C4 删 `views/layout/AppLayout.vue`
- [ ] C5 删 `components/layout/{DynamicLayout,LayoutPreviewContent,LayoutPreviewFrame,LayoutSkeleton}.vue`（**保留 `LayoutBackButton.vue`**）
- [ ] C6 删 `modules/layout/{layouts-definition.ts,useDynamicTuffLayout.ts,atoms/,preset/}`，收窄 `modules/layout/index.ts` 只导出 `useWallpaper` / `wallpaper-state` / `useSecondaryNavigation`
- [ ] C7 删 `views/base/styles/{LayoutSection,LayoutAtomEditor}.vue` 与 `editors/RemotePresetOverlay.vue`
- [ ] C8 删 `styles/layout/` 四个 scss
- [ ] C9 全仓 grep 残留：`useDynamicTuffLayout` / `layouts-definition` / `LayoutAtom` / `usePresetExport` / `useRemotePresets` / `appSettingsData.layout` / `styles/layout` 均应为 0 命中 —— **提交点 2**

### D. 主进程

- [ ] D1 `src/main/config/default.ts` 的 `trafficLightPosition` 改为 `{x: 20, y: 18}`
- [ ] D2 macOS 实机确认红绿灯落在侧栏左上且不压住 Brand

### E. 验证

- [ ] E1 保留能力实测三项（design.md §6）：主题切换、壁纸、窗口效果 refraction/filter/pure
- [ ] E2 light / dark 双主题走查侧栏与 TopBar，无对比度不足、无溢出
- [ ] E3 侧栏规格与画板 `jlARh` 逐项比对（宽/底色/描边/padding/gap/导航项尺寸/选中态）
- [ ] E4 现有路由逐个打开：store、store/installed、intelligence 及其 6 个子页、plugin/:name、application、downloads、details、setting、styles、setting/storage
- [ ] E5 `pnpm lint`
- [ ] E6 `cd apps/core-app && npm run typecheck`

## 验证命令

```bash
pnpm lint
cd apps/core-app && npm run typecheck
```

残留检查：

```bash
cd apps/core-app/src && grep -rn "useDynamicTuffLayout\|layouts-definition\|LayoutAtom\|usePresetExport\|useRemotePresets\|styles/layout" --include="*.ts" --include="*.vue" --include="*.scss" .
```

## 回退点

- 提交点 1（`AppShell` 落地，尚未删除）：此时新旧并存，revert 即回到原状。
- 提交点 2（删除完成）：单独 revert 可恢复全部 layout 文件。

## 风险提示

- C6 收窄 `modules/layout/index.ts` 时容易连带删掉 `useWallpaper` 的导出 —— 收窄后立刻跑 `useWallpaper.test.ts` 与 `wallpaper-state.test.ts`。
- `AppLayout.vue` 的全局样式块含三组必须迁移的规则（design.md §3），删除前先确认已在 `AppShell` 中生效，否则路由过渡与壁纸会静默失效。
