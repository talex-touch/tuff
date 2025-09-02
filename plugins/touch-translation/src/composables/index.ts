export { useTranslation } from './useTranslation'
export { useTranslationProvider } from './useTranslationProvider'
export { useDark } from './dark'

// 导出类型
export type {
  TranslationProvider,
  TranslationResult,
  TranslationRequest,
  TranslationResponse,
  HistoryItem
} from '../types/translation'

// 导出所有翻译提供者
export { GoogleTranslateProvider } from '../providers/google-translate'
export { DeepLTranslateProvider } from '../providers/deepl-translate'
export { BingTranslateProvider } from '../providers/bing-translate'
export { CustomTranslateProvider } from '../providers/custom-translate'