# PRD: Tuff 2.5.2 现代浏览器工作区（Modern Browser Workspace）

> 更新时间：2026-11-27
> 状态：Beta / **Default ON**（自 `73e6a1b8c` 起默认开启；Phase 1 与 Phase 2 主体已入 `origin/master`，前进/后退快捷键已在 Wave 2 分支验证待合入；余网页选区 AI 联动、Phase 3 与实机验收开放）
> 目标版本：2.5.2  
> 关联调研报告：`../../engineering/reports/electron-browser-feasibility-survey-2026-10-17.md`  
> 关联执行清单：`../TODO.md`  

---

## 1. 最终目标

2.5.2 将 **现代浏览器工作区 (Modern Browser Workspace)** 作为 Tuff 的实验性生产力能力：
用户在不离开 Tuff 的前提下，拥有一个界面极致优雅（Arc/Zen 风格垂直标签栏、沉浸式无边框视口、与 ⌘K CoreBox 深度结合）的内嵌浏览工作台。

### 核心选型与原则（路线 1）
* **坚持走 `WebContentsView` + Vue 3 自研现代外壳**：彻底抛弃 Chrome 传统的顶栏和标签页设计，使用 TuffEx 和 UnoCSS 构建高颜值界面。
* **规避全量 Chrome Web Store 扩展与 DRM 授权包袱**：
  * 不把支持海量 Chrome 商店插件作为目标；
  * 高频诉求（广告拦截、深色模式、脚本增强、翻译）由 `@talex-touch/tuff-native`（Rust adblock 核心）与主进程/preload 原生提供。
* **Beta 门禁与可关闭零回归原则**：
  * **默认开启（自 `73e6a1b8c` 生效）**：`packages/utils/common/storage/entity/app-settings.ts:253` 已将 `betaFeatures.browserWorkspace` 设为 `true`，`apps/core-app/src/main/modules/storage/index.ts` 通过一次性 `browser-workspace-default-on` 迁移自动为存量默认关闭配置切至开启（历史 `v2.4.15-beta.9` 发布说明 `notes/update_2.4.15-beta.9.{zh,en}.md` 仍沿用“默认关闭”旧措辞，已登记为勘误待下一期发布说明校正）；
  * **用户手动关闭状态**：侧边栏完全不显示浏览器入口，路由拦截重定向回主页，应用展示与交互保持原有传统启动器与项目面板形态；
  * **开启状态（默认）**：顶栏/侧边栏提供浏览器导航与按 Space 隔离的多标签页管理、无边框网页视口、历史记录与书签。

---

## 2. Beta 门禁与配置定义

### 2.1 存储与配置实体 (`AppSetting`)
在 `packages/utils/common/storage/entity/app-settings.ts` 中维护统一的 `betaFeatures` 状态：
```ts
export interface AppSetting {
  // ...
  betaFeatures: {
    screenshot: boolean
    voiceDictation: boolean
    voiceQuickEdit: boolean
    omniPanel: boolean
    browserWorkspace: boolean // 现代浏览器工作区开关，自 73e6a1b8c 起默认 true（支持手动关闭）
  }
}
```

### 2.2 用户设置界面 (`SettingGeneralPage` / 实验室特性)
* 位置：在「设置 -> 通用配置」页面提供「实验特性 (Beta)」区块。
* 组件：`SettingBetaFeatures.vue`。
* 开关文案：
  * **标题**：现代浏览器工作区（带 `Beta` 徽章）
  * **描述**：开启基于 WebContentsView 的现代化独立浏览器工作区，支持垂直标签页与无边框视口。关闭时保持传统启动器外观。
* 响应：切换后实时保存至 `appSetting.betaFeatures.browserWorkspace`，侧边栏导航响应式更新。

