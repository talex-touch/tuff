# Tuff Forum — Tuffex + Nuxt 4 纯前端 mock 论坛

## Goal

在 `~/Workspace/Projects/tuff-forum` 新建独立项目，用 **Nuxt 4 + @talex-touch/tuffex@0.5.0** 搭出一个 Discourse 风格的论坛"架子"：纯前端 mock 数据、不写任何自定义样式。价值：用一个真实业务形态完整检验 Tuffex 作为 npm 组件库的组合能力（布局原语、列表、表单、覆盖层、Markdown、状态反馈）。

## Background（已确认事实，详见 research/tuffex-0.5.0-inventory.md）

- 用户确认：框架 **Nuxt**（"Next" 为口误；Tuffex 只有 Vue 3 实现）；项目位置 `~/Workspace/Projects/tuff-forum`（独立 git + pnpm，不进 talex-touch workspace）；范围 **扩展版**；UI 文案与 mock 内容 **中文**。
- `@talex-touch/tuffex@0.5.0` 已发布 npm，152 个组件子路径，类型齐全；`./vite` 按需样式插件未随包发布；组件内部依赖 `i-carbon-*`/`i-ri-*` 图标类（39 个静态类），宿主必须提供 UnoCSS `presetIcons` + carbon/ri 图标集。
- `base.css`/`style.css` 不重置 `body`、不给 `html/body` 设 `font-family`；深色模式靠 `html.dark`。
- `@talex-touch/utils@2.1.0`（Tuffex 运行时依赖）声明 `electron` peer；pnpm 不能开 auto-install-peers。
- 环境：Node 26.0.0、pnpm 11.24.0；npm 最新 nuxt 4.5.2（Vite 8）。

## Requirements

- **R1 项目骨架**：`~/Workspace/Projects/tuff-forum`，Nuxt 4 独立项目，依赖 npm `@talex-touch/tuffex@0.5.0`（精确版本）、UnoCSS（presetWind3 + presetIcons + carbon/ri）、`@pinia/nuxt`、`@nuxtjs/color-mode`、`@vueuse/nuxt`、dayjs。SPA 模式（`ssr: false`）。
- **R2 零自定义样式**（用户确认边界）：`app/` 内不得出现 `<style>` 块、内联 `style=` / `:style=` 绑定、自建 `.css/.scss/.sass/.less` 文件。允许：Tuffex `style.css`、`@unocss/reset` 等第三方成品样式表；`class` 中的 UnoCSS 工具类（含引用 Tuffex token 的 `bg-$tx-*` / `text-$tx-*`）。视觉与布局优先用 Tuffex 组件与 props/slots 表达，工具类只做布局微调。
- **R3 纯前端 mock**：数据来自项目内确定性种子（seeded PRNG，无运行时 `Math.random`）；写操作只改 Pinia 状态；状态持久化到 `localStorage`（版本化 key），提供"重置为示例数据"。无后端、无网络请求。
- **R4 论坛功能（扩展版，形态以 Discourse 为基准）**：用户明确要求参考 Discourse；页面结构、区块顺序、文案叫法对照 Discourse 现行 UI（design.md §5 逐页给出对照）。
  - R4.1 话题列表 `/`（Discourse `/latest`）：导航行 [最新 | 新 | 热门] + 类别 / 标签下拉 + 右端「新话题」；桌面为表格（话题 | 发帖者头像堆叠 | 回复 | 浏览 | 活动），窄屏为行列表；置顶 / 已关闭标识，置顶话题显示摘要；分页。
  - R4.2 类别 `/categories`（两栏：类别列表 + 最新话题）、`/c/[slug]`（类别横幅 + 列表）；标签 `/tags`（标签云）、`/tag/[slug]`。
  - R4.3 话题页 `/t/[id]`：帖子流（左头像 + 头行 / Markdown 正文 / 控制行：赞 · 链接 · 书签 · 回复 · 编辑 · 更多）、"回复 @user" 回链、右侧时间线、话题底部控制条（书签 / 分享 / 通知级别 mock / 回复）、**底部滑出的回复编辑器**（Discourse composer，`TxDrawer direction=bottom`）、引用回复、建议话题；作者 / staff 可编辑 / 删除帖子，staff 可置顶 / 关闭；已关闭话题禁止回复。
  - R4.4 发帖 `/new`：标题、分类、标签、Markdown 正文，表单校验，成功后跳转并 toast。
  - R4.5 用户页 `/u/[username]`：横幅（大头像 / 显示名 / @username / 简介 / 所在地 / 网站 / 关注 / 编辑资料）、统计条（话题 / 帖子 / 已收到的赞 / 已送出的赞 / 关注者 / 正在关注）、Tabs 摘要（热门回复 / 热门话题 / 最多点赞的用户）/ 活动（全部 / 话题 / 回复 / 赞 / 书签）/ 通知（本人）/ 偏好设置（本人）。
  - R4.6 偏好设置 `/u/[username]/preferences`（仅本人，左侧子导航：个人资料 / 头像 / 通知 / 界面）：显示名、简介、所在地、网站、头像预设、通知偏好（mock）、界面主题、保存 toast。
  - R4.7 用户目录 `/users`：可排序表格 + 搜索。
  - R4.8 通知 `/notifications`：未读 / 全部，标记已读，头部未读角标。
  - R4.9 书签 `/bookmarks`。
  - R4.10 搜索 `/search?q=`：话题 / 帖子 / 用户结果 Tabs；全局命令面板（⌘K / Ctrl+K）跳转页面、话题、用户。
  - R4.11 模拟登录：切换当前用户（预设用户列表）、退出登录（访客态隐藏写操作并给出引导）。
