---
title: 搜索匹配 API
description: CoreBox 搜索匹配系统的 API 文档，包括拼音匹配、模糊搜索和高亮显示
---

# 搜索匹配 API

## 概述
CoreBox 搜索系统提供强大的搜索匹配能力，支持：

- **中文拼音匹配**：搜索 `fanyi` 可以匹配 `翻译`
- **首字母缩写**：搜索 `fy` 可以匹配 `翻译`
- **模糊匹配**：容错搜索，如 `helol` 匹配 `hello`
- **高亮显示**：搜索结果中高亮匹配的部分

## 介绍
搜索匹配由 Feature 的标题、描述、关键词与剪贴板输入组合生成，适合用于构建自定义搜索与高亮 UI。

## 搜索令牌 (Search Tokens)

插件 Feature 在注册时会自动生成搜索令牌，包括：

- 原始名称（小写）
- 拼音全拼
- 拼音首字母
- 关键词
- 命令值

**自定义关键词**

在 `manifest.json` 中为 Feature 添加 `keywords` 可以增强搜索匹配：

```json
{
  "features": [
    {
      "id": "translate",
      "name": "翻译",
      "desc": "翻译选中的文本",
      "keywords": ["translate", "translation", "fanyi", "fy"]
    }
  ]
}
```

## 匹配类型与优先级

搜索引擎按以下优先级进行匹配：

| 优先级 | 匹配类型 | 分数范围 | 说明 |
|--------|----------|----------|------|
| 1 | 精确匹配 | 1000 | 标题完全匹配查询 |
| 2 | 前缀匹配 | 800-900 | 标题以查询开头 |
| 3 | 令牌匹配 | 600-950 | 拼音/首字母/关键词匹配 |
| 4 | 包含匹配 | 600-700 | 标题包含查询 |
| 5 | 描述匹配 | 400 | 描述中包含查询 |
| 6 | 模糊匹配 | 0-500 | 容错匹配 |

## 高亮显示

搜索结果会包含 `matchResult` 字段用于 UI 高亮显示：

```typescript
interface MatchRange {
  start: number  // 起始位置
  end: number    // 结束位置（不含）
}

// 在 TuffItem.meta.extension 中
interface FeatureExtension {
  matchResult?: MatchRange[]
  searchTokens?: string[]
}
```

**渲染器中使用高亮**

BoxItem 组件自动处理 `matchResult` 高亮：

```vue
<h5
  class="text-sm font-semibold truncate"
  v-html="getHighlightedHTML(
    render.basic?.title || '',
    props.item.meta?.extension?.matchResult
  )"
/>
```

`getHighlightedHTML` 函数会将匹配区域包裹在 `<span>` 中：

```typescript
function getHighlightedHTML(
  text: string,
  matchedIndices?: MatchRange[],
  opts?: {
    className?: string   // 高亮 CSS 类名
    base?: 0 | 1        // 索引基数
    inclusiveEnd?: boolean
  }
): string
```

## 在插件中使用搜索匹配

**使用 matchFeature 函数**

`@talex-touch/utils/search` 导出的 `matchFeature` 函数可用于自定义搜索：

```typescript
import { matchFeature } from '@talex-touch/utils/search'

const result = matchFeature({
  title: '翻译',
  desc: '翻译选中的文本',
  searchTokens: ['翻译', 'fanyi', 'fy', 'translate'],
  query: 'fanyi',
  enableFuzzy: true
})

if (result.matched) {
  console.log('匹配类型:', result.matchType)
  console.log('匹配分数:', result.score)
  console.log('高亮区域:', result.matchRanges)
}
```

**FeatureMatchResult 接口**

```typescript
interface FeatureMatchResult {
  /** 是否匹配 */
  matched: boolean
  /** 匹配分数 (0-1000) */
  score: number
  /** 匹配类型 */
  matchType: 'exact' | 'token' | 'prefix' | 'contains' | 'fuzzy' | 'none'
  /** 高亮区域 */
  matchRanges: MatchRange[]
  /** 匹配的令牌（调试用） */
  matchedToken?: string
}
```

## 模糊匹配 API

**fuzzyMatch 函数**

用于容错搜索，支持拼写错误：

```typescript
import { fuzzyMatch, indicesToRanges } from '@talex-touch/utils/search'

const result = fuzzyMatch('hello', 'helol', 2)

if (result.matched) {
  console.log('分数:', result.score)
  console.log('匹配索引:', result.matchedIndices)
  
  // 转换为高亮区域
  const ranges = indicesToRanges(result.matchedIndices)
}
```

**FuzzyMatchResult 接口**

```typescript
interface FuzzyMatchResult {
  /** 是否匹配 */
  matched: boolean
  /** 匹配分数 (0-1) */
  score: number
  /** 匹配字符的索引数组 */
  matchedIndices: number[]
}
```

## 命令匹配

Feature 的 `commands` 字段用于精确匹配触发：

```json
{
  "features": [
    {
      "id": "search-web",
      "name": "搜索网页",
      "commands": [
        { "type": "over" },
        { "type": "match", "value": ["g ", "google "] },
        { "type": "contain", "value": "搜索" },
        { "type": "regex", "value": "^s\\s+" }
      ]
    }
  ]
}
```

命令类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| `over` | 始终匹配 | 显示在空白搜索结果中 |
| `match` | 前缀匹配 | `g hello` 匹配 `g ` |
| `contain` | 包含匹配 | `我要搜索` 匹配 `搜索` |
| `regex` | 正则匹配 | `s hello` 匹配 `^s\\s+` |

## 剪贴板状态同步

搜索查询会包含当前剪贴板状态：

```typescript
interface TuffQuery {
  text: string
  inputs?: TuffQueryInput[]
}

interface TuffQueryInput {
  type: TuffInputType  // 'text' | 'image' | 'files' | 'html'
  content: string
  thumbnail?: string
  rawContent?: string
  metadata?: Record<string, unknown>
}
```

**声明接受的输入类型**

在 Feature 中声明 `acceptedInputTypes` 以接收剪贴板内容：

```json
{
  "features": [
    {
      "id": "image-ocr",
      "name": "图片文字识别",
      "acceptedInputTypes": ["image"]
    }
  ]
}
```

支持的输入类型：
- `text` - 纯文本
- `image` - 图片（Base64）
- `files` - 文件路径列表
- `html` - HTML 富文本

## 最佳实践

1. **提供多语言关键词**：在 `keywords` 中包含英文和中文
2. **使用有意义的 Feature 名称**：名称会自动生成拼音令牌
3. **声明 acceptedInputTypes**：明确 Feature 能处理的输入类型
4. **合理使用命令类型**：`over` 用于通用功能，`match` 用于特定前缀触发

## 技术原理
- 搜索令牌在 Feature 注册时生成，并以 `searchTokens` 参与评分。
- `matchFeature` 与 `fuzzyMatch` 负责计算匹配类型、分数与高亮范围。

## 相关链接

- [Feature API](/docs/dev/api/feature)
- [Box API](/docs/dev/api/box)
- [Manifest 配置](/docs/dev/reference/manifest)
