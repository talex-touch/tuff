# 跨平台兼容、占位实现、UI 适配与架构健壮性自动化增量审计（2026-05-30）

> 范围：`apps/core-app`、`apps/nexus`、`packages/*`、`plugins/*`、`docs/plan-prd` 当前 live tree 与未提交工作树。
> 口径：基于 2026-05-29 增量审计与 post-slice 复核继续检查，重点识别 UI 完整度、兼容性、假实现、占位路径、不优雅代码与下一步架构收口。

## 总结

- **P0 结论**：本轮未发现新的生产路径 fixed fake-success、mock 支付 URL、伪成功空结果或可消费占位 payload。测试 mock、playground mock 与静态受控 fallback 不纳入 P0。
- **UI 判断**：Tuff 当前更适合“专业桌面工具、高密度、可扫描、键盘优先、状态可信”的方向，不建议做大范围主题重绘。主要问题是旧组件语义、局部圆角/视觉语言不统一、真实截图 evidence 不足。
- **兼容性判断**：Indexing Runtime V1、typed diagnostics、Search Provider manifest 与 `settings.indexedSource` 已把 App/File/Everything/Browser Data/Quicklinks 迁移方向拉到统一架构；风险在于 File/App 内部写入边界尚未完全迁到 runtime store，Windows/Everything 仍缺真机 evidence。
- **占位与假实现判断**：未发现新的“成功但实际未做”的生产占位。仍有 fail-closed 的 cloud preset placeholder、disabled/pending Browser Bookmarks skeleton、local/memory evidence fallback 与 playground mock，需要继续在 UI 和文档中显式标记状态。
- **架构优先级**：下一步应优先补真实平台/截图 evidence、完成 File provider 写入边界迁移、清理旧语义交互和本地偏好存储绕路，而不是继续泛化搜索 placeholder。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.4 / 10 | CoreBox、设置、插件详情、搜索诊断、手动维护动作和即时反馈已经符合桌面工具基调。扣分点是旧式 `div/span @click`、局部旧 dialog/旧组件、直接 `localStorage` 偏好与部分非语义交互仍并存。 |
| Nexus 文档与生态站 | 7.8 / 10 | TuffEx composition demo、dashboard chart wrapper、evidence source 分层与发布文档持续改善。扣分点是 visual smoke 真实截图、生产/preview operator evidence、live storage/send、真实 provider quota 仍未闭环。 |
| TuffEx 组件体系 | 7.7 / 10 | Dialog 文本/可信 HTML 分流、Tabs Fragment 支持、visual smoke 脚本和 per-component docs 让组件体系更稳。扣分点是截图 evidence 尚未形成稳定报告，且产品侧仍有旧组件没有完全迁到 TuffEx 语义。 |
| 官方/示例插件 UI | 6.6 / 10 | 旧 snippets placeholder 已 hidden/deprecated/replacedBy，官方插件 provider manifest 覆盖率提升。扣分点是部分示例插件仍有裸 console、旧观感与能力状态表达不统一。 |
| 架构健壮性 | 7.6 / 10 | Indexing Runtime V1、Search Provider SDK、capability gate 与 typed diagnostics 是正确方向。扣分点是 runtime store 迁移仍半程、hard-cut telemetry 需要 release cycle 观察、平台真机 evidence 不足。 |

整体观感不是“难看”，而是“局部旧边界拖累专业感”。对 Tuff 这种指令中心，下一阶段应继续提升控件语义、状态可信度、错误解释与截图证据，而不是增加装饰性视觉。

## 本轮代码证据

### 1. 没有发现新的 i18n 全局直连

扫描 `apps/core-app/src` 与 `packages` 未发现生产代码直接访问 `window.$t` / `window.$i18n`。这符合当前 i18n 规则，后续仍应保持只通过 `useI18n` / `useLanguage` / `useI18nText` 或 typed resolver 访问。

### 2. 直接 `localStorage` 主要是非敏感 UI 偏好

证据：

- `apps/core-app/src/renderer/src/components/tuff/TuffGroupBlock.vue` 用 `localStorage` 记住折叠状态。
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue` 用 `localStorage` 记住 preview frame size。
- `apps/core-app/src/renderer/src/modules/lang/language-preferences.ts` 读取旧语言偏好。

判断：

- 当前没有看到把 secret、token、业务同步明文写入 `localStorage` 的生产路径，不违反 Storage/Security P0。
- 但 UI 偏好绕过统一 storage/hydration 边界，长期会造成状态恢复口径分散。建议后续抽 `useUiPreference()` 或复用现有 storage facade，保留 legacy migration read。

### 3. 旧式非语义点击仍影响可访问性与专业感

证据：

- `apps/core-app/src/renderer/src/components/plugin/FeatureCard.vue` 使用 `<div class="FeatureCard ..."> @click`，并使用 20px 圆角。
- `apps/core-app/src/renderer/src/components/render/CoreBoxRender.vue` 根节点使用 `<div @click>` 承担 item trigger。
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`、`SectionItem.vue`、`PluginList.vue`、`PluginNew.vue` 等仍有 `span/div @click`。
- 部分 overlay 点击关闭是合理模式，但可点击 item / button / tab / card 应优先使用 button、listbox option 或现有 TuffEx 组件。

判断：

