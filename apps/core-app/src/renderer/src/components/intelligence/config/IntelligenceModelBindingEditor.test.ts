// @vitest-environment jsdom
import type { IntelligenceProviderModelOption } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type {
  IntelligenceModelBinding,
  IntelligenceProviderConfig
} from '@talex-touch/utils/types/intelligence'
import { resolveEffectiveModel } from '@talex-touch/utils/intelligence/model-binding'
import { IntelligenceProviderType } from '@talex-touch/utils/types/intelligence'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligenceModelBindingEditor from './IntelligenceModelBindingEditor.vue'

const boundary = vi.hoisted(() => ({
  getProviderModelOptions: vi.fn(),
  updateProvider: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({ getProviderModelOptions: boundary.getProviderModelOptions })
}))

vi.mock('@talex-touch/utils/renderer/storage', () => ({
  intelligenceSettings: { updateProvider: boundary.updateProvider }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// Keep controls semantic and interactive; the effective-value panel is the real component DOM.
vi.mock('@talex-touch/tuffex/select', () => ({
  TuffSelect: {
    props: ['modelValue', 'disabled', 'searchable'],
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
  },
  TuffSelectItem: {
    props: ['value', 'label'],
    template: '<option :value="value">{{ label }}</option>'
  }
}))

vi.mock('@talex-touch/tuffex/number-input', () => ({
  TxNumberInput: {
    props: ['modelValue', 'min', 'step', 'placeholder', 'disabled'],
    emits: ['change'],
    template:
      '<input type="number" :value="modelValue" :min="min" :step="step" :placeholder="placeholder" :disabled="disabled" @change="$emit(\'change\', $event.target.value === \'\' ? null : Number($event.target.value))" />'
  }
}))

vi.mock('@talex-touch/tuffex/input', () => ({
  TxInput: {
    props: ['modelValue', 'placeholder', 'disabled'],
    emits: ['update:modelValue', 'blur'],
    template:
      '<input :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\', $event)" />'
  }
}))

vi.mock('@talex-touch/tuffex/flat-radio', () => ({
  TxFlatRadio: { template: '<div><slot /></div>' },
  TxFlatRadioItem: { props: ['label'], template: '<span>{{ label }}</span>' }
}))

vi.mock('@talex-touch/tuffex/checkbox', () => ({
  TxCheckbox: { props: ['label'], template: '<span>{{ label }}</span>' }
}))

const MODEL_ID = 'catalog-refresh-model'
const KEY = 'intelligence.config.model.binding.'
const UNKNOWN = `${KEY}unknown`
const LATEST_CATALOG = { contextWindow: 24_000, maxTokens: 7_000 }

function catalogBinding(): IntelligenceModelBinding {
  return {
    id: MODEL_ID,
    contextWindow: 12_000,
    contextWindowSource: 'catalog',
    maxTokens: 3_000,
    maxTokensSource: 'catalog'
  }
}

function providerWith(models: IntelligenceModelBinding[]): IntelligenceProviderConfig {
  return reactive({
    id: 'binding-editor-provider',
    type: IntelligenceProviderType.CUSTOM,
    name: 'Binding editor provider',
    enabled: true,
    models,
    capabilities: ['text.chat']
  })
}

function mainOptions(provider: IntelligenceProviderConfig): IntelligenceProviderModelOption[] {
  const models = provider.models?.map((binding) => binding.id) ?? []
  return [
    {
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.type,
      models,
      effectiveModels: models.map((id) => resolveEffectiveModel(provider, id, LATEST_CATALOG)),
      defaultModel: null,
      capabilities: ['text.chat'],
      available: true
    }
  ]
}

const mounted: VueWrapper[] = []

async function mountEditor(provider: IntelligenceProviderConfig): Promise<VueWrapper> {
  // Renderer storage applies the component's public edit to its reactive provider, as in Settings.
  boundary.updateProvider.mockImplementation(
    (id: string, patch: Partial<IntelligenceProviderConfig>) => {
      if (id === provider.id) Object.assign(provider, patch)
    }
  )
  const wrapper = mount(IntelligenceModelBindingEditor, { props: { provider } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function expectLimits(
  wrapper: VueWrapper,
  context: { text: string; source: 'catalog' | 'user' | 'unknown' },
  output: { text: string; source: 'catalog' | 'user' | 'unknown' }
): void {
  const rows = wrapper.get('.model-binding-editor__effective').findAll('dl > div')
  for (const [label, expected] of [
    ['contextWindow', context],
    ['maxTokens', output]
  ] as const) {
    const row = rows.find((candidate) => candidate.get('dt').text() === `${KEY}${label}`)
    expect(row, `missing effective ${label} row`).toBeDefined()
    expect(row!.get('dd').text().replace(/\s+/g, ' ').trim()).toBe(
      `${expected.text} ${KEY}source.${expected.source}`
    )
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  // Freeze only the Settings-to-Main debounce, not promise settlement; no wall-clock races.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('IntelligenceModelBindingEditor effective limits', () => {
  it('shows Main’s refreshed catalog limits instead of the older saved catalog values', async () => {
    const provider = providerWith([catalogBinding()])
    boundary.getProviderModelOptions.mockResolvedValue(mainOptions(provider))

    const wrapper = await mountEditor(provider)

    expectLimits(wrapper, { text: '24K', source: 'catalog' }, { text: '7K', source: 'catalog' })
  })

  it.each([
    { name: 'explicit user provenance', source: 'user' as const },
    { name: 'legacy limits without provenance', source: undefined }
  ])('preserves $name while Main still has the catalog binding', async ({ source }) => {
    boundary.getProviderModelOptions.mockResolvedValue(
      mainOptions(providerWith([catalogBinding()]))
    )
    const provider = providerWith([
      {
        id: MODEL_ID,
        contextWindow: 18_000,
        contextWindowSource: source,
        maxTokens: 4_000,
        maxTokensSource: source
      }
    ])

    const wrapper = await mountEditor(provider)

    expectLimits(wrapper, { text: '18K', source: 'user' }, { text: '4K', source: 'user' })
  })

  it.each([
    {
      name: 'context window',
      inputId: 'model-binding-context',
      value: '18000',
      context: { text: '18K', source: 'user' as const },
      output: { text: '7K', source: 'catalog' as const }
    },
    {
      name: 'output cap',
      inputId: 'model-binding-output',
      value: '4500',
      context: { text: '24K', source: 'catalog' as const },
      output: { text: '4.5K', source: 'user' as const }
    }
  ])('editing the $name keeps the other limit on Main’s latest catalog', async (scenario) => {
    const provider = providerWith([catalogBinding()])
    boundary.getProviderModelOptions.mockResolvedValue(mainOptions(provider))
    const wrapper = await mountEditor(provider)
    expectLimits(wrapper, { text: '24K', source: 'catalog' }, { text: '7K', source: 'catalog' })

    await wrapper.get(`input#${scenario.inputId}`).setValue(scenario.value)
    await flushPromises()

    // Before the debounced Main refresh, the edited limit is user-owned and its sibling is not.
    expectLimits(wrapper, scenario.context, scenario.output)
  })

  it.each(['missing provider', 'missing model', 'request rejected'] as const)(
    'uses local known values and marks unknown limits when Main has %s',
    async (availability) => {
      const provider = providerWith([
        catalogBinding(),
        { id: 'partly-known-model', contextWindow: 18_000, contextWindowSource: 'user' },
        { id: 'unknown-model' }
      ])
      if (availability === 'request rejected') {
        boundary.getProviderModelOptions.mockRejectedValue(new Error('Main transport unavailable'))
      } else {
        const other = providerWith([{ id: 'another-model' }])
        if (availability === 'missing provider') other.id = 'another-provider'
        boundary.getProviderModelOptions.mockResolvedValue(mainOptions(other))
      }

      const wrapper = await mountEditor(provider)
      expectLimits(wrapper, { text: '12K', source: 'catalog' }, { text: '3K', source: 'catalog' })

      await wrapper.get('select#model-binding-model').setValue('partly-known-model')
      expectLimits(wrapper, { text: '18K', source: 'user' }, { text: UNKNOWN, source: 'unknown' })

      await wrapper.get('select#model-binding-model').setValue('unknown-model')
      expectLimits(
        wrapper,
        { text: UNKNOWN, source: 'unknown' },
        { text: UNKNOWN, source: 'unknown' }
      )
    }
  )
})
