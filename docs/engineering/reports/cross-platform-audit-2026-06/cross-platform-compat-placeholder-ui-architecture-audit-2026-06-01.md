# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-06-01）

> 范围：`apps/core-app`、`apps/nexus`、`packages/*`、`plugins/*`、`docs/plan-prd` 当前 live tree 与未提交工作区。
> 口径：承接 2026-05-31 增量审计，重点复核 UI 完成度、真实视觉证据、兼容性、占位/伪实现、安全边界与下一步文档/工程收口。

## 总结

- **P0 结论**：本轮继续未发现新的生产路径 fixed fake-success、mock 支付 URL、伪成功空 payload 或可消费占位响应。旧 AI 兼容入口 HTTP `410`、Browser Bookmarks 显式 consent gate、Quicklinks 空源 degraded 和 cloud preset fail-closed 的口径保持不变。
- **UI 判断**：整体仍是专业工具型桌面指令中心方向，适合走高密度、可扫描、低装饰的信息架构。Nexus/TuffEx 侧已有 30/30 visual smoke 截图/JSON evidence，UI 证据链明显改善；CoreApp 主产品仍受旧式 `div/span @click`、局部 `v-html`、分散 `localStorage` 偏好和旧 base 组件拖累。
- **兼容性判断**：当前最大兼容缺口仍不是代码里有没有 platform branch，而是 Windows/macOS 真机 evidence 未闭环。Windows App indexing、Everything registry PATH、CoreBox function key hardening、手动索引完成通知仍不能只靠 macOS/CI 推断。
- **占位与不优雅代码判断**：输入框 placeholder、demo mock、测试 mock 不是问题；真正需要治理的是 public placeholder API、默认未 sanitize 的共享 Markdown renderer、preload loading overlay 的 `innerHTML`、Nexus `deviceId` 写入 `localStorage` 的安全口径，以及 Widget runtime `new Function` 的边界持续证明。
- **下一步判断**：优先级应从“继续泛扫 placeholder”切到“真实证据 + 明确边界 + 小切片迁移”。最合适的下一步是收口 File write/store boundary、Windows evidence、Markdown/HTML 安全渲染、UI 语义控件和 Nexus device identity 持久化口径。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.4 / 10 | CoreBox、Settings diagnostics、Store、Assistant/Intelligence 入口都具备可用骨架，但视觉一致性仍被旧 base/tuff 组件、`div/span @click`、局部无语义交互与分散偏好存储拉低。 |
| Nexus 文档与生态站 | 8.1 / 10 | TuffEx composition demo、ECharts-backed 小趋势图、async component name 修复与 visual smoke evidence 让文档站从“可读”走向“可验收”。生产/preview operator evidence 与 Data Governance live evidence 仍是短板。 |
| TuffEx 组件体系 | 8.0 / 10 | 子路径 exports、局部样式、on-demand style plugin、`audit:size/exports/types` 与 Tabs 动态子项兼容是正向进展。下一步应继续拆重组件内部模型，保持按需入口不回涨。 |
| 官方/示例插件 UI | 6.7 / 10 | snippets legacy 已 hidden/deprecated/replacedBy，Browser Data/Bookmarks 权限口径更清楚。`touch-music` 旧视觉命名、示例插件裸 console、部分执行状态表达仍偏 demo 感。 |
| 架构健壮性 | 7.8 / 10 | Indexing Runtime SDK primitive 与 FileProvider thin adapter 方向正确。短板仍是 SQLite/FTS 写入边界、durable job history、Windows evidence、legacy alias release-cycle hit=0 观察。 |

结论：界面不是“难看”，而是“专业产品方向成立，但证据链和旧组件迁移还没有完全跟上”。老板如果想提升观感，优先做语义控件、视觉 evidence、状态表达和 TuffEx 组件统一，比重画整套皮肤更稳。

## 本轮代码证据

### 1. TuffEx visual smoke 已补真实截图/JSON evidence

证据：

- `output/playwright/tuffex-visual-smoke/2026-06-01/tuffex-composition-smoke-report.json`
- `apps/nexus/scripts/tuffex-visual-smoke.mjs`

报告显示：

- 覆盖 demo：`data-operations`、`navigation-shell`、`feedback-task-center`、`permission-orchestration`、`release-policy`
- 覆盖宽度：`375`、`768`、`1440`
- 覆盖主题：light / dark
- reduced motion：开启
- 结果：`total: 30`、`passed: 30`、`failed: 0`

