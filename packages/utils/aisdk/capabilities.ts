import { aiCapabilityRegistry } from './registry'
import { AiCapabilityType, AiProviderType } from '../types/aisdk'

const BUILTIN_CAPABILITIES = [
  {
    id: 'text.chat',
    type: AiCapabilityType.CHAT,
    name: '文本对话',
    description: '多轮对话、翻译、总结等通用文本任务',
    supportedProviders: [
      AiProviderType.OPENAI,
      AiProviderType.ANTHROPIC,
      AiProviderType.DEEPSEEK,
      AiProviderType.SILICONFLOW,
      AiProviderType.LOCAL,
      AiProviderType.CUSTOM
    ]
  },
  {
    id: 'embedding.generate',
    type: AiCapabilityType.EMBEDDING,
    name: 'Embedding',
    description: '生成语义向量用于检索、摘要、排序等',
    supportedProviders: [
      AiProviderType.OPENAI,
      AiProviderType.SILICONFLOW,
      AiProviderType.LOCAL,
      AiProviderType.CUSTOM
    ]
  },
  {
    id: 'vision.ocr',
    type: AiCapabilityType.VISION,
    name: '视觉 OCR',
    description: '对图片、截图执行 OCR，返回文本、关键词、布局',
    supportedProviders: [
      AiProviderType.OPENAI,
      AiProviderType.SILICONFLOW,
      AiProviderType.DEEPSEEK
    ],
    metadata: {
      mode: 'ocr'
    }
  }
]

for (const capability of BUILTIN_CAPABILITIES) {
  if (!aiCapabilityRegistry.has(capability.id)) {
    aiCapabilityRegistry.register(capability)
  }
}
