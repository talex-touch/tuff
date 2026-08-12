# 技术设计：设置页 IA 重构

> 事实基线 2026-08-04 20:33。实现前需按 `implement.md` 步骤 0 重新核对。

## 1. 设计稿映射

`docs/design/corebox/v2.5.0.pen` 画板（浅色 v2）：

| 画板 id | 名称 | 对应实现 |
| --- | --- | --- |
| `aRjnd` | 设置 · 更新 | 新 `SettingUpdatePage.vue` |
| `Dm0Xs` | 设置 · 更新 · 实验模式 | 同上，env 分支 |
| `V8s05` | 设置 · 网络 | 新 `SettingNetworkPage.vue` |
| `pEwON` | 设置 · 网络 · 自定义代理 | 网络页的二级表单 |
| `X14AN` | 设置 · 下载 | 新 `SettingDownloadPage.vue` |
| `FyKeM` | 设置 · 存储 | 改造 `SettingStoragePage.vue` |
| `pC8PA` | 设置 · 通用 | 改造 `SettingGeneralPage.vue` |
| `E0C1Zz` | 设置 · 外观 | 改造 `SettingAppearancePage.vue` |
| `TxPng` | 设置 · 插件与工具 | 改造 `SettingPluginsPage.vue` |

## 2. 现状证据

以下为改动依据，均已在代码中核实。

### 2.1 三套重试 / 两套超时

| 位置 | 字段 | UI 文案 |
| --- | --- | --- |
| `packages/utils/types/download.ts:120` | `chunk.maxRetries` | 最大重试次数 |
| `packages/utils/types/download.ts:130` | `network.maxRetries` | 网络最大重试次数 |
| `SettingNetwork.vue:259` | 策略 `maxRetries` | 最大重试次数 |
| `packages/utils/types/download.ts:128` | `network.timeout` | 网络超时 |
| `SettingNetwork.vue:233` | 策略 `timeoutMs` | 超时 |
| `packages/utils/types/download.ts:129` | `network.retryDelay` | 重试延迟 |
| `SettingNetwork.vue:282` / `:308` | `baseDelayMs` / `maxDelayMs` | 退避基数 / 上限 |

### 2.2 无消费者字段

- `storage.historyRetention`：`grep -rn historyRetention src/main/` → 0 命中。
- `storage.autoCleanup`：`src/main/modules/download/` 内 0 命中（其余命中来自无关的 `usage-summary-service.ts`）。
- `concurrency.autoAdjust / networkAware / priorityBased`：被 `concurrency-adjuster.ts` 读取，但 `download-center.ts:746-751` 的 `updateConfig` 只回传 `maxConcurrent` 与 `storage.tempDir`，三个布尔改了要重启才生效。

### 2.3 有消费者、不能删的字段

- `storage.tempDir`：`download-center.ts:115/122/402/447/540/638/750/763`、`download-worker.ts:178`、`chunk-manager.ts` 均使用。**只挪 UI 位置，不动字段。**
- `concurrency.maxConcurrent`：`concurrency-adjuster.ts`、`download-center.ts:943/1214/1430` 使用。
- `chunk.size` / `chunk.resume` / `chunk.autoRetry` / `chunk.maxRetries`：`chunk-manager.ts` 使用。

### 2.4 缺口

- `DownloadConfig` 无默认下载目录。`destination` 来自 `download-center.ts:269/292` 的 `request.destination`，由调用方逐任务传入。
- `NotificationConfig`（`modules/download/notification-service.ts`，字段 `downloadComplete` / `updateAvailable` / `updateDownloadComplete`）无任何 UI。

### 2.5 Renderer Override 双重门控

`update-system.ts:899`：

```ts
return ENABLE_RENDERER_OVERRIDE && this.config.rendererOverrideEnabled === true
```

