# Research: CodeEditor（R2：光斑 + 底边截断）

- **Query**: 源码/API；编辑器中间灰色径向光斑的来源；底边为什么被截；紧凑提案
- **Scope**: internal（源码 + ego 实测：计算样式、CSSOM 规则匹配、编译器源码）
- **Date**: 2026-09-23

## Findings

### Files Found

| File Path | Description |
|---|---|
| `packages/tuffex/packages/components/src/code-editor/src/TxCodeEditor.vue` | 包装：挂载后懒加载 runtime；全局（非 scoped）样式 |
| `packages/tuffex/packages/components/src/code-editor/src/TxCodeEditorRuntime.vue` | CodeMirror 6 实现、主题调色板 |
| `packages/tuffex/packages/components/src/code-editor/src/TxCodeEditorToolbar.vue` | 工具栏 |
| `packages/tuffex/packages/components/src/code-editor/src/{types,stream-parsers}.ts`、`index.ts`、`__tests__/` | 类型 / 解析器 / 导出 / 单测 |
| `apps/nexus/app/components/content/demos/CodeEditorCodeEditorDemo.vue`、`CodeEditorToolbarDemo.vue` | 文档 demo |
| `apps/nexus/app/components/docs/TuffexDocsHeroBackground.vue` | **光斑来源** |
| `apps/nexus/app/layouts/docs.vue:10, 18, 311-358, 407` | hero 背景懒挂载（首次 scroll / pointerdown / keydown / touchstart + idle 之后） |
| `node_modules/.pnpm/@vue+compiler-sfc@3.5.41/node_modules/@vue/compiler-sfc/dist/compiler-sfc.cjs.js:8583-8585` | scoped CSS 对 `:global()` 的处理 |

### 公共 API

**TxCodeEditor props**（10-25）：`modelValue` `''`；`language` `'json'`（`'json' | 'yaml' | 'toml' | 'ini' | 'javascript' | 'js'`）；`theme` `'auto'`（`'auto' | 'light' | 'dark' | 'github' | 'dracula' | 'monokai'`）；`readOnly` false；`lineNumbers` true；`lineWrapping` false；`placeholder` `''`；`tabSize` 2；`formatOnBlur` false；`formatOnInit` false；`lint` true（只对 json / yaml 生效）；`search` true；`completion` true；`extensions` `[]`。

- emits：`update:modelValue`、`change`、`focus`、`blur`、`format({ value, language })`。
- slot `toolbar`，slot props：`format`、`openSearch`、`foldAll`、`unfoldAll`、`copy`、`getValue`。
- expose：`focus`、`blur`、`format`、`openSearch`、`foldAll`、`unfoldAll`、`copy`、`getValue`、`getView`。
- 样式（91-137，全局）：`.tx-code-editor` 有 `min-height: 160px`、radius 12、1px `var(--tx-code-editor-border)` 边、`background: var(--tx-code-editor-bg, var(--tx-fill-color-blank))`、overflow hidden；`.is-readonly` 为 `opacity: .92`；`__view` 与 `.cm-content` 都是 `min-height: 160px`。
- runtime：根带 `data-theme` = 解析后的主题（740 行）；auto 模式读取 html / body 的 data-theme 或 `.dark` / `.light`（247-265），并监听 html 的 class / data-theme；`rootStyle` 按调色板写入 `--tx-code-editor-*`（294-300）；暗色调色板（117-128）bg `#0d1117`、text `#e6edf3`、gutter `#0d1117`、border `#30363d`、activeLine `#161b22`（GitHub dark）；扩展（545-612）：始终开启 `highlightActiveLine`、foldGutter、lineNumbers + activeLineGutter、search、autocompletion、closeBrackets，json / yaml 另有 lint + lintGutter。
- **TxCodeEditorToolbar**：`actions`（默认 format / search / foldAll / unfoldAll / copy 五个）、`compact`（false，开启后按钮 padding 4 8）；emit `action(key)`；slot `leading` / `trailing`。

### R2 灰色径向光斑——根因（已在页面内确认）

- `TuffexDocsHeroBackground.vue` 的 scoped `<style>`（已提交版本 195-215 行）写的是 `:global(.dark) .tuffex-docs-hero-bg__x` / `:global([data-theme='dark']) …`。Vue compiler-sfc 的 scoped 插件遇到 `:global()` 时，会用它的参数**替换整个选择器**（`selector.replaceWith(n.nodes[0])`），于是编译产物是四条裸规则：
  - `.dark, [data-theme="dark"] { background: transparent; color: rgba(255,255,255,.9) }`
  - `.dark, [data-theme="dark"] { background: linear-gradient(135deg, …) }`
  - `.dark, [data-theme="dark"] { border-color: rgba(255,255,255,.2); box-shadow: 0 10px 34px rgba(255,255,255,.12) }`
  - `.dark, [data-theme="dark"] { background: radial-gradient(circle, rgba(255,255,255,.34), transparent 70%) }`
