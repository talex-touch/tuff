# Capabilities & Usage

## Text

- `text.chat`
- `text.translate`
- `text.summarize`
- `text.rewrite`
- `text.grammarCheck`

## Vision

- `vision.ocr`

**OCR example**

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

## Embedding

- `embedding.generate`

**Embedding governance**

`embedding.generate` applies:

- normalize `string | string[]` into a single string
- chunking + truncation (length limits)
- multi-request embeddings, then vector aggregation (weighted average)

So callers don't need to manually chunk the input.

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
