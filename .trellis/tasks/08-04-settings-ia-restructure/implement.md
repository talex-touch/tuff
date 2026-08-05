# 执行计划：设置页 IA 重构

顺序有依赖：**步骤 0 → 1（IA 骨架）必须先落地并单独提交**，之后 2–8 各页可独立推进、独立回滚。

## 验证命令

```bash
# 类型（main + renderer）
cd apps/core-app && npm run typecheck

# 单侧快速验证
cd apps/core-app && npm run typecheck:web

# Lint
pnpm lint

# 受影响测试
cd apps/core-app && npx vitest run src/renderer/src/views/base/settings
```

每步收尾至少跑 `typecheck:web`；步骤 1、7 涉及 main 侧，需跑完整 `typecheck`。

---

## 步骤 0 — 重新核对基线 `[gate]`

前一次核对时间 2026-08-04 20:33，期间已发生过一次外部改动（`SettingFileIndexPage.vue` → `SettingAdvancedPage.vue`）。

- [ ] `git status --porcelain -- apps/core-app/src/renderer/src` 与 `design.md` §2 记录对比
- [ ] `ls apps/core-app/src/renderer/src/views/base/settings/categories/` 确认文件集
- [ ] `modules/settings/categories.ts` 的 9 个 key 与 `router.ts` 的 loaders 仍一一对应
- [ ] 重跑 `design.md` §2.2 的三条 grep，确认「无消费者」结论仍成立

**若任一条与记录不符：停下，更新 `design.md` 后再继续。不要在过期事实上实现。**

---

## 步骤 1 — IA 骨架 `[单独提交]`

只动导航与路由，不动任何页面内容。这一步跑完，应用应当能正常跑，只是新分类页是空壳。

- [ ] `modules/settings/categories.ts`：删 `advanced`，加 `file-index`（capability）、`update` / `download`（system）；`network` 的 icon 改为 `i-ri-global-line`
- [ ] `LEGACY_SECTION_REDIRECTS`：`everything` 由 `/setting/advanced` 改为 `/setting/file-index`
- [ ] `router.ts`：`loaders` 表同步；新增 `/setting/advanced` → `/setting/network` 的重定向
- [ ] 新建三个空壳页：`SettingUpdatePage.vue` / `SettingDownloadPage.vue` / `SettingFileIndexPage.vue`（后者直接挂现有 `SettingFileIndex.vue`）
- [ ] i18n：`settingsNav.category` 下补 `update` / `download` / `fileIndex`，`zh-CN.json` 与 `en-US.json` 同步
- [ ] 全仓搜 `/setting/advanced` 与 `settingsNav.category.advanced`，处理残留引用

**验证**：`npm run typecheck` + 手动点一遍侧栏九项，每项都能进且不报错。
**回滚点**：此步单独一次提交。

---

## 步骤 2 — 移除 `sectionEntries` 中转

- [ ] `SettingNetworkPage.vue` / `SettingPluginsPage.vue` / `SettingIntelligencePage.vue` / `SettingStoragePage.vue` 删除 `SettingSection :label="t('settingsEntries.sectionEntries')"` 整块
- [ ] 删除随之失效的 `useRouter` 导入与 i18n key（`settingsEntries.sectionEntries` 及只被它用到的条目）
- [ ] `SettingStorage.vue`（只有一行 `router.push` 的那个组件）删除

**验证**：`typecheck:web`；四页点进去都直接见内容。

---

## 步骤 3 — 更新页

- [ ] `SettingAdvancedPage.vue` 中的 `SettingNetwork proxy-only` 摘出（先摘，步骤 4 再接到网络页）
- [ ] `SettingUpdate.vue`：删 8 字段诊断网格与重复 trust 警告块；合并 `autoDownload` + `installOnQuit` 为「安装方式」下拉；合并复制/保存证据为「导出诊断」；检查更新按钮上移到状态卡
- [ ] 新增「有新版本时通知」接 `NotificationConfig.updateAvailable`
- [ ] `Tuff*Block` 全部去 icon、`TuffGroupBlock` 传 `:collapsible="false"`
- [ ] 同步 `SettingUpdate.channel.test.ts`、`update-diagnostic-evidence.test.ts`

**验证**：`npx vitest run src/renderer/src/views/base/settings/SettingUpdate.channel.test.ts update-diagnostic-evidence.test.ts`
**Review gate**：与画板 `aRjnd` 对照，确认行数与分组一致。

---

## 步骤 4 — Renderer Override env 条件渲染

- [ ] `update-system.ts` / `UpdateService.ts:166`：settings payload 增加 `rendererOverrideAvailable`（值取 `ENABLE_RENDERER_OVERRIDE`）
- [ ] `useUpdateRuntime.ts` 与 `update-diagnostic-evidence.ts` 的类型同步
- [ ] `SettingUpdate.vue`：`showAdvancedSettings` 与该字段联动，未可用时该行**不渲染**（不是 disabled）
- [ ] 行内加 mono chip 显示 `TUFF_ENABLE_RENDERER_OVERRIDE=1`

**验证**：`npm run typecheck`；分别以 `TUFF_ENABLE_RENDERER_OVERRIDE=1 pnpm core:dev` 和不带 env 启动，确认两种形态（对照画板 `aRjnd` / `Dm0Xs`）。

---

## 步骤 5 — 网络页

