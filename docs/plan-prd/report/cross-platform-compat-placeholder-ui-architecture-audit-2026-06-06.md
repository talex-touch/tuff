# 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计（2026-06-06）

> 范围：`apps/core-app`、`apps/nexus`、`packages/tuffex`、`packages/intelligence-uikit`、`packages/utils`、`plugins/*` 与 `docs/plan-prd` 当前 live tree。
> 关系：承接 2026-06-04/05 增量审计，重点复核当前真实 worktree、UI 完成度、HTML trusted boundary、示例插件遗留、占位/假实现与下一步执行顺序。

## 总结

- **P0 结论**：本轮继续未发现新的生产路径 fixed fake-success、mock payment URL、伪成功空 payload 或可消费占位业务响应。`touch-intelligence` 的 placeholder item 仍是 `status: "empty"` 的空输入提示，不是成功结果。
- **当前工作区事实已变化**：截至 2026-06-06，上一条已推送代码基线为 `ea0c2c93c test(search): add preview sdk benchmark command`，`HEAD -> master, origin/master, origin/HEAD` 且 `origin/master...HEAD` 为 `0 0`；当前 live tree 已进入 Widget sandbox evidence 与 docs/audit 同步小切片，不再是此前“314 tracked + 25 untracked dirty worktree”的大脏切片。
- **验证环境口径**：默认 automation shell 仍是 Codex Node `v24.14.0`，且无裸 `pnpm` / `corepack`；但 `/tmp/talex-touch-node22-adhoc` 仍存在临时 ad-hoc signed Node `22.16.0` 和 pnpm `10.32.1` shim。本轮复核只追加静态扫描与文档事实同步；dialog / Widget focused test 与 typecheck 证据以 `CHANGES` 中当前切片记录为准。
- **UI 方向判断**：Tuff 作为桌面指令中心，仍应坚持高密度、可扫描、键盘优先、低装饰的工作台风格。`ui-ux-pro-max` 的结果也指向 data-dense dashboard 与 Vue semantic element 规则；不建议把 CoreApp / Dashboard 改成大 hero、装饰卡片或营销页式布局。
- **当前最值得继续的代码治理**：CoreApp/TuffEx dialog `messageHtml` 可信 HTML 类型边界与 Widget runtime sandbox evidence 已进入 focused evidence 切片；下一批高信号治理收敛为主路径 `div/span @click` 语义控件收口、`touch-music` 示例插件全量 TuffEx 样式入口与 dev asset 清理、Windows/macOS 真机 evidence，以及 Widget navigator/worker/postMessage 等扩展边界长尾。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 8.1 / 10 | 主线适配度正确：CoreBox、Settings、provider/source diagnostics 与 AI 入口都是工作台形态；dialog trusted HTML 与 Widget sandbox evidence 已进入 focused 切片，剩余短板是部分旧式 clickable div/span、平台截图与 packaged Electron 体验证据。 |
| Nexus 文档与生态站 | 8.5 / 10 | Docs SEO/noindex、TuffEx docs 推荐导入和 DatePicker PC/mobile 文档近期继续改善；仍需新一轮 Nexus/TuffEx visual smoke 或 production/preview 页面 evidence。 |
| TuffEx 组件体系 | 8.7 / 10 | `base.css`、组件子路径、局部 style、audit 脚本、DatePicker adaptive field 与 dialog trusted HTML API 都在往可复用组件库方向走；主要缺口是少数组件语义/a11y 细节与生产视觉证据。 |
| `intelligence-uikit` | 7.5 / 10 | Playground mock 属开发态；消费侧已转向按需 TuffEx 样式，但仍需要 package typecheck 与视觉截图证据。 |
| 官方/示例插件 UI | 6.8 / 10 | `touch-intelligence` 不是假实现；旧 snippets 已 hidden/deprecated。`touch-music` 仍有全量 TuffEx 样式入口、Vite starter asset 和较多非语义点击控件，适合作为 P2 polish。 |
| 架构健壮性 | 8.3 / 10 | 当前已推送代码基线回到同步状态，分批提交纪律已兑现。剩余风险从“混杂 dirty slice”转为“UI semantics/platform evidence/示例插件质量/Widget 扩展边界长尾”。 |

## 本轮代码证据

### 1. 已推送代码基线已回到同步状态

证据：

- `git rev-list --count --left-right origin/master...HEAD` 为 `0 0`。
- `git show --stat --oneline --decorate -1` 显示 `ea0c2c93c (HEAD -> master, origin/master, origin/HEAD) test(search): add preview sdk benchmark command`。
- 本切片只同步审计文档，不包含运行时代码改动。

判断：

- 之前“先清理大脏 worktree”的下一步已完成，不应继续把它作为当前 blocker。
- 下一步可以直接按高信号风险推进：UI 语义控件、示例插件清理、平台真机 evidence、File write/store boundary。

### 2. 未发现 i18n 直接访问回潮

证据：

- 本轮扫描 `window.$t` / `window.$i18n` 无生产命中。

判断：

- 前端 i18n 仍保持 hook/helper 口径，未发现违反当前规则的新回潮。

### 3. HTML 渲染点需要继续分层，而不是一刀切删除

低风险或已有防护：

- `BoxItem.vue` 的 title highlight 先 escape 文本再拼 `<span>`，属于 escaped highlight。
- `TextPreview.vue` 对文件内容和 query 都做 escape 后再 `<mark>` 高亮。
- `CoreIntelligenceAnswer.vue` 先 escape AI answer，再把换行替换为 `<br />`。
- `TxMarkdownView.vue` 默认 `sanitize: true`，动态加载 DOMPurify 后才输出 `safeHtml`；sanitizer 不可用时输出空字符串。
- Nexus `CodeRenderer.vue` fallback 会 escape code；highlight.js 输出用于代码高亮，但 CDN script 本身仍是外部依赖风险，应保持 docs-only 分层。

