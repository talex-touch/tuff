import type { PromptTemplate } from './prompt-types'

const BUILTIN_PROMPTS: PromptTemplate[] = [
  {
    id: 'assistant_default',
    name: '通用助手',
    content: '你是一个有用的AI助手，请友好、准确地回答用户的问题。',
    builtin: true,
    category: 'general',
    description: '适用于日常对话和通用问题解答'
  },
  {
    id: 'ocr_assistant',
    name: 'OCR助手',
    content:
      '你是一名OCR助手，返回JSON，包含text/keywords/blocks等字段。请准确识别图片中的文字内容。',
    builtin: true,
    category: 'image',
    description: '专门用于图片文字识别和结构化输出'
  },
  {
    id: 'translation_assistant',
    name: '翻译助手',
    content: '你是一名专业的翻译助手，请准确翻译用户提供的文本，保持原意和语言风格。',
    builtin: true,
    category: 'language',
    description: '专业翻译服务，支持多语言转换'
  },
  {
    id: 'code_assistant',
    name: '编程助手',
    content: '你是一名专业的编程助手，请提供准确、清晰的代码解答和编程建议。',
    builtin: true,
    category: 'development',
    description: '编程相关问题解答和代码生成'
  },
  {
    id: 'data_analyst',
    name: '数据分析师',
    content:
      '你是一名专业的数据分析师，擅长数据处理、分析和可视化建议。请用专业的角度分析数据并提供见解。',
    builtin: true,
    category: 'analysis',
    description: '数据分析和业务洞察'
  },
  {
    id: 'creative_writer',
    name: '创意写作助手',
    content:
      '你是一名富有创意的写作助手，善于创作各种文体的内容。请根据用户需求提供高质量的创意写作。',
    builtin: true,
    category: 'creative',
    description: '创意写作和内容创作'
  }
]

export function getBuiltinPromptTemplates(): PromptTemplate[] {
  return BUILTIN_PROMPTS.map((prompt) => ({ ...prompt }))
}
