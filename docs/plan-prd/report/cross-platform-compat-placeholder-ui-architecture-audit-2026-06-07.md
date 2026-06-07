# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-06-07）

> 范围：`apps/core-app`、`apps/nexus`、`packages/tuffex`、`packages/intelligence-uikit`、`packages/utils`、`packages/tuff-cli`、`plugins/*` 与 `docs/plan-prd` 当前 live tree。
> 关系：承接 2026-06-06 审计，重点复核 2026-06-07 新增 CLI publish auth 修复、当前版本事实、UI 完成度、占位/假实现、HTML/动态执行边界与下一步执行顺序。

## 总结

- **P0 结论**：本轮继续未发现新的生产路径 fixed fake-success、mock payment URL、伪成功空 payload 或可消费占位业务响应。`touch-intelligence` 的 placeholder item 仍是 `status: "empty"` 空输入提示，不是成功结果。
- **当前基线事实**：当前 `HEAD -> master, origin/master, origin/HEAD` 为 `686ec013e fix(cli): refresh publish auth before upload`，`origin/master...HEAD` 为 `0 0`，工作区从干净状态开始。根目录与 CoreApp 版本已是 `2.4.11-beta.7`，`@talex-touch/tuff-cli` 已准备到 `0.0.7`。
- **新增代码兼容性重点**：`tuffcli publish` 现在会先跑 onboarding 与远端 auth probe；交互式 publish 在旧 token 被拒绝时会清理陈旧 auth 并走已有 browser OAuth device flow，非交互模式仍 fail-closed。这比在 publish core 中直接吞掉 401 更稳，保留 CI 行为。
- **仍需关注的 CLI 长尾**：publisher auth probe 会携带 CLI device headers；实际 package upload POST 目前只带 `Authorization`。当前 Nexus `versions.post` 只要求 `requireAuthOrApiKey(event, ['plugin:publish'])`，所以不是当前 bug；但若后续发布接口也引入设备态/风控校验，应把 POST header 口径与 probe 对齐。
- **UI 方向判断**：Tuff 是本地优先的桌面指令中心，UI 应继续走高密度、可扫描、键盘优先、低装饰工作台路线。`ui-ux-pro-max` 检索也给出 Data-Dense Dashboard 与 Vue semantic element 规则；不建议转成营销页式 hero、过多装饰卡片或单色炫技风格。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 8.2 / 10 | CoreBox、Settings、AI provider config、FlipDialog 与 Widget diagnostics 已更接近专业工作台；剩余短板是主路径 clickable `div/span/i`、部分 focus/keyboard 细节、Windows/macOS packaged evidence。 |
| Nexus 文档与生态站 | 8.6 / 10 | Docs SEO/noindex、release notes sanitizer、TuffEx docs 推荐导入与 DatePicker docs 已改善；仍缺新一轮 preview/production visual smoke 与 provider registry 生产/preview operator evidence。 |
| TuffEx 组件体系 | 8.8 / 10 | 子路径 exports、`base.css`、局部 style、dialog trusted HTML、DatePicker adaptive field 与 audit 脚本已形成组件库质量闭环；下一步更适合补语义控件和 visual regression，而不是继续堆新组件。 |
| `intelligence-uikit` | 7.6 / 10 | Playground mock 属开发态，消费侧按需 TuffEx 样式方向正确；仍需 package typecheck 与视觉截图证据。 |
| 官方/示例插件 UI | 6.8 / 10 | `touch-intelligence` 不是假实现；旧 snippets 已 hidden/deprecated。`touch-music` 仍有 full TuffEx style、Vite starter asset 与多个非语义点击控件，是当前最明确的不优雅 UI 长尾。 |
| 架构健壮性 | 8.4 / 10 | 代码基线与远端同步，CLI publish auth 修复保持交互/CI 分层；剩余风险集中在 UI semantics、sample plugin polish、平台真机 evidence、File write/store boundary 与 Browser Bookmarks official lifecycle。 |

## 本轮代码证据

### 1. 当前版本与工作区已校准到 2026-06-07

证据：

- `git rev-parse --short HEAD` 为 `686ec013e`。
- `git rev-list --left-right --count origin/master...HEAD` 为 `0 0`。
- `package.json` 与 `apps/core-app/package.json` 版本为 `2.4.11-beta.7`。
- `packages/tuff-cli/package.json` 版本为 `0.0.7`。

判断：

- 旧文档中的 `2.4.11-beta.6`、`ea0c2c93c` 或 `2e49f7d7d` 不能再作为当前 live tree 状态。
- 当前不再需要围绕 dirty worktree 做治理，下一步应继续按 related-only 小切片推进高信号债务。

### 2. CLI publish auth 修复是兼容增强，不是绕过

证据：

- `packages/tuff-cli/src/bin/tuff.ts` 的 `runPublishWithTracking()` 先执行 `ensureOnboarding()`，再执行 `ensureAuthenticated({ reloginStrategy: 'oauth' })`，最后才 `trackRepository('publish')` 与 `runPublish()`。
- `ensureAuthenticated()` 对已有 token 会先 `fetchAuthProbe()`；失败后在 `TUFF_NON_INTERACTIVE=1` 下直接返回 false，交互式 publish 才清理旧 token 并进入 `runDeviceAuthLogin()`。
- API key token 仍走 publisher auth probe；普通 app JWT 走 account profile probe。
- `packages/tuff-cli-core/src/publish.ts` 仍在真正发布前执行 `preflightPublisherAccess()`，并对 401/403 fail-closed。

