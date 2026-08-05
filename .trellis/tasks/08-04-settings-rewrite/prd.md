# ③ 18 个 Setting*.vue 按设计稿重写

父任务：`.trellis/tasks/08-03-app-shell-ai-redesign`
依赖：子任务 ②（`08-04-settings-ia-primitives`）
设计基准：父任务 `design.md` 第 4 节；画板 `iqbKR`。

## 范围收窄（2026-08-05，用户确认）

`08-04-settings-ia-restructure` 已按**裁撤 + 新增**的口径改完下列分类，本任务不再认领，也**不要**按「原样搬运」把它们改回去：

| 分类 | 已落地内容 | 口径差异 |
|---|---|---|
| 更新 | 拆为独立分类；8 字段诊断网格与重复信任块删除；自动下载 + 退出时安装合并为「安装方式」；证据复制/保存合并为「导出诊断」；Renderer Override 改 env 条件渲染 | 有裁撤、有合并 |
| 网络 | 代理五项收进模态二级表单；退避/重试成因/自动复位删 UI 保字段；阈值 + 冷却合并为「不稳定时暂停」 | 有裁撤、有合并 |
| 下载 | 五个引擎参数删 UI；`autoCleanup` 连字段删除；**新增「下载位置」「完成后通知」**；临时目录迁往存储 | 有裁撤、**有新增** |
| 存储 | 分类路由直接渲染 `Storagable`，删除中转页与 `SettingStorage.vue`；新增位置分组 | 有裁撤、有新增 |
| 通用 / 外观 / 插件与工具 | 由 `08-04-settings-ia-restructure` 步骤 9 接手 | 同上 |

因此本任务原「不新增任何设置项 / 裁撤归 batch-settings-razor」的约束**不适用于**上述分类。`08-04-batch-settings-razor` 若启动，需以当前实际状态为基线重新盘点。

本任务剩余范围：总览、智能、文件索引、关于四个分类。**第一轮改做「总览」**，`design.md` 第 1 节与 `implement.md` 中关于「外观」的部分已失效，需重写后再启动。

外观分类的一个已决口径：画板 `E0C1Zz` 的「个性化」只画了 4 行，而现有外观页有 25 项。**本轮全部保留**，画板未画的按同一行式语言补成「壁纸滤镜 / 强调 / 动画」三组。设置项的裁撤归 `08-04-batch-settings-razor`，其规划尚未经用户批准，本任务不代做该决定。

## 背景

子任务 ② 之后，9 个分类路由和行式基础组件已就位，但各分类里挂的仍是原样的 `Setting*.vue` —— 折叠分组卡片、卡片边框堆层级，与设计稿的发丝线行式布局不一致。

## 目标

把 20 个来源组件（18 个 `Setting*.vue` + 风格页 + Storagable）的表现层全部改为 `SettingSection` + `SettingRow` 结构。**行为逻辑原样搬运，只换表现层。**

## 范围

按分类逐个迁移，每迁完一个分类跑一次 typecheck，不一次性推平。

| 分类 | 来源组件 |
|---|---|
| 总览 | `SettingHeader`（吸收为身份带）、`SettingUser`、AI 积分（新，接 `accountSDK`）、`SettingLanguage`、`SettingSetup` 的开机自启 |
| 通用 | `SettingSetup`（除开机自启）、`SettingWindow`、`SettingMessages` |
| 外观 | `views/base/styles/`（去掉布局区后剩余部分） |
| 智能 | `SettingAssistant` |
| 插件与工具 | `SettingTools`、`SettingPlatformCapabilities`、`SettingPermission` |
| 文件索引 | `SettingFileIndex`、`SettingEverything`、`SettingFileIndexAppDiagnostic`、`SettingFileIndexAppIndexManager` |
| 网络与更新 | `SettingNetwork`、`SettingUpdate`、`SettingDownload` |
| 存储 | `SettingStorage`、`views/storage/Storagable` |
| 关于 | `SettingAbout`、`SettingSentry` |

### 约束

- 每一项设置的读写逻辑、校验、副作用保持不变；只重构模板与样式
- 不写死颜色，全部走 `--shell-*`
- 长文本截断用 CSS，不在数据层截字符串
- 强调色只出现在：主按钮、开关开态、进度条、选中态

### 不在本子任务范围

- 新增任何设置项
- AI 积分之外的新功能

## 验收标准

- [ ] 20 个来源组件的**每一项设置**都能在新分类页里找到并正常读写（逐项核对，不抽样）
- [ ] 设置页内不再出现折叠分组卡片与旧 hero 横幅
- [ ] 所有分区遵循「小号灰组标签 + `radius-lg` 描边容器 + 行间 1px 发丝线」结构
- [ ] 强调色使用范围符合约束，无多余色块
- [ ] AI 积分区可显示当月额度与用量进度（未登录时显示合理空态）
- [ ] light / dark 双主题下无对比度不足或布局溢出
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过
