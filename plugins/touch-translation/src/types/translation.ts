export interface TranslationResult {
  text: string
  sourceLanguage?: string
  targetLanguage: string
  provider: string
  timestamp: number
}

export interface TranslationProvider {
  name: string
  id: string
  type: 'api' | 'web' | 'ai'
  enabled: boolean
  config?: Record<string, any>
  translate: (text: string, targetLang?: string, sourceLang?: string) => Promise<TranslationResult>
}

export interface TranslationRequest {
  text: string
  targetLanguage: string
  sourceLanguage?: string
  providers: string[]
}

export interface TranslationResponse {
  request: TranslationRequest
  results: Map<string, TranslationResult>
  errors: Map<string, Error>
  isLoading: boolean
  isComplete: boolean
}

export interface HistoryItem {
  id: number
  text: string
  timestamp: number
  results?: TranslationResult[]
}