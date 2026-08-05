# ① TxStreamMarkdown 执行计划

前置：`design.md` 已过审。工作目录 `packages/tuffex`。

## 顺序清单

### S1 纯逻辑层（可独立验证，先行）
- [x] `stream-markdown/src/use-block-stream.ts`：lexer 前缀比对、块 id 继承、per-block parse + 消毒缓存、围栏闭合判定、`links` 指纹失效
- [x] `__tests__/` 逻辑单测：追加流、setext 改写、引用链接后置定义、围栏未闭合/闭合、id 稳定性
- 验证：`pnpm --filter @talex-touch/tuffex test -- stream-markdown`（或 `cd packages/tuffex && pnpm test -- stream-markdown`）

### S2 TxStreamMarkdown 组件
- [x] `TxStreamMarkdown.vue`：v-for keyed 渲染、dompurify 惯例接入、流式光标 CSS、新块揭示动画、`prefers-reduced-motion`
- [x] 组件单测：DOM identity（两轮 delta 后既有块 element 引用相等）、光标出现/消失、sanitize 拦截 `<script>`
- 验证：同上 vitest 过滤

### S3 TxCodeBlock + shiki
- [x] `pnpm add @shikijs/core @shikijs/engine-javascript @shikijs/themes @shikijs/langs`（tuffex 包内）
- [x] `shiki-runtime.ts` 单例懒加载 + 语言按需 + 失败降级
- [x] `TxCodeBlock.vue`：header/复制（组合 copy-button）/escaped 纯文本先行/闭合后高亮
- [x] 单测（shiki mock 为同步假实现）：流式中不高亮、闭合后高亮调用、复制事件、import 失败降级
- 【review 门】高亮观感 + chunk 分包核验：`pnpm --filter @talex-touch/tuffex build:vite` 产物中 shiki 不在主 chunk

### S4 TxMermaidBlock + mermaid
- [x] `pnpm add mermaid`
- [x] `TxMermaidBlock.vue`：骨架态/出图/错误回退/overlay 放大/主题跟随/`hasDocument()` 守卫
- [x] 单测（mermaid mock）：未闭合停骨架、闭合触发 render、异常回退、Esc 关 overlay
- 【review 门】真实 mermaid 手测：合法/非法源、深浅主题切换

### S5 注册与收尾
- [x] `components.ts` 加 `export * from './stream-markdown/index'`（按字母序插位）
- [x] `index.ts` withInstall 导出 + 类型导出，评估移除未使用的 `ai-elements-vue` 依赖（PRD Notes，若移除单独提交）
- [x] 全量验证

## 验证命令（S5 全量）

```bash
cd packages/tuffex
pnpm test                 # 全部单测
pnpm typecheck            # vue-tsc
pnpm build                # gulp 全量构建
pnpm lint
```

根目录 `pnpm lint` 收口。

## 回滚点

- 每个 S 段独立可回滚（S1/S2 无新依赖；S3/S4 各自引入依赖，回滚需同步还原 package.json + lockfile）。
- 全件回滚：删除 `stream-markdown/` 目录 + components.ts 一行 + 依赖项。