已进入 focused 切片：

- CoreApp legacy dialog 与 TuffEx dialog family 已补 `TrustedDialogHtml` branded type 与 `asTrustedDialogHtml()` 显式 marker，让 `message` 继续作为默认纯文本路径，`messageHtml` 只能由可信调用点显式标记后进入 `v-html`。
- Focused tests 已覆盖 TuffEx dialog 与 CoreApp legacy dialog 文本/可信 HTML 渲染边界。

仍需治理：

- 保持 dialog trusted HTML API 只用于内部可信内容；后续若新增 Markdown/highlight HTML 输出，应继续走 sanitizer 或品牌类型，不允许业务字符串直接进入 `v-html`。
- Nexus docs-only highlight.js CDN 仍要作为文档站外部依赖风险单独分层，不与 CoreApp runtime HTML 边界混为一类。

### 4. Widget runtime 动态执行仍是声明边界，不是 PreviewSDK 回潮

证据：

- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 仍在 `evaluateWidgetComponent()` 中使用 `new Function(...)` 执行 widget code。
- 函数要求显式 `sandbox`，并注入受控 `window`、`globalThis`、`localStorage`、`sessionStorage`、`document`、`indexedDB`、`BroadcastChannel`、`caches`、`self` facade。

判断：

- 这不是 PreviewSDK fake implementation 或算式动态执行回潮；它属于 Widget runtime sandbox 边界。
- 当前已新增 `WidgetSandboxEvidence`，覆盖 declared / allowed / blocked / undeclared dependencies、storage facade、window boundary 与 `new Function` injected globals；注册失败会把 sandbox evidence 写入 failure payload，避免伪装为空白成功。
- 仍未闭环的是真实示例插件与 packaged/dev source 手动验收、navigator/worker/postMessage 等扩展拦截、`@arrow-js/sandbox` 单独安全评估。

### 5. 占位、假的、不优雅代码分层

不构成生产假实现：

- UI input `placeholder`、TuffEx empty/loading skeleton、测试 mock、playground mock。
- `plugins/touch-intelligence/index.js` 的 `buildPlaceholderItem()` 返回 `status: "empty"`，只是 CoreBox AI Ask 空输入态。
- `touch-text-snippets` / `touch-code-snippets` 是 legacy placeholder manifest，已 hidden/deprecated/replacedBy，无 features。
- `PresetCloudUnavailableService` 仍是 fail-closed unavailable contract。

仍不优雅但非 P0：

- `plugins/touch-music/src/main.js` 仍导入根入口和 full style：`import { TxInput, TxScroll, TxSlider } from '@talex-touch/tuffex'` + `@talex-touch/tuffex/style.css`。
- `plugins/touch-music/public/vite.svg` 仍被 git 跟踪，属于 Vite starter asset 长尾。
- `plugins/touch-translation/src/composables/useTranslationProvider.ts` 注释仍写 localStorage，但实际已走 plugin storage + secret migration，建议改注释避免误导。
- 多处 overlay/backdrop 可以保留 `div @click.self`，但导航项、列表项、按钮图标类点击应继续迁为 `<button>` 或加完整 keyboard/focus 语义。

## 下一步建议

1. **做 UI 语义控件 P2 切片**：优先 CoreBoxRender、PluginList add/clear icon、Nexus LanguageToggle、touch-music player controls；mask/backdrop `@click.self` 可暂缓。
2. **清理示例插件质量长尾**：`touch-music` 迁到 TuffEx `base.css` + 子路径组件导入，移除 Vite starter asset；`touch-translation` 更新 storage 注释。
3. **补平台证据**：Windows App indexing / Everything registry PATH / CoreBox function key / 手动索引完成通知仍需要 Windows 真机 evidence；macOS release-blocking 也需保留独立手工回归记录。
4. **继续 Widget 扩展边界长尾**：在已有 sandbox evidence 上补 navigator/worker/postMessage 拦截、真实示例插件与 packaged/dev source 手动验收。
5. **回到 P1-APP-DATA**：上述 UI/插件小切片后，可以继续 File write/store boundary、Browser Bookmarks official plugin lifecycle、Everything productionization、Quicklinks feed/UI evidence。

## 验证

- 已执行静态扫描：`v-html`、`innerHTML`、`new Function`、`localStorage`、`window.$t`、`window.$i18n`、`@talex-touch/tuffex/style.css`、`placeholder`、`mock`、`not implemented`、`div/span @click`、宽泛 `any`/`unknown` 等。
- 已确认当前 git 状态：已推送代码基线与 `origin/master` 同步，`origin/master...HEAD` 为 `0 0`。
- 已确认当前 automation shell：Codex Node `v24.14.0`，无裸 `pnpm` / `corepack`。
- 已确认临时验证工具链仍存在：`/tmp/talex-touch-node22-adhoc/node` 与 `pnpm` shim。
- 本轮未重跑 package typecheck/build；当前 dialog / Widget focused 验证结果以 `CHANGES` 已记录的 Node `22.16.0` + pnpm `10.32.1` 证据为准。

## 文档同步

本报告同步到 `README`、`TODO`、`CHANGES`、`docs/INDEX.md`、Roadmap 与 Quality Baseline。同步内容只修正事实状态与下一步顺序，不改变版本目标或质量门禁。