判断：

- 这补上了 2026-05-31 报告里“脚本存在但缺真实视觉 evidence”的缺口。
- 该 evidence 适合作为 TuffEx composition docs 的 focused evidence，不应升级为 `quality:pr` 或 `quality:release` 全局门禁。

### 2. `SharedPluginDetailReadme` 默认未 sanitize 仍是高信号 P1

证据：

- `packages/utils/renderer/shared/components/SharedPluginDetailReadme.vue`

当前逻辑默认 `marked.parse(markdown)` 后 `v-html`，只用注释要求调用方保证可信：

- 对官方审核 README 短期不是 P0。
- 对共享组件 API 形状不优雅，因为默认不安全、opt-in 安全的设计容易被复用方误用。

建议：

1. 默认复用 TuffEx `TxMarkdownView` 或共享 sanitizer。
2. 只允许显式 `trusted` / `sanitize={false}` opt-out。
3. 把 Store README、Update release notes、AI markdown display 纳入同一安全渲染口径。

### 3. preload loading overlay 仍有 `innerHTML`，但风险低于 debug panel

证据：

- `apps/core-app/src/preload/index.ts`

当前 loading overlay 用 `oStyle.innerHTML = styleContent` 和 `container.innerHTML = ...` 创建启动遮罩。和已清理的 debug panel 不同，这里的内容主要来自本地常量、className 与 raw logo，不接收用户日志或远端 payload。

判断：

- 当前不按 P0 处理。
- 但 preload 是高敏感边界，后续应改为 `textContent` + `createElement`，避免后续维护时把动态消息塞回 HTML 模板。

### 4. Nexus `deviceId` 与 privacy settings 写入 `localStorage` 需要安全口径收口

证据：

- `apps/nexus/app/composables/useDeviceIdentity.ts`
- `apps/nexus/app/pages/dashboard/privacy.vue`

判断：

- `deviceId` 当前只是设备标识，不等同于密钥材料；未发现用作派生密钥或加密根的路径。
- 但质量基线已经明确：`deviceId` 只能做设备标识或 AAD，不能作为密钥材料。Nexus 把 device identity 放入 `localStorage` 容易让后续代码误解其安全等级。
- privacy settings 放在 `localStorage` 也会绕过服务端策略与多端一致性；若只是本地 UI 偏好，需要显式命名为 local preference；若影响真实隐私开关，应走账号/设备配置 API。

建议：

1. 为 `useDeviceIdentity()` 补注释/类型或改名，明确 local web device marker，不是 secret。
2. 若要参与 sync/auth 风控，迁到 server-backed device registration 或 secure reference。
3. privacy settings 区分本地 UI 偏好与真实隐私策略，避免 UI 显示保存但服务端未生效。

### 5. 直接 `localStorage` UI 偏好仍分散

证据样例：

- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffGroupBlock.vue`
- `packages/tuffex/packages/components/src/group-block/src/TxGroupBlock.vue`
- `apps/core-app/src/renderer/src/modules/lang/language-preferences.ts`

判断：

- 未发现 token、API key、provider secret 进入这些路径。
- 但直接调用分散在组件里，会绕过 storage hydration、跨窗口同步和迁移策略。

建议：

- 建立 `UiPreferenceStorage` / `useUiPreference()`，只允许非敏感 UI 状态。
- 保留 legacy read + migrate，但禁止新增直接 `localStorage`。

### 6. UI 语义债务仍影响专业度和可访问性

高信号样例：

- `apps/core-app/src/renderer/src/components/plugin/FeatureCard.vue`
- `apps/core-app/src/renderer/src/components/render/CoreBoxRender.vue`
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`
- `apps/core-app/src/renderer/src/views/base/styles/SectionItem.vue`
- `apps/core-app/src/renderer/src/views/base/plugin/PluginNew.vue`

判断：

- overlay `@click.self` 和受控容器点击不应误报。
- 可点击 card/item/back icon 应逐步改为 `button`、TuffEx 组件，或至少补 `role="button"`、`tabindex`、keyboard handler 与 focus-visible。
- 这类债务直接影响“好不好用”和“是否像专业桌面产品”，优先级高于换色或大规模重绘。

