# ① TxStreamMarkdown 技术设计

PRD：`./prd.md`。本文定案三个开放决策（父任务开放决策 1 不属本件；2、3 在此定案），并给出增量解析、组件契约与目录结构。

## 0. 定案

| 决策 | 结论 | 理由 |
|---|---|---|
| 代码高亮器 | **shiki**（root `shiki` 包 + `@shikijs/engine-javascript`），不复用 CodeMirror | CodeMirror 是编辑器运行时（EditorState/EditorView 常驻实例），显示级高亮用它是背着编辑器跑步；shiki 输出静态 HTML，与 v-html 渲染管线同构，主题质量对标 VS Code，且 JS regex 引擎免 wasm。实现修订：不用 `@shikijs/core` 细粒度四件套——语言按需加载需要 bundled registry 的 per-lang import thunk（`loadLanguage('js')` 连别名都解析），root 包的 registry 本身极小、语法/主题仍在各自 dynamic import 后面，懒加载语义等价且免维护自建别名表。实测 shiki 4.4.2 API 兼容 |
| mermaid / shiki 依赖形态 | **tuffex `dependencies` + 动态 import** | optional peer 会把安装责任推给每个消费方，而 tuffex 的两个真实消费方（core-app、nexus docs）都要用；动态 import 保证初始 chunk 零成本，Vite/electron-vite 自动分包。若 import 失败（极端裁剪场景）组件走降级路径，不裂 |
| mermaid 放大预览 | 复用 `image-gallery` 的灯箱**不可行**（它面向 img 元素），改为轻量内置 overlay（svg 直挂 + 缩放），复用 `--tx-overlay-*` 惯例 | 避免为一个 svg 场景改造 image-gallery 的类型面 |

## 1. 增量解析策略（核心）

### 1.1 原则：比较驱动，不做「块已闭合」假设

Markdown 允许后来的输入改写前文语义（setext 标题 `===`、列表继续行、引用式链接定义 `[ref]: url`、表格分隔行）。因此**不**采用「上一块永远稳定」的假设，而是每次 delta：

1. `markedInstance.lexer(content)` 全量重 lex（纯词法，5k 字符 < 1ms 量级，成本可接受；性能预算见 §5）；
2. 与上一轮 token 列表做**前缀比对**：`token.raw` 逐个严格相等的最长前缀视为稳定块；
3. 稳定块命中 per-block HTML 缓存（key = 块序号 + raw），**不重新 parse、不重新消毒**；
4. 前缀之后的所有块（通常只有尾部 1 块；被改写时可能多块）重新 `parser([token])` + 消毒。

这样 setext/链接定义等改写场景自动正确——改写发生时前缀断在改写点，受影响块自然重渲染。

### 1.2 块渲染与 DOM 稳定性

- 渲染结构：`v-for` over `blocks`，`:key="block.id"`。`block.id` 在前缀比对中继承上一轮 id（稳定块 id 不变），新块分配自增 id。稳定块的 vnode props（html 字符串）不变 → Vue patch 跳过 → **DOM 节点引用不变**（PRD 验收的 identity 断言基于此）。
- 每块独立 `v-html`（普通块）或分派到块组件（围栏块，见 §2）。
- 引用式链接：`TokensList.links` 是 lexer 级全局表。per-block parse 前把当前全量 `links` 挂到单块 token 数组上（`Object.assign([token], { links })`）。links 表变化会引起使用了引用链接的段落输出变化——比对时把 `links` 的指纹并入缓存 key 的全局盐，links 变更即全量失效重 parse（罕见路径，正确性优先）。

### 1.3 消毒

- 沿用 TxMarkdownView 惯例：dompurify 动态 import、就绪前不渲染任何未消毒 HTML（`sanitize=true` 时）。
- 消毒按块进行，缓存的是**消毒后的 HTML**。`sanitize=false` 时缓存原始输出。

### 1.4 流式光标

- 纯 CSS：`streaming=true` 时容器加 `is-streaming` 类，`.tx-stream-md.is-streaming .tx-stream-md__block:last-child` 内的最后一个内容元素（`p/li/h1-h6:last-of-type`）`::after { content: '▍' }` + 闪烁动画。
- 尾块是围栏块（代码/mermaid）时光标不进块内，落在块容器后的独立光标行（块级光标），避免污染 pre 内文本。

### 1.5 揭示动画

- 新块 mount 时加一次性 CSS 动画（opacity 0.55→1 + translateY 3px + blur 2px→0，260ms ease-out），沿用 `tx-ai-response-reveal` 的既有观感；动画类在 `animationend` 后移除。
- 尾块每次 delta 更新**不**重放动画（只有新 id 的块播）。
- `@media (prefers-reduced-motion: reduce)` 下动画整体禁用（透明度直达）。

## 2. 块渲染器注册契约

```ts
// stream-markdown/src/types.ts（形态示意，命名以实现为准）
export interface StreamMarkdownBlockContext {
  lang: string        // 围栏语言（已 trim、lowercase）
  code: string        // 围栏原文
  closed: boolean     // 该围栏是否已闭合（流式尾块为 false）
  streaming: boolean  // 整体流式态
  theme: 'light' | 'dark'
}
export type StreamMarkdownBlockRenderer = Component /* props: StreamMarkdownBlockContext */
```

