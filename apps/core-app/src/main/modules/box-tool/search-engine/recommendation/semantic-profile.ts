import type { ContextSignal } from '@talex-touch/utils/core-box'
import { isTerminalApp } from './app-category-rules'

const VECTOR_DIMENSIONS = 64
const VECTOR_DIMENSION_MASK = VECTOR_DIMENSIONS - 1

export const CANDIDATE_SEMANTIC_PROFILE_CACHE_MAX = 512

const TYPED_VECTOR = Symbol('recommendation.semanticProfile.typedVector')
const TOKEN_SET = Symbol('recommendation.semanticProfile.tokenSet')

const STOP_TOKENS = new Set([
  'app',
  'apps',
  'application',
  'com',
  'desktop',
  'exe',
  'linux',
  'mac',
  'net',
  'org',
  'provider',
  'windows'
])

const IDE_NEEDLES = [
  'vscode',
  'visual studio code',
  'codium',
  'jetbrains',
  'intellij',
  'pycharm',
  'webstorm',
  'goland',
  'rider',
  'xcode',
  'android studio'
] as const

const TERMINAL_NEEDLES = [
  'terminal',
  '终端',
  'iterm',
  'wezterm',
  'alacritty',
  'net.kovidgoyal.kitty',
  'kitty terminal',
  'ghostty',
  'tabby',
  'cmux',
  'waveterm',
  'windterm',
  'electerm',
  'pwsh',
  'powershell',
  'git bash',
  'git-bash',
  'command prompt',
  'dev.warp.warp',
  'co.zeit.hyper',
  'com.raphaelamorim.rio',
  'rio terminal',
  'rioterm',
  'microsoft.windowsterminal',
  'konsole',
  'ptyxis',
  'tilix'
] as const

const EXACT_TITLE_TERMINAL_NAMES = new Set(['cmd', 'wt', 'hyper'])

const BROWSER_NEEDLES = [
  'chrome',
  'safari',
  'firefox',
  'edge',
  'brave',
  'opera',
  'browser'
] as const

const DESIGN_NEEDLES = [
  'figma',
  'sketch',
  'photoshop',
  'illustrator',
  'pixelmator',
  'preview',
  'gimp',
  'krita',
  'canva'
] as const

const EDITOR_NEEDLES = [
  'textedit',
  'sublime',
  'bbedit',
  'coteditor',
  'typora',
  'vim',
  'neovim'
] as const

const FILE_MANAGER_NEEDLES = ['finder', 'explorer', 'files', 'file manager'] as const

const SOCIAL_NEEDLES = [
  'discord',
  'telegram',
  'wechat',
  'spotify',
  'music',
  'netflix',
  'youtube',
  'twitter',
  'x.com'
] as const

const API_CLIENT_NEEDLES = ['postman', 'insomnia'] as const

export interface RecommendationSemanticProfile {
  tokens: string[]
  text: string
  vector: number[]
}

interface InternalSemanticProfile extends RecommendationSemanticProfile {
  [TYPED_VECTOR]?: Float32Array
  [TOKEN_SET]?: ReadonlySet<string>
}

export interface RecommendationSemanticCandidateInput {
  sourceId: string
  itemId: string
  sourceType: string
  source?: string
  title?: string
  subtitle?: string
}

const candidateProfileMemo = new Map<string, RecommendationSemanticProfile>()

export function clearCandidateSemanticProfileCache(): void {
  candidateProfileMemo.clear()
}

export function getCandidateSemanticProfileCacheSize(): number {
  return candidateProfileMemo.size
}

