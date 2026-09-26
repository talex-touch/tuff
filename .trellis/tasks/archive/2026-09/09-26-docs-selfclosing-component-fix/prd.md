# 文档站：自闭合 `<TuffDocSourceLink />` 吞掉后续章节

父任务：`09-25-home-session-polish`（本父任务交付的 fusion-surface / choice-card 文档页受影响）。2026-09-26 由会话 talex-touch-40 报告。

## 问题

`apps/nexus/content/docs/**.mdc` 里 293 个页面写了 `<TuffDocSourceLink />`。MDC 的 HTML 解析不认自闭合写法，把它当成开标签：之后的全部内容都成了它的子节点，而组件没有插槽，于是**这些内容不渲染**。文档模板把它放在「技术实现」与「使用场景」之间，所以凡是其后还有章节的页面（fusion-surface、choice-card、button、fine-tune-card、group-block、avatar、rating、signal-meter、container、tabs、code-editor、sound、tree、echart-charts、chat……）都丢了「使用场景」「相关组件」等章节。prism-glow 用「挪到文件末尾」临时规避。

## Requirements

1. 全站一次修复，**不逐个改 .mdc**（大量文档页正被其他会话编辑）：在内容解析之前，把正文里自闭合的自定义组件标签（大写开头的 PascalCase，`<Name ... />`）规范成成对标签 `<Name ...></Name>`；代码块 / 行内代码里的示例不受影响。优先用 Nuxt Content / MDC 的解析前钩子（例如 `content:file:beforeParse`），以已安装版本的实际 API 为准。
2. 受影响页面恢复完整渲染；页面上原本就在文件末尾的写法不受影响。
3. 更新文档规范（`.trellis/spec/frontend/tuffex-docs-sync.md` 或相关文档模板说明）：说明自闭合组件现在安全，并记录这个坑。
4. 加一个守护：脚本或测试，能发现「组件标签后面的正文没有渲染」这类回归（例如抽查 fusion-surface 页面的「使用场景」标题能在渲染结果里找到）。

## Acceptance Criteria

- [ ] :3200 的 `/docs/dev/components/fusion-surface`、`choice-card`、`button`（中英各一）能看到「使用场景 / Use cases」「相关组件 / Related」章节（抓取渲染后的 HTML 或 body JSON 验证）。
- [ ] 代码块里的 `<TuffDocSourceLink />` 示例（如有）原样显示。
- [ ] nexus 相关测试 / 文档检查脚本通过（`check-doc-translation-parity`、`check-mdc-fences` 等）。
