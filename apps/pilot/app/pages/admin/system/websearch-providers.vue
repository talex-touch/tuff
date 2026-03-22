<script setup lang="ts">
import { endHttp } from '~/composables/api/axios'

definePageMeta({
  name: 'WebsearchProviders',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type ProviderType = 'searxng' | 'serper' | 'tavily'

interface ProviderItem {
  id: string
  type: ProviderType
  enabled: boolean
  priority: number
  baseUrl: string
  timeoutMs: number
  maxResults: number
  hasApiKey: boolean
  apiKeyMasked: string
  apiKey: string
  clearApiKey: boolean
}

interface AggregationConfig {
  mode: 'hybrid' | 'sequential'
  targetResults: number
  minPerProvider: number
  dedupeKey: 'url' | 'url+content'
  stopWhenEnough: boolean
}

interface CrawlConfig {
  enabled: boolean
  timeoutMs: number
  maxContentChars: number
}

interface WebsearchForm {
  providers: ProviderItem[]
  aggregation: AggregationConfig
  crawl: CrawlConfig
  allowlistDomains: string[]
  ttlMinutes: number
}

const loading = ref(false)
const saving = ref(false)
const form = ref<WebsearchForm>(createEmptyForm())
let providerSeq = 0

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  const text = normalizeText(value).toLowerCase()
  if (!text) {
    return fallback
  }
  if (text === '1' || text === 'true' || text === 'yes' || text === 'on') {
    return true
  }
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') {
    return false
  }
  return fallback
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function createProviderId(type: ProviderType): string {
  providerSeq += 1
  return `${type}-${Date.now().toString(36)}-${providerSeq}`
}

function createProvider(type: ProviderType): ProviderItem {
  const defaults: Record<ProviderType, { baseUrl: string, priority: number }> = {
    searxng: {
      baseUrl: '',
      priority: 10,
    },
    serper: {
      baseUrl: 'https://google.serper.dev',
      priority: 20,
    },
    tavily: {
      baseUrl: 'https://api.tavily.com',
      priority: 30,
    },
  }

  return {
    id: createProviderId(type),
    type,
    enabled: true,
    priority: defaults[type].priority,
    baseUrl: defaults[type].baseUrl,
    timeoutMs: 12_000,
    maxResults: 6,
    hasApiKey: false,
    apiKeyMasked: '',
    apiKey: '',
    clearApiKey: false,
  }
}

function getNextProviderPriority(list: ProviderItem[]): number {
  const maxPriority = list.reduce((max, item) => Math.max(max, item.priority), 0)
  return Math.min(maxPriority + 10, 9_999)
}

function createEmptyForm(): WebsearchForm {
  return {
    providers: [createProvider('searxng'), createProvider('serper'), createProvider('tavily')],
    aggregation: {
      mode: 'hybrid',
      targetResults: 6,
      minPerProvider: 2,
      dedupeKey: 'url',
      stopWhenEnough: true,
    },
    crawl: {
      enabled: true,
      timeoutMs: 12_000,
      maxContentChars: 8_000,
    },
    allowlistDomains: [],
    ttlMinutes: 30,
  }
}

function normalizeProviderType(value: unknown): ProviderType {
  const text = normalizeText(value).toLowerCase()
  if (text === 'serper' || text === 'tavily') {
    return text
  }
  return 'searxng'
}

function normalizeProviders(value: unknown): ProviderItem[] {
  if (!Array.isArray(value) || value.length <= 0) {
    return [createProvider('searxng'), createProvider('serper'), createProvider('tavily')]
  }

  const parsed = value
    .map((item) => {
      const row = item && typeof item === 'object' && !Array.isArray(item)
        ? item as Record<string, unknown>
        : null
      if (!row) {
        return null
      }
      const type = normalizeProviderType(row.type)
      return {
        id: normalizeText(row.id) || createProviderId(type),
        type,
        enabled: normalizeBoolean(row.enabled, true),
        priority: normalizeNumber(row.priority, 100, 1, 9_999),
        baseUrl: normalizeText(row.baseUrl),
        timeoutMs: normalizeNumber(row.timeoutMs, 12_000, 1_000, 120_000),
        maxResults: normalizeNumber(row.maxResults, 6, 1, 20),
        hasApiKey: normalizeBoolean(row.hasApiKey, false),
        apiKeyMasked: normalizeText(row.apiKeyMasked),
        apiKey: '',
        clearApiKey: false,
      } as ProviderItem
    })
    .filter((item): item is ProviderItem => Boolean(item))
    .sort((a, b) => a.priority - b.priority)

  return parsed.length > 0 ? parsed : [createProvider('searxng')]
}

function normalizeForm(raw: any): WebsearchForm {
  const aggregationRaw = raw?.aggregation || {}
  const crawlRaw = raw?.crawl || {}
  const allowlist = Array.isArray(raw?.allowlistDomains)
    ? raw.allowlistDomains
      .map((item: unknown) => normalizeText(item).toLowerCase())
      .filter(Boolean)
    : []

  return {
    providers: normalizeProviders(raw?.providers),
    aggregation: {
      mode: normalizeText(aggregationRaw.mode).toLowerCase() === 'sequential' ? 'sequential' : 'hybrid',
      targetResults: normalizeNumber(aggregationRaw.targetResults, 6, 1, 20),
      minPerProvider: normalizeNumber(aggregationRaw.minPerProvider, 2, 1, 20),
      dedupeKey: normalizeText(aggregationRaw.dedupeKey).toLowerCase() === 'url+content' ? 'url+content' : 'url',
      stopWhenEnough: normalizeBoolean(aggregationRaw.stopWhenEnough, true),
    },
    crawl: {
      enabled: normalizeBoolean(crawlRaw.enabled, true),
      timeoutMs: normalizeNumber(crawlRaw.timeoutMs, 12_000, 1_000, 120_000),
      maxContentChars: normalizeNumber(crawlRaw.maxContentChars, 8_000, 500, 100_000),
    },
    allowlistDomains: Array.from(new Set(allowlist)),
    ttlMinutes: normalizeNumber(raw?.ttlMinutes, 30, 1, 1_440),
  }
}

async function fetchSettings() {
  loading.value = true
  try {
    const res: any = await endHttp.get('admin/settings')
    const payload = res?.settings?.datasource?.websearch
    if (!payload) {
      ElMessage.error(res?.message || '加载 Websearch Providers 失败')
      return
    }
    form.value = normalizeForm(payload)
  }
  finally {
    loading.value = false
  }
}

function addProvider(type: ProviderType) {
  const provider = createProvider(type)
  provider.priority = getNextProviderPriority(form.value.providers)
  form.value.providers.push(provider)
}

function removeProvider(index: number) {
  if (form.value.providers.length <= 1) {
    ElMessage.warning('至少保留一个 Provider')
    return
  }
  form.value.providers.splice(index, 1)
}

function moveProvider(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= form.value.providers.length) {
    return
  }
  const providers = [...form.value.providers]
  const [item] = providers.splice(index, 1)
  providers.splice(target, 0, item)
  form.value.providers = providers.map((provider, idx) => ({
    ...provider,
    priority: (idx + 1) * 10,
  }))
}