- [ ] `SettingNetworkPage.vue` 接入 `SettingNetwork`（完整，非 proxy-only）
- [ ] `SettingNetwork.vue`：HTTP/HTTPS/SOCKS/PAC/绕过规则移入二级表单组件（新建 `SettingProxyForm.vue`，模态，含取消/保存）；HTTP 与 HTTPS 合成一个输入 + 「为 HTTPS 单独设置地址」勾选
- [ ] 删 UI 保字段：`baseDelayMs` / `maxDelayMs` / `retryOnNetworkError` / `retryOnTimeout` / `autoResetOnSuccess`
- [ ] 合并 `failureThreshold` + `cooldownMs` 为「不稳定时暂停」开关
- [ ] 同步 `setting-network-form.ts` 与 `setting-network-form.test.ts`

**验证**：`npx vitest run src/renderer/src/views/base/settings/setting-network-form.test.ts`
**Review gate**：对照画板 `V8s05` / `pEwON`。

---

## 步骤 6 — 下载页

- [ ] `SettingDownloadPage.vue` 接入 `SettingDownload.vue`
- [ ] 删 UI：`autoAdjust` / `networkAware` / `priorityBased` / `chunk.size` / `chunk.resume` / `network.timeout` / `network.retryDelay` / `network.maxRetries` / `autoCleanup`
- [ ] 合并 `chunk.autoRetry` + `chunk.maxRetries` 为「失败重试」
- [ ] `tempDir` 从本页移除（步骤 8 迁到存储页）
- [ ] 「下载中心」从页尾入口分组提升为页首入口卡
- [ ] **不加**「空闲超时」（见 prd 已知缺口 1）

**验证**：`typecheck:web`；对照画板 `X14AN`（除空闲超时外）。

---

## 步骤 7 — 数据契约 `[涉及 main + packages]`

- [ ] `packages/utils/types/download.ts`：新增可选 `storage.defaultDestination`；删除 `storage.autoCleanup`
- [ ] `defaultDownloadConfig` 的 `defaultDestination` 用 `app.getPath('downloads')` 在 main 侧解析，不硬编码
- [ ] `download-center.ts:269/292`：`request.destination` 为空时回落到 `config.storage.defaultDestination`
- [ ] `historyRetention` **二选一**（决策点，做之前先评估）：
  - (a) 在 `download-center.ts` / `database-service.ts` 补超期记录清理，保留 UI；
  - (b) 从类型与 UI 中一并删除。
  - 选 (b) 时必须在同一次提交里删干净，不留半截。
- [ ] `NotificationConfig` 的 get/update transport 通道（若不存在则新增）
- [ ] 带旧配置文件启动一次，确认多余键不导致读取失败

**验证**：`npm run typecheck`（main + renderer）；`pnpm utils:test`；确认 `plugins/` 下 7 个包仍能构建。
**Review gate**：`packages/utils` 是已发布包，改动需确认非破坏性。

---

## 步骤 8 — 存储页

- [ ] `SettingStoragePage.vue` 改为直接渲染存储内容（方案 (a)/(b) 见 design.md §5.4，按代码实际情况定）
- [ ] 占用明细的清理动作复用 `Storagable.vue` 已有的 cleanup action 定义，不重写
- [ ] 迁入「临时目录」行（接 `storage.tempDir`）+ 新增「数据目录」行
- [ ] 补 `--chart-violet` CSS 变量（浅 `#7C5CD6` / 深 `#9B7FE8`）

**验证**：`typecheck:web`；对照画板 `FyKeM`。

---

## 步骤 9 — 通用 / 外观 / 插件与工具

三页互不依赖，可并行。

- [ ] **通用**（`SettingGeneralPage.vue` + `SettingSetup.vue` + `SettingPermission.vue`）：权限四行 + 启动与后台四行；权限状态统一三档 chip；平台标注统一中性 chip。同步 `SettingSetup.test.ts`
- [ ] **外观**（`SettingAppearancePage.vue`）：窗口效果三选一 + 自定义 CoreBox + 个性化四行；壁纸 info 条并入描述
- [ ] **插件与工具**（`SettingPluginsPage.vue` + `SettingTools.vue`）：Auto Context 卡 + 内置工具四行 + 来自插件三行；并入原 `SettingTools advanced-only` 内容。同步 `SettingTools.quickops.test.ts`

**验证**：`npx vitest run src/renderer/src/views/base/settings`；分别对照画板 `pC8PA` / `E0C1Zz` / `TxPng`。

---

## 步骤 10 — 收尾

- [ ] `npm run typecheck` 全绿
- [ ] `pnpm lint` 无新增
- [ ] `npx vitest run src/renderer/src/views/base/settings` 全绿
- [ ] `AppSettings.layout.test.ts` 通过（IA 变更会影响它）
- [ ] 手动走查九个分类页各一遍：无溢出、无空分组、无死链、无二次点击才见内容的页
- [ ] 全仓 grep 确认无残留：`sectionEntries`、`/setting/advanced`（除重定向）、`autoCleanup`、被删掉的 i18n key

## 回滚点

| 提交 | 内容 | 独立回滚 |
| --- | --- | --- |
| 1 | IA 骨架（categories + router + 空壳页 + i18n） | 是，回滚即恢复原九分类 |
| 2 | 移除 sectionEntries | 是 |
| 3–4 | 更新页 + Renderer Override | 是 |
| 5 | 网络页 | 是 |
| 6 | 下载页 UI | 依赖 7；若 7 未落地则下载页的「下载位置」行不可用 |
| 7 | 数据契约 | 独立；含 packages/utils 改动 |
| 8 | 存储页 | 依赖 6（tempDir 迁移） |
| 9 | 通用 / 外观 / 插件与工具 | 是，三页各自独立 |

## 未决

- 步骤 7 的 `historyRetention` 二选一，需在开工时定。
- 「空闲超时」需另立任务改 `download-worker.ts` 的超时语义后再补 UI。
