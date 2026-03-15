import type { H3Event } from 'h3'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { getPilotAdminChannelCatalog, updatePilotAdminChannelCatalog } from './pilot-admin-channel-config'
import type { PilotBuiltinTool, PilotChannelAdapter, PilotChannelTransport } from './pilot-channel'

const DEFAULT_ENDS_FOLDER = 'g-wggu5114-thisai-thisai-ends-'
const END_ENV_FILES = ['.env', '.env.development', '.env.production'] as const

interface ProviderSpec {
  id: string
  name: string
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  defaultBaseUrl: string
  defaultModel: string
  apiKeyKeys: string[]
  baseUrlKeys: string[]
  modelKeys: string[]
}

interface EndsCandidate {
  id: string
  name: string
  baseUrl: string
  model: string
  apiKey: string
  adapter: PilotChannelAdapter
  transport: PilotChannelTransport
  sourceEnvKeys: string[]
}

export interface MergePilotChannelsFromEndsOptions {
  endsRoot?: string
  dryRun?: boolean
}

export interface MergePilotChannelsFromEndsResult {
  dryRun: boolean
  endsRoot: string
  sourceEnvFiles: string[]
  inspectedEnvKeys: string[]
  candidateChannelIds: string[]
  mergedChannelIds: string[]
  skippedChannelIds: string[]
  mergedCount: number
  skippedCount: number
  defaultChannelId: string
}

