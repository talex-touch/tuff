<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

if (!import.meta.dev) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Not Found',
  })
}

const defaultMarkdown = `
# Streaming Markdown Demo

这个页面用于验证主聊天中的 Markdown 流式渲染效果。

## 有序列表（重点观察）

1. 第一条：流式中不要频繁断成多个列表。
2. 第二条：列表项较长时，刷新应尽量稳定。
3. 第三条：完成态后结构保持稳定。

## 无序列表与嵌套

- 一级 A
  - 二级 A.1
  - 二级 A.2
- 一级 B

## 表格

| Item | Status | Note |
| --- | --- | --- |
| streaming-gradient | enabled | 应该持续有渐变 pulse |
| generating-dot | enabled | 结束后应消失 |

## 代码块

\`\`\`ts
function sum(a: number, b: number) {
  return a + b
}
\`\`\`

## 数学公式

行内公式：$E = mc^2$，用于观察流式阶段的公式稳定性。

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

## Mermaid（代码块展示）

\`\`\`mermaid
graph TD
  A[用户输入] --> B{解析意图}
  B -->|chat| C[文本回复]
  B -->|image| D[图像生成]
  C --> E[写回会话]
  D --> E
\`\`\`

## SVG 预览测试

\`\`\`svg
<svg width="420" height="120" viewBox="0 0 420 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" rx="14" ry="14" width="404" height="104" fill="#f8fafc" stroke="#cbd5e1"/>
  <circle cx="56" cy="60" r="20" fill="url(#g1)"/>
  <text x="92" y="68" font-size="24" fill="#334155" font-family="Menlo, Consolas, monospace">SVG Preview OK</text>
</svg>
\`\`\`

## HTML 网页预览测试

\`\`\`html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview Demo</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; }
      .card { margin: 20px; padding: 16px; border-radius: 12px; background: #fff; border: 1px solid #e2e8f0; }
      h2 { margin: 0 0 8px; color: #0f172a; }
      p { margin: 0; color: #475569; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>HTML Preview OK</h2>
      <p>这个块用于验证代码块“预览”按钮和弹层效果。</p>
    </div>
  </body>
</html>
\`\`\`
`.trim()

const sourceMarkdown = ref(defaultMarkdown)
const renderedMarkdown = ref('')
const playbackMs = ref(16)
const isStreaming = ref(false)
const chunkCursor = ref(0)
const preparedChunks = ref<string[]>([])
const route = useRoute()

let playbackTimer: ReturnType<typeof setTimeout> | null = null

function clearPlaybackTimer() {
  if (!playbackTimer) {
    return
  }
  clearTimeout(playbackTimer)
  playbackTimer = null
}

function splitInlineBySize(content: string, maxSize: number): string[] {
  if (!content) {
    return []
  }

  const tokens = content.split(/(\s+)/).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const token of tokens) {
    if (!current) {
      current = token
      continue
    }

    if ((current + token).length > maxSize) {
      chunks.push(current)
      current = token
      continue
    }

    current += token
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function buildStreamChunks(source: string): string[] {
  const normalized = source.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const chunks: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || ''
    const listPrefix = line.match(/^(\s*(?:\d+\.|[-*+])\s+)/)?.[1] || ''

    if (listPrefix) {
      chunks.push(listPrefix)
      const rest = line.slice(listPrefix.length)
      chunks.push(...splitInlineBySize(rest, 12))
    }
    else {
      chunks.push(...splitInlineBySize(line, 16))
    }

    if (i < lines.length - 1) {
      chunks.push('\n')
    }
  }

  return chunks.filter(chunk => chunk.length > 0)
}

function runNextChunk() {
  if (!isStreaming.value) {
    return
  }

  const chunk = preparedChunks.value[chunkCursor.value]
  if (!chunk) {
    isStreaming.value = false
    clearPlaybackTimer()
    return
  }

  renderedMarkdown.value += chunk
  chunkCursor.value += 1
  playbackTimer = setTimeout(runNextChunk, playbackMs.value)
}

