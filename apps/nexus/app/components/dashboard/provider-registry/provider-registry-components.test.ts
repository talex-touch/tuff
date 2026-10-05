import type { Component } from 'vue'
import type { RegistryDetailSection } from '~/utils/admin-provider-registry-detail'
import type { ProviderQuotaRecord, ProviderRegistryRecord } from '~/utils/provider-registry-admin'
import * as tuffexAlert from '@talex-touch/tuffex/alert'
import * as tuffexButton from '@talex-touch/tuffex/button'
import * as tuffexDescriptions from '@talex-touch/tuffex/descriptions'
import * as tuffexInput from '@talex-touch/tuffex/input'
import * as tuffexSelect from '@talex-touch/tuffex/select'
import * as tuffexStatusBadge from '@talex-touch/tuffex/status-badge'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as vue from 'vue'
import { createSSRApp, defineComponent, h, reactive, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import * as adminFieldControl from '~/composables/useAdminFieldControl'
import * as adminFormat from '~/composables/useAdminFormat'
import { createProviderQuotaPanel } from '~/utils/provider-registry-admin'
import { loadSfcComponent } from '../../../../test/helpers/sfc-component'

/**
 * Markup of the provider registry's drawers on the server renderer: the quota
 * drawer's channel list, the create drawer's capability rows, and the shared
 * read-only detail view. The rules behind them are tested in
 * `utils/admin-provider-registry*.test.ts` and `composables/useProviderRegistry*.test.ts`.
 */

// The drawer only frames the content; a stand-in renders the slots in place.
const drawerStub = defineComponent({
  props: { visible: Boolean, title: String },
  setup(props, { slots }) {
    return () => h('div', { 'data-drawer': props.title }, [slots.default?.(), slots.footer?.()])
  },
})

const MODULES: Record<string, unknown> = {
  'vue': vue,
  '@talex-touch/tuffex/alert': tuffexAlert,
  '@talex-touch/tuffex/button': tuffexButton,
  '@talex-touch/tuffex/descriptions': tuffexDescriptions,
  '@talex-touch/tuffex/drawer': { TxDrawer: drawerStub },
  '@talex-touch/tuffex/input': tuffexInput,
  '@talex-touch/tuffex/select': tuffexSelect,
  '@talex-touch/tuffex/status-badge': tuffexStatusBadge,
  '~/composables/useAdminFieldControl': adminFieldControl,
  '~/composables/useAdminFormat': adminFormat,
}

const components: Record<string, Component> = {}

async function load(path: string, specifier: string) {
  const component = await loadSfcComponent(path, MODULES)
  MODULES[specifier] = { default: component }
  return component
}

beforeAll(async () => {
  // English fallbacks stand in for the locale files.
  vi.stubGlobal('useI18n', () => ({
    locale: ref('en'),
    t: (key: string, second?: unknown, third?: unknown) => {
      const fallback = typeof second === 'string' ? second : typeof third === 'string' ? third : key
      return second && typeof second === 'object'
        ? fallback.replace(/\{(\w+)\}/g, (_, name: string) => String((second as Record<string, unknown>)[name] ?? ''))
        : fallback
    },
  }))
  await load('app/components/admin/AdminFormField.vue', '~/components/admin/AdminFormField.vue')
  components.DetailView = await load(
    'app/components/dashboard/provider-registry/ProviderRegistryDetailView.vue',
    './ProviderRegistryDetailView.vue',
  )
  components.ProviderDrawer = await load(
    'app/components/dashboard/provider-registry/ProviderRegistryProviderDrawer.vue',
    './ProviderRegistryProviderDrawer.vue',
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function render(name: string, props: Record<string, unknown>) {
  return renderToString(createSSRApp({ render: () => h(components[name]!, props) }))
}

function provider(): ProviderRegistryRecord {
  return {
    id: 'prv_a',
    name: 'provider-a',
    displayName: 'Provider A',
    vendor: 'openai',
    status: 'enabled',
    authType: 'api_key',
    authRef: null,
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: null,
    region: null,
    metadata: null,
    capabilities: [],
    createdBy: 'admin',
    createdAt: '',
    updatedAt: '',
  }
}

function quota(id: string, channel: string | null, maxRequests: number, maxTokens: number): ProviderQuotaRecord {
  return {
    id,
    configType: 'intelligence_provider_quota',
    name: `quota ${id}`,
    targetId: 'prv_a',
    provider: 'prv_a',
    channel,
    enabled: true,
    limits: { windowDays: 30, maxRequests, maxTokens },
    warningThreshold: 80,
    config: null,
    createdBy: 'admin',
    createdAt: '',
    updatedAt: '',
  }
}

/** The registry facade, cut to what the provider drawer reads. */
function fakeAdmin(quotas: ProviderQuotaRecord[] = []) {
  return {
    savingProvider: ref(false),
    providerCreateError: ref<string | null>(null),
    fetchingProviderModels: ref<string | null>(null),
    providerServiceCategoryId: ref('ai'),
    providerServiceCategoryOptions: ref([{ value: 'ai', label: 'ai' }]),
    providerTemplateId: ref('openai-compatible-ai'),
    providerTemplateOptions: ref([{ value: 'openai-compatible-ai', label: 'OpenAI compatible' }]),
    providerVendorOptions: ['openai'],
    providerAdapterOptions: ref([{ value: 'openai-compatible', label: 'OpenAI compatible' }]),
    providerStatusOptions: ['enabled', 'disabled', 'degraded'],
    authTypeOptions: ['api_key', 'none'],
    ownerScopeOptions: ['system'],
    providerForm: reactive({ name: 'a', displayName: 'A', vendor: 'openai', adapterKey: 'openai-compatible', status: 'disabled', authType: 'none', endpoint: '', region: '', modelsText: '', defaultModel: '', apiKey: '', secretId: '', secretKey: '' }),
    capabilityRows: ref([{ capability: 'text.chat', schemaRef: 'tuff://schemas/text.chat', meteringUnit: 'token' }]),
    providerCapabilityTemplateOptions: ref([{ capability: 'text.chat', schemaRef: 'tuff://schemas/text.chat', meteringUnit: 'token' }]),
    providerMeteringUnitOptions: ref(['token', 'request']),
    getProviderQuotaPanel: (record: ProviderRegistryRecord) => createProviderQuotaPanel(record, quotas[0]),
    getProviderQuotaList: () => quotas,
    getProviderEditPanel: () => null,
    applyProviderServiceCategory: vi.fn(),
    applyProviderTemplate: vi.fn(),
    applyProviderCapabilityTemplate: vi.fn(),
    addCapabilityRow: vi.fn(),
    removeCapabilityRow: vi.fn(),
  }
}

describe('ProviderRegistryDetailView', () => {
  it('draws fields, identifiers, badges, lists, JSON and the empty line', async () => {
    const sections: RegistryDetailSection[] = [
      {
        key: 'record',
        fields: [
          { key: 'id', label: 'Provider ID', value: 'prv_a', kind: 'code' },
          { key: 'status', label: 'Status', value: 'Degraded', kind: 'badge', tone: 'warning' },
          { key: 'error', label: 'Error', value: 'Bad gateway', danger: true },
          { key: 'region', label: 'Region', value: '' },
        ],
      },
      { key: 'list', title: 'Missing capabilities', items: [{ key: 'a', primary: 'image.translate', code: true }, { key: 'b', primary: 'Provider B · text.chat', secondary: 'Adapter missing' }] },
      { key: 'json', title: 'Trace', json: '[\n  {}\n]' },
      { key: 'empty', title: 'Latest usage', empty: 'No usage of it among the latest 25 ledger rows.' },
    ]

    const html = await render('DetailView', { sections })

    expect(html).toContain('Provider ID')
    expect(html).toContain('<code class="RegistryDetail-Code"')
    expect(html).toContain('prv_a')
    expect(html).toContain('Degraded')
    expect(html).toMatch(/class="RegistryDetail-Text is-danger"[^>]*>Bad gateway</)
    expect(html).toContain('Missing capabilities')
    expect(html).toContain('Adapter missing')
    expect(html).toContain('<pre class="RegistryDetail-Pre"')
    expect(html).toContain('No usage of it among the latest 25 ledger rows.')
  })

  it('gives every section the label track of the longest label, so the values line up', async () => {
    const html = await render('DetailView', {
      sections: [
        { key: 'route', fields: [{ key: 'status', label: 'Status', value: 'Enabled' }, { key: 'required', label: 'Required capabilities', value: 'text.chat' }] },
        { key: 'latestRun', title: 'Latest run', fields: [{ key: 'status', label: 'Status', value: 'Failed' }] },
      ] satisfies RegistryDetailSection[],
    })
    const zh = await render('DetailView', { sections: [{ key: 'provider', fields: [{ key: 'id', label: '服务渠道 ID', value: 'prv_a' }] }] })

    expect(html.match(/--tx-descriptions-label-width:\s*([^;"]+)/g)).toEqual(['--tx-descriptions-label-width:11em', '--tx-descriptions-label-width:11em'])
    expect(zh).toContain('--tx-descriptions-label-width:6em')
  })
})

describe('ProviderRegistryProviderDrawer', () => {
  it('lists every quota channel of a provider, the default one by name, with its limits', async () => {
    const quotas = [quota('q1', null, 1000, 50000), quota('q2', 'vip', 20000, 1000000)]
    const html = await render('ProviderDrawer', { admin: fakeAdmin(quotas), mode: 'quota', provider: provider(), open: true })

    expect(html).toContain('channels')
    expect(html).toMatch(/default\s+· requests 1,000\s+· tokens 50,000/)
    expect(html).toMatch(/vip\s+· requests 20,000\s+· tokens 1,000,000/)
  })

})
