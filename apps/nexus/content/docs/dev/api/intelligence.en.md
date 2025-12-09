# Intelligence SDK

The Intelligence SDK provides a unified interface for plugins to access AI capabilities, supporting multiple AI Providers (OpenAI, Anthropic, DeepSeek, SiliconFlow, etc.).

## Quick Start

```typescript
import { useIntelligence } from '@talex-touch/utils/renderer/hooks'

const { text, vision, code, isLoading, lastError } = useIntelligence()

// AI Chat
const result = await text.chat({
  messages: [{ role: 'user', content: 'Hello!' }]
})

// Translation
const translated = await text.translate({
  text: 'Hello World',
  targetLang: 'zh-CN'
})

// OCR
const ocrResult = await vision.ocr({
  source: { type: 'data-url', dataUrl: imageDataUrl }
})
```

---

## API Reference

### useIntelligence()

Get Intelligence SDK instance (Vue Composable).

```typescript
import { useIntelligence } from '@talex-touch/utils/renderer/hooks'

const intelligence = useIntelligence()
```

Returns an object with the following properties and methods:

| Property/Method | Description |
|-----------------|-------------|
| `invoke` | Generic invocation interface |
| `text` | Text processing capabilities |
| `code` | Code processing capabilities |
| `analysis` | Analysis capabilities |
| `vision` | Vision processing capabilities |
| `embedding` | Vector embedding capabilities |
| `rag` | RAG retrieval capabilities |
| `agent` | Agent capabilities |
| `isLoading` | Loading state (Ref) |
| `lastError` | Last error message (Ref) |

---

## Text Processing (text)

### `text.chat(payload, options?)`

AI Chat.

```typescript
const result = await text.chat({
  messages: [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  maxTokens: 1000
})

console.log(result.result) // Chat response
console.log(result.usage)  // { promptTokens, completionTokens, totalTokens }
```

### `text.translate(payload, options?)`

Text translation.

```typescript
const result = await text.translate({
  text: 'Hello World',
  sourceLang: 'en',    // Optional, auto-detect
  targetLang: 'zh-CN'
})
```

### `text.summarize(payload, options?)`

Text summarization.

```typescript
const result = await text.summarize({
  text: longArticle,
  maxLength: 200,
  style: 'bullet-points'  // 'concise' | 'detailed' | 'bullet-points'
})
```

### `text.rewrite(payload, options?)`

Text rewriting.

```typescript
const result = await text.rewrite({
  text: 'This product is good',
  style: 'formal',        // 'formal' | 'casual' | 'professional' | 'creative'
  tone: 'authoritative'   // 'neutral' | 'friendly' | 'authoritative'
})
```

### `text.grammarCheck(payload, options?)`

Grammar checking.

```typescript
const result = await text.grammarCheck({
  text: 'I has a apple',
  language: 'en',
  checkTypes: ['spelling', 'grammar', 'punctuation']
})
```

---

## Code Processing (code)

### `code.generate(payload, options?)`

Code generation.

```typescript
const result = await code.generate({
  description: 'Implement a quicksort algorithm',
  language: 'typescript',
  includeTests: true,
  includeComments: true
})
```

### `code.explain(payload, options?)`

Code explanation.

```typescript
const result = await code.explain({
  code: 'const [a, b] = [b, a]',
  language: 'javascript',
  depth: 'detailed',
  targetAudience: 'beginner'
})
```

### `code.review(payload, options?)`

Code review.

```typescript
const result = await code.review({
  code: myCode,
  language: 'typescript',
  focusAreas: ['security', 'performance', 'best-practices']
})
```

### `code.refactor(payload, options?)`

Code refactoring.

```typescript
const result = await code.refactor({
  code: legacyCode,
  language: 'javascript',
  goals: ['readability', 'maintainability']
})
```

### `code.debug(payload, options?)`

Code debugging.

```typescript
const result = await code.debug({
  code: buggyCode,
  error: 'TypeError: Cannot read property...',
  stackTrace: '...'
})
```

---

## Analysis Capabilities (analysis)

### `analysis.detectIntent(payload, options?)`

Intent detection.

```typescript
const result = await analysis.detectIntent({
  text: 'Book a flight to New York tomorrow',
  possibleIntents: ['book_flight', 'book_hotel', 'query_weather']
})
```

### `analysis.analyzeSentiment(payload, options?)`

Sentiment analysis.

```typescript
const result = await analysis.analyzeSentiment({
  text: 'This product is amazing!',
  granularity: 'document'
})
```

### `analysis.extractContent(payload, options?)`

Content extraction.

```typescript
const result = await analysis.extractContent({
  text: 'Contact John at john@example.com or call 555-1234',
  extractTypes: ['people', 'phones', 'emails']
})
```

### `analysis.extractKeywords(payload, options?)`

Keyword extraction.

```typescript
const result = await analysis.extractKeywords({
  text: articleContent,
  maxKeywords: 10,
  includeScores: true
})
```

### `analysis.classify(payload, options?)`

Text classification.

