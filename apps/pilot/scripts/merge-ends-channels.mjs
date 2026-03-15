#!/usr/bin/env node

import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const SETTINGS_TABLE = 'pilot_admin_settings'
const CHANNELS_KEY = 'channel.catalog'
const DEFAULT_CHANNEL_KEY = 'channel.defaultId'
const DEFAULT_ENDS_FOLDER = 'g-wggu5114-thisai-thisai-ends-'
const END_ENV_FILES = ['.env', '.env.development', '.env.production']
const PILOT_ENV_FILES = ['.env', '.env.dev', '.env.prod', '.env.local']
const ENC_PREFIX = 'enc:v1'

const PROVIDER_SPECS = [
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

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeBool(value) {
  const normalized = normalizeText(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function stripQuotes(rawValue) {
  const value = normalizeText(rawValue)
  if (!value) {
    return ''
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1)
  }
  return value.replace(/\s+#.*$/, '').trim()
}

function parseEnvLine(line) {
  const raw = normalizeText(line)
  if (!raw || raw.startsWith('#')) {
    return null
  }
  const normalized = raw.startsWith('export ') ? normalizeText(raw.slice('export '.length)) : raw
  const splitIndex = normalized.indexOf('=')
  if (splitIndex <= 0) {
    return null
  }
  const key = normalizeText(normalized.slice(0, splitIndex))
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null
  }
  return {
    key,
    value: stripQuotes(normalized.slice(splitIndex + 1)),
  }
}

function loadEnvFiles(rootDir, files) {
  const envMap = new Map()
  const loadedFiles = []
  for (const fileName of files) {
    const filePath = resolve(rootDir, fileName)
    if (!existsSync(filePath)) {
      continue
    }
    loadedFiles.push(filePath)
    const content = readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line)
      if (!parsed) {
        continue
      }
      envMap.set(parsed.key, parsed.value)
    }
  }
  return { envMap, loadedFiles }
}

function normalizeBaseUrl(input) {
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

function firstDefined(map, keys) {
  for (const key of keys) {
    const value = normalizeText(map.get(key))
    if (value) {
      return { key, value }
    }
  }
  return null
}

function collectCandidates(envMap) {
  const list = []
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
    list.push({
      id: provider.id,
      name: provider.name,
      baseUrl,
      apiKey: apiKeyMatch.value,
      model,
      adapter: provider.adapter,
      transport: provider.transport,
      timeoutMs: 90_000,
      builtinTools: ['write_todos'],
      enabled: true,
    })
  }
  return list
}

function deriveKey(secret) {
  return createHash('sha256').update(secret).digest()
}

function encryptConfigValue(plainText, secret) {
  const raw = String(plainText || '')
  if (!raw) {
    return ''
  }
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(raw, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${ENC_PREFIX}:${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    endsRoot: '',
    pilotRoot: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--dry-run') {
      parsed.dryRun = true
      continue
    }
    if (token.startsWith('--ends-root=')) {
      parsed.endsRoot = normalizeText(token.slice('--ends-root='.length))
      continue
    }
    if (token === '--ends-root') {
      parsed.endsRoot = normalizeText(argv[index + 1] || '')
      index += 1
      continue
    }
    if (token.startsWith('--pilot-root=')) {
      parsed.pilotRoot = normalizeText(token.slice('--pilot-root='.length))
      continue
    }
    if (token === '--pilot-root') {
      parsed.pilotRoot = normalizeText(argv[index + 1] || '')
      index += 1
      continue
    }
  }
  return parsed
}

function resolvePilotRoot(input) {
  if (input && existsSync(input)) {
    return input
  }
  const fromEnv = normalizeText(process.env.PILOT_ENV_ROOT)
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv
  }
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  return resolve(scriptDir, '..')
}

function resolveEndsRoot(input) {
  const cwd = process.cwd()
  const fromEnv = normalizeText(process.env.PILOT_ENDS_SOURCE_ROOT)
  const candidates = [
    normalizeText(input),
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
  return normalizeText(input) || fromEnv || resolve(cwd, 'apps', DEFAULT_ENDS_FOLDER)
}

async function ensureSettingsSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}

async function getSetting(client, key) {
  const result = await client.query(
    `SELECT value FROM ${SETTINGS_TABLE} WHERE key = $1 LIMIT 1`,
    [key],
  )
  return normalizeText(result.rows?.[0]?.value)
}

async function upsertSetting(client, key, value) {
  const now = new Date().toISOString()
  await client.query(
    `
    INSERT INTO ${SETTINGS_TABLE} (key, value, updated_at)
    VALUES ($1, $2, $3)
    ON CONFLICT(key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at
    `,
    [key, value, now],
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pilotRoot = resolvePilotRoot(args.pilotRoot)
  const endsRoot = resolveEndsRoot(args.endsRoot)

  const pilotEnv = loadEnvFiles(pilotRoot, PILOT_ENV_FILES)
  for (const [key, value] of pilotEnv.envMap.entries()) {
    process.env[key] = value
  }

  const dsn = normalizeText(process.env.PILOT_POSTGRES_URL)
  const encryptionKey = normalizeText(process.env.PILOT_CONFIG_ENCRYPTION_KEY)
  if (!dsn) {
    throw new Error('PILOT_POSTGRES_URL is required (from env or apps/pilot/.env*).')
  }
  if (encryptionKey.length < 16) {
    throw new Error('PILOT_CONFIG_ENCRYPTION_KEY is required and must be at least 16 chars.')
  }

  const endsEnv = loadEnvFiles(endsRoot, END_ENV_FILES)
  const candidates = collectCandidates(endsEnv.envMap)

  const client = new Client({ connectionString: dsn })
  await client.connect()
  try {
    await client.query('BEGIN')
    await ensureSettingsSchema(client)

    const rawChannels = await getSetting(client, CHANNELS_KEY)
    let existingChannels = []
    if (rawChannels) {
      try {
        const parsed = JSON.parse(rawChannels)
        if (!Array.isArray(parsed)) {
          throw new TypeError('channel.catalog is not an array')
        }
        existingChannels = parsed
      }
      catch (error) {
        throw new Error(`channel.catalog parse failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const existingIds = new Set(
      existingChannels
        .map(item => normalizeText(item?.id))
        .filter(Boolean),
    )
    const additions = candidates.filter(item => !existingIds.has(item.id))
    const mergedChannels = [
      ...existingChannels,
      ...additions.map(item => ({
        ...item,
        apiKey: encryptConfigValue(item.apiKey, encryptionKey),
      })),
    ]

    const defaultChannelRaw = await getSetting(client, DEFAULT_CHANNEL_KEY)
    const defaultChannelId = defaultChannelRaw || normalizeText(mergedChannels[0]?.id)

    if (!args.dryRun && additions.length > 0) {
      await upsertSetting(client, CHANNELS_KEY, JSON.stringify(mergedChannels))
      if (defaultChannelId) {
        await upsertSetting(client, DEFAULT_CHANNEL_KEY, defaultChannelId)
      }
    }

    await client.query('COMMIT')
    console.info('[pilot][channels-merge-ends] completed', {
      dryRun: args.dryRun,
      endsRoot,
      loadedEndsEnvFiles: endsEnv.loadedFiles,
      candidates: candidates.map(item => item.id),
      merged: additions.map(item => item.id),
      skipped: candidates.filter(item => existingIds.has(item.id)).map(item => item.id),
      defaultChannelId,
    })
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
  finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('[pilot][channels-merge-ends] failed', {
    message: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