### 7. Cloud preset public placeholder 仍应改为 capability unavailable contract

证据：

- `packages/utils/common/storage/entity/preset-cloud-api.ts`

当前 `PresetCloudServicePlaceholder` 所有云操作都抛 `Cloud preset service is not yet available`，`getStatus()` 返回 `available: false`。

判断：

- 不是 fake-success，因为不会返回可消费成功数据。
- 但 `presetCloudService` public singleton + `coming soon` 文案会污染 API 语义，让调用方误以为只是临时未上线。

建议：

- 改为机器可读 unavailable contract：`not-shipped` / `not-configured` / `disabled`。
- UI 默认隐藏入口或显示明确 reason，不暴露泛化 coming-soon 能力。

### 8. Widget runtime `new Function` 仍必须限制在 sandbox 边界

证据：

- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`

判断：

- 当前 `new Function` 是 Widget runtime sandbox 的已知动态执行边界，不属于 PreviewSDK 或普通业务逻辑。
- 必须继续防止扩散：新增 preview ability、搜索 parser、AI formatter、Markdown renderer 不应引入同类动态执行。

### 9. legacy snippets placeholder 已降权，不再按可见空插件阻塞

证据：

- `plugins/touch-text-snippets/manifest.json`
- `plugins/touch-code-snippets/manifest.json`

当前已标记：

- `deprecated: true`
- `hidden: true`
- `replacedBy: "touch-snippets"`
- `features: []`

判断：

- 这已经从“可见空 feature 插件污染 Store”降为 legacy migration marker。
- 后续只需确保 Store / inventory 默认不展示 hidden deprecated 插件，并避免新增同类空 feature placeholder。

## 兼容性与架构判断

### 已改善

- TuffEx composition visual smoke 有了真实截图/JSON evidence。
- TuffEx Tabs 动态子项、async component name、子路径 exports、局部样式和按需注册方向正确。
- Indexing Runtime SDK primitive 下沉仍保持正确方向，FileProvider adapter 继续变薄。
- Browser Bookmarks / Browser Data 的 `network.internet` 与 high-privacy consent 口径更清楚。

### 未闭环

- Windows App indexing、Everything registry PATH、App Paths、bad shortcut filtering、CoreBox function key hardening、手动索引完成通知仍缺 Windows 真机 evidence。
- FileProvider SQLite/FTS 真实写入、`scan_progress` 表、worker readiness、SearchIndex/FTS 语义仍未完全迁到 runtime store/task 边界。
- Nexus Data Governance 仍缺生产/preview operator evidence、live send、live object storage、production D1 migration/backfill 与真实 provider quota。
- CoreApp markdown/html 渲染边界仍分散，`SharedPluginDetailReadme` 和 Update release notes 应优先统一。
- `quality:release` 仍按全仓 lint/build 另行收口；本轮审计不改变门禁。

## 下一步建议

1. **先收工作区**：当前本地 `master` 领先远端 48 个提交，dirty 范围横跨 Indexing Runtime、TuffEx/Nexus、renderer、`intelligence-uikit`。先按 related-only 分批确认未跟踪文件归属，不要继续叠大切片。
2. **补 Windows evidence**：Windows App indexing、Everything registry PATH、CoreBox function key、手动索引完成通知是下一批最高价值兼容证据。
3. **收 Markdown/HTML 安全边界**：`SharedPluginDetailReadme` 默认 sanitize，Update release notes 迁到统一 Markdown renderer，preload loading overlay 改 `textContent/createElement`。
4. **收 UI 语义债务**：从 `FeatureCard`、`AppList`、`SectionItem`、`PluginNew` 这些主路径开始，替换可点击 `div/span`，补键盘与 focus。
5. **推进 File write/store boundary**：继续把 FileProvider 写入、progress、integrity reset 收敛到 runtime store/task，不改变 SQLite/FTS/SearchIndex 行为。
6. **整理 localStorage 口径**：CoreApp UI preference 走 facade；Nexus device identity/privacy settings 区分 local marker、本地偏好和服务端策略。
7. **收 cloud preset API 形状**：用 capability unavailable / hidden contract 替代 public placeholder singleton。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES` 与 `docs/INDEX.md`。本轮未修改运行时代码，也未改变 `quality:pr` / `quality:release` 门禁，因此不更新 Roadmap 与 Quality Baseline。