export function buildRecommendationSemanticProfile(
  context: ContextSignal
): RecommendationSemanticProfile {
  const tokens: string[] = []

  tokens.push(`time:${context.time.timeSlot}`)
  tokens.push(context.time.isWorkingHours ? 'work-hours' : 'off-hours')
  tokens.push(context.time.dayOfWeek >= 1 && context.time.dayOfWeek <= 5 ? 'weekday' : 'weekend')

  if (context.clipboard) {
    tokens.push(`clipboard:${context.clipboard.type}`)
    if (context.clipboard.contentType) {
      tokens.push(`clipboard-content:${context.clipboard.contentType}`)
    }

    const fileType = context.clipboard.meta?.fileType
    if (typeof fileType === 'string') {
      tokens.push(`file:${fileType}`)
    }

    const language = context.clipboard.meta?.language
    if (typeof language === 'string' && language) {
      tokens.push(`lang:${language.toLowerCase()}`)
    }

    if (context.clipboard.contentType === 'url' || context.clipboard.meta?.isUrl === true) {
      tokens.push('task:web', 'app:browser', 'research')
    }

    if (fileType === 'code' || context.clipboard.contentType === 'code') {
      tokens.push('task:dev', 'code', 'app:ide', 'app:terminal', 'editor', 'work')
    } else if (fileType === 'image' || context.clipboard.type === 'image') {
      tokens.push('image', 'creative', 'app:design')
    } else if (fileType === 'text' || context.clipboard.contentType === 'text') {
      tokens.push('docs', 'editor', 'work')
    } else if (fileType === 'document') {
      tokens.push('docs', 'reader', 'work')
    }
  }

  if (context.selection) {
    tokens.push('selection')
    if (context.selection.contentType) {
      tokens.push(`selection-content:${context.selection.contentType}`)
    }

    const selectionLanguage = context.selection.meta?.language
    if (typeof selectionLanguage === 'string' && selectionLanguage) {
      tokens.push(`lang:${selectionLanguage.toLowerCase()}`)
    }

    if (context.selection.contentType === 'url' || context.selection.meta?.isUrl === true) {
      tokens.push('task:web', 'app:browser', 'research')
    } else if (context.selection.meta?.fileType === 'code') {
      tokens.push('task:dev', 'code', 'app:ide', 'editor', 'work')
    }
  }

  if (context.foregroundApp) {
    const foregroundTokens = inferAppCategoryTokens(
      context.foregroundApp.bundleId,
      context.foregroundApp.name
    )
    tokens.push(...foregroundTokens)

    if (foregroundTokens.includes('app:ide')) {
      tokens.push('task:dev', 'app:terminal', 'shell', 'work')
    }
    if (foregroundTokens.includes('app:browser')) {
      tokens.push('task:web', 'research', 'app:ide', 'developer-tool')
    }
  }

  if (context.systemState) {
    const state = context.systemState
    tokens.push(state.isOnline ? 'online' : 'offline')
    if (state.networkType) {
      tokens.push(`network:${state.networkType}`)
    }
    if (state.locationBucket) {
      tokens.push('location:bucket')
    }
    if (state.timezoneChanged) {
      tokens.push('travel', 'timezone:changed')
    }

    if (state.focusMode === 'active' || state.isDNDEnabled) {
      tokens.push('focus', 'work', 'task:dev', 'app:ide', 'app:terminal', 'editor', 'docs')
    }

    const lowBattery =
      state.powerMode === 'battery' &&
      (typeof state.batteryLevel !== 'number' || state.batteryLevel <= 25)
    if (lowBattery) {
      tokens.push('power:low', 'lightweight', 'app:terminal', 'editor', 'docs')
    } else if (state.powerMode) {
      tokens.push(`power:${state.powerMode}`)
    }

    if (state.isOnline === false) {
      tokens.push('local-first', 'offline', 'app:terminal', 'editor', 'docs')
    }
  }

  return createProfile(tokens)
}

