import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { FeatureSearchToken } from '@talex-touch/utils/search'
import {
  addSimpleTextSearchTokens,
  addTitlePinyinSearchTokens,
  addTitleSearchTokens
} from '@talex-touch/utils/search'
import { pinyin } from 'pinyin-pro'
import { createLogger } from '../../../utils/logger'

const featureSearchTokensLog = createLogger('PluginSystem').child('FeatureSearchTokens')

function getPinyinSyllables(text: string): string[] {
  return pinyin(text, { toneType: 'none' })
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function collectCommandTokens(commands: IPluginFeature['commands']): string[] {
  const values: string[] = []
  for (const cmd of commands) {
    if (typeof cmd.value === 'string') {
      values.push(cmd.value)
    } else if (Array.isArray(cmd.value)) {
      values.push(...cmd.value.filter((value): value is string => typeof value === 'string'))
    }
  }
  return values
}

export function buildFeatureSearchTokens(feature: IPluginFeature): FeatureSearchToken[] {
  const tokens: FeatureSearchToken[] = []

  addSimpleTextSearchTokens(tokens, feature.id, 'id', feature.id)
  addTitleSearchTokens(tokens, feature.name)
  addTitlePinyinSearchTokens(tokens, feature.name, {
    getSyllables: getPinyinSyllables,
    onError: (error) => featureSearchTokensLog.warn('Failed to generate pinyin tokens', { error })
  })
  addSimpleTextSearchTokens(tokens, feature.desc, 'description', feature.desc)

  feature.keywords?.forEach((keyword) =>
    addSimpleTextSearchTokens(tokens, keyword, 'keyword', keyword)
  )
  collectCommandTokens(feature.commands).forEach((cmd) =>
    addSimpleTextSearchTokens(tokens, cmd, 'command', cmd)
  )

  return tokens
}
