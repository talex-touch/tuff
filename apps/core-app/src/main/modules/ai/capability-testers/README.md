# Capability Testers

能力测试器的注册制度实现，使用 OOP 方式管理不同类型能力的测试逻辑。

## 架构

### BaseCapabilityTester (基类)

所有测试器的抽象基类，定义了测试器的标准接口：

- `generateTestPayload()` - 生成测试 payload
- `formatTestResult()` - 格式化测试结果用于展示
- `getDefaultInputHint()` - 获取默认输入提示
- `requiresUserInput()` - 是否需要用户输入

### 内置测试器

当前 `IntelligenceModule.registerCapabilities()` 注册的 30 个稳定能力都必须有测试器覆盖。按能力域划分如下：

| 能力域 | capabilityId | 测试器文件 |
|------|------|------|
| Text | `text.chat`, `text.translate`, `text.summarize`, `text.rewrite`, `text.grammar`, `text.classify` | `chat-tester.ts`, `translate-tester.ts`, `summarize-tester.ts`, `text-tester.ts`, `analysis-tester.ts` |
| Embedding | `embedding.generate` | `embedding-tester.ts` |
| Code | `code.generate`, `code.explain`, `code.review`, `code.refactor`, `code.debug` | `code-tester.ts` |
| Analysis | `intent.detect`, `sentiment.analyze`, `content.extract`, `keywords.extract` | `analysis-tester.ts` |
| Vision / Image | `vision.ocr`, `image.caption`, `image.analyze`, `image.translate.e2e`, `image.generate`, `image.edit` | `vision-tester.ts`, `image-tester.ts` |
| Audio | `audio.tts`, `audio.stt`, `audio.transcribe` | `audio-tester.ts` |
| RAG / Search | `rag.query`, `search.semantic`, `search.rerank` | `search-tester.ts` |
| Workflow / Agent | `workflow.execute`, `agent.run` | `workflow-agent-tester.ts` |

`registry-coverage.test.ts` 会直接对齐 `IntelligenceModule.registerCapabilities()` 的注册结果；新增或删除稳定能力时，必须同步更新对应 tester、registry 注册和覆盖测试。

### 注册系统

使用 `capabilityTesterRegistry` 注册测试器：

```typescript
import { capabilityTesterRegistry } from './capability-testers'

// 注册自定义测试器
capabilityTesterRegistry.register('custom.capability', new CustomTester())
```

## 添加新的测试器

1. 创建新的测试器类，继承 `BaseCapabilityTester<TPayload, TResult>`
2. 复用已有 typed payload / result 类型，不新增宽泛 `any` 返回
3. 使用 `buildTestResult()` 格式化 provider、model、latency、usage、稳定性字段
4. 在 `registry.ts` 中注册，并从 `index.ts` 导出对应文件
5. 更新 `registry-coverage.test.ts` 的稳定能力集守卫

示例：

```typescript
import type { IntelligenceInvokeResult } from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

interface CustomPayload {
  text: string
}

interface CustomResult {
  summary: string
}

export class CustomCapabilityTester extends BaseCapabilityTester<CustomPayload, CustomResult> {
  readonly capabilityType = 'custom'

  async generateTestPayload(input: CapabilityTestPayload): Promise<CustomPayload> {
    return {
      text: input.userInput || '请输入测试内容'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<CustomResult>) {
    return this.buildTestResult(result, {
      message: '测试成功',
      textPreview: result.result?.summary || ''
    })
  }

  getDefaultInputHint(): string {
    return '请输入测试内容'
  }

  requiresUserInput(): boolean {
    return true
  }
}
```

## UI 集成

测试对话框 (`CapabilityTestDialog.vue`) 会自动：
- 显示已启用的 providers 供用户选择
- 根据 `requiresUserInput()` 决定是否显示输入框
- 使用 `getDefaultInputHint()` 作为输入提示
