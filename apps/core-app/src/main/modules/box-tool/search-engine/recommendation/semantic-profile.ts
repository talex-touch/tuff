import type { ContextSignal } from '@talex-touch/utils/core-box'

const VECTOR_DIMENSIONS = 64
const USAGE_PREFERENCE_PROFILE_LIMIT = 24

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

export interface RecommendationSemanticProfile {
  tokens: string[]
  text: string
  vector: number[]
}

export interface RecommendationSemanticCandidateInput {
  sourceId: string
  itemId: string
  sourceType: string
  source?: string
  title?: string
  subtitle?: string
}

export interface RecommendationSemanticPreferenceInput extends RecommendationSemanticCandidateInput {
  searchCount?: number
  executeCount?: number
  cancelCount?: number
  lastSearched?: Date | null
  lastExecuted?: Date | null
  lastCancelled?: Date | null
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

  if (context.foregroundApp) {
    const foregroundTokens = inferAppCategoryTokens(
      `${context.foregroundApp.bundleId} ${context.foregroundApp.name}`
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
    if (typeof state.bluetoothConnectedCount === 'number' && state.bluetoothConnectedCount > 0) {
      tokens.push('device:bluetooth')
    }
    if (state.locationBucket) {
      tokens.push('location:bucket')
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

export function buildRecommendationUsagePreferenceProfile(
  candidates: RecommendationSemanticPreferenceInput[],
  now = Date.now()
): RecommendationSemanticProfile | null {
  const weightedCandidates = candidates
    .map((candidate) => ({
      candidate,
      weight: calculateUsagePreferenceWeight(candidate, now)
    }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, USAGE_PREFERENCE_PROFILE_LIMIT)

  if (weightedCandidates.length === 0) return null

  const tokenWeights = new Map<string, number>()
  for (const entry of weightedCandidates) {
    const profile = buildCandidateSemanticProfile(entry.candidate)
    for (const token of profile.tokens) {
      if (!isPreferenceToken(token)) continue
      tokenWeights.set(token, (tokenWeights.get(token) ?? 0) + entry.weight)
    }
  }

  if (tokenWeights.size === 0) return null
  return createWeightedProfile(tokenWeights)
}

export function buildCandidateSemanticProfile(
  candidate: RecommendationSemanticCandidateInput
): RecommendationSemanticProfile {
  const tokens: string[] = [
    `source:${candidate.source ?? 'unknown'}`,
    `source-type:${candidate.sourceType}`
  ]

  tokens.push(...splitIdentifier(candidate.sourceId))
  tokens.push(...splitIdentifier(candidate.itemId))
  tokens.push(...splitIdentifier(candidate.title))
  tokens.push(...splitIdentifier(candidate.subtitle))
  tokens.push(...inferAppCategoryTokens(`${candidate.itemId} ${candidate.title ?? ''}`))

  return createProfile(tokens)
}

export function calculateLocalSemanticScore(
  contextProfile: RecommendationSemanticProfile,
  candidateProfile: RecommendationSemanticProfile
): number {
  if (contextProfile.tokens.length === 0 || candidateProfile.tokens.length === 0) {
    return 0
  }

  const cosine = cosineSimilarity(contextProfile.vector, candidateProfile.vector)
  const overlap = calculateTokenOverlap(contextProfile.tokens, candidateProfile.tokens)
  return clamp01(cosine * 0.75 + overlap * 0.25)
}

function createProfile(tokens: string[]): RecommendationSemanticProfile {
  const normalized = normalizeTokens(tokens)
  return {
    tokens: normalized,
    text: normalized.join(' '),
    vector: vectorizeTokens(normalized)
  }
}

function createWeightedProfile(tokenWeights: Map<string, number>): RecommendationSemanticProfile {
  const entries = Array.from(tokenWeights.entries())
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
  const tokens = entries.map(([token]) => token)

  return {
    tokens,
    text: tokens.join(' '),
    vector: vectorizeWeightedTokens(entries)
  }
}

function normalizeTokens(tokens: Array<string | undefined>): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const raw of tokens) {
    const token = normalizeToken(raw)
    if (!token || seen.has(token)) continue
    seen.add(token)
    result.push(token)
  }

  return result
}

function normalizeToken(raw?: string): string | null {
  if (!raw) return null
  const token = raw.trim().toLowerCase()
  if (!token || STOP_TOKENS.has(token)) return null
  return token
}

function isPreferenceToken(token: string): boolean {
  return (
    token.includes(':') ||
    [
      'api',
      'code',
      'creative',
      'developer-tool',
      'docs',
      'editor',
      'entertainment',
      'image',
      'local-first',
      'reader',
      'research',
      'shell',
      'work'
    ].includes(token)
  )
}

function splitIdentifier(value?: string): string[] {
  if (!value) return []
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 1 && !STOP_TOKENS.has(part))
}

function inferAppCategoryTokens(identifier: string): string[] {
  const value = identifier.toLowerCase()
  const tokens: string[] = []

  if (
    includesAny(value, [
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
    ])
  ) {
    tokens.push('app:ide', 'task:dev', 'code', 'editor', 'work')
  }

  if (
    includesAny(value, [
      'terminal',
      'iterm',
      'wezterm',
      'alacritty',
      'kitty',
      'powershell',
      'cmd',
      'shell'
    ])
  ) {
    tokens.push('app:terminal', 'task:dev', 'shell', 'work')
  }

  if (includesAny(value, ['chrome', 'safari', 'firefox', 'edge', 'brave', 'opera', 'browser'])) {
    tokens.push('app:browser', 'task:web', 'research')
  }

  if (
    includesAny(value, [
      'figma',
      'sketch',
      'photoshop',
      'illustrator',
      'pixelmator',
      'preview',
      'gimp',
      'krita',
      'canva'
    ])
  ) {
    tokens.push('app:design', 'image', 'creative')
  }

  if (
    includesAny(value, ['textedit', 'sublime', 'bbedit', 'coteditor', 'typora', 'vim', 'neovim'])
  ) {
    tokens.push('editor', 'docs', 'work')
  }

  if (includesAny(value, ['finder', 'explorer', 'files', 'file manager'])) {
    tokens.push('app:file-manager', 'local-first', 'docs')
  }

  if (
    includesAny(value, [
      'discord',
      'telegram',
      'wechat',
      'spotify',
      'music',
      'netflix',
      'youtube',
      'twitter',
      'x.com'
    ])
  ) {
    tokens.push('app:social', 'entertainment')
  }

  if (includesAny(value, ['postman', 'insomnia'])) {
    tokens.push('developer-tool', 'task:dev', 'api', 'work')
  }

  return tokens
}

function vectorizeTokens(tokens: string[]): number[] {
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0)
  for (const token of tokens) {
    vector[hashToken(token) % VECTOR_DIMENSIONS] += 1
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (magnitude === 0) return vector
  return vector.map((value) => value / magnitude)
}

function vectorizeWeightedTokens(entries: Array<[string, number]>): number[] {
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0)
  for (const [token, weight] of entries) {
    vector[hashToken(token) % VECTOR_DIMENSIONS] += weight
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (magnitude === 0) return vector
  return vector.map((value) => value / magnitude)
}

function calculateUsagePreferenceWeight(
  candidate: RecommendationSemanticPreferenceInput,
  now: number
): number {
  const positiveInteractions =
    (candidate.executeCount ?? 0) * 1 + (candidate.searchCount ?? 0) * 0.3
  const penalty = (candidate.cancelCount ?? 0) * 0.8
  const interactionWeight = Math.max(0, positiveInteractions - penalty)
  if (interactionWeight <= 0) return 0

  const lastInteraction = Math.max(
    candidate.lastExecuted?.getTime() ?? 0,
    candidate.lastSearched?.getTime() ?? 0,
    candidate.lastCancelled?.getTime() ?? 0
  )
  const daysSince =
    lastInteraction > 0 ? Math.max(0, (now - lastInteraction) / (24 * 60 * 60 * 1000)) : 30
  const recencyWeight = Math.exp(-0.08 * daysSince)

  return Math.log1p(interactionWeight) * (0.35 + recencyWeight * 0.65)
}

function hashToken(token: string): number {
  let hash = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length)
  let score = 0
  for (let i = 0; i < length; i += 1) {
    score += left[i] * right[i]
  }
  return clamp01(score)
}

function calculateTokenOverlap(left: string[], right: string[]): number {
  const rightSet = new Set(right)
  let overlap = 0
  for (const token of left) {
    if (rightSet.has(token)) overlap += 1
  }
  return clamp01(overlap / Math.sqrt(left.length * right.length))
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
