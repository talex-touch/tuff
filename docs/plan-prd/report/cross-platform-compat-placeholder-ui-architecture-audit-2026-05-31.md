# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-05-31）

> 范围：`apps/core-app`、`apps/nexus`、`packages/*`、`plugins/*`、`docs/plan-prd` 当前 live tree 与未提交工作树。
> 口径：基于 2026-05-30 自动化增量审计继续复核，重点看 UI 完成度、兼容性、占位/伪实现、发布污染风险与下一步架构收口。

## 总结

- **P0 结论**：本轮继续未发现新的生产路径 fixed fake-success、mock 支付 URL、伪成功空 payload 或可消费占位响应。AI retired endpoint `410`、Browser Bookmarks disabled/pending-migration、cloud preset fail-closed 的判断口径保持不变。
- **UI 判断**：整体仍是“专业桌面指令中心”方向，CoreApp 与 Nexus/TuffEx 的完成度在提升；扣分项主要集中在真实视觉 evidence 缺口、旧式非语义点击、分散 UI preference、旧 Markdown/HTML 渲染边界和发布 exports 持续校验。
- **兼容性判断**：未提交的 TuffEx Tabs / Nexus async component name 修复方向正确，能覆盖 Fragment、`v-for` 与 named async component 场景，属于 UI 文档与组件兼容性的正向修复；focused test 已补，仍需 Nexus visual smoke 截图报告作为视觉 evidence。
- **占位与不优雅代码判断**：真正需要关注的不是输入框 placeholder 或 demo mock，而是 `PresetCloudServicePlaceholder` 仍作为 public singleton 暴露、`SharedPluginDetailReadme` 默认未 sanitize、Widget runtime `new Function` 必须继续限制在 sandbox 边界，以及直接 `localStorage` 仍散落在 UI 偏好中。
- **发布风险**：本轮未发现本机绝对路径临时 Vite 配置进入工作树；TuffEx 新增组件子路径 exports、局部 `style.css` 生成脚本与 `audit:exports` 发布校验，当前 build / export audit 已通过，但 build 阶段仍打印既有 `TxDrawer.vue` dts 诊断，需继续按既有债务跟踪。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.5 / 10 | CoreBox、设置诊断、插件 Store 与 Assistant 入口持续变稳。主要扣分是 `div/span @click`、旧 base 组件、直接 `localStorage` UI 偏好与部分 v-html 边界仍未统一。 |
| Nexus 文档与生态站 | 7.9 / 10 | TuffEx composition demo、dashboard sparkline、visual smoke 脚本与 async component name 修复提升文档可用性。真实截图报告、生产/preview operator evidence 与 live governance evidence 仍缺。 |
| TuffEx 组件体系 | 7.9 / 10 | Tabs Fragment/async 子项兼容修复补齐了动态文档场景；Dialog trusted HTML 分流与 MarkdownView sanitize 默认方向正确。仍需 smoke 截图和旧组件语义迁移。 |
| 官方/示例插件 UI | 6.7 / 10 | push provider、network/shell capability 与旧 snippets deprecated 口径清晰。旧观感、裸 console 与执行状态表达还需分批清理。 |
| 架构健壮性 | 7.7 / 10 | Indexing Runtime SDK primitive 持续下沉，FileProvider adapter 责任在收窄。剩余风险是 FileProvider 真实 SQLite/FTS 写入边界、Windows/Everything 真机证据和 legacy alias release-cycle 观察。 |

整体不是视觉“难看”，而是产品核心体验已具备专业基调，但证据链和旧边界还没有完全跟上。下一阶段继续做真实 evidence、语义控件、渲染安全边界和 runtime store 迁移，比大规模重绘更有价值。

## 本轮代码证据

### 1. TuffEx Tabs 动态子项兼容修复方向正确

当前未提交改动包含：

- `packages/tuffex/packages/components/src/tabs/src/TxTabs.vue`
- `packages/tuffex/packages/components/src/tabs/__tests__/tabs.test.ts`
- `apps/nexus/app/plugins/tuffex.ts`
- `packages/tuffex/CHANGELOG.md`

判断：

