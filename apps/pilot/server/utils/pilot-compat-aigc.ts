import type { H3Event } from 'h3'
import {
  ensurePilotEntitySeed,
  getPilotEntity,
  listPilotEntities,
  listPilotEntitiesAll,
  upsertPilotEntity,
} from './pilot-entity-store'
import { toBoundedPositiveInt } from './quota-api'

const CHAT_LOG_DOMAIN = 'aigc.chat_logs'
const PROMPT_DOMAIN = 'aigc.prompts'
const TAG_DOMAIN = 'aigc.prompt_tags'

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeUser(uid: string) {
  return {
    id: uid,
    username: uid,
    nickname: `Pilot-${uid.slice(-6)}`,
    avatar: '',
  }
}

export async function ensureAigcCompatSeed(event: H3Event): Promise<void> {
  const createdAt = nowIso()
  await ensurePilotEntitySeed(event, TAG_DOMAIN, [
    {
      id: 'tag_productivity',
      name: '生产力',
      description: '提高工作效率的提示词',
      color: '#3b82f6',
      icon: 'i-carbon-launch',
      status: 1,
      prompts: [],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'tag_coding',
      name: '编程',
      description: '开发与代码相关提示词',
      color: '#22c55e',
      icon: 'i-carbon-code',
      status: 1,
      prompts: [],
      createdAt,
      updatedAt: createdAt,
    },
  ])
  await ensurePilotEntitySeed(event, PROMPT_DOMAIN, [
    {
      id: 'prompt_seed_1',
      avatar: '',
      title: '需求拆解助手',
      description: '把复杂需求拆解成可执行任务列表，并给出优先级建议。',
      content: '你是一个资深产品经理，请把输入需求拆成目标、范围、风险与验收标准。',
      keywords: '需求分析,任务拆解,产品管理',
      status: 3,
      tags: [
        {
          id: 'tag_productivity',
          name: '生产力',
        },
      ],
      creator: normalizeUser('seed_admin'),
      updater: normalizeUser('seed_admin'),
      createdAt,
      updatedAt: createdAt,
    },
  ])
  await ensurePilotEntitySeed(event, CHAT_LOG_DOMAIN, [
    {
      id: 'chat_log_seed_1',
      message_type: 1,
      model: 'gpt-4o-mini',
      duration: 1320,
      is_stream: 1,
      prompt_tokens: 830,
      completion_tokens: 456,
      cost: 0.0041,
      status: 'success',
      user_ip: '127.0.0.1',
      device_info: 'Pilot Mock Device',
      session_id: 'session_seed_001',
      user: normalizeUser('seed_admin'),
      updated_at: createdAt,
      createdAt,
      updatedAt: createdAt,
    },
  ])
}

export async function listAigcChatLogs(
  event: H3Event,
  query: Record<string, unknown>,
) {
  await ensureAigcCompatSeed(event)
  return await listPilotEntities(event, CHAT_LOG_DOMAIN, {
    query,
    defaultPageSize: 20,
  })
}

