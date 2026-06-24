import type { AppSemanticAliasInput } from './app-semantic-catalog'
import { normalizeStringList } from './app-utils'

export type AppToolSourceId = 'dev' | 'im' | 'design'

export interface AppToolSourceMatch {
  sourceId: AppToolSourceId
  label: string
  aliases: string[]
}

interface AppToolSourceCatalogEntry {
  sourceId: AppToolSourceId
  label: string
  match: readonly string[]
  aliases: readonly string[]
}

const DEV_TOOL_ALIASES = ['dev', 'develop', 'developer', 'code', 'coding', 'ide', '开发', '编程']
const IM_TOOL_ALIASES = [
  'im',
  'chat',
  'messenger',
  'message',
  'messages',
  '即时通讯',
  '聊天',
  '通讯'
]
const DESIGN_TOOL_ALIASES = ['design', 'designer', 'creative', 'graphics', 'image', '设计', '作图']

export const APP_TOOL_SOURCE_CATALOG_VERSION = 1

const APP_TOOL_SOURCE_CATALOG: readonly AppToolSourceCatalogEntry[] = [
  {
    sourceId: 'design',
    label: 'Design tools',
    match: ['photoshop', 'adobe photoshop', 'com.adobe.photoshop'],
    aliases: [...DESIGN_TOOL_ALIASES, 'photoshop', 'adobe photoshop', 'ps', '修图']
  },
  {
    sourceId: 'dev',
    label: 'Developer tools',
    match: ['codex', 'openai codex'],
    aliases: [...DEV_TOOL_ALIASES, 'codex', 'openai codex', 'agent']
  },
  {
    sourceId: 'dev',
    label: 'Developer tools',
    match: ['visual studio code', 'vscode', 'vs code', 'vscodium', 'com.microsoft.vscode'],
    aliases: [...DEV_TOOL_ALIASES, 'vscode', 'vsc', 'vs code', 'visual studio code']
  },
  {
    sourceId: 'im',
    label: 'Messaging tools',
    match: ['feishu', 'lark', '飞书', 'bytedance.feishu'],
    aliases: [...IM_TOOL_ALIASES, 'feishu', 'lark', '飞书']
  },
  {
    sourceId: 'im',
    label: 'Messaging tools',
    match: ['wechat', 'weixin', '微信', 'com.tencent.xin'],
    aliases: [...IM_TOOL_ALIASES, 'wechat', 'weixin', 'wx', '微信']
  },
  {
    sourceId: 'im',
    label: 'Messaging tools',
    match: ['telegram', 'tg', 'org.telegram'],
    aliases: [...IM_TOOL_ALIASES, 'telegram', 'tg']
  }
]

function normalizeForMatch(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function basenameWithoutExtension(value: string | null | undefined): string {
  const normalized = value?.trim()
  if (!normalized) return ''

  const baseName = normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized
  return baseName.replace(/\.(app|exe|lnk|desktop)$/i, '')
}

function collectSearchText(app: AppSemanticAliasInput): string {
  return normalizeForMatch(
    [
      app.name,
      app.displayName,
      app.fileName,
      ...(app.alternateNames ?? []),
      app.bundleId,
      app.uniqueId,
      app.stableId,
      app.appIdentity,
      app.path,
      app.launchTarget,
      app.displayPath,
      app.description,
      basenameWithoutExtension(app.path),
      basenameWithoutExtension(app.launchTarget)
    ].join(' ')
  )
}

export function resolveAppToolSourceMatches(app: AppSemanticAliasInput): AppToolSourceMatch[] {
  const searchText = collectSearchText(app)
  if (!searchText) return []

  const matches = new Map<AppToolSourceId, AppToolSourceMatch>()
  for (const entry of APP_TOOL_SOURCE_CATALOG) {
    if (!entry.match.some((needle) => searchText.includes(needle.toLowerCase()))) {
      continue
    }

    const existing = matches.get(entry.sourceId)
    matches.set(entry.sourceId, {
      sourceId: entry.sourceId,
      label: entry.label,
      aliases: normalizeStringList([...(existing?.aliases ?? []), ...entry.aliases, entry.sourceId])
    })
  }

  return Array.from(matches.values())
}

export function resolveAppToolSourceAliases(app: AppSemanticAliasInput): string[] {
  return normalizeStringList(resolveAppToolSourceMatches(app).flatMap((match) => match.aliases))
}

export function resolveAppToolSourceIds(app: AppSemanticAliasInput): AppToolSourceId[] {
  return resolveAppToolSourceMatches(app).map((match) => match.sourceId)
}

export function getAppToolSourceCatalogSummary(): Array<{
  sourceId: AppToolSourceId
  label: string
  aliasCount: number
  appCount: number
}> {
  const bySource = new Map<
    AppToolSourceId,
    { sourceId: AppToolSourceId; label: string; aliases: Set<string>; appCount: number }
  >()

  for (const entry of APP_TOOL_SOURCE_CATALOG) {
    const summary = bySource.get(entry.sourceId) ?? {
      sourceId: entry.sourceId,
      label: entry.label,
      aliases: new Set<string>(),
      appCount: 0
    }

    summary.appCount += 1
    for (const alias of normalizeStringList([...entry.aliases, entry.sourceId])) {
      summary.aliases.add(alias)
    }
    bySource.set(entry.sourceId, summary)
  }

  return Array.from(bySource.values()).map((summary) => ({
    sourceId: summary.sourceId,
    label: summary.label,
    aliasCount: summary.aliases.size,
    appCount: summary.appCount
  }))
}