export function buildCandidateSemanticProfile(
  candidate: RecommendationSemanticCandidateInput
): RecommendationSemanticProfile {
  const cacheKey = buildCandidateMemoKey(candidate)
  const cached = candidateProfileMemo.get(cacheKey)
  if (cached) {
    candidateProfileMemo.delete(cacheKey)
    candidateProfileMemo.set(cacheKey, cached)
    return cached
  }

  const tokens: string[] = [
    `source:${candidate.source ?? 'unknown'}`,
    `source-type:${candidate.sourceType}`
  ]

  tokens.push(...splitIdentifier(candidate.sourceId))
  tokens.push(...splitIdentifier(candidate.itemId))
  tokens.push(...splitIdentifier(candidate.title))
  tokens.push(...splitIdentifier(candidate.subtitle))
  tokens.push(...inferAppCategoryTokens(candidate.itemId, candidate.title))

  const profile = createProfile(tokens)
  if (candidateProfileMemo.size >= CANDIDATE_SEMANTIC_PROFILE_CACHE_MAX) {
    const oldestKey = candidateProfileMemo.keys().next().value
    if (oldestKey !== undefined) {
      candidateProfileMemo.delete(oldestKey)
    }
  }
  candidateProfileMemo.set(cacheKey, profile)
  return profile
}

export function calculateLocalSemanticScore(
  contextProfile: RecommendationSemanticProfile,
  candidateProfile: RecommendationSemanticProfile
): number {
  if (contextProfile.tokens.length === 0 || candidateProfile.tokens.length === 0) {
    return 0
  }

  const cosine = cosineSimilarity(
    contextProfile as InternalSemanticProfile,
    candidateProfile as InternalSemanticProfile
  )
  const overlap = calculateTokenOverlap(
    contextProfile as InternalSemanticProfile,
    candidateProfile as InternalSemanticProfile
  )
  return clamp01(cosine * 0.75 + overlap * 0.25)
}

function buildCandidateMemoKey(candidate: RecommendationSemanticCandidateInput): string {
  return `${candidate.sourceId}\0${candidate.itemId}\0${candidate.sourceType}\0${candidate.source ?? ''}\0${candidate.title ?? ''}\0${candidate.subtitle ?? ''}`
}

function createProfile(tokens: string[]): RecommendationSemanticProfile {
  const { normalized, seen } = normalizeTokensWithSet(tokens)
  const { vector, typedVector } = vectorizeTokens(normalized)
  const profile: InternalSemanticProfile = {
    tokens: normalized,
    text: normalized.join(' '),
    vector
  }
  Object.defineProperties(profile, {
    [TYPED_VECTOR]: { value: typedVector, enumerable: false },
    [TOKEN_SET]: { value: seen, enumerable: false }
  })
  return profile
}

function splitIdentifier(value?: string): string[] {
  if (!value) return []
  return (
    value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Unicode-aware: the old [^a-zA-Z0-9] class erased CJK, Cyrillic and accented
      // Latin wholesale, so every non-ASCII-named app produced the same empty
      // profile and scored identically (#661).
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 1 && !STOP_TOKENS.has(part))
  )
}

function isTerminalIdentity(
  primaryId: string,
  secondaryName: string | undefined,
  loweredCombined: string
): boolean {
  if (isTerminalApp(primaryId)) return true
  if (includesAny(loweredCombined, TERMINAL_NEEDLES)) return true
  const normalizedTitle = secondaryName?.trim().toLowerCase()
  return Boolean(normalizedTitle && EXACT_TITLE_TERMINAL_NAMES.has(normalizedTitle))
}

function inferAppCategoryTokens(primaryId: string, secondaryName?: string): string[] {
  const value = `${primaryId} ${secondaryName ?? ''}`.toLowerCase()
  const tokens: string[] = []

  if (includesAny(value, IDE_NEEDLES)) {
    tokens.push('app:ide', 'task:dev', 'code', 'editor', 'work')
  }

  if (isTerminalIdentity(primaryId, secondaryName, value)) {
    tokens.push('app:terminal', 'task:dev', 'shell', 'work')
  }

  if (includesAny(value, BROWSER_NEEDLES)) {
    tokens.push('app:browser', 'task:web', 'research')
  }

  if (includesAny(value, DESIGN_NEEDLES)) {
    tokens.push('app:design', 'image', 'creative')
  }

  if (includesAny(value, EDITOR_NEEDLES)) {
    tokens.push('editor', 'docs', 'work')
  }

  if (includesAny(value, FILE_MANAGER_NEEDLES)) {
    tokens.push('app:file-manager', 'local-first', 'docs')
  }

  if (includesAny(value, SOCIAL_NEEDLES)) {
    tokens.push('app:social', 'entertainment')
  }

  if (includesAny(value, API_CLIENT_NEEDLES)) {
    tokens.push('developer-tool', 'task:dev', 'api', 'work')
  }

  return tokens
}

