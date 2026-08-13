# 技术设计 · ① 移除 layout 切换特性 + 固定 shell 骨架

父任务设计：`.trellis/tasks/08-03-app-shell-ai-redesign/design.md`（token 表、侧栏实测规格、平台差异见父文档 1、2 节，此处不复述）。

## 1. 依赖图（已实测核实）

删除面是收敛的，没有跨模块的隐藏引用：

| 待删对象 | 唯一消费者 | 结论 |
|---|---|---|
| `views/layout/AppLayout.vue` | `App.vue:11,45,77` | 一处替换 |
| `components/layout/DynamicLayout.vue` | `AppLayout.vue:150`、`LayoutPreviewFrame.vue` | 随 AppLayout 一并删 |
| `styles/layout/{_layout-shell,_navbar-base,_controller-mixins,_container-base}.scss` | 只被 8 套 layout 与 `LayoutShell.vue` 引用 | 4 个文件全删 |
| `modules/layout/{layouts-definition,useDynamicTuffLayout}` | `DynamicLayout.vue`、`LayoutSection.vue` | 两处随删 |
| `modules/layout/atoms/`、`preset/` | `LayoutShell.vue`、`LayoutAtomProvider.vue`、`LayoutSection.vue`、`CustomLayout.vue`、`RemotePresetOverlay.vue` | 全在删除集内 |
| `views/base/styles/LayoutSection.vue` | `ThemeStyle.vue:39,499` | 摘掉这两行 |
| `appSettingsData.layout` | **仅** `useDynamicTuffLayout.ts` 的 `getCurrentLayoutName` / `setCurrentLayoutName` | 随文件一起消失，无残留读写点 |

`components/layout/LayoutBackButton.vue` 目前只被 `AppLayout.vue:167` 使用。**保留并由 `AppShell` 继续渲染**（配合保留的 `useSecondaryNavigation`），使二级返回行为在本子任务内零变化；是否被设置页的「返回 Tuff」取代由子任务 ② 决定。

## 2. `App.vue` 的插槽消失

`AppLayout` 接受 `#title` / `#navbar` / `#plugins` 三个插槽，`App.vue` 往里塞了 `TouchMenu` 导航（setting / intelligence / store / details / styles）和 `PluginNavTree`。

新 `AppShell` **自持导航**，不再暴露 `#navbar`。处置：

| 原插槽内容 | 去向 |
|---|---|
| `TouchMenu` 里的 setting / intelligence / store | 变成 `ShellSidebar` 内置导航项（智能 / 市场 + 底部设置） |
| `/details`、`/styles` 两项 | 移出侧栏。路由仍可达，入口在子任务 ② 挂到设置分类下 |
| `#title` 的 `app.title` | 无全局 header，取消 |
| `PluginNavTree`（457 行） | **本子任务不删、不改**，从侧栏摘下暂不挂载；由子任务 ② 挂到「设置 › 插件与工具」。摘下时在 `App.vue` 留一行注释标明去向，避免被后续当成死代码清掉 |

`App.vue` 最终只剩 `<AppShell />`，`TouchMenu` / `TouchMenuItem` 的 import 若无其他消费者则一并移除（需 grep 确认）。

## 3. 路由过渡样式的迁移

`AppLayout.vue` 的 `<style>` 是非 scoped 全局块，其中三组是 shell 必需的，删除时要迁到 `AppShell.vue`：

- `.route-{slide,fade,zoom}-{enter,leave}-{active,from,to}` —— 路由过渡，由 `themeStyle.theme.transition.route` 驱动
- `.AppWallpaper` —— 壁纸层（**保留能力**）
- `--layout-window-header-opacity` / `--layout-window-aside-opacity` 与 `window-{pure,refraction,filter}` 类 —— 窗口效果（**保留能力**）

其余（`.AppLayout-Aside` / `-Main` / `-Header` / `-Controller` / `-View` / `-Container`）随 8 套 layout 一起删。

`AppShell` 保留 `AppLayout` 的这三件行为：路由过渡 + keep-alive（`isKeepAliveRoute` / `resolveRouteCacheKey`）、`reportPerfToMain` 的路由耗时上报、挂载时 `triggerThemeTransition`。这些是既有能力，不在本轮重新设计。

## 4. `AppShell` 结构

```vue
<div class="AppShell fake-background" :class="窗口效果类" :style="窗口不透明度变量">
  <div v-if="wallpaperActive" class="AppWallpaper" :style="wallpaperStyle" />
  <ShellSidebar />
  <ShellMain>
    <ShellTopBar />
    <router-view v-slot="{ Component, route }"> … 过渡 + keep-alive … </router-view>
  </ShellMain>
</div>
```

侧栏在本子任务只做首页上下文的形态：红绿灯占位 → Brand → SearchEntry → Nav（新建对话 / 智能 / 市场）→ **对话区留空**（子任务 ④ 填）→ 底部设置项。「新建对话」本轮指向 `/home` 尚不存在，暂指向 `/setting`，并在代码里以 TODO 标注等待子任务 ④。

`--shell-*` 变量定义在 `.AppShell` 上，值优先引用 `--tx-*`，缺失项按父设计 1.1 表给字面值。

## 5. 删除顺序

先摘引用再删文件，保证每一步 typecheck 都能过：

1. `ThemeStyle.vue` 摘掉 `LayoutSection`（风格页先失去布局区，其余功能不受影响）
2. `App.vue` 换成 `AppShell`（此时 `AppShell` 已实现），插槽内容按 §2 处置
3. 删 `views/layout/` 的 8 套 + `shared/` 4 个 + `AppLayout.vue`
4. 删 `components/layout/` 的 4 个（保留 `LayoutBackButton`）
5. 删 `modules/layout/{layouts-definition,useDynamicTuffLayout,atoms/,preset/}`，收窄 `modules/layout/index.ts`
6. 删 `views/base/styles/{LayoutSection,LayoutAtomEditor}.vue`、`editors/RemotePresetOverlay.vue`
7. 删 `styles/layout/` 四个 scss
8. 主进程 `config/default.ts` 调 `trafficLightPosition`

§5 的 2 与 3–7 分成两个提交：先落 `AppShell` 让应用可跑，再做删除，便于二分。

## 6. 保留能力的验证方式

删完后逐项实测，不靠「没报错」推断：

- 主题：设置里切亮/暗/跟随系统，观察 `triggerThemeTransition` 动画与最终配色
- 壁纸：设置壁纸后 `.AppWallpaper` 可见，`useWallpaper` 的两个测试文件仍通过
- 窗口效果：refraction / filter / pure 三档切换，观察侧栏与内容区的模糊与不透明度差异