- 这不是 P0，因为 CoreBox 键盘导航另有独立 hook，且很多 overlay click 是常规交互。
- 但 UI/UX 基线要求语义元素和可见 focus，长期应清掉产品主路径里的非语义点击。

### 4. Cloud preset placeholder 是 fail-closed，但仍是产品完整度债务

证据：

- `packages/utils/common/storage/entity/preset-cloud-api.ts` 导出 `PresetCloudServicePlaceholder`。
- 所有云端操作都抛出 `Cloud preset service is not yet available`。
- `getStatus()` 返回 `available: false` 与 `Cloud preset service is coming soon`。

判断：

- 这不是 fake-success，因为它没有返回成功 payload。
- 但它是对外可 import 的 placeholder singleton，若 UI 暴露入口，会拉低完成度并制造“即将上线但不可用”的体验。建议改为 capability-driven unavailable service，UI 默认隐藏或明确 “not configured / not shipped”，不要使用泛化 coming soon 文案。

### 5. Browser Bookmarks runtime skeleton 状态表达正确，但不能算完成

当前 `BrowserBookmarksIndexedSource` 以 high privacy、disabled/pending-migration diagnostics 表达迁移状态，这是正确的 fail-closed 设计。它不应被产品/文档算作 Browser Data 完成，只能算 runtime 迁移样板。下一步应把用户 consent、clear/rebuild、SQLite-backed scan/watch/reconcile 与 official plugin provider 归属补齐。

### 6. `fake-background` 是历史命名债务，不是假实现

`fake-background` / `--fake-*` 出现在 TuffEx surface、CoreBox footer、BoxGridItem 等视觉层。当前语义上是伪元素/层叠背景，不是 fake implementation。问题在于命名不够专业，容易污染审计搜索和开发理解。建议后续新 API 使用 `surface-layer` / `backdrop-layer` 等语义，旧 class 只保留兼容别名。

### 7. `new Function` 与静态 `innerHTML` 仍需边界管理

- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 的 `new Function` 仍属于 Widget runtime sandbox 边界，不能复制到 PreviewSDK 或普通业务 parser。
- `apps/core-app/src/preload/index.ts` 剩余静态 overlay `innerHTML` 是受控 markup，不是动态用户输入路径，优先级低于 dialog/source evidence/平台 evidence。

## 兼容性与架构判断

### 已明显改善的部分

- `@talex-touch/utils/search` 已暴露 `IndexedSource*`、`IndexedSourceAdmission`、task eligibility、Search Provider descriptor/config/manifest helper，减少 CoreApp 与插件各写一套状态字段。
- CoreApp `IndexingRuntime` 已拆出 `SourceDiagnosticsService`、`WatchEventRouter`、`ScanScheduler`、`ReconcileScheduler`、`ReconcileEngine`、`IndexStoreAdapter`、`IndexingRootPolicy`，方向符合 SRP。
- Settings 与 CoreBox no-result 已消费 typed indexing diagnostics，不再直接依赖 provider-private API。
- 18 个 push 插件已补显式 `manifest.searchProviders`，`search.root-results` 权限让根结果写入边界更清楚。
- Everything path filtering 改读 runtime root policy，降低 FileProvider 私有状态耦合。

### 仍需收口的风险

- FileProvider 内部 worker scan、index worker、incremental queue、scan_progress、FTS integrity reset 仍在 provider 内部，runtime store 迁移未完成。
- AppProvider 内部 DB 写入、pending deletion、mdls 与关键词同步后处理仍未完全迁出。
- Windows App indexing / Everything registry PATH / App Paths / bad shortcut filtering 需要 Windows 真机 evidence，不能只凭代码和单元测试宣称完成。
- TuffEx visual smoke 脚本已存在，但真实截图运行证据仍缺，文档应分清“脚本入口已落地”和“视觉验收通过”。
- Legacy alias telemetry 已有，下一步是观察一个 release cycle 的 hit=0，再从 Terminal / Sync 等小面 hard-cut。

## 下一步建议

1. **先补真实 evidence**：Windows App indexing、Everything CLI registry PATH、CoreBox function key、手动文件索引完成通知；TuffEx visual smoke 375/768/1440 light/dark/reduced-motion 截图。
2. **继续 Indexing Runtime 迁移**：优先 File provider 写入边界，逐步把 incremental/full-scan/reconcile side effects 收敛到 runtime store adapter，避免 FileProvider 再膨胀。
3. **清理 UI 语义债务**：从 `FeatureCard`、`CoreBoxRender`、PluginList、SectionItem 等主路径开始，把 `div/span @click` 换成 button/listbox option 或 TuffEx 组件，并补 focus/keyboard 状态。
4. **收口 UI 偏好存储**：建立非敏感 UI preference facade，保留 legacy localStorage 迁移读，避免继续散落直接 `localStorage`。
5. **处理 cloud preset placeholder**：保留 fail-closed，但从 public singleton placeholder 迁到 capability unavailable contract；UI 不展示 coming-soon 空入口。
6. **观察 legacy hard-cut 数据**：记录 alias hit=0 的 release cycle 证据后，Terminal / Sync 先删 legacy listener，再推进 Auth/CoreBox 大面。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES` 与 `docs/INDEX.md`。本轮没有修改运行时代码，也没有改变质量门禁；因此不更新 Roadmap 与 Quality Baseline。
