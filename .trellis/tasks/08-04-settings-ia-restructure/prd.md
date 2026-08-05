# 设置页 IA 重构：拆页与选项收敛

## 背景

`docs/design/corebox/v2.5.0.pen` 已产出 7 张浅色 v2 设置页设计稿（画板 id 见 design.md）。本任务把设计稿落到代码。

现状问题（均已在代码中核实，证据见 design.md）：

1. **单页过载**：`网络与更新` 一页承载约 41 行——`SettingUpdate.vue`（1377 行）约 9 行 + `SettingNetwork.vue` 17 行 + `SettingDownload.vue` 15 行。
2. **同一概念三套参数**：`DownloadConfig.chunk.maxRetries`、`DownloadConfig.network.maxRetries`、网络策略 `maxRetries` 并存且 UI 文案几乎一样；`timeout` / `retryDelay` 各有两套。
3. **空开关**：`storage.historyRetention` 在 `src/main/` 零消费者；`storage.autoCleanup` 在 `modules/download/` 零消费者；`concurrency.autoAdjust/networkAware/priorityBased` 只在构造时读取，`updateConfig` 不回传，改了要重启才生效。
4. **该有的没有**：`DownloadConfig` 没有默认下载目录（`destination` 逐任务传入），却暴露了引擎内部的 `storage.tempDir`；`NotificationConfig` 三个字段全无 UI。
5. **永远禁用的控件**：Renderer Override 受 `ENABLE_RENDERER_OVERRIDE && config.rendererOverrideEnabled` 双重门控，未设 env 时渲染成一个点不动的开关 + 一段让用户去设环境变量的说明。
6. **中转入口页**：`categories/*.vue` 有个 `settingsEntries.sectionEntries` 分组专放跳转行。最极端的是 `SettingStoragePage.vue`——整页内容就是两行指向同一个 `/setting/storage` 的链接。
7. **分类语义错位**：`advanced` 分类实际托管 `SettingNetwork proxy-only` + `SettingAssistant mode=advanced` + `SettingTools advanced-only` 三块互不相关的内容，「高级」只是一个收容所。
8. **文件索引无分类入口**：`SettingFileIndex.vue` 只在遗留的单页视图 `AppSettings.vue` 内渲染，`SETTING_CATEGORIES` 中没有对应分类；而设计稿侧栏画的是「文件索引」而非「高级」。

> 事实基线时间：2026-08-04 20:33。此前 20:00–20:01 有并发改动把 `categories/SettingFileIndexPage.vue` 改名为 `SettingAdvancedPage.vue` 并同步了 `categories.ts`，当前 9 个分类与路由 loader 一一对应、自洽。实现前需重新确认基线未再变。

## 目标

1. 把 `网络与更新` 拆成 **更新 / 网络 / 下载** 三个独立分类，`存储` 从中转页改为直接呈现内容。
2. 按设计稿收敛选项集：删掉无消费者与引擎内部的参数，合并重复语义，补上缺失的用户级设置。
3. 统一页面版式：分组标签 + 单层卡片 + 分隔线，去掉折叠头与逐行图标。
4. 导航项点进去就是内容本身，移除 `sectionEntries` 中转分组。

## 范围

**改动页面（7）**：更新、网络、下载、存储、通用、外观、插件与工具。

**连带必须处理**（已确认）：
- **解散 `advanced` 分类**，三块内容各自归位：`SettingNetwork proxy-only` → 网络页；`SettingAssistant mode=advanced` → 智能页；`SettingTools advanced-only` → 插件与工具页。否则 网络 拆分后 `advanced` 里的代理配置会与新 网络 页重复。
- **新增 `file-index` 分类**（设计稿侧栏已有该项）：新建 `categories/SettingFileIndexPage.vue` 承载现有的 `SettingFileIndex.vue`。**不重做该页内容**，只是给它一个分类入口——它目前只在遗留单页视图 `AppSettings.vue` 里渲染。

## 非目标

- 不重做 总览 / 智能 / 关于 / 文件索引 四页的内容。
- 不新建组件原语。沿用 `TuffGroupBlock` / `TuffBlockSwitch` / `TuffBlockSelect` / `TuffBlockSlot`，通过 props 配成扁平形态。
- 不实现「下载空闲超时」的传输层语义变更（见「已知缺口」）。
- 不做深色态验证（设计稿只出了浅色）。

## 约束

