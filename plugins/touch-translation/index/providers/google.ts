import type {
  TranslationMeaning,
  TranslationPronunciation,
  TranslationProvider,
  TranslationResult,
} from '../types'

interface GoogleSentence {
  trans?: string
  translit?: string
}

interface GoogleDictionaryWordEntry {
  word?: string
}

interface GoogleDictionaryEntry {
  pos?: string
  terms?: string[]
  entry?: GoogleDictionaryWordEntry[]
}

interface GoogleTranslateJsonResponse {
  sentences?: GoogleSentence[]
  dict?: GoogleDictionaryEntry[]
  src?: string
}

interface DictionaryApiPhonetic {
  text?: string
  audio?: string
}

interface DictionaryApiDefinition {
  definition?: string
  example?: string
}

interface DictionaryApiMeaning {
  partOfSpeech?: string
  definitions?: DictionaryApiDefinition[]
}

interface DictionaryApiEntry {
  phonetic?: string
  phonetics?: DictionaryApiPhonetic[]
  meanings?: DictionaryApiMeaning[]
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function pushUnique(target: string[], value: string): void {
  const normalized = normalizeText(value)
  if (!normalized || target.includes(normalized)) {
    return
  }
  target.push(normalized)
}

function mergeMeanings(groups: TranslationMeaning[]): TranslationMeaning[] {
  const merged = new Map<string, TranslationMeaning>()

  for (const group of groups) {
    const key = normalizeText(group.partOfSpeech) || '__fallback__'
    const current = merged.get(key) ?? {
      partOfSpeech: normalizeText(group.partOfSpeech) || undefined,
      terms: [],
      definitions: [],
    }

    for (const term of group.terms ?? []) {
      pushUnique(current.terms!, term)
    }

    for (const definition of group.definitions ?? []) {
      pushUnique(current.definitions!, definition)
    }

    merged.set(key, current)
  }

  return [...merged.values()].filter(
    group => (group.terms?.length ?? 0) > 0 || (group.definitions?.length ?? 0) > 0,
  )
}

function inferPronunciationLabel(audioUrl: string): string | undefined {
  const normalizedUrl = audioUrl.toLowerCase()
  if (normalizedUrl.includes('-us.')) {
    return 'US'
  }
  if (normalizedUrl.includes('-uk.')) {
    return 'UK'
  }
  if (normalizedUrl.includes('-au.')) {
    return 'AU'
  }
  return undefined
}

function normalizePronunciations(input: DictionaryApiPhonetic[] | undefined): TranslationPronunciation[] {
  if (!Array.isArray(input)) {
    return []
  }

  const unique = new Set<string>()
  const pronunciations: TranslationPronunciation[] = []

  for (const item of input) {
    const text = normalizeText(item?.text)
    const audioUrl = normalizeText(item?.audio)
    if (!text && !audioUrl) {
      continue
    }

    const key = `${text}::${audioUrl}`
    if (unique.has(key)) {
      continue
    }
    unique.add(key)

    pronunciations.push({
      label: audioUrl ? inferPronunciationLabel(audioUrl) : undefined,
      text: text || undefined,
      audioUrl: audioUrl || undefined,
    })
  }

  return pronunciations
}

function normalizeDictionaryDefinitions(input: DictionaryApiDefinition[] | undefined): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  const definitions: string[] = []
  for (const item of input) {
    const definition = normalizeText(item?.definition)
    if (!definition) {
      continue
    }

    const example = normalizeText(item?.example)
    pushUnique(
      definitions,
      example ? `${definition} 例：${example}` : definition,
    )
  }

  return definitions
}

function normalizeDictionaryMeanings(entries: DictionaryApiEntry[]): TranslationMeaning[] {
  const meanings: TranslationMeaning[] = []

  for (const entry of entries) {
    for (const meaning of entry.meanings ?? []) {
      meanings.push({
        partOfSpeech: normalizeText(meaning?.partOfSpeech) || undefined,
        definitions: normalizeDictionaryDefinitions(meaning?.definitions),
      })
    }
  }

  return mergeMeanings(meanings)
}