export async function getAigcChatLogStatistics(event: H3Event): Promise<Array<Record<string, string>>> {
  await ensureAigcCompatSeed(event)
  const list = await listPilotEntitiesAll<Record<string, any>>(event, CHAT_LOG_DOMAIN)
  const grouped = new Map<string, {
    log_model: string
    log_message_type: string
    count: number
    totalDuration: number
    totalPromptTokens: number
    totalCompletionTokens: number
    totalCost: number
  }>()

  for (const item of list) {
    const model = normalizeText(item.model || 'unknown')
    const msgType = String(item.message_type ?? '0')
    const key = `${model}#${msgType}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        log_model: model,
        log_message_type: msgType,
        count: 0,
        totalDuration: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalCost: 0,
      })
    }
    const target = grouped.get(key)!
    target.count += 1
    target.totalDuration += Number(item.duration || 0)
    target.totalPromptTokens += Number(item.prompt_tokens || 0)
    target.totalCompletionTokens += Number(item.completion_tokens || 0)
    target.totalCost += Number(item.cost || 0)
  }

  return [...grouped.values()].map(item => ({
    log_model: item.log_model,
    log_message_type: item.log_message_type,
    average_duration: (item.count > 0 ? item.totalDuration / item.count : 0).toFixed(2),
    total_prompt_tokens: String(item.totalPromptTokens),
    total_completion_tokens: String(item.totalCompletionTokens),
    total_cost: item.totalCost.toFixed(6),
  }))
}

export async function getAigcConsumptionStatistics(event: H3Event): Promise<{
  data: Record<string, Array<Record<string, any>>>
  results: Array<Record<string, string>>
}> {
  await ensureAigcCompatSeed(event)
  const list = await listPilotEntitiesAll<Record<string, any>>(event, CHAT_LOG_DOMAIN)
  const grouped = new Map<string, Map<string, {
    date: string
    total_prompt_tokens: number
    total_completion_tokens: number
    total_tokens: number
    total_cost: number
    usage_count: number
  }>>()

  for (const item of list) {
    const model = normalizeText(item.model || 'unknown')
    const date = String(item.updated_at || item.updatedAt || nowIso()).slice(0, 10)
    if (!grouped.has(model)) {
      grouped.set(model, new Map())
    }
    const modelMap = grouped.get(model)!
    if (!modelMap.has(date)) {
      modelMap.set(date, {
        date,
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_tokens: 0,
        total_cost: 0,
        usage_count: 0,
      })
    }
    const entry = modelMap.get(date)!
    const prompt = Number(item.prompt_tokens || 0)
    const completion = Number(item.completion_tokens || 0)
    entry.total_prompt_tokens += prompt
    entry.total_completion_tokens += completion
    entry.total_tokens += prompt + completion
    entry.total_cost += Number(item.cost || 0)
    entry.usage_count += 1
  }

  const data: Record<string, Array<Record<string, any>>> = {}
  const results: Array<Record<string, string>> = []

  for (const [model, modelMap] of grouped.entries()) {
    const rows = [...modelMap.values()].sort((a, b) => a.date.localeCompare(b.date))
    data[model] = rows
    for (const row of rows) {
      results.push({
        log_model: model,
        date: row.date,
        total_prompt_tokens: String(row.total_prompt_tokens),
        total_completion_tokens: String(row.total_completion_tokens),
        total_tokens: String(row.total_tokens),
        total_cost: row.total_cost.toFixed(6),
        usage_count: String(row.usage_count),
      })
    }
  }

  return {
    data,
    results,
  }
}

export async function listPromptPage(event: H3Event, query: Record<string, unknown>) {
  await ensureAigcCompatSeed(event)
  return await listPilotEntities(event, PROMPT_DOMAIN, {
    query,
    defaultPageSize: 20,
  })
}

export async function getPromptById(event: H3Event, id: string): Promise<Record<string, any> | null> {
  await ensureAigcCompatSeed(event)
  return await getPilotEntity(event, PROMPT_DOMAIN, id)
}

export async function createPrompt(event: H3Event, body: Record<string, any>, creatorId: string): Promise<Record<string, any>> {
  await ensureAigcCompatSeed(event)
  const now = nowIso()
  return await upsertPilotEntity(event, {
    domain: PROMPT_DOMAIN,
    id: normalizeText(body.id),
    payload: {
      avatar: '',
      title: '',
      description: '',
      content: '',
      keywords: '',
      tags: [],
      creator: normalizeUser(creatorId),
      updater: normalizeUser(creatorId),
      ...body,
      status: Number(body.status ?? 0),
      updatedAt: now,
      createdAt: body.createdAt || now,
    },
  })
}

export async function updatePrompt(
  event: H3Event,
  id: string,
  body: Record<string, any>,
  updaterId: string,
): Promise<Record<string, any> | null> {
  const existing = await getPromptById(event, id)
  if (!existing) {
    return null
  }
  return await upsertPilotEntity(event, {
    domain: PROMPT_DOMAIN,
    id,
    payload: {
      ...existing,
      ...body,
      updater: normalizeUser(updaterId),
      updatedAt: nowIso(),
    },
  })
}

export async function auditPrompt(
  event: H3Event,
  id: string,
  status: number,
  reason: string,
  updaterId: string,
): Promise<Record<string, any> | null> {
  const existing = await getPromptById(event, id)
  if (!existing) {
    return null
  }
  return await upsertPilotEntity(event, {
    domain: PROMPT_DOMAIN,
    id,
    payload: {
      ...existing,
      status,
      auditReason: reason,
      updater: normalizeUser(updaterId),
      updatedAt: nowIso(),
    },
  })
}

export async function publishPrompt(
  event: H3Event,
  id: string,
  online: boolean,
  updaterId: string,
): Promise<Record<string, any> | null> {
  const existing = await getPromptById(event, id)
  if (!existing) {
    return null
  }
  return await upsertPilotEntity(event, {
    domain: PROMPT_DOMAIN,
    id,
    payload: {
      ...existing,
      status: online ? 3 : 4,
      updater: normalizeUser(updaterId),
      updatedAt: nowIso(),
    },
  })
}

export async function getPromptStatistics(event: H3Event): Promise<Array<{ status: number, count: string }>> {
  await ensureAigcCompatSeed(event)
  const list = await listPilotEntitiesAll<Record<string, any>>(event, PROMPT_DOMAIN)
  const counter = new Map<number, number>()
  for (const item of list) {
    const status = Number(item.status ?? 0)
    counter.set(status, Number(counter.get(status) || 0) + 1)
  }
  return [...counter.entries()].map(([status, count]) => ({
    status,
    count: String(count),
  }))
}

export async function createPromptTag(event: H3Event, body: Record<string, any>) {
  await ensureAigcCompatSeed(event)
  const now = nowIso()
  return await upsertPilotEntity(event, {
    domain: TAG_DOMAIN,
    id: normalizeText(body.id),
    payload: {
      name: '',
      description: '',
      color: null,
      icon: null,
      status: 1,
      prompts: [],
      ...body,
      updatedAt: now,
      createdAt: body.createdAt || now,
    },
  })
}

export async function updatePromptTag(event: H3Event, id: string, body: Record<string, any>) {
  await ensureAigcCompatSeed(event)
  const existing = await getPilotEntity(event, TAG_DOMAIN, id)
  if (!existing) {
    return null
  }
  return await upsertPilotEntity(event, {
    domain: TAG_DOMAIN,
    id,
    payload: {
      ...existing,
      ...body,
      updatedAt: nowIso(),
    },
  })
}

export async function listPromptTagPage(event: H3Event, query: Record<string, unknown>) {
  await ensureAigcCompatSeed(event)
  return await listPilotEntities(event, TAG_DOMAIN, {
    query,
    defaultPageSize: 20,
  })
}

export async function searchPromptTags(event: H3Event, keyword: string) {
  await ensureAigcCompatSeed(event)
  const page = await listPilotEntities(event, TAG_DOMAIN, {
    query: {
      keyword,
      page: 1,
      pageSize: 100,
    },
  })
  return page.items
}

export async function assignPromptTags(event: H3Event, promptId: string, tags: unknown[]) {
  await ensureAigcCompatSeed(event)
  const prompt = await getPromptById(event, promptId)
  if (!prompt) {
    return null
  }
  const ids = Array.isArray(tags) ? tags.map(item => normalizeText(item)).filter(Boolean) : []
  const allTags = await listPilotEntitiesAll<Record<string, any>>(event, TAG_DOMAIN)
  const attached = allTags
    .filter(item => ids.includes(normalizeText(item.id)))
    .map(item => ({
      id: item.id,
      name: item.name,
    }))

  return await upsertPilotEntity(event, {
    domain: PROMPT_DOMAIN,
    id: promptId,
    payload: {
      ...prompt,
      tags: attached,
      updatedAt: nowIso(),
    },
  })
}

export function resolvePagination(input: Record<string, unknown>) {
  return {
    page: toBoundedPositiveInt(input.page, 1, 1, 100000),
    pageSize: toBoundedPositiveInt(input.pageSize, 20, 1, 200),
  }
}
