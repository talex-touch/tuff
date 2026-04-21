export interface TranslationPronunciation {
  label?: string
  text?: string
  audioUrl?: string
}

export interface TranslationMeaning {
  partOfSpeech?: string
  terms?: string[]
  definitions?: string[]
}

export interface TranslationResult {
  text: string
  from: string
  to: string
  service: string
  provider?: string
  model?: string
  phonetic?: string
  transliteration?: string
  pronunciations?: TranslationPronunciation[]
  meanings?: TranslationMeaning[]
  error?: string
}

export interface TranslationProvider {
  id: string
  name: string
  translate: (text: string, from: string, to: string, signal?: AbortSignal) => Promise<TranslationResult>
}