### 2.3 侧边栏与路由门禁
* **侧边栏 (`ShellSidebar.vue`)**：
  ```vue
  <ShellNavItem
    v-if="isBrowserWorkspaceEnabled"
    icon="i-ri-global-line"
    :label="t('shell.browser')"
    to="/browser"
  />
  ```
  未启用时，DOM 中不渲染该项，不留空位，不影响其他导航项。
* **路由守卫 (`router.ts`)**：
  在全局 `beforeEach` 中对携带 `meta.betaFeature: 'browserWorkspace'` 的路由进行拦截；未启用时直接重定向回 `/home`，防止通过深层链接误入。

---

## 3. 功能架构与分期演进

```
┌────────────────────────────────────────────────────────┐
│  Tuff 主窗口 (Vue 3 + TuffEx + UnoCSS)                 │
│ ┌───────────────┬────────────────────────────────────┐ │
│ │ 垂直侧边栏     │ 现代浏览器视口 (WebContentsView)    │ │
│ │ • 标签页列表   │ • 独立 Session 隔离                 │ │
│ │ • 新增/关闭   │ • Rust 原生 Adblock 拦截 (规划)     │ │
│ │ • 历史/书签   │ • 智能页面缩放与暗黑适配             │ │
│ │ • ⌘K 唤醒     │                                    │ │
│ └───────────────┴────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 阶段规划与当前落地状态（2026-11-27）
* **Phase 1（已入 `origin/master`）**：
  * 主进程 `browserModule`、`BrowserWorkspaceManager` 与 `SideBrowserManager` 管理 `WebContentsView` 视口布局、独立 `persist:tuff-browser` 默认拒绝会话与生命周期。
  * 渲染层 `BrowserPage.vue` 与顶栏 `BrowserTabStrip` 实现标签切换、按 Space 隔离工作区标签（PR `#2312`）、Home/Herdr 舞台操作整合（PR `#2317`）、历史与书签抽屉及 Chrome Cookie 同步。
  * Beta 门禁开关已于 `73e6a1b8c` 切换为默认开启，关闭时仍保持传统外观与路由拦截。
* **Phase 2（2.5.2 核心打磨 — 主体已入 `origin/master`，部分待合入/开放）**：
  * **已入 `origin/master`**：标签页 LRU 挂起（`176fdc51e`：`maxWarmGuests=6`、`idleDiscardMs=10m`、`discardTab()`）与基础键盘快捷键（`⌘/Ctrl+L`、`⌘/Ctrl+T`、`⌘/Ctrl+W`、`⌘/Ctrl+R`）。
  * **Wave 2 分支已本地验证待合入（`task/feat/nexus-admin-tail-and-252 @ 41b6be34e`）**：前进/后退快捷键补齐（`Alt+ArrowLeft/Right` 与 macOS `⌘+[/]`，覆盖 `BrowserPage.vue` 远端/本地预览历史与 `BrowserWorkspaceManager` guest `before-input-event`）。
  * **仍开放**：网页选区 → CoreBox AI 解释/翻译右键菜单钩子（当前 0 代码），以及真实打包 Electron 端到端交互验收。
* **Phase 3（增强能力 — 仍开放，0 代码）**：
  * `@talex-touch/tuff-native` 接入 Brave 开源的 `adblock-rust`，主进程网络钩子实现秒级去广告。
  * 智能暗色模式注入。

---

## 4. 质量与验收标准

1. **关闭态零回归验收**：
   * 当用户手动关闭 `betaFeatures.browserWorkspace` 时，侧边栏、快捷键、主页搜索保持传统外观，无 `/browser` 入口暴露；
   * 单元测试覆盖：`SettingBetaFeatures` 开关渲染与状态更新、`ShellSidebar` 依据开关展示/隐藏导航项、`router` 拦截未授权访问。
2. **生命周期受控**：
   * 浏览器视口大小与坐标必须随窗口缩放（Resize）精确同步，不发生画面遮挡或错位；
   * 关闭标签页时，底层的 `WebContentsView` 与 `webContents` 必须彻底销毁，内存即时释放。
