# ② 设置页信息架构 + 行式基础组件

父任务：`.trellis/tasks/08-03-app-shell-ai-redesign`
依赖：子任务 ①（`08-04-shell-fixed-frame`）
设计基准：父任务 `design.md` 第 4 节；画板 `iqbKR`。

## 背景

`/setting` 是单路由，`AppSettings.vue` 顺序堆叠 18 个 `Setting*.vue`（14144 行）。设计稿改为「侧栏分类导航 + 内容列」，分类分「偏好 · 能力 · 系统」三组共 9 项。

## 目标

搭好设置页的骨架与积木：9 个分类子路由、进入设置时的侧栏上下文切换、以及供子任务 ③ 使用的行式基础组件。本子任务**不重写 18 个组件的内部实现** —— 现有组件按映射表挂进对应分类即可，内部保持原样。

## 范围

### 路由

- `/setting` → redirect `/setting/overview`
- 新增 9 个分类子路由（父 design.md 4.1 映射表）
- `?section=file-index` / `?section=everything` 深链兼容重定向
- 移出侧栏的入口挂到设置分类下：`/application` → 插件与工具、`/downloads` → 网络与更新、风格 → 外观、`/setting/storage` → 存储

### 侧栏设置上下文

进入设置时侧栏切换为：`返回 Tuff` 返回行 + 「搜索设置」入口 + 三组分类导航 + 底部版本号。复用 ① 的 `ShellNavItem` / `ShellNavGroup`。

### 行式基础组件

按父 design.md 4.2 表格实现 `SettingSection` / `SettingRow` / `SettingDivider` / `SettingToggle` / `SettingChip` / `SettingButton` / `SettingProgress`。

### 总览页

设计稿「总览」是新页面，本子任务落地其骨架与身份带（64px logo + `TUFF` + 版本胶囊 + tagline + 检查更新按钮），账户 / AI 积分 / 常规三个分区的内容留给子任务 ③。

### 不在本子任务范围

- 18 个 `Setting*.vue` 的内部重写（子任务 ③）
- 「搜索设置」的实际搜索能力（本轮只做入口，点击行为可先留空或跳 CoreBox）

## 验收标准

- [ ] 9 个分类子路由均可直达，`/setting` 正确 redirect 到 `/setting/overview`
- [ ] `?section=file-index` / `?section=everything` 旧深链仍可用
- [ ] 进入设置侧栏切到设置上下文，`返回 Tuff` 可退回上一个非设置路由
- [ ] 分类切换不丢失各自的滚动位置
- [ ] 行式基础组件实测对齐画板：`SettingRow` padding [12,16] / gap 16 / title 13.5 / desc 12 lineHeight 1.5 / trailing gap 6；`SettingSection` 组标签 11px `$text-muted` + `radius-lg` 描边容器 + `clip`；分隔线 1px 左右缩进 16
- [ ] 身份带对齐画板：IdentityCard padding 16 / gap 18 / `radius-lg` / `$bg` + 1px `$border`，AppMark 64、AppName 与版本胶囊同行
- [ ] 20 个来源组件全部挂到某个分类下，无组件失联
- [ ] light / dark 双主题验过
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过
