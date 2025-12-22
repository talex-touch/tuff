export interface TranslationResult {
  text: string
  from: string
  to: string
  service: string
  provider?: string
  model?: string
  error?: string
}

export interface TranslationProvider {
  id: string
  name: string
  translate: (text: string, from: string, to: string, signal?: AbortSignal) => Promise<TranslationResult>
}