`SettingUpdate.vue:765` 用 `v-if="showAdvancedSettings"` 控制显示，但未与 env 联动，导致未设 env 时渲染一个永久禁用的开关。

### 2.6 中转入口

`categories/*.vue` 中带 `settingsEntries.sectionEntries` 分组的：`SettingStoragePage`（→ `/setting/storage` ×2，全页仅此内容）、`SettingNetworkPage`（→ `/setting/advanced`）、`SettingPluginsPage`（→ `/application`、`/store/installed`）、`SettingIntelligencePage`（→ `/intelligence`）。

## 3. 目标 IA

`modules/settings/categories.ts` 是唯一真源，改动如下：

| 分组 | 现状 | 目标 |
| --- | --- | --- |
| preference | overview, general, **advanced**, appearance | overview, general, appearance |
| capability | intelligence, plugins | intelligence, plugins, **file-index** |
| system | **network**, storage-usage, about | **update, network, download**, storage-usage, about |

- 删除 `advanced`。
- 新增 `file-index`（icon `i-ri-file-search-line`，labelKey `fileIndex`）。
- `network` 从「更新+网络+下载」缩为纯网络；新增 `update`（`i-ri-refresh-line`）与 `download`（`i-ri-download-2-line`）。
- `network` 的 icon 从 `i-ri-refresh-line` 改为 `i-ri-global-line`（refresh 让给 update）。

### 路由与兼容

- `router.ts` 的 `loaders` 表按分类同步增删。
- `LEGACY_SECTION_REDIRECTS` 现有 `everything → /setting/advanced` 改为 `everything → /setting/file-index`。
- 保留 `/setting/advanced` 为重定向到 `/setting/network`，避免外部深链 404。
- `keepAliveKey` 沿用 `setting-${key}` 规则，新分类自动获得独立滚动位。

## 4. 组件层策略（已确认：保留 Tuff*Block）

页面骨架继续用 `components/settings/`（`SettingsPage` / `SettingSection` / `SettingRow` / `SettingChip` / `SettingButton` / `SettingDivider` / `SettingProgress`）——`categories/*.vue` 已经在用，且与设计稿 1:1。

叶子内容组件（`SettingUpdate.vue` 等）继续用 `Tuff*Block`，按以下方式配成扁平：

| 组件 | 配置 |
| --- | --- |
| `TuffGroupBlock` | `:collapsible="false"`，不传 `default-icon` / `active-icon` |
| `TuffBlockSwitch` / `TuffBlockSelect` | 不传 `default-icon` / `active-icon` |
| `TuffBlockSlot` | 同上 |

> 与设计稿的已知差异：分组标签仍在卡内（`TuffGroupBlock` 的 header），设计稿是标签外置。已确认接受，不为此改组件。

若某组件在不传 icon 时仍渲染占位，需在组件内加 `v-if`——这是允许的组件层最小改动，不算新建原语。

## 5. 各页选项集（before → after）

### 5.1 更新（新页）

| 现状 | 处置 |
| --- | --- |
| 顶部 trust 警告块（3 条 bullet + 错误码） | 收成状态卡内一条 strip，保留标题+一句说明+「前往发布页」 |
| 更新渠道 | 保留 |
| 检查频率 | 保留 |
| 自动下载更新 + 正常退出时安装 | **合并**为「安装方式」下拉：仅提醒 / 自动下载，退出时安装 / 自动下载并立即安装 |
| Renderer Override | **改为 env 条件渲染**，见 §6 |
| 8 字段诊断网格 + 重复 trust 警告 | **删除**，信息收进「导出诊断」 |
| 操作 → 检查更新 | **提升**为状态卡主按钮 |
| 诊断证据 → 复制证据 + 保存证据 | **合并**为「导出诊断」单按钮 |
| —— | **新增**「有新版本时通知」→ `NotificationConfig.updateAvailable` |

### 5.2 网络（新页）