function parseAllowlistInput(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,\n]/g)
      .map(item => normalizeText(item).toLowerCase())
      .filter(Boolean),
  ))
}

const allowlistInput = computed({
  get: () => form.value.allowlistDomains.join(', '),
  set: (value: string) => {
    form.value.allowlistDomains = parseAllowlistInput(value)
  },
})

function buildSavePayload() {
  return {
    datasource: {
      websearch: {
        providers: form.value.providers.map(item => ({
          id: item.id,
          type: item.type,
          enabled: item.enabled,
          priority: item.priority,
          baseUrl: normalizeText(item.baseUrl),
          timeoutMs: item.timeoutMs,
          maxResults: item.maxResults,
          apiKey: normalizeText(item.apiKey) || undefined,
          clearApiKey: item.clearApiKey === true ? true : undefined,
        })),
        aggregation: {
          mode: form.value.aggregation.mode,
          targetResults: form.value.aggregation.targetResults,
          minPerProvider: form.value.aggregation.minPerProvider,
          dedupeKey: form.value.aggregation.dedupeKey,
          stopWhenEnough: form.value.aggregation.stopWhenEnough,
        },
        crawl: {
          enabled: form.value.crawl.enabled,
          timeoutMs: form.value.crawl.timeoutMs,
          maxContentChars: form.value.crawl.maxContentChars,
        },
        allowlistDomains: form.value.allowlistDomains,
        ttlMinutes: form.value.ttlMinutes,
      },
    },
  }
}