```typescript
const result = await analysis.classify({
  text: 'Apple released a new iPhone',
  categories: ['Technology', 'Sports', 'Entertainment', 'Finance'],
  multiLabel: false
})
```

---

## Vision Processing (vision)

### `vision.ocr(payload, options?)`

OCR text recognition.

```typescript
const result = await vision.ocr({
  source: { 
    type: 'data-url', 
    dataUrl: 'data:image/png;base64,...' 
  },
  language: 'en',
  includeLayout: true,
  includeKeywords: true
})
```

**Image Source Types**:

```typescript
// Data URL
{ type: 'data-url', dataUrl: 'data:image/png;base64,...' }

// File path
{ type: 'file', filePath: '/path/to/image.png' }

// Base64
{ type: 'base64', base64: '...' }
```

### `vision.caption(payload, options?)`

Image captioning.

```typescript
const result = await vision.caption({
  source: { type: 'data-url', dataUrl: imageUrl },
  style: 'detailed',
  language: 'en'
})
```

### `vision.analyze(payload, options?)`

Image analysis.

```typescript
const result = await vision.analyze({
  source: { type: 'data-url', dataUrl: imageUrl },
  analysisTypes: ['objects', 'faces', 'colors', 'scene']
})
```

### `vision.generate(payload, options?)`

Image generation.

```typescript
const result = await vision.generate({
  prompt: 'A cute cat sitting on a sofa',
  width: 1024,
  height: 1024,
  quality: 'hd',
  count: 1
})
```

---

## Embedding (embedding)

### `embedding.generate(payload, options?)`

Generate text embeddings.

```typescript
const result = await embedding.generate({
  text: 'This is some text',
  model: 'text-embedding-3-small'
})

// result.result: [0.123, -0.456, ...] // Vector array
```

---

## RAG (rag)

### `rag.query(payload, options?)`

RAG query.

```typescript
const result = await rag.query({
  query: 'How to configure plugins?',
  documents: [...],
  topK: 5
})
```

### `rag.semanticSearch(payload, options?)`

Semantic search.

```typescript
const result = await rag.semanticSearch({
  query: 'user interface design',
  corpus: 'documentation',
  limit: 10
})
```

### `rag.rerank(payload, options?)`

Result reranking.

```typescript
const result = await rag.rerank({
  query: 'search query',
  documents: searchResults,
  topK: 5
})
```

---

## Agent (agent)

### `agent.run(payload, options?)`

Run an agent.

```typescript
const result = await agent.run({
  task: 'Analyze this data for me',
  tools: ['calculator', 'web_search'],
  context: { data: [...] }
})
```

---

## Generic Invocation

### `invoke(capabilityId, payload, options?)`

Directly invoke any capability.

```typescript
const result = await invoke('text.chat', {
  messages: [{ role: 'user', content: 'Hello' }]
})
```

---

## Invocation Options

All methods support a second `options` parameter:

```typescript
interface IntelligenceInvokeOptions {
  strategy?: string           // Strategy ID
  modelPreference?: string[]  // Preferred models list
  costCeiling?: number        // Cost ceiling
  latencyTarget?: number      // Target latency (ms)
  timeout?: number            // Timeout (ms)
  stream?: boolean            // Enable streaming
  preferredProviderId?: string // Preferred Provider
  allowedProviderIds?: string[] // Allowed Provider list
}
```

---

## Response Structure

All APIs return a unified response structure:

```typescript
interface IntelligenceInvokeResult<T> {
  result: T                    // Result data
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost?: number
  }
  model: string               // Model used
  latency: number             // Request latency (ms)
  traceId: string             // Trace ID
  provider: string            // Provider used
}
```

---

## State Management

```typescript
const { isLoading, lastError } = useIntelligence()

// Watch loading state
watch(isLoading, (loading) => {
  if (loading) {
    showLoadingSpinner()
  } else {
    hideLoadingSpinner()
  }
})

// Watch errors
watch(lastError, (error) => {
  if (error) {
    showErrorToast(error)
  }
})
```

---

## Provider Types

```typescript
enum IntelligenceProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom'
}
```

---

## Capability Types

```typescript
enum IntelligenceCapabilityType {
  // Text
  CHAT, COMPLETION, EMBEDDING, SUMMARIZE, TRANSLATE, REWRITE, GRAMMAR_CHECK,
  // Code
  CODE_GENERATE, CODE_EXPLAIN, CODE_REVIEW, CODE_REFACTOR, CODE_DEBUG,
  // Analysis
  INTENT_DETECT, SENTIMENT_ANALYZE, CONTENT_EXTRACT, KEYWORDS_EXTRACT, CLASSIFICATION,
  // Audio
  TTS, STT, AUDIO_TRANSCRIBE,
  // Vision
  VISION, VISION_OCR, IMAGE_CAPTION, IMAGE_ANALYZE, IMAGE_GENERATE, IMAGE_EDIT,
  // RAG
  RAG_QUERY, SEMANTIC_SEARCH, RERANK,
  // Workflow
  WORKFLOW, AGENT
}
```