判断：

- 该修复没有把失败 publish 包装成成功，也没有绕过 `plugin:publish` scope。
- 交互式体验更优雅：旧 token 被拒绝时可以直接刷新，不需要用户先手动 logout/login。
- 非交互 CI 仍不会自动开浏览器，符合发布自动化边界。

长尾：

- `publishPackage()` 上传 POST 只传 `Authorization`；probe 与 dashboard list 会传 device headers。当前 Nexus 版本发布接口没有额外设备 header 要求，所以不阻塞；后续若发布风控升级，应把 POST headers 与 `requestJsonWithAuth()` 对齐。

### 3. i18n 与 HTML 边界未发现回潮

证据：

- `window.$t` / `window.$i18n` 扫描无命中。
- `BoxItem.vue`、`TextPreview.vue` 与 `CoreIntelligenceAnswer.vue` 仍属于先 escape 再输出 highlight / answer HTML。
- `TxMarkdownView.vue` 默认 sanitize；Nexus notes `notesHtml` 已经过 `sanitizeMarkdownHtml()`。
- TuffEx/CoreApp dialog family 已使用 `TrustedDialogHtml` 与 `asTrustedDialogHtml()` 标记 HTML props。

判断：

- 当前不应把 escaped highlight、safe Markdown 或 AI answer escape 误判成假实现或 XSS 回潮。
- 新增业务 HTML 输出仍必须走 sanitizer 或 branded trusted type，不能直接把任意字符串塞进 `v-html`。

### 4. Widget runtime 动态执行仍是声明边界

证据：

- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 仍在 widget runtime 边界使用 `new Function(...)`。
- 当前已新增 `WidgetSandboxEvidence`，覆盖 declared / allowed / blocked / undeclared dependencies、storage facade、window boundary 与 injected globals。

判断：

- 这不是 PreviewSDK 动态执行回潮；PreviewSDK 仍保持纯 payload 与 parser/ability 边界。
- 后续治理应补 navigator/worker/postMessage 等扩展边界和真实示例插件 packaged/dev source 手动验收，而不是把 `new Function` 从 widget runtime 中机械删除。

### 5. 占位、假的、不优雅代码分层

不构成生产假实现：

- UI input `placeholder`、TuffEx loading/empty/skeleton、测试 mock、playground mock。
- `plugins/touch-intelligence/index.js` 的 `buildPlaceholderItem()` 返回 `status: "empty"`，只是 AI Ask 空输入态。
- `touch-text-snippets` / `touch-code-snippets` 是 hidden/deprecated legacy placeholder manifest。
- `PresetCloudUnavailableService` 仍是 fail-closed unavailable contract。

仍不优雅但非 P0：

- `plugins/touch-music/src/main.js` 仍导入 `@talex-touch/tuffex/style.css` 与根入口组件。
- `plugins/touch-music/index.html` 与 `plugins/touch-image/index.html` 仍引用 `/vite.svg`，对应 public starter asset 仍存在。
- `plugins/touch-translation/src/composables/useTranslationProvider.ts` 注释仍写 localStorage，但实际已使用 plugin storage + plugin secret，需要修正文档口径。
- 主路径仍有若干 clickable `div/span/i/li`：CoreApp `CoreBoxRender`、PluginList add/clear、layout controller upgrade、TuffEx NavBar、Nexus LanguageToggle、`touch-music` player controls 等；mask/backdrop `@click.self` 可单独分层。

## 下一步建议

1. **UI semantics 小切片**：优先 CoreBoxRender、PluginList add/clear icon、Nexus LanguageToggle、TuffEx NavBar、`touch-music` player controls；保留 overlay/backdrop 分层。
2. **示例插件清理**：`touch-music` 迁到 TuffEx `base.css` + 子路径组件导入，移除 Vite starter asset；`touch-image` 同步移除 starter favicon；`touch-translation` 修正 storage 注释。
3. **平台 evidence**：补 Windows App indexing、Everything registry PATH、CoreBox function key、手动索引完成通知、macOS packaged Electron 的 release-blocking evidence。
4. **CLI publish evidence**：对 `tuffcli publish` 增加过期 app JWT 交互刷新、API key publish、`TUFF_NON_INTERACTIVE=1` fail-closed 的 focused/端到端证据；评估 upload POST 是否应携带 device headers。
5. **回到 P1-APP-DATA**：UI/示例插件小切片后继续 File write/store boundary、Browser Bookmarks official plugin lifecycle、Everything productionization、Quicklinks persistent feed/UI evidence。

## 验证

- 已执行静态扫描：`window.$t` / `window.$i18n`、`v-html`、`new Function`、`success: true`、`status: "success"`、`placeholder`、`mock`、`not implemented`、TuffEx full style、Vite starter asset、clickable non-semantic controls、storage/sync/secret 关键词。
- 已复核 `packages/tuff-cli` publish auth 入口、`packages/tuff-cli-core` publisher preflight 与 Nexus dashboard plugin version API。
- 已确认当前 git 状态与版本事实：`HEAD=686ec013e`，`origin/master...HEAD=0 0`，root/CoreApp `2.4.11-beta.7`。
- 本轮未重跑 package typecheck/build/test；新增代码验证以 `CHANGES` 中 CLI lint 与 `git diff --check` 记录为准。当前文档同步后会再执行 `git diff --check`。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES`、`docs/INDEX.md`、Roadmap 与 Quality Baseline。同步内容只修正事实状态、审计结论与下一步顺序，不改变版本目标或质量门禁。