function normalizeGoogleMeanings(input: GoogleDictionaryEntry[] | undefined): TranslationMeaning[] {
  if (!Array.isArray(input)) {
    return []
  }

  const meanings: TranslationMeaning[] = []
  for (const entry of input) {
    const terms: string[] = []

    for (const term of entry.terms ?? []) {
      pushUnique(terms, term)
    }

    for (const wordEntry of entry.entry ?? []) {
      pushUnique(terms, wordEntry.word ?? '')
    }

    meanings.push({
      partOfSpeech: normalizeText(entry.pos) || undefined,
      terms,
    })
  }

  return mergeMeanings(meanings)
}

function shouldFetchEnglishDictionary(text: string, sourceLang: string): boolean {
  return sourceLang === 'en' && /^[a-z]+(?:['-][a-z]+)*$/i.test(text.trim())
}

async function fetchEnglishDictionaryDetails(
  http: any,
  text: string,
  signal?: AbortSignal,
): Promise<{
  phonetic?: string
  pronunciations: TranslationPronunciation[]
  meanings: TranslationMeaning[]
}> {
  try {
    const response = await http.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`,
      {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
    )

    const data = response.data || response
    if (!Array.isArray(data)) {
      return { pronunciations: [], meanings: [] }
    }

    const entries = data as DictionaryApiEntry[]
    const phonetic =
      normalizeText(entries.find(entry => normalizeText(entry.phonetic))?.phonetic)
      || normalizeText(
        entries.flatMap(entry => entry.phonetics ?? []).find(item => normalizeText(item.text))?.text,
      )
      || undefined

    const pronunciations = normalizePronunciations(
      entries.flatMap(entry => entry.phonetics ?? []),
    )
    const meanings = normalizeDictionaryMeanings(entries)

    return { phonetic, pronunciations, meanings }
  }
  catch {
    return { pronunciations: [], meanings: [] }
  }
}

export class GoogleProvider implements TranslationProvider {
  id = 'google'
  name = 'Google Translate'

  async translate(text: string, from: string, to: string, signal?: AbortSignal): Promise<TranslationResult> {
    const { http, URLSearchParams } = globalThis as any

    try {
      const params = new URLSearchParams({
        client: 'gtx',
        sl: from,
        tl: to,
        dj: '1',
        q: text,
      })
      params.append('dt', 't')
      params.append('dt', 'bd')
      params.append('dt', 'rm')

      const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`

      const response = await http.get(url, {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      const data = (response.data || response) as GoogleTranslateJsonResponse

      if (!data || !Array.isArray(data.sentences) || data.sentences.length === 0) {
        throw new Error('Invalid response format')
      }

      const translatedText = data.sentences
        .map(sentence => normalizeText(sentence.trans))
        .filter(Boolean)
        .join('')
      const transliteration = data.sentences
        .map(sentence => normalizeText(sentence.translit))
        .filter(Boolean)
        .join(' ')
        .trim()
      const detectedLang = normalizeText(data.src) || from

      const dictionaryDetails = shouldFetchEnglishDictionary(text, detectedLang)
        ? await fetchEnglishDictionaryDetails(http, text, signal)
        : { pronunciations: [], meanings: [] as TranslationMeaning[], phonetic: undefined as string | undefined }

      return {
        text: translatedText || text,
        from: detectedLang,
        to,
        service: this.id,
        transliteration: transliteration || undefined,
        phonetic: dictionaryDetails.phonetic,
        pronunciations: dictionaryDetails.pronunciations,
        meanings: mergeMeanings([
          ...normalizeGoogleMeanings(data.dict),
          ...dictionaryDetails.meanings,
        ]),
      }
    }
    catch (error) {
      return {
        text: `[Translation Failed] ${text}`,
        from,
        to,
        service: this.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