- 分派规则：`code` 类型 token 且 `lang` 命中注册表 → 渲染注册组件；未命中 → TxCodeBlock。内置注册 `mermaid` → TxMermaidBlock。
- 注册面：`renderers?: Record<string, StreamMarkdownBlockRenderer>` prop（实例级，避免全局注册的跨实例污染——Pencil 教训同款）。
- 围栏「闭合」判定：lexer 产出的 code token 的 `raw` 以闭合围栏结尾（`/\n\s*(`{3,}|~{3,})\s*$/`）；尾块未闭合时 `closed=false`。

## 3. TxCodeBlock

- 结构：header（语言标签 + 复制按钮）+ `<pre><code>`。
- 复制按钮复用 `copy-button` 组件（既有目录已存在，直接组合）。
- 高亮：`closed && !streaming尾块` 时触发。单例懒加载 highlighter：
  - `@shikijs/core` + `@shikijs/engine-javascript`，主题内置 `github-light` / `github-dark` 两枚（`@shikijs/themes`），语言按需 `@shikijs/langs` 动态 import，未收录语言回退纯文本；
  - 高亮是异步增强：先渲染 escaped 纯文本（流式期间一直如此），高亮完成后原位替换，替换不改变块高度突变观感（pre 尺寸由内容定，同字体同内容仅上色）。
- import 失败（离线裁剪等）→ 永久纯文本，不报错到用户。

## 4. TxMermaidBlock

- 状态机：`closed=false` → 骨架（shimmer 占位 + 原文小字）；`closed=true` → 动态 import `mermaid` → `mermaid.render()` 出 svg → 淡入；渲染异常 → 回退 TxCodeBlock 形态 + 错误提示行（`role="alert"`，一行，非阻断）。
- `initialize({ startOnLoad: false, securityLevel: 'strict', theme: resolved })`；主题变更时对已渲染块重渲染（监听 theme prop）。
- svg 点击 → 内置 overlay 放大（fixed 遮罩 + svg 等比缩放 + Esc/点击遮罩关闭）；overlay 挂 body（Teleport），`aria-modal`。
- mermaid 的 `render` 需要真实 DOM 测量：无 `document` 环境直接停在骨架态（`hasDocument()` 守卫）。

## 5. 性能预算与退路

- 预算：5k 字符 / 10+ 块文档，20ms/delta 注入下主线程每帧解析+比对 < 4ms（lexer 全量重 lex 是主要成本）。
- 若实测超标：退路是「稳定前缀跳过重 lex」——记录稳定前缀的字符偏移，只 lex `content.slice(offset - 尾块raw长度)`，前缀 token 直接复用。此优化**不进首版**（复杂度高、正确性风险大），预算超标才启用。
- 缓存上限：per-block HTML 缓存随块数线性增长，单实例不设上限（会话内消息级组件，卸载即释放）。

## 6. 目录与导出

```
stream-markdown/
├── index.ts                       # withInstall + 类型导出，components.ts 加一行
├── __tests__/stream-markdown.test.ts
│            code-block.test.ts
│            mermaid-block.test.ts
└── src/
    ├── TxStreamMarkdown.vue
    ├── TxCodeBlock.vue
    ├── TxMermaidBlock.vue
    ├── use-block-stream.ts        # lexer 比对 + 缓存（纯 TS，单测主战场）
    ├── shiki-runtime.ts           # 高亮器单例懒加载
    └── types.ts
```

- 子路径 `@talex-touch/tuffex/stream-markdown` 走既有 `./*` 通配 export，无需改 package.json exports。
- 新依赖：`shiki@^4.4.2` `@shikijs/engine-javascript@^4.4.2`（直接 semver，与 dompurify/marked 同风格）、`mermaid`（workspace catalog 已有 `^11.16.0`，引用 `catalog:`）——全部 dynamic import 触达，dist 实证 entry chunk 零静态引用。
- 顺带落地 PRD Notes 的评估结论：`ai-elements-vue` 源码零引用，已移除。

## 7. 与既有组件关系

- TxMarkdownView 不动；文档场景继续用它。
- TxAiMessage（③ 的分部模型落地后）以 TxStreamMarkdown 替换其 TxMarkdownView 用法——属 ③/④ 范围。

## 8. 测试策略

- `use-block-stream.ts` 纯逻辑单测：前缀比对、id 继承、setext 改写、引用链接失效、围栏闭合判定。
- 组件测试沿用 markdown-view 测试惯例：`vi.mock('dompurify')`、flushPromises；DOM identity 断言用 `wrapper.find(...).element` 引用比较两轮 delta。
- shiki/mermaid 在测试中 `vi.mock` 为同步假实现（真模块体积大且 wasm/DOM 依赖，单测不加载真件）。

## 9. 回滚

全部为新增文件 + components.ts 一行导出，回滚 = 删目录删行，无既有行为改动。