const PROVIDER_SPECS: ProviderSpec[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    adapter: 'openai',
    transport: 'responses',
    defaultBaseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-5.2',
    apiKeyKeys: ['OPENAI_API_KEY'],
    baseUrlKeys: ['OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_BASE_PATH'],
    modelKeys: ['OPENAI_MODEL', 'OPENAI_MODEL_NAME'],
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    adapter: 'openai',
    transport: 'responses',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o-mini',
    apiKeyKeys: ['AZURE_OPENAI_API_KEY'],
    baseUrlKeys: ['AZURE_OPENAI_BASE_PATH'],
    modelKeys: ['AZURE_OPENAI_MODEL', 'AZURE_OPENAI_API_DEPLOYMENT_NAME'],
  },
  {
    id: 'volc',
    name: 'VolcEngine Ark',
    adapter: 'openai',
    transport: 'chat.completions',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
    defaultModel: 'doubao-seed-1-6-250615',
    apiKeyKeys: ['VOLC_API_KEY', 'ARK_API_KEY', 'DOUBAO_API_KEY'],
    baseUrlKeys: ['VOLC_BASE_URL', 'ARK_BASE_URL', 'DOUBAO_BASE_URL'],
    modelKeys: ['VOLC_MODEL', 'ARK_MODEL', 'DOUBAO_MODEL'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    adapter: 'openai',
    transport: 'responses',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    apiKeyKeys: ['DEEPSEEK_API_KEY'],
    baseUrlKeys: ['DEEPSEEK_BASE_URL'],
    modelKeys: ['DEEPSEEK_MODEL'],
  },
  {
    id: 'qwen',
    name: 'Qwen',
    adapter: 'openai',
    transport: 'responses',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    defaultModel: 'qwen-plus',
    apiKeyKeys: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
    baseUrlKeys: ['QWEN_BASE_URL', 'DASHSCOPE_BASE_URL'],
    modelKeys: ['QWEN_MODEL', 'DASHSCOPE_MODEL'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    adapter: 'openai',
    transport: 'responses',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.0-flash',
    apiKeyKeys: ['GEMINI_API_KEY'],
    baseUrlKeys: ['GEMINI_BASE_URL'],
    modelKeys: ['GEMINI_MODEL'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    adapter: 'openai',
    transport: 'responses',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-7-sonnet',
    apiKeyKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    baseUrlKeys: ['ANTHROPIC_BASE_URL', 'CLAUDE_BASE_URL'],
    modelKeys: ['ANTHROPIC_MODEL', 'CLAUDE_MODEL'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    adapter: 'openai',
    transport: 'responses',
    defaultBaseUrl: 'https://api.moonshot.cn',
    defaultModel: 'moonshot-v1-8k',
    apiKeyKeys: ['MOONSHOT_API_KEY'],
    baseUrlKeys: ['MOONSHOT_BASE_URL'],
    modelKeys: ['MOONSHOT_MODEL'],
  },
]

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeBoolean(value: unknown): boolean {
  const normalized = normalizeText(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function parseEnvAssignment(line: string): { key: string, value: string } | null {
  const raw = line.trim()
  if (!raw || raw.startsWith('#')) {
    return null
  }
  const normalized = raw.startsWith('export ')
    ? raw.slice('export '.length).trim()
    : raw
  const splitIndex = normalized.indexOf('=')
  if (splitIndex <= 0) {
    return null
  }
  const key = normalized.slice(0, splitIndex).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null
  }
  let value = normalized.slice(splitIndex + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    value = value.slice(1, -1)
  }
  else {
    value = value.replace(/\s+#.*$/, '').trim()
  }
  return { key, value }
}

function normalizeBaseUrl(input: string): string {
  const value = normalizeText(input).replace(/\/+$/, '')
  if (!value) {
    return ''
  }
  if (value.endsWith('/v1/responses')) {
    return value.slice(0, -'/v1/responses'.length)
  }
  if (value.endsWith('/responses')) {
    return value.slice(0, -'/responses'.length)
  }
  if (value.endsWith('/v1/chat/completions')) {
    return value.slice(0, -'/v1/chat/completions'.length)
  }
  if (value.endsWith('/chat/completions')) {
    return value.slice(0, -'/chat/completions'.length)
  }
  return value
}

function resolveEndsRoot(input?: string): string {
  const direct = normalizeText(input)
  const fromEnv = normalizeText(process.env.PILOT_ENDS_SOURCE_ROOT)
  const cwd = process.cwd()

  const candidates = [
    direct,
    fromEnv,
    resolve(cwd, 'apps', DEFAULT_ENDS_FOLDER),
    resolve(cwd, '../apps', DEFAULT_ENDS_FOLDER),
    resolve(cwd, DEFAULT_ENDS_FOLDER),
    resolve(cwd, '..', DEFAULT_ENDS_FOLDER),
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return direct || fromEnv || resolve(cwd, 'apps', DEFAULT_ENDS_FOLDER)
}

function loadEndsEnvMap(endsRoot: string): { env: Map<string, string>, files: string[], keys: string[] } {
  const envMap = new Map<string, string>()
  const files: string[] = []

  for (const fileName of END_ENV_FILES) {
    const filePath = resolve(endsRoot, fileName)
    if (!existsSync(filePath)) {
      continue
    }
    files.push(filePath)
    const content = readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvAssignment(line)
      if (!parsed) {
        continue
      }
      envMap.set(parsed.key, parsed.value)
    }
  }

  const keys = Array.from(envMap.keys()).sort((a, b) => a.localeCompare(b))
  return { env: envMap, files, keys }
}

function firstDefined(map: Map<string, string>, keys: string[]): { key: string, value: string } | null {
  for (const key of keys) {
    const value = normalizeText(map.get(key))
    if (value) {
      return { key, value }
    }
  }
  return null
}

function collectEndsCandidates(envMap: Map<string, string>): EndsCandidate[] {
  const candidates: EndsCandidate[] = []
  for (const provider of PROVIDER_SPECS) {
    const apiKeyMatch = firstDefined(envMap, provider.apiKeyKeys)
    if (!apiKeyMatch) {
      continue
    }

    const baseMatch = firstDefined(envMap, provider.baseUrlKeys)
    const modelMatch = firstDefined(envMap, provider.modelKeys)
    const baseUrl = normalizeBaseUrl(baseMatch?.value || provider.defaultBaseUrl)
    if (!baseUrl) {
      continue
    }

    const model = normalizeText(modelMatch?.value || provider.defaultModel) || provider.defaultModel
    const sourceEnvKeys = [
      apiKeyMatch.key,
      baseMatch?.key,
      modelMatch?.key,
    ].filter((item): item is string => Boolean(item))

    candidates.push({
      id: provider.id,
      name: provider.name,
      baseUrl,
      model,
      apiKey: apiKeyMatch.value,
      adapter: provider.adapter,
      transport: provider.transport,
      sourceEnvKeys: Array.from(new Set(sourceEnvKeys)),
    })
  }
  return candidates
}

export async function mergePilotAdminChannelsFromEnds(
  event: H3Event,
  options: MergePilotChannelsFromEndsOptions = {},
): Promise<MergePilotChannelsFromEndsResult> {
  const endsRoot = resolveEndsRoot(options.endsRoot)
  const dryRun = normalizeBoolean(options.dryRun)
  const loaded = loadEndsEnvMap(endsRoot)
  const candidates = collectEndsCandidates(loaded.env)

  const catalog = await getPilotAdminChannelCatalog(event)
  const existingIds = new Set(catalog.channels.map(item => item.id))
  const merged = candidates.filter(item => !existingIds.has(item.id))
  const skipped = candidates.filter(item => existingIds.has(item.id))

  let defaultChannelId = catalog.defaultChannelId
  if (!dryRun && merged.length > 0) {
    const updated = await updatePilotAdminChannelCatalog(event, {
      defaultChannelId: defaultChannelId || merged[0].id,
      channels: [
        ...catalog.channels,
        ...merged.map(item => ({
          id: item.id,
          name: item.name,
          baseUrl: item.baseUrl,
          apiKey: item.apiKey,
          model: item.model,
          adapter: item.adapter,
          transport: item.transport,
          timeoutMs: 90_000,
          builtinTools: ['write_todos'] as PilotBuiltinTool[],
          enabled: true,
        })),
      ],
    })
    defaultChannelId = updated.defaultChannelId
  }

  return {
    dryRun,
    endsRoot,
    sourceEnvFiles: loaded.files,
    inspectedEnvKeys: loaded.keys,
    candidateChannelIds: candidates.map(item => item.id),
    mergedChannelIds: merged.map(item => item.id),
    skippedChannelIds: skipped.map(item => item.id),
    mergedCount: merged.length,
    skippedCount: skipped.length,
    defaultChannelId: defaultChannelId || merged[0]?.id || '',
  }
}
