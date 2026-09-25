# Research: MarkdownEditor 格子（灰方块图标 / 底部径向光带 / 游离 "Markdown source" tooltip）与 Modal 方案

- **Query**: 工具栏图标为何是灰色实心方块（Nexus UnoCSS 是否生成？用哪套图标类？）；底部怪异光带是什么；邻格里漂着的 "Markdown source" tooltip 由谁渲染、为何会留在那；改为"按钮 → 弹窗里放编辑器"的方案。
- **Scope**: internal（源码 + live dev server CSS 取证 + `@vue/compiler-sfc` 实测）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/markdown-editor/src/TxMarkdownEditor.vue` | 组件（829 行）：图标表 ~33–51 行，模板 469–560 行，样式 562–829 行 |
| `packages/tuffex/packages/components/src/markdown-editor/src/types.ts` | Props / Emits / ToolbarActionKey |
| `packages/tuffex/packages/components/src/markdown-editor/src/markdown-serializer.ts` | WYSIWYG DOM → Markdown |
| `packages/tuffex/packages/components/src/icon/src/TxIcon.vue` | `name` 以 `i-` 开头 → `type:'class'` → `<span class="tuff-icon__class"><i :class="name"/></span>` |
| `apps/nexus/uno.config.ts` | presetIcons（scale 1.2）、icon preflight、`:where()` postprocess、pipeline include |
| `apps/nexus/package.json` | 已装 iconify：`cib`(46)、`carbon`(77)、`logos`(78)、`twemoji`(79)；**无 `ri`** |
| `apps/nexus/app/components/docs/TuffexDocsHeroBackground.vue` | HEAD 版的暗色规则泄漏源（工作区已修） |
| `apps/nexus/app/components/content/demos/MarkdownEditorMarkdownEditorDemo.vue` | 文档 demo（同样有灰方块） |
| `packages/tuffex/packages/components/src/modal/src/TxModal.vue` | 方案用的弹窗（Teleport 到 body） |

### 1. 灰色实心方块 —— 图标类在 Nexus 不存在

- 工具栏动作与模式按钮都渲染 `<TxIcon :name="…" :size="16" />`，图标全部是 Remix Icon（`TxMarkdownEditor.vue` `actionMeta` / `modeMeta`），共 **14 个类**：
  `i-ri-heading`、`i-ri-bold`、`i-ri-italic`、`i-ri-strikethrough`、`i-ri-double-quotes-l`、`i-ri-code-line`、`i-ri-list-unordered`、`i-ri-list-ordered`、`i-ri-link`、`i-ri-arrow-go-back-line`、`i-ri-arrow-go-forward-line`（动作）＋ `i-ri-edit-2-line`、`i-ri-markdown-line`、`i-ri-eye-line`（模式）。
- Nexus 无 `ri` 集合：`apps/nexus/package.json` 只有 carbon/cib/logos/twemoji；`@iconify-json/ri@1.2.10` 只链接在 `apps/core-app/node_modules`（core-app `package.json:177`），根 `node_modules` 未提升。`uno.config.ts` shortcuts 上方注释也写明 `ri` 是 "a collection this app has never installed"，"Uno emits nothing for a collection it cannot resolve"。
- 即便装了，dev 下也扫描不到：tuffex 走 `packages/tuffex/dist/es/*.js`，而 `content.pipeline.include` 只匹配 `vue|svelte|[jt]sx|vine.ts|mdx?|astro|elm|php|phtml|marko|html` 与 `/app/(data|composables|utils)/*.ts`（`.js` 不在内）。（prod 构建的 auto-import 走源码 `.vue`，会被扫描，但仍缺集合。）
- **live 取证**：`curl http://[::1]:3200/_nuxt/__uno_icons.css`（727 KB）中 `i-ri-*` 规则 **0 条**；同文件里新加的 `i-carbon-renew` 存在。`/_nuxt/__uno.css` 含 preflight `[class^="i-"],[class*=" i-"]{width:1.2em;height:1.2em}`。
- 成方块的机制：preflight 给 `<i class="i-ri-heading">` 撑出 1.2em（19.2px）盒子 → TxIcon 的 `.tuff-icon__class i { display:block; background-color: currentColor }` 把盒子涂成当前色（预期由图标规则的 `mask` 抠形，但规则不存在）→ `.tuff-icon`（`max-width/height:1em; overflow:hidden`）与 `.tuff-icon__class`（1em，overflow hidden）裁成 16×16 → 灰色（`--tx-markdown-editor-muted` = `--tx-text-color-secondary`）实心方块。文档页 demo 同样如此。
- tuffex 里用 `i-ri-*` 的组件：markdown-editor、icon-picker、button/split-button、icon（TxIcon 自己的 error 回退 `i-ri-image-line`）。

### 2. 底部"径向光带"

两层原因叠加：

**(a) 布局：128px 裁切只露出一条正文**
- 格子把编辑器放在 `.docs-gallery__block.docs-gallery__code`（`width: min(320px,100%)`、`height: 128px; overflow: hidden; border-radius: 10px`）。
- 工具栏：`padding 8`、`gap 12`、模式组 `flex-shrink:0` 宽 3×30+2×4+2×2+2 = 104px；320 − 2（边）− 16 − 12 − 104 = 186px 给动作组（`flex-wrap: wrap`，按钮 30px，gap 4）→ 每行 5 个，11 个按钮排 **3 行**（98px）→ 工具栏 ≈ 115px + 上边 1px。
- 正文 `min-height: 220px` 从 y≈116 开始，128px 裁切只露出 **≈12px**，且没有下边框/圆角 → 看起来像一条不属于组件的带子。

**(b) 样式泄漏：HEAD 版 hero 背景的暗色规则变成了全局规则**
- `TuffexDocsHeroBackground.vue`（`<style scoped>`）HEAD 版写的是 `:global(.dark) .tuffex-docs-hero-bg__shape-core::after, :global([data-theme='dark']) … { … }` 等 4 组。用 `@vue/compiler-sfc@3.5.41` 编译 HEAD 源码，输出选择器全部塌缩为 **`.dark,[data-theme='dark']`**：
  1. `background: transparent; color: rgba(255,255,255,0.9)`
  2. `background: linear-gradient(135deg, rgba(99,102,241,.04), transparent 44%, rgba(244,63,94,.04))`
  3. `border-color: rgba(255,255,255,.2); box-shadow: 0 10px 34px rgba(255,255,255,.12)`
  4. `background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.34), transparent 70%)`
- TxMarkdownEditor 根元素带 `:data-theme="resolvedTheme"`（暗色为 `"dark"`）→ 命中 `[data-theme='dark']`，与 `.tx-markdown-editor { background: var(--tx-markdown-editor-bg) }` 同为 (0,1,0)，hero 组件懒挂载、样式更晚进入 cascade → **根背景被换成白色径向渐变**（还有白色 border-color 与 box-shadow）。
- 暗色下 `--tx-markdown-editor-bg: var(--tx-fill-color-blank, #0d1117)`，而 tuffex `.dark` 里 `--tx-fill-color-blank: transparent` → 正文透明；工具栏有自己的 `--tx-fill-color`(#303030) 背景盖住上部 → 只在 (a) 那 12px 正文条里透出根上的径向白光 = "怪异光带"。
- 这 4 条规则也作用于 `html.dark` 与其他 `data-theme="dark"` 的组件根；CodeEditor 格子"中间灰色径向光斑"（R2）是同一来源。
- **工作区已修**（并行会话，未提交）：改为 `.dark .tuffex-docs-hero-bg…` / `[data-theme='dark'] .tuffex-docs-hero-bg…` 后代选择器；实测编译为 `….tuffex-docs-hero-bg__shape-core[data-v-hero]::after` 等带作用域的规则，不再外泄。修复后 (a) 的 12px 条仍在（透明，透出格子背景），改为 Modal 方案后才消失。

### 3. 游离的 "Markdown source" tooltip

- 全仓库（排除 node_modules/dist）字符串 "Markdown source" 只在 `TxMarkdownEditor.vue:50` `modeMeta.source.label`，用作模式按钮的 `:title` 与 `:aria-label`（core-app 的 `out/` 构建产物是同一份代码）。
- Nexus 与 tuffex 没有把 `title` 升级为 DOM tooltip 的机制（grep `getAttribute('title')`、`[title]` 选择器、`v-tooltip` 均无命中；Nexus plugins 只有 device-headers/highlight/i18n/mermaid/sentry/unocss-icons）。TxIcon 只在传 `alt` 时设 `title`。
- 因此它是**浏览器原生 title 提示**：由浏览器/OS 在指针的屏幕坐标处绘制，不是 DOM 节点，不受格子边界或 overflow 限制；指针不动而页面滚动/重排时，提示可能停留在另一格上方直到下一次指针移动。CDP `Page.captureScreenshot` 不会拍到它（只有系统截图会）。
- 改为 Modal 方案后，网格静止态不再存在带 title 的模式按钮。

### API（`types.ts` + `withDefaults`）

| Prop | Type | Default |
|---|---|---|
| `modelValue` | `string` | `''` |
| `placeholder` | `string` | `''` |
| `mode` | `'wysiwyg' \| 'source' \| 'preview'` | —（受控） |
| `defaultMode` | 同上 | `'wysiwyg'` |
| `disabled` / `readonly` | `boolean` | `false` |
| `sanitize` | `boolean` | `true`（DOMPurify） |
| `theme` | `'auto' \| 'light' \| 'dark'` | `'auto'`（读 `html`/`body` 的 `data-theme` 或 `.dark/.light` 类，MutationObserver 跟随） |
| `toolbar` | `boolean` | `true`（同时控制模式切换组） |
| `toolbarActions` | `MarkdownEditorToolbarActionKey[]` | 全部 11 个 |
| `minHeight` / `maxHeight` | `string \| number` | `220` / — |
| `ariaLabel` | `string` | `'Markdown editor'` |
| `linkPrompt` | `(selected: string) => string \| Promise<string>` | —（未提供时 link 动作无效） |

- **Emits**：`update:modelValue`、`change`、`update:mode`、`mode-change`、`focus`、`blur`。
- **Expose**：`focus()`、`blur()`、`setMode(mode)`、`getMode()`、`getValue()`、`setValue(value)`。
- **Slots**：无。
- **CSS 变量**（根上定义）：`--tx-markdown-editor-border`(`--tx-border-color`)、`-bg`(`--tx-fill-color-blank`)、`-toolbar-bg`(亮 `--tx-fill-color-lighter` / 暗 `--tx-fill-color`)、`-text`(`--tx-text-color-primary`)、`-muted`(`--tx-text-color-secondary`)、`-focus`(`--tx-color-primary`)。
- 渲染：工具栏（动作组 + `role="group"` 模式组，按钮 `aria-pressed`）＋ 正文（WYSIWYG `contenteditable.markdown-body` / source `<textarea>` / preview `.markdown-body`，`v-show` 切换）。`marked` 与 `dompurify` 动态 import。无入场动画；聚焦时 3px 主色 ring。
- 注意：正文 `.markdown-body` 也会吃到 Nexus `github-markdown.css` 的未加 `.not-prose` 守卫的根规则（`.markdown-body { color: var(--fgColor-default); font-size: 16px; … }`、`.dark .markdown-body { color-scheme: dark; … }`）；组件自己的 `.tx-markdown-editor .markdown-body { font-size:14px; line-height:1.7 }` 特异性更高，字号不受影响。

### Nexus demo

`MarkdownEditorMarkdownEditorDemo.vue`：`default-mode="source"`，`toolbar-actions` 精简为 `['heading','bold','italic','bulletList','orderedList','link']`，`:min-height="220"`，下方一行 12px 说明（i18n）。无外框宽度限制（随 demo 容器）。

### 当前画廊格子（研究时 ~2720–2734 行，锚点 `docPath('markdown-editor')`）

```vue
<div class="docs-gallery__block docs-gallery__code">
  <TxMarkdownEditor v-model="markdownDraft" />
</div>
```

`const markdownDraft = ref('## Release notes\n\n- Faster CoreBox\n')`（~529 行）。

### 方案：按钮 → TxModal 内的编辑器

仓库里没有名为 `TxDialog` 的组件：`dialog/` 目录是 `TxBlowDialog`/`TxPopperDialog`/`TxBottomDialog`/`TxTouchTip`（偏命令式，BlowDialog/PopperDialog 用 `comp`/`render` 注入内容）。画廊 Modal 格子用的 `TxModal` 最合适：`v-model`、`title`、`width`（string，默认 `'480px'`，内容类默认 `min(90vw, 560px)`）、slots `default/header/footer`，**Teleport 到 body**（逃出 `.docs-prose` containment），内置 Esc 关闭、焦点陷阱、焦点复原、`tx-modal` 渐入 + 面板 scale/translate 动画（无 reduced-motion 分支）。

```vue
<div class="docs-gallery__stack docs-gallery__stack--center">
  <TxButton icon="i-carbon-edit" @click="markdownOpen = true">
    {{ copy.editNotes }}
  </TxButton>
  <span class="docs-gallery__muted">WYSIWYG · Source · Preview</span>
</div>
<TxModal v-model="markdownOpen" :title="copy.releaseNotes" width="min(92vw, 600px)">
  <TxMarkdownEditor
    v-model="markdownDraft"
    :min-height="200"
    :max-height="320"
    :aria-label="copy.releaseNotes"
  />
</TxModal>
```

- 宽度：modal 600 → 内容区 560（padding 20×2）→ 工具栏内宽 542 → 动作组可用 542 − 12 − 104 = 426 ≥ 11 按钮所需 370 → **单行**。宽 480 时会折成 2 行。
- 图标：弹窗里依旧是灰方块，除非 Nexus 侧 (1) 加 `@iconify-json/ri`（core-app 用 `^1.2.10`；workspace catalog 里没有 ri 条目），并 (2) 在 `apps/nexus/uno.config.ts` 加 `safelist` 这 14 个类（dist `.js` 不被扫描；在画廊 `.vue` 里写出这些字面量也能被提取）。改的是 Nexus 配置，不是组件。
- teleport 后的内容拿不到 `--docs-*` 变量；编辑器本身只用 `--tx-*`，无影响；若在 modal 里加说明文字别用 `.docs-gallery__muted`。
- 暗色下编辑器正文透明，落在 `.tx-modal__content { background: var(--tx-bg-color) }` 上，不再透出页面背景。
- 格子内只剩按钮与一行说明（~70px 高），舞台内居中；`markdownDraft` 是画廊状态，reset/关闭都保留草稿。
- 需要的新文案（zh/en）：按钮（如 "编辑发布说明 / Edit release notes"）、弹窗标题（"发布说明 / Release notes"）。

## Caveats / Not Found

- "光带"的最终观感（径向白光落在 12px 条内）由代码与编译输出推得，未在浏览器目测；hero 背景修复已在工作区，建议在 ego 里对比修复前后。
- 原生 tooltip 在滚动后是否残留取决于浏览器的 hover 更新策略，无法从代码确定老板截图时的具体操作顺序；但可确定渲染源只有该 `title`。