- **R5 全局壳（Discourse 壳）**：含侧栏「关于」指向的 `/about` 静态页（站点简介 + 用户 / 话题 / 帖子统计 + 管理团队）；顶栏（Logo、搜索、☰ 侧栏开关、深色切换、通知角标、头像用户菜单；「新话题」按钮放在话题列表导航行而非顶栏）、左侧 sidebar 分区（社区 / 类别（彩色圆点）/ 标签 / 我的）用 `TxSidebarNav` groups 复现、内容区；窄屏（<1024px）侧栏收进 `TxDrawer`。
- **R6 主题**：浅色 / 深色切换并持久化（`html.dark`）。
- **R7 状态反馈**：列表首屏骨架（`TxRowSkeleton` + `useDeferredLoading`）、空状态（`TxEmptyState`）、404 / 错误页（`error.vue`）、操作 toast。
- **R8 质量门**：`pnpm typecheck`、`pnpm lint`、`pnpm check:styles`（守卫脚本，含 self-test）、`pnpm test`（store 单测）、`pnpm build` 全绿。

## Acceptance Criteria

- [ ] **AC1**（R1）在 `~/Workspace/Projects/tuff-forum` 执行 `pnpm install && pnpm dev` 可启动；`pnpm build` 成功；`pnpm typecheck` 0 error。
- [ ] **AC2**（R2）`pnpm check:styles` 通过：`app/` 内无 `<style`、无 `style=`/`:style=`/`v-bind:style`、无自建样式文件；`pnpm check:styles --self-test` 能对含 `<style>` 的夹具报错退出。
- [ ] **AC3**（R4/R5）14 条路由（`/`, `/categories`, `/c/[slug]`, `/tags`, `/tag/[slug]`, `/t/[id]`, `/new`, `/u/[username]`, `/u/[username]/preferences`, `/users`, `/notifications`, `/bookmarks`, `/search`, `/about`）在浏览器中均可打开，无 Vue warn / console error；Tuffex 内部图标（如分页箭头、空状态图标、编辑器工具栏）与页面图标均可见（`i-carbon-*`/`i-ri-*` 元素有非空 mask/background）。
- [ ] **AC4**（R3/R4）核心交互链路：发帖 → 列表出现新话题；回复 → 详情出现新帖且回复数 +1；点赞 → 计数切换；书签 → `/bookmarks` 出现；关注 → 主页关注者 +1；编辑资料 → 主页更新；刷新页面后以上状态保留；"重置示例数据"后恢复种子。
- [ ] **AC5**（R6）切换深色后 `html` 带 `dark` 类，Tuffex 组件与 Markdown 渲染随之变色，刷新后保持。
- [ ] **AC6**（R4.11）退出登录后：发帖 / 回复 / 点赞入口隐藏或给出引导；切换用户后头部头像与"我的"页面随之变化。
- [ ] **AC7**（R7）话题列表首屏出现与列表同结构的骨架；空分类 / 空搜索显示 `TxEmptyState`；访问不存在的 `/t/xxx` 显示错误页。
- [ ] **AC8**（R8）`pnpm lint`、`pnpm test` 通过。

## Out of Scope

- 后端、真实鉴权、跨设备持久化。
- 私信、徽章、信任等级流转、管理后台、邮件、SSO 等 Discourse 高级功能。
- i18n 框架（文案直接中文；组件 a11y 文案通过 props 传中文）。
- 修改 talex-touch 仓库或 Tuffex 源码（发现组件缺陷只记录到 task notes，不在本任务内修）。
- SEO / SSR。

## Technical Notes（决策摘要，细节见 design.md）

- SPA（`ssr: false`）：纯 mock + localStorage，规避 hydration 隐患（spec 禁止 SSR 输出依赖 localStorage / 时间 / 随机）。
- 组件注册：本地 Nuxt module 扫描 `node_modules/@talex-touch/tuffex/dist/es/*/index.d.ts` 自动 `addComponent`（复刻 `apps/nexus/modules/tuffex-components.ts` 思路）；失败则回退为 SFC 显式子路径导入。
- 样式：一次性引入 `@talex-touch/tuffex/style.css`（含 base tokens）+ `@unocss/reset/tailwind-compat.css`；Tuffex 内部图标类通过启动时扫描 dist 生成 UnoCSS `safelist`。
