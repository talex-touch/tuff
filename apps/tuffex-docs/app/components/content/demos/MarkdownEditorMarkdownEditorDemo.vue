<script setup lang="ts">
import type { MarkdownEditorComment } from '@talex-touch/tuffex/markdown-editor'
import { computed, ref, watch } from 'vue'
import { createDemoAi, demoUploadImage } from './markdown-editor-demo-host'
import { MARKDOWN_EDITOR_ZH_LABELS } from './markdown-editor-demo-labels'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const SAMPLES = {
  zh: {
    doc: `# Tuff 2.5 发布说明 :tada:

这一版重写了 CoreBox 的搜索管线：==冷启动快了 38%==，索引的内存峰值降到<mark data-color="green">原来的一半</mark>。

## 更新内容

- [x] 文件索引改为增量写入 :rocket:
- [x] 剪贴板支持图片与富文本
- [ ] Windows 托盘图标适配高分屏

> [!TIP]
> 按 ⌥Space 随时唤起 CoreBox。

| 指标 | 2.4 | 2.5 |
| --- | --- | --- |
| 冷启动 | 820 ms | 510 ms |
| 索引 10 万个文件 | 46 s | 19 s |

结果按 $s = \\alpha f + (1 - \\alpha) r$ 排序，其中 $\\alpha = 0.6$：

$$
\\operatorname{score}(q) = \\sum_{i=1}^{n} w_i \\cdot \\operatorname{match}_i(q)
$$

\`\`\`ts
export function score(freq: number, recency: number, alpha = 0.6): number {
  return alpha * freq + (1 - alpha) * recency
}
\`\`\`

> [!WARNING]
> 升级前请先备份 \`~/Library/Application Support/tuff\`。

感谢所有参与测试版的朋友，你们反馈的问题我们都认真的看过了，也让我们改的更快
`,
    quote: '文件索引改为增量写入',
    author: '林夏',
    question: '首次索引也会变快吗？',
    answer: '首次仍是全量扫描，之后只写变化的部分。',
    placeholder: '写点什么，或者输入 : 插入表情…',
    hint: '选中文字会浮出工具条：加粗、高亮、评论，或点「AI 改写」润色、精简、翻译（模拟 AI，不连真实模型；最后一段故意留了错别字）。输入 / 插入块，输入 : 插入表情；粘贴、拖入或从工具栏选择图片会自动上传（模拟 CDN）。',
  },
  en: {
    doc: `# Tuff 2.5 release notes :tada:

This release rewrites the CoreBox search pipeline: ==cold start is 38% faster==, and indexing peaks at <mark data-color="green">half the memory</mark>.

## What's new

- [x] Incremental writes for the file index :rocket:
- [x] Images and rich text on the clipboard
- [ ] HiDPI tray icon on Windows

> [!TIP]
> Press ⌥Space to open CoreBox from anywhere.

| Metric | 2.4 | 2.5 |
| --- | --- | --- |
| Cold start | 820 ms | 510 ms |
| Index 100k files | 46 s | 19 s |

Results rank by $s = \\alpha f + (1 - \\alpha) r$, with $\\alpha = 0.6$:

$$
\\operatorname{score}(q) = \\sum_{i=1}^{n} w_i \\cdot \\operatorname{match}_i(q)
$$

\`\`\`ts
export function score(freq: number, recency: number, alpha = 0.6): number {
  return alpha * freq + (1 - alpha) * recency
}
\`\`\`

> [!WARNING]
> Back up \`~/Library/Application Support/tuff\` before you upgrade.

Thanks to everyone who tryed the beta — your feedback realy helped us ship this faster then we planned
`,
    quote: 'Incremental writes for the file index',
    author: 'Lin Xia',
    question: 'Does the first index get faster too?',
    answer: 'The first run still scans everything; after that only changes are written.',
    placeholder: 'Write something, or type : for emoji…',
    hint: 'Select text for a bar to format, highlight or comment on it, or to Ask AI to improve, shorten or translate it (a simulated AI, no real model; the last paragraph has typos on purpose). Type / for blocks and : for emoji; paste, drop or pick an image and it uploads by itself (to a simulated CDN).',
  },
}

const sample = computed(() => SAMPLES[zh.value ? 'zh' : 'en'])
const labels = computed(() => (zh.value ? MARKDOWN_EDITOR_ZH_LABELS : undefined))

function seedComments(): MarkdownEditorComment[] {
  const { doc, quote, author, question, answer } = sample.value
  const from = doc.indexOf(quote)
  const now = Date.now()
  return [{
    id: 'first-index',
    from,
    to: from + quote.length,
    quote,
    author: { id: 'lin', name: author, color: '#0ea5e9' },
    body: question,
    createdAt: now - 42 * 60_000,
    replies: [{ id: 'first-index-1', author: { id: 'local', name: labels.value?.you ?? 'You' }, body: answer, createdAt: now - 35 * 60_000 }],
  }]
}

const content = ref(sample.value.doc)
const comments = ref<MarkdownEditorComment[]>(seedComments())

watch(zh, () => {
  content.value = sample.value.doc
  comments.value = seedComments()
})

const ai = createDemoAi(() => [SAMPLES.zh.doc, SAMPLES.en.doc])
</script>

<template>
  <div class="not-prose grid gap-2">
    <TxMarkdownEditor
      v-model="content"
      v-model:comments="comments"
      :labels="labels"
      :placeholder="sample.placeholder"
      :upload-image="demoUploadImage"
      :ai="ai"
      :min-height="320"
      :max-height="560"
    />
    <span class="text-sm text-[var(--tx-text-color-secondary)]">{{ sample.hint }}</span>
  </div>
</template>