async function saveSettings() {
  saving.value = true
  try {
    const res: any = await endHttp.post('admin/settings', buildSavePayload())
    if (!res?.ok) {
      ElMessage.error(res?.message || '保存 Websearch Providers 失败')
      return
    }

    const payload = res?.settings?.datasource?.websearch
    if (!payload) {
      ElMessage.error('保存成功但返回数据异常，请刷新页面')
      return
    }

    form.value = normalizeForm(payload)
    ElMessage.success('Websearch Providers 保存成功')
  }
  finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <el-container class="CmsWebsearchProviders">
    <el-main>
      <div class="toolbar">
        <el-button :loading="loading" @click="fetchSettings">
          刷新
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveSettings">
          保存配置
        </el-button>
      </div>

      <el-card shadow="never" class="block">
        <template #header>
          <div class="header">Provider 全局池</div>
        </template>

        <div class="provider-actions">
          <el-button size="small" @click="addProvider('searxng')">
            + SearXNG
          </el-button>
          <el-button size="small" @click="addProvider('serper')">
            + Serper
          </el-button>
          <el-button size="small" @click="addProvider('tavily')">
            + Tavily
          </el-button>
        </div>

        <el-table border table-layout="auto" :data="form.providers" style="width: 100%">
          <el-table-column label="ID" min-width="180">
            <template #default="{ row }">
              <el-input v-model="row.id" />
            </template>
          </el-table-column>
          <el-table-column label="Type" width="140">
            <template #default="{ row }">
              <el-select v-model="row.type" style="width: 100%">
                <el-option label="searxng" value="searxng" />
                <el-option label="serper" value="serper" />
                <el-option label="tavily" value="tavily" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="Enabled" width="90">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" />
            </template>
          </el-table-column>
          <el-table-column label="Priority" width="110">
            <template #default="{ row }">
              <el-input-number v-model="row.priority" :min="1" :max="9999" :step="1" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="Base URL" min-width="240">
            <template #default="{ row }">
              <el-input v-model="row.baseUrl" />
            </template>
          </el-table-column>
          <el-table-column label="Timeout" width="130">
            <template #default="{ row }">
              <el-input-number v-model="row.timeoutMs" :min="1000" :max="120000" :step="1000" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="Max Results" width="130">
            <template #default="{ row }">
              <el-input-number v-model="row.maxResults" :min="1" :max="20" :step="1" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="API Key" min-width="240">
            <template #default="{ row }">
              <el-input
                v-model="row.apiKey"
                show-password
                :placeholder="row.hasApiKey ? `留空保持不变（当前：${row.apiKeyMasked || '已设置'}）` : '输入 API Key'"
              />
              <el-checkbox v-model="row.clearApiKey" style="margin-top: 6px">
                清空已存 Key
              </el-checkbox>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ $index }">
              <el-button text @click="moveProvider($index, -1)">
                上移
              </el-button>
              <el-button text @click="moveProvider($index, 1)">
                下移
              </el-button>
              <el-button text type="danger" @click="removeProvider($index)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" class="block">
        <template #header>
          <div class="header">聚合配置</div>
        </template>
        <el-form label-width="180px">
          <el-form-item label="Mode">
            <el-select v-model="form.aggregation.mode" style="width: 220px">
              <el-option label="hybrid" value="hybrid" />
              <el-option label="sequential" value="sequential" />
            </el-select>
          </el-form-item>
          <el-form-item label="Target Results">
            <el-input-number v-model="form.aggregation.targetResults" :min="1" :max="20" :step="1" />
          </el-form-item>
          <el-form-item label="Min Per Provider">
            <el-input-number v-model="form.aggregation.minPerProvider" :min="1" :max="20" :step="1" />
          </el-form-item>
          <el-form-item label="Dedupe Key">
            <el-select v-model="form.aggregation.dedupeKey" style="width: 220px">
              <el-option label="url" value="url" />
              <el-option label="url+content" value="url+content" />
            </el-select>
          </el-form-item>
          <el-form-item label="Stop When Enough">
            <el-switch v-model="form.aggregation.stopWhenEnough" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" class="block">
        <template #header>
          <div class="header">抓取配置</div>
        </template>
        <el-form label-width="180px">
          <el-form-item label="Crawl Enabled">
            <el-switch v-model="form.crawl.enabled" />
          </el-form-item>
          <el-form-item label="Crawl Timeout (ms)">
            <el-input-number v-model="form.crawl.timeoutMs" :min="1000" :max="120000" :step="1000" />
          </el-form-item>
          <el-form-item label="Max Content Chars">
            <el-input-number v-model="form.crawl.maxContentChars" :min="500" :max="100000" :step="500" />
          </el-form-item>
          <el-form-item label="Allowlist Domains">
            <el-input v-model="allowlistInput" placeholder="example.com, docs.example.com" />
          </el-form-item>
          <el-form-item label="TTL Minutes">
            <el-input-number v-model="form.ttlMinutes" :min="1" :max="1440" :step="1" />
          </el-form-item>
        </el-form>
      </el-card>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.CmsWebsearchProviders {
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .block + .block {
    margin-top: 12px;
  }

  .header {
    font-weight: 600;
  }

  .provider-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
}
</style>