function vectorizeTokens(tokens: string[]): { vector: number[]; typedVector: Float32Array } {
  const typedVector = new Float32Array(VECTOR_DIMENSIONS)
  for (let i = 0; i < tokens.length; i += 1) {
    typedVector[hashToken(tokens[i]!) & VECTOR_DIMENSION_MASK] += 1
  }

  let sumSq = 0
  for (let i = 0; i < VECTOR_DIMENSIONS; i += 1) {
    const value = typedVector[i]!
    sumSq += value * value
  }

  const vector = new Array<number>(VECTOR_DIMENSIONS)
  if (sumSq === 0) {
    for (let i = 0; i < VECTOR_DIMENSIONS; i += 1) {
      vector[i] = 0
    }
    return { vector, typedVector }
  }

  const invMagnitude = 1 / Math.sqrt(sumSq)
  for (let i = 0; i < VECTOR_DIMENSIONS; i += 1) {
    const normalized = typedVector[i]! * invMagnitude
    typedVector[i] = normalized
    vector[i] = normalized
  }

  return { vector, typedVector }
}

function normalizeTokensWithSet(tokens: Array<string | undefined>): {
  normalized: string[]
  seen: Set<string>
} {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < tokens.length; i += 1) {
    const token = normalizeToken(tokens[i])
    if (!token || seen.has(token)) continue
    seen.add(token)
    normalized.push(token)
  }

  return { normalized, seen }
}

function normalizeToken(raw?: string): string | null {
  if (!raw) return null
  const token = raw.trim().toLowerCase()
  if (!token || STOP_TOKENS.has(token)) return null
  return token
}

function hashToken(token: string): number {
  let hash = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function cosineSimilarity(left: InternalSemanticProfile, right: InternalSemanticProfile): number {
  const leftTyped = left[TYPED_VECTOR]
  const rightTyped = right[TYPED_VECTOR]
  if (leftTyped && rightTyped) {
    let score = 0
    for (let i = 0; i < VECTOR_DIMENSIONS; i += 1) {
      score += leftTyped[i]! * rightTyped[i]!
    }
    return clamp01(score)
  }

  const leftVec = left.vector
  const rightVec = right.vector
  const length = Math.min(leftVec.length, rightVec.length)
  let score = 0
  for (let i = 0; i < length; i += 1) {
    score += leftVec[i]! * rightVec[i]!
  }
  return clamp01(score)
}

function ensureTokenSet(profile: InternalSemanticProfile): ReadonlySet<string> {
  let set = profile[TOKEN_SET]
  if (!set) {
    set = new Set(profile.tokens)
    Object.defineProperty(profile, TOKEN_SET, { value: set, enumerable: false })
  }
  return set
}

function calculateTokenOverlap(
  left: InternalSemanticProfile,
  right: InternalSemanticProfile
): number {
  const leftTokens = left.tokens
  const rightTokens = right.tokens
  let overlap = 0

  if (leftTokens.length <= rightTokens.length) {
    const rightSet = ensureTokenSet(right)
    for (let i = 0; i < leftTokens.length; i += 1) {
      if (rightSet.has(leftTokens[i]!)) overlap += 1
    }
  } else {
    const leftSet = ensureTokenSet(left)
    for (let i = 0; i < rightTokens.length; i += 1) {
      if (leftSet.has(rightTokens[i]!)) overlap += 1
    }
  }

  return clamp01(overlap / Math.sqrt(leftTokens.length * rightTokens.length))
}

function includesAny(value: string, needles: readonly string[]): boolean {
  for (let i = 0; i < needles.length; i += 1) {
    if (value.includes(needles[i]!)) return true
  }
  return false
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
