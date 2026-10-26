import type { Translate } from '~/modules/lang/useI18nText'
import type { PromptTemplate } from './prompt-types'

type BuiltinPromptDefinition = Omit<PromptTemplate, 'name' | 'description'> & {
  name: (t: Translate) => string
  description: (t: Translate) => string
}

const BUILTIN_PROMPTS: BuiltinPromptDefinition[] = [
  {
    id: 'assistant_default',
    name: (t) => t('settings.intelligence.builtinPromptTemplate.assistant_default.name'),
    content: '你是一个有用的AI助手，请友好、准确地回答用户的问题。',
    builtin: true,
    category: 'general',
    description: (t) =>
      t('settings.intelligence.builtinPromptTemplate.assistant_default.description')
  },
  {
    id: 'ocr_assistant',
    name: (t) => t('settings.intelligence.builtinPromptTemplate.ocr_assistant.name'),
    content:
      '你是一名OCR助手，返回JSON，包含text/keywords/blocks等字段。请准确识别图片中的文字内容。',
    builtin: true,
    category: 'image',
    description: (t) => t('settings.intelligence.builtinPromptTemplate.ocr_assistant.description')
  },
  {
    id: 'translation_assistant',
    name: (t) => t('settings.intelligence.builtinPromptTemplate.translation_assistant.name'),
    content: '你是一名专业的翻译助手，请准确翻译用户提供的文本，保持原意和语言风格。',
    builtin: true,
    category: 'language',
    description: (t) =>
      t('settings.intelligence.builtinPromptTemplate.translation_assistant.description')
  },
  {
    id: 'code_assistant',
    name: (t) => t('settings.intelligence.builtinPromptTemplate.code_assistant.name'),
    content: '你是一名专业的编程助手，请提供准确、清晰的代码解答和编程建议。',
    builtin: true,
    category: 'development',
    description: (t) => t('settings.intelligence.builtinPromptTemplate.code_assistant.description')
  },
  {
    id: 'data_analyst',
    name: (t) => t('settings.intelligence.builtinPromptTemplate.data_analyst.name'),
    content:
      '你是一名专业的数据分析师，擅长数据处理、分析和可视化建议。请用专业的角度分析数据并提供见解。',
    builtin: true,
    category: 'analysis',
    description: (t) => t('settings.intelligence.builtinPromptTemplate.data_analyst.description')
  },
  {
    id: 'creative_writer',
    name: (t) => t('settings.intelligence.builtinPromptTemplate.creative_writer.name'),
    content:
      '你是一名富有创意的写作助手，善于创作各种文体的内容。请根据用户需求提供高质量的创意写作。',
    builtin: true,
    category: 'creative',
    description: (t) => t('settings.intelligence.builtinPromptTemplate.creative_writer.description')
  }
]

/**
 * The templates as the interface language words them. Names and descriptions are read through
 * `t` on every call, so a caller that keeps the result reactive follows a language switch.
 * `content` stays as written: it is what the model is sent, and its language steers the reply's.
 */
export function getBuiltinPromptTemplates(t: Translate): PromptTemplate[] {
  return BUILTIN_PROMPTS.map(({ name, description, ...prompt }) => ({
    ...prompt,
    name: name(t),
    description: description(t)
  }))
}