- `TxTabs` 新增 Fragment 展开与组件名识别后，能覆盖 `v-for` 生成的 `TxTabItem` / `TxTabItemGroup`。
- Nexus 异步注册 TuffEx 组件时给 async component 补 `name`，能避免 `defineAsyncComponent` 包装后子项组件名丢失，从而避免文档 demo 显示 `No tab selected`。
- 这是 UI 完善度和文档可用性的正向修复，符合 KISS：只补 slot normalization 与 async component name，不引入新的 tab registry 或复杂上下文协议。

合并前建议运行：

```bash
pnpm -C "packages/tuffex" exec vitest run "packages/components/src/tabs/__tests__/tabs.test.ts"
pnpm -C "apps/nexus" run visual:smoke:tuffex
```

### 2. TuffEx 子路径 exports 与局部样式入口已补发布校验

证据：

- `packages/tuffex/package.json`
- `packages/tuffex/packages/components/vite.config.js`
- `packages/tuffex/packages/script/build/component-styles.ts`
- `packages/tuffex/packages/script/build/index.ts`
- `packages/tuffex/scripts/audit-package-exports.mjs`
- `apps/core-app/src/renderer/src/modules/tuffex/index.ts`

判断：

- `@talex-touch/tuffex/<component>` 与 `<component>/style.css` 现在有真实 dist 产物和 audit 脚本校验，不再只是文档建议或 tsconfig alias。
- Core App 受控注册已改为从组件子路径动态加载，避免少量组件注册触发根入口全量导出。
- `pnpm -C "packages/tuffex" run build` 和 `pnpm -C "packages/tuffex" run audit:exports` 已通过；build 仍打印既有 `TxDrawer.vue` dts TS7022/TS7024 诊断，但退出码为 0。

建议：

- 保留 `audit:exports` 作为 TuffEx 发布前校验，避免 exports 指向缺失 dist 文件。
- 后续只迁移对 chunking 有实质收益的业务根入口导入，不做全仓机械替换。
- 单独跟进 `TxScroll` / `TxCodeEditor` / `TxFlipOverlay` / `TxBaseAnchor` / `TxRadioGroup` 等重组件拆分，不把它混进 Tabs 修复。

### 3. `SharedPluginDetailReadme` 仍默认未 sanitize

证据：

- `packages/utils/renderer/shared/components/SharedPluginDetailReadme.vue`

该组件默认执行 `marked.parse(markdown)` 后 `v-html`，只通过注释要求调用方保证内容可信。相比 `packages/tuffex/packages/components/src/markdown-view/src/TxMarkdownView.vue` 已默认 `sanitize: true` 并延迟到 sanitizer ready 后输出，这里是更弱的边界。

判断：

- 如果 README 来源只来自官方或已审核 Store 内容，短期不是 P0。
- 但组件位于 `packages/utils/renderer/shared`，天然会被多个宿主复用；默认不 sanitize 是不优雅且易误用的 API 形状。

建议下一批改为：

- 复用 TuffEx `TxMarkdownView` 或在 shared 组件内默认 DOMPurify sanitize。
- 仅通过显式 `trusted` / `sanitize={false}` opt-out 渲染未净化 HTML。

### 4. 直接 `localStorage` 仍集中在 UI 偏好

证据：

- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginFeatures.vue`
- `apps/core-app/src/renderer/src/components/tuff/TuffGroupBlock.vue`
- `packages/tuffex/packages/components/src/group-block/src/TxGroupBlock.vue`
- `apps/core-app/src/renderer/src/modules/lang/language-preferences.ts`

判断：

- 当前没有发现 token、secret、业务同步明文写入 `localStorage` 的生产路径。
- 但 UI 偏好散落会绕过 hydration 与 storage facade，长期会造成迁移、清理和跨窗口同步口径不一致。

建议：

- 建立 `useUiPreference()` / `UiPreferenceStorage`，只存非敏感 UI 状态。
- 保留 legacy `localStorage` read + migrate，但禁止新增直接调用。

### 5. UI 语义债务仍在主路径

高信号样例：

- `apps/core-app/src/renderer/src/components/plugin/FeatureCard.vue`
- `apps/core-app/src/renderer/src/components/render/CoreBoxRender.vue`
- `apps/core-app/src/renderer/src/views/base/application/AppList.vue`
- `apps/core-app/src/renderer/src/views/base/styles/SectionItem.vue`
- `apps/core-app/src/renderer/src/views/base/plugin/PluginNew.vue`
- `apps/core-app/src/renderer/src/components/plugin/layout/PluginList.vue`

判断：

- overlay `@click.self` 属于合理模式，不应误报。
- 可点击 item/card/button 应逐步换成 `button`、`role="button"` + keyboard handler，或 TuffEx 现有组件，并补 focus-visible。

### 6. Cloud preset placeholder 仍是 fail-closed，但 API 形状应收口

证据：

- `packages/utils/common/storage/entity/preset-cloud-api.ts`

`PresetCloudServicePlaceholder` 所有云端操作都抛出 `Cloud preset service is not yet available`，`getStatus()` 返回 `available: false`。这不是 fake-success，但 `presetCloudService` public singleton 容易让 UI 或调用方误以为能力只是“即将上线”。

建议：

- 改成 capability unavailable contract，状态使用 `not-shipped` / `not-configured` / `disabled` 等机器可读 reason。
- UI 默认隐藏入口或展示明确不可用原因，不用泛化 coming-soon 文案。

### 7. Widget runtime `new Function` 仍需保持隔离边界

证据：

- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`