- **组件层**：保留 `Tuff*Block` 系列。`TuffGroupBlock` 传 `collapsible=false`、不传 icon；`TuffBlockSwitch/Select` 去掉行图标。分组标签仍在卡内（与设计稿「标签外置」有差异，已与用户确认接受）。
- `modules/settings/categories.ts` 是侧栏与路由的唯一真源，改 IA 必须从这里改。
- 删除任何配置字段前，必须先确认没有 main 侧消费者；有消费者的字段只能改 UI 呈现，不能删字段。

## 验收标准

### A. IA 与导航
- [ ] 侧栏「系统」组为：更新 / 网络 / 下载 / 存储 / 关于；「能力」组为：智能 / 插件与工具 / 文件索引；「偏好」组为：总览 / 通用 / 外观。
- [ ] 上述每个分类在 `SETTING_CATEGORIES` 与路由中一一对应，无孤儿路由、无无路由的导航项。
- [ ] `advanced` 分类不再存在；`LEGACY_SECTION_REDIRECTS` 及任何指向 `/setting/advanced` 的链接改为指向新归属页，旧路径至少保留重定向。
- [ ] 所有 `categories/*.vue` 中的 `settingsEntries.sectionEntries` 分组被移除；点击任一导航项直接看到该页内容，无需二次点击。
- [ ] `/setting/storage-usage` 直接呈现存储占用内容，不再是跳转到 `/setting/storage` 的链接页。

### B. 选项集
- [ ] 更新页：更新渠道 / 检查频率 / 安装方式 / 有新版本时通知 四行 + 状态卡（版本、渠道、信任状态、检查更新）+ 更新诊断一行。信任警告全页只出现一次。
- [ ] 更新页不再渲染 8 字段诊断网格；相关信息只通过「导出诊断」产出。
- [ ] 未设 `TUFF_ENABLE_RENDERER_OVERRIDE` 时，Renderer Override 行**不渲染**；设了才在「高级」分组出现，行内标出变量名。
- [ ] 网络页：代理模式 / 自定义代理 / 代理认证 + 请求超时 / 失败重试 / 不稳定时暂停，共 6 行。HTTP/HTTPS/SOCKS/PAC/绕过规则收进「自定义代理」二级表单。
- [ ] 下载页：下载位置 / 完成后通知 + 最大并发 / 失败重试 / 历史记录保留（+ 空闲超时，见「已知缺口」）+ 下载中心入口。
- [ ] 下载页不再出现 `autoAdjust` / `networkAware` / `priorityBased` / `chunk.size` / `chunk.resume` 五个控件。
- [ ] 临时目录出现在存储页而非下载页。
- [ ] 通用页：权限四行（辅助功能 / 完全磁盘访问 / 麦克风 / 通知）+ 启动与后台四行。
- [ ] 外观页：窗口效果三选一 + 自定义 CoreBox + 个性化四行（色彩风格 / 主页壁纸 / 窗口模糊 / 窗口透明度）。

### C. 数据契约
- [ ] 新增默认下载目录字段并在下载页可读可写；新建任务未显式指定 `destination` 时使用该值。
- [ ] `NotificationConfig.downloadComplete` 与 `updateAvailable` 有对应 UI 且可持久化。
- [ ] `storage.historyRetention` 与 `storage.autoCleanup`：要么补上 main 侧消费者，要么从 `DownloadConfig` 中移除。**不接受保留一个不生效的控件。**
- [ ] `concurrency.autoAdjust/networkAware/priorityBased` 三个字段的 UI 移除后，字段本身保留且默认值不变（不改变现有运行时行为）。

### D. 质量门
- [ ] `npm run typecheck` 通过（main + renderer）。
- [ ] `pnpm lint` 无新增错误。
- [ ] `apps/core-app` 既有测试全绿，特别是 `SettingUpdate.channel.test.ts`、`setting-network-form.test.ts`、`AppSettings.layout.test.ts`、`update-diagnostic-evidence.test.ts`。
- [ ] 每个改动页面手动走查一遍：无控件溢出、无空分组、无死链。

## 已知缺口（本任务不解决，需另立）

1. **下载空闲超时**：设计稿的「空闲超时」是「多久没收到数据判失败」，与现有 `network.timeout`（总请求超时）语义不同。落地需要改 `download-worker.ts` 的超时实现。**本轮不上线该控件**；语义变更另立任务后再补 UI。
2. **深色态**：设计稿仅浅色，深色需另出稿或按 token 推导后验证。
3. **文件索引 / 智能 / 总览 / 关于** 四页的内容重做。