| 现状 | 处置 |
| --- | --- |
| 代理模式 | 保留 |
| HTTP / HTTPS / SOCKS / PAC / 绕过规则 | **收进二级表单**「自定义代理」。HTTP 与 HTTPS 合成一个输入 + 「为 HTTPS 单独设置地址」勾选 |
| 代理认证 | 保留为状态行 + 二级入口 |
| `timeoutMs` | 保留，改名「请求超时」 |
| `maxRetries` | 保留，改名「失败重试」 |
| `baseDelayMs` / `maxDelayMs` | **删 UI**，字段保留用固定退避 |
| `retryOnNetworkError` / `retryOnTimeout` | **删 UI**，字段保留恒 true |
| `failureThreshold` + `cooldownMs` | **合并**为「不稳定时暂停」开关，阈值与冷却写进描述 |
| `autoResetOnSuccess` | **删 UI**，字段保留恒 true |

### 5.3 下载（新页）

| 现状 | 处置 |
| --- | --- |
| —— | **新增**「下载位置」→ `DownloadConfig.storage.defaultDestination`（新字段） |
| —— | **新增**「完成后通知」→ `NotificationConfig.downloadComplete` |
| `maxConcurrent` | 保留 |
| `autoAdjust` / `networkAware` / `priorityBased` | **删 UI**，字段与默认值保留 |
| `chunk.size` | **删 UI**，字段保留 |
| `chunk.resume` | **删 UI**，字段保留恒 true |
| `chunk.autoRetry` + `chunk.maxRetries` | **合并**为「失败重试」下拉：关闭 / 3 次 / 5 次 |
| `historyRetention` | 保留 UI，**必须补 main 侧消费者**（见 §7） |
| `autoCleanup` | **删 UI**（无消费者，且与页尾「清理临时文件」重复） |
| `network.timeout` / `retryDelay` / `maxRetries` | **删 UI**，统一走网络页策略 |
| `tempDir` | **移到存储页** |
| 「入口 → 下载中心」分组 | **提升**为页首入口卡 |
| 空闲超时 | **本轮不上线**，见 prd「已知缺口」1 |

### 5.4 存储（改造）

`SettingStoragePage.vue` 从两行跳转链接改为直接渲染内容：

- 占用概览卡：总占用 + 堆叠条 + 图例 + 「重新统计」。
- 占用明细：按分类逐行（名称 / 条形 / 大小 / 行内清理动作），复用 `Storagable.vue` 的 `categoryLabels` 与 cleanup action 定义。
- 位置：临时目录（从下载页迁入）+ 数据目录。

实现方式二选一，实现时按代码实际情况定：
- (a) 把 `views/storage/Storagable.vue` 的内容组件化后在分类页内联；
- (b) 让 `/setting/storage-usage` 直接渲染 `Storagable.vue` 的主体，`/setting/storage` 保留为重定向。

**不接受**继续保留 `SettingStorage.vue` 这个「只有一行 `router.push`」的组件。

图表配色：设计稿新增了 `chart-violet` token（浅 `#7C5CD6` / 深 `#9B7FE8`），因为原来第 4、5 类都是灰、第 5 类在浅灰轨道上不可见。落地时需在样式变量中补对应的 CSS 变量。

### 5.5 通用 / 外观 / 插件与工具（改造）

- **通用**：权限四行（辅助功能 / 完全磁盘访问 / 麦克风 / 通知）+ 启动与后台四行（开机自启 / 静默启动 / 托盘图标 / 不在 Dock 显示）。权限状态统一三档 chip：已授权 = success、已拒绝 = danger、状态不可读取 = info；需要动作的行右侧跟次级按钮。平台限制统一为中性 `macOS` chip，不用蓝色 Apple 徽标。
- **外观**：窗口效果三选一（Pure / Refraction / Filter，选中主色描边）+ 自定义 CoreBox（Beta chip + 编辑）+ 个性化四行（色彩风格 / 主页壁纸 / 窗口模糊 / 窗口透明度）。原来独立的「自动模式会优先读取桌面壁纸」info 条并入「主页壁纸」的描述。
- **插件与工具**：Auto Context 总开关卡 + 内置工具四行 toggle + 来自插件三行；移除 `sectionEntries` 中转，`SettingTools advanced-only` 的内容并入本页。