当前 `new Function` 只在 Widget sandbox 评估 compiled widget code 时使用，并注入 sandbox window/global/storage/document 等对象。这条边界必须继续保留在 Widget runtime safety 清单内，不能扩散到 PreviewSDK、搜索 parser 或普通业务逻辑。

### 8. `v-html` 风险已经分层，但仍有旧入口待统一

已改善：

- TuffEx/CoreApp dialog 已区分 `message` 纯文本与 `messageHtml` trusted-only。
- `TxMarkdownView` 默认 sanitize。
- TextPreview / CoreIntelligenceAnswer / BoxItem highlight 具备 escape 或格式化边界。

仍需跟进：

- Store README shared renderer 默认未 sanitize。
- Update release notes 使用轻量 Markdown replace + `v-html`，应迁到统一 Markdown sanitizer。
- `MainBoxHeader` completionDisplay 仍走 `v-html`，需要确认上游始终 escape 或改为结构化高亮 token。

## 兼容性与架构判断

### 已改善

- TuffEx Tabs 动态子项识别修复解决了 Vue Fragment / async component 包装后组件名丢失的真实 UI 兼容问题。
- Indexing Runtime V1 的 SDK primitive 下沉仍保持正确方向：task gate、diagnostics summary、snapshot cache、profile diagnostics、write flush/buffer/runtime emitter 等让 FileProvider adapter 继续变薄。
- Search Provider 与 indexed source manifest intent 已让 Browser Data 官方插件生命周期有了更清晰的权限和归属口径。

### 未闭环

- Windows App indexing、Everything registry PATH、App Paths、bad shortcut filtering 仍缺 Windows 真机 evidence。
- TuffEx visual smoke 脚本入口存在，但缺真实截图报告，不能把“脚本已落地”写成“视觉验收已通过”。
- FileProvider 的 DB persist、scan_progress 表结构、worker readiness、SearchIndex/FTS 语义仍未完全迁到 runtime store/task 边界。
- Legacy alias telemetry 需要至少一个 release cycle hit=0 证据，再从 Terminal / Sync 等小面开始 hard-cut。

## 下一步建议

1. **先做合并前卫生**：TuffEx Tabs focused test、CoreApp node/web typecheck、TuffEx build、TuffEx export audit 与 `git diff --check` 已通过；若要收 Tabs 修复，还需跑 Nexus visual smoke 并产出截图/JSON 证据。
2. **补真实 evidence**：Windows App indexing / Everything registry PATH / CoreBox function key / 手动索引通知；TuffEx visual smoke 生成截图与 JSON 报告。
3. **收 Markdown/HTML 边界**：优先把 `SharedPluginDetailReadme` 和 Update release notes 迁到默认 sanitize 的统一 renderer。
4. **推进 UI 语义债务**：从 FeatureCard、CoreBoxRender、PluginList、SectionItem 开始做小切片，避免一次性重写 UI。
5. **继续 File runtime store 迁移**：把 FileProvider 剩余 DB persist、scan_progress、integrity reset durable history 按 adapter 边界迁出，不改变搜索行为。
6. **收 cloud preset API 形状**：从 public placeholder singleton 改为 capability unavailable contract，避免 coming-soon 入口污染产品完成度。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES` 与 `docs/INDEX.md`。本轮没有修改运行时代码，也没有改变 `quality:pr` / `quality:release` 门禁，因此不更新 Roadmap 与 Quality Baseline。