- 页面中被命中的元素：`html.dark`、`div.tx-code-editor.is-readonly[data-theme=dark]`、`div.tx-markdown-editor.tx-markdown-editor--dark[data-theme=dark]`。
- 与 `.tx-code-editor` 同为 (0,1,0) 优先级，而 hero 样式表是后注入的（异步 hero 在首次交互后才挂载），所以后者胜出：编辑器计算样式为 `background: rgba(0,0,0,0) radial-gradient(...)`、`border-color: rgba(255,255,255,.2)`、`box-shadow: rgba(255,255,255,.12) 0 10px 34px`、`color: rgba(255,255,255,.9)`。页面未交互（hero 未挂载）时编辑器是正常的（#0d1117）——所以要滚动之后才出现。
- 排除项：把编辑器 opacity 改成 1，光斑不变；编辑器子树里没有伪元素、filter、text-shadow。
- 只在暗色下出现（亮色下编辑器是 `data-theme=light`，html 也没有 `.dark`）。
- R3（MarkdownEditor 底部的怪异光带）很可能是同一处泄漏：它的根也是 `data-theme=dark`，被同样命中（径向渐变 + 下方白色 box-shadow）。
- **现状**：工作树里的 `TuffexDocsHeroBackground.vue` 已有未提交的修复（改成普通的 `.dark .tuffex-docs-hero-bg…` 后代选择器，195-219 行带注释）。重新加载并滚动后实测：hero 样式表不再含无作用域规则；CodeEditor bg 为 `rgb(13,17,23)`，无渐变、无阴影；MarkdownEditor bg none、box-shadow none。
- 附注：第一次截图时编辑器在视口底部，文字周围有柔和光晕，那是固定在视口底部 64px 的 `.docs-edge-blur--bottom`（`backdrop-filter: blur(8.8px)`），与编辑器无关。

### 底边截断——根因

- `.docs-gallery__code { height: 128px; overflow: hidden; border-radius: 10px }`（DocsComponentsGallery.css:302-306）对上 `.tx-code-editor`、`.tx-code-editor__view`、`.cm-content` 三处的 `min-height: 160px`（TxCodeEditor.vue:97、126、135）。实测：容器 128、编辑器 162（160 + 2px 边框）、view 160、content 160 → 底部 34px（含下边框和圆角）被裁掉；行号列只有 96.8px（4 行），其余是空白。
- 其它问题：第 1 行 `export function greet(name: string) {` 比 320px 宽，又没开换行，右侧的 `{` 被截；样例是 TypeScript，却写了 `language="javascript"`；末尾的 `\n` 造成空的第 4 行；`read-only` → opacity .92；第 1 行即使未聚焦也有 active-line 色带（`#161b22`）。
- `.docs-gallery__code` 还被 MarkdownEditor 格使用（R3 正在改成 dialog）。

### 现有 demo

- `CodeEditorCodeEditorDemo.vue`：grid gap 4，JSON（单行 `{"name":"Tuffex","version":1,"features":["lint","format","search"]}`）与 YAML 两个编辑器，带 placeholder，v-model。
- `CodeEditorToolbarDemo.vue`：同一段单行 JSON，`line-wrapping`，toolbar slot 里放 `TxCodeEditorToolbar compact`，动作为 format / search / foldAll / unfoldAll / copy（图标 i-carbon-code / search / collapse-categories / row-expand / copy），下方有 "Last action" 状态行。

### 紧凑提案

```vue
<div class="docs-gallery__block docs-gallery__block--wide docs-gallery__editor">
  <TxCodeEditor :model-value="manifestSample" language="json" />
</div>
```

```ts
const manifestSample = '{\n  "id": "com.talex.clipboard",\n  "version": "1.2.0",\n  "sdkapi": 260713,\n  "features": ["history", "pin"]\n}'
```

```css
.docs-gallery__editor .tx-code-editor,
.docs-gallery__editor .tx-code-editor__view,
.docs-gallery__editor .cm-content { min-height: 0; }
```

- 6 行 × 18.2 + 24 ≈ 133px，再加 2px 边框，自然高度就放得下，不需要裁剪容器；用新 class，不改共用的 `.docs-gallery__code`。
- 最长一行约 30 个字符 × 约 7.8px，加上行号 / 折叠 / lint 三列和 24 的内边距，约 300 < 360。
- JSON 是组件的默认语言，自带 lint（lintGutter）和 Mod-Shift-F 格式化；去掉 read-only，变成可编辑的活 specimen；`:model-value` 单向绑定，reset（重挂载）即可恢复样例。
- 可选（更能体现能力）：单行压缩 JSON + `line-wrapping` + toolbar slot 放 `TxCodeEditorToolbar compact`（只留 format、copy），点 Format 展开成多行；这时需要给固定高度（例如 `.docs-gallery__editor .tx-code-editor { height: 150px }`，再加上面的 min-height 覆盖），让 `.cm-scroller` 在内部滚动。
- 观察：暗色调色板是 GitHub dark `#0d1117`（略偏蓝），页面是中性的 `#121212`。
- 静态组件：reset 只是重挂载（恢复内容）。

## Caveats / Not Found

- hero 的修复是其他会话或主会话在工作树里做的，尚未提交；本文只记录根因，并复测了修复后的效果。
- 提案的高度与宽度是按行高和字宽估算的，未实测。
