# ① 移除 layout 切换特性 + 固定 shell 骨架

父任务：`.trellis/tasks/08-03-app-shell-ai-redesign`
设计基准：父任务 `design.md` 第 1、2、3 节；画板 `iqbKR` / `JVvAr` 的 Sidebar 与 Main。

## 背景

`views/layout/` 下有 8 套可切换 layout，由 `useDynamicTuffLayout` 按 `appSettingsData.layout` 动态加载，配套布局原子编辑器、预设导入导出、远程预设，合计约 5k 行。这套可配置性使壳层无法收敛到设计稿的单一形态。

## 目标

删除整套 layout 切换特性，落地唯一固定 shell：260px 侧栏 + 无全局 header 的主区。本子任务不改设置页内容、不做对话功能 —— 现有路由在新 shell 里照常可达即可。

## 范围

### 删除

按父任务 design.md 2.3 节的移除清单执行。删除前对每个文件 grep 引用，确认无外部依赖。

### 保留（不得误删）

`modules/layout/useWallpaper.ts`、`wallpaper-state.ts`（含两个测试文件）、`useSecondaryNavigation.ts`、`components/layout/LayoutBackButton.vue`、`modules/storage/theme-style.ts`。主题、壁纸、窗口效果三项能力在本子任务后必须仍然可用。

### 新增

- `--shell-*` token 层（父 design.md 1.2）
- `AppShell.vue` + `ShellSidebar` / `ShellTopBar` / `ShellMain` / `ShellNavItem` / `ShellNavGroup` / `ShellSearchEntry` / `ShellTrafficLights`
- 侧栏导航按设计稿：新建对话 / 智能 / 市场 + 底部设置
- 主进程 `trafficLightPosition` 调整为 `{x: 20, y: 18}`

### 不在本子任务范围

- 设置页分类拆分与内容重写（子任务 ②③）
- 对话历史列表与 composer（子任务 ④）—— 侧栏对话区本轮留空位，`/` 暂仍 redirect 到 `/setting`
- 移出侧栏的入口（应用 / 下载 / 风格）改挂到设置分类下 —— 属子任务 ②

## 验收标准

- [ ] `views/layout/` 下不再有 8 套 layout 与 `LayoutShell` / `LayoutAtomProvider` / `FloatingNav` / `LayoutFooter`
- [ ] `modules/layout/` 下不再有 `layouts-definition.ts` / `useDynamicTuffLayout.ts` / `atoms/` / `preset/`
- [ ] `components/layout/` 下不再有 `DynamicLayout` / `LayoutPreview*` / `LayoutSkeleton`
- [ ] 风格设置页不再有布局选择区、布局原子编辑器、远程预设入口
- [ ] CoreBox 画布编辑器（`coreBoxCanvasConfig`）仍可到达 —— 它原本挂在被删的 `LayoutSection` 下，属 CoreBox 而非壳层布局，须保留并另置入口
- [ ] `appSettingsData.layout` 的**读写点**已清零。schema 字段本身保留：`apps/nexus` 的 presetStore 仍读其同族字段，且 `@talex-touch/utils` 是已发布包，删字段对外部插件是破坏性变更
- [ ] 主题切换、壁纸、窗口效果（refraction / filter / pure）三项能力实测仍可用
- [ ] 侧栏实测对齐画板：宽 260、`$surface` 底、右侧 1px 描边、padding 14、gap 10；导航项 padding [7,10]、gap 10、icon 16、label 13；选中态 `$primary-soft` + `$primary`
- [ ] TopBar 高 52、padding [0,32]
- [ ] macOS 红绿灯落在侧栏左上且不被遮挡；Windows 下不渲染红绿灯占位，窗口控制可用
- [ ] 现有路由（store / intelligence / plugin / application / downloads / details / setting / styles）在新 shell 下均可正常打开
- [ ] light / dark 两个主题下均无对比度不足或布局溢出
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过