## 6. Renderer Override 的 env 条件渲染

保持 env 门控（已确认）。渲染规则：

```
未设 TUFF_ENABLE_RENDERER_OVERRIDE  →  该行完全不渲染
已设                                →  在「高级」分组渲染，可切换，行内以 mono chip 标出变量名
```

需要一条从 main 到 renderer 的 env 可见性通道。优先复用现有链路：`UpdateService.ts:166` 已把 `rendererOverrideEnabled` 放进 settings payload，在同一 payload 里补一个 `rendererOverrideAvailable`（来自 `ENABLE_RENDERER_OVERRIDE`）即可，不新增 IPC 通道。`SettingUpdate.vue` 的 `showAdvancedSettings` 改为与该字段联动。

## 7. 数据契约改动

| 改动 | 位置 | 说明 |
| --- | --- | --- |
| 新增 `storage.defaultDestination: string` | `packages/utils/types/download.ts` | 默认下载目录；`defaultDownloadConfig` 给 `~/Downloads`（用 `app.getPath('downloads')` 解析，不硬编码） |
| 消费新字段 | `download-center.ts:269/292` | `request.destination` 为空时回落到 `config.storage.defaultDestination` |
| `historyRetention` 补消费者 | `download-center.ts` / `database-service.ts` | 启动时与定期清理超期记录。**若本轮不实现，则必须把该字段与 UI 一并删除** |
| 删除 `storage.autoCleanup` | `packages/utils/types/download.ts` + `SettingDownload.vue` | 无消费者 |
| 新增 `rendererOverrideAvailable: boolean` | update settings payload | 见 §6 |
| `NotificationConfig` 接线 | `notification-service.ts` + 下载/更新页 | 需要 get/update 的 transport 通道；若无则新增 |

> `packages/utils` 是已发布的 npm 包（v1.0.23）。`DownloadConfig` 改动属于结构变更，需检查是否有外部插件依赖该类型；`defaultDestination` 用可选字段 + 默认值可避免破坏性变更。

## 8. 兼容与回滚

- **回滚单位**：按页回滚。每页一次提交，`categories.ts` + `router.ts` 的 IA 改动单独一次提交排在最前。
- **深链兼容**：`/setting/advanced` 保留重定向；`LEGACY_SECTION_REDIRECTS` 同步更新。
- **配置兼容**：删除 `autoCleanup` 后，旧配置里残留该键不应导致读取失败——`download-center.ts` 的配置合并是 `{...default, ...stored}` 形式，多余键会被忽略，但需实测一次带旧配置启动。
- **测试基线**：`SettingUpdate.channel.test.ts`、`setting-network-form.test.ts`、`AppSettings.layout.test.ts`、`update-diagnostic-evidence.test.ts`、`SettingSetup.test.ts`、`SettingTools.quickops.test.ts` 会受影响，改动时同步更新而非跳过。

## 9. 风险

1. **并发改动**：20:00–20:01 有外部改动碰过 `categories/` 与 `categories.ts`。开工前必须重新 diff 基线。
2. **`SettingUpdate.vue` 体量**：1377 行，拆页时容易漏掉状态机分支。优先只做「删 UI + 重组」，不重写状态逻辑。
3. **`historyRetention` 的二选一**：补消费者会牵出数据库清理逻辑，工期不确定。若评估超标，走「删字段」分支，但必须在同一次提交里删干净。
4. **`packages/utils` 版本联动**：类型改动需要同步发包或用 workspace 引用，注意 `plugins/` 下 7 个插件包的构建。
