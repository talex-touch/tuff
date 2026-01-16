# 能力与使用

## 文本（Text）

- `text.chat`
- `text.translate`
- `text.summarize`
- `text.rewrite`
- `text.grammarCheck`

## 视觉（Vision）

- `vision.ocr`

### OCR 示例

```ts
import { useIntelligence } from '@talex-touch/utils/renderer/hooks'

const { vision } = useIntelligence()

const res = await vision.ocr({
  source: { type: 'data-url', dataUrl },
  includeLayout: true,
  includeKeywords: true,
})

console.log(res.result.text)
```

## 向量（Embedding）

- `embedding.generate`

### Embedding 输入治理

`embedding.generate` 会统一执行：

- `string | string[]` 归一化为单字符串
- chunking + truncation（长度限制）
- 多次 embedding 请求后做向量聚合（加权平均）

因此调用侧一般不需要再手动分块。

```ts
import { useIntelligence } from '@talex-touch/utils/renderer/hooks'

const { embedding } = useIntelligence()

const res = await embedding.generate({
  text: veryLongText,
})

console.log(res.result.length)
```

## Agent

- `agent.run`
