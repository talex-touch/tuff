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

- [x] C0 **计划外**：`LayoutSection` 是 CoreBox 画布编辑器的唯一入口，删它会让一个在用的 CoreBox 功能变成不可达。新建 `views/base/styles/CoreBoxCanvasSection.vue` 承接该入口，`ThemeStyle.vue` 改挂它。详见下方「边界修正」
- [x] C1 `ThemeStyle.vue` 摘 `LayoutSection`，换成 `CoreBoxCanvasSection`
- [x] C2 删 `views/layout/{simple,flat,compact,minimal,classic,card,dock,custom}/`
- [x] C3 删 `views/layout/shared/`（`LayoutShell` / `LayoutAtomProvider` / `FloatingNav` / `LayoutFooter`）
- [x] C4 删 `views/layout/AppLayout.vue`
- [x] C5 删 `components/layout/{DynamicLayout,LayoutPreviewContent,LayoutPreviewFrame,LayoutSkeleton}.vue`（**保留 `LayoutBackButton.vue`**）
- [x] C6 删 `modules/layout/{layouts-definition.ts,useDynamicTuffLayout.ts,atoms/,preset/}`，收窄 `modules/layout/index.ts`
- [x] C7 删 `views/base/styles/{LayoutSection,LayoutAtomEditor}.vue` 与 `editors/{MainLayoutEditorOverlay,RemotePresetOverlay}.vue`（**保留 `CoreBoxEditorOverlay.vue` / `CanvasGridEditor.vue` / `canvas-types.ts`**）
- [x] C8 删 `styles/layout/` 四个 scss
- [x] C9 core-app 内 grep 残留：`useDynamicTuffLayout` / `layouts-definition` / `LayoutAtom` / `usePresetExport` / `useRemotePresets` / `styles/layout` / `layoutCanvasConfig` 均 **0 命中** —— **提交点 2**

#### 边界修正（与 design.md §5 原计划的差异）

1. **`CoreBoxEditorOverlay` 保留。** 它编辑 `appSetting.coreBoxCanvasConfig`（区域 `logo/input/tags/actions/results/addon/footer`），是 **CoreBox 搜索窗**的画布定制，与 app 壳层布局无关，不在「移除 layout 切换」的授权范围内。同层的 `MainLayoutEditorOverlay` 编辑 `layoutCanvasConfig`（区域 `header/aside/view`）才是壳层布局，已删。二者共用的 `CanvasGridEditor` 随 CoreBox 侧保留。
2. **`packages/utils` 的设置 schema 字段不删。** `layout` / `layoutAtomConfig` / `layoutCanvasConfig` / `presetState` 在 core-app 内已 0 引用，但：
   - `apps/nexus/server/utils/presetStore.ts` 仍读 `layoutAtomConfig` / `layoutCanvasConfig` / `coreBoxThemeConfig` —— Nexus 是另一个 app，不在本任务范围；
   - `@talex-touch/utils` 是已发布 npm 包（v1.0.23），外部插件开发者依赖其类型，删字段是破坏性变更。

   因此 PRD 里「`appSettingsData.layout` 字段已清理」**只做到读写点清零**，schema 字段保留为惰性配置。是否连带清理需要单独决定（涉及 Nexus + published API）。

### D. 主进程

- [x] D1 `src/main/config/default.ts`：`MainWindowOption` **新增** `trafficLightPosition: {x: 20, y: 18}`（原本没有该字段，带它的是 `DivisionBoxWindowOption`）；默认高度 680 → 820
- [ ] D2 macOS 实机确认红绿灯落在侧栏左上且不压住 Brand

### E. 验证

- [x] E0 `typecheck` 0 error、core-app 全量 `eslint --max-warnings=0` 通过、`build:vite` 通过
- [x] E0b `vitest` 跑 `modules/layout` + `views/base/styles`：8 文件 32 测试全过，含 `useWallpaper.test.ts`(7) 与 `wallpaper-state.test.ts`(8)
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