function replayDemo() {
  clearPlaybackTimer()
  preparedChunks.value = buildStreamChunks(sourceMarkdown.value)
  renderedMarkdown.value = ''
  chunkCursor.value = 0
  isStreaming.value = true
  runNextChunk()
}

function pauseDemo() {
  isStreaming.value = false
  clearPlaybackTimer()
}

function resumeDemo() {
  if (isStreaming.value || chunkCursor.value >= preparedChunks.value.length) {
    return
  }
  isStreaming.value = true
  runNextChunk()
}

function finishNow() {
  pauseDemo()
  renderedMarkdown.value = sourceMarkdown.value.replace(/\r\n/g, '\n')
  chunkCursor.value = preparedChunks.value.length
}

function resetDemo() {
  pauseDemo()
  renderedMarkdown.value = ''
  chunkCursor.value = 0
  preparedChunks.value = []
}

const progress = computed(() => {
  if (!preparedChunks.value.length) {
    return 0
  }
  return Math.min(100, Math.round((chunkCursor.value / preparedChunks.value.length) * 100))
})

onMounted(() => {
  const speedQuery = Number(route.query.speed || '')
  if (Number.isFinite(speedQuery) && speedQuery >= 16 && speedQuery <= 240) {
    playbackMs.value = speedQuery
  }

  if (route.query.autoplay === '1') {
    replayDemo()
  }
})

onBeforeUnmount(() => {
  clearPlaybackTimer()
})
</script>

<template>
  <div class="MarkdownStreamDemo">
    <h1>Dev Markdown Stream Demo</h1>
    <p class="hint">
      当前路由：<code>/test/markdown-stream</code>（仅开发环境可访问）
    </p>

    <div class="toolbar">
      <button type="button" @click="replayDemo">
        重新回放
      </button>
      <button type="button" :disabled="!isStreaming" @click="pauseDemo">
        暂停
      </button>
      <button type="button" :disabled="isStreaming || !preparedChunks.length" @click="resumeDemo">
        继续
      </button>
      <button type="button" @click="finishNow">
        立即完成
      </button>
      <button type="button" @click="resetDemo">
        清空
      </button>

      <label class="speed">
        速度 {{ playbackMs }}ms
        <input v-model.number="playbackMs" type="range" min="16" max="240" step="4">
      </label>

      <span class="progress">进度 {{ progress }}%</span>
    </div>

    <div class="layout">
      <section class="panel">
        <h2>Source Markdown</h2>
        <textarea v-model="sourceMarkdown" rows="24" spellcheck="false" />
      </section>

      <section class="panel preview">
        <h2>Stream Preview</h2>
        <RenderContent
          :data="renderedMarkdown"
          :dot-enable="isStreaming"
          :streaming-gradient="true"
        />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.MarkdownStreamDemo {
  --demo-panel-height: min(72vh, 760px);
  margin: 0 auto;
  padding: 1rem 1.25rem 1.5rem;
  max-width: 1400px;

  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .hint {
    margin: 0.5rem 0 0;
    color: var(--el-text-color-secondary);
  }
}

.toolbar {
  margin-top: 0.875rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;

  button {
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    padding: 0.35rem 0.65rem;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .speed {
    margin-left: 0.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--el-text-color-secondary);
  }

  .progress {
    margin-left: auto;
    color: var(--el-text-color-secondary);
  }
}

.layout {
  margin-top: 1rem;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr);
  gap: 1rem;

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
}

.panel {
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 0.75rem;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: var(--demo-panel-height);

  h2 {
    margin: 0 0 0.625rem;
    font-size: 1rem;
    font-weight: 600;
  }

  textarea {
    flex: 1;
    width: 100%;
    min-height: 0;
    height: 100%;
    resize: none;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    padding: 0.625rem 0.75rem;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-blank);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    line-height: 1.5;
  }
}

.preview {
  :deep(.RenderContent) {
    position: relative;
    flex: 1;
    min-height: 0;
    max-height: 100%;
    border-radius: 8px;
    overflow: auto;
    background: var(--el-fill-color-blank);
  }
}
</style>
