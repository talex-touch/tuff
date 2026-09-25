// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type {
  VoiceInstalledSpeechModel,
  VoiceSpeechModelCatalog,
  VoiceSpeechModelEntry
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const voiceSdk = vi.hoisted(() => ({
  listInstalledSpeechModels: vi.fn(),
  getSpeechModelCatalog: vi.fn(),
  getSpeechModelProgress: vi.fn(),
  installSpeechModel: vi.fn(),
  uninstallSpeechModel: vi.fn()
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/voice', () => ({
  createVoiceSdk: () => voiceSdk
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['disabled', 'loading', 'size', 'variant'],
    template: '<button type="button" :disabled="disabled"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/tag', () => ({
  TxTag: {
    props: ['size', 'type'],
    template: '<span><slot /></span>'
  }
}))

// The real block slots are layout primitives; what matters here is which rows and badges they
// were handed, so the stub keeps title/description/tags readable and nothing else.
vi.mock('~/components/tuff/TuffBlockSlot.vue', () => ({
  default: {
    props: ['title', 'description'],
    template:
      '<section><span>{{ title }}</span><span>{{ description }}</span><slot name="tags" /><slot /></section>'
  }
}))

vi.mock('~/components/tuff/TuffGroupBlock.vue', () => ({
  default: {
    name: 'TuffGroupBlock',
    props: ['name', 'description'],
    template: '<main><span>{{ name }}</span><span>{{ description }}</span><slot /></main>'
  }
}))

// Every key stays a key, and interpolated params stay visible: the disclosure count has to be
// checked against the number of rows actually hidden, not against shipped copy.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${Object.values(params).join(',')})` : key
  })
}))

import SpeechModelSettings from './SpeechModelSettings.vue'

const MORE = '[data-testid="speech-model-more"]'
const EXPAND = '[data-testid="speech-model-expand"]'
const COLLAPSE = '[data-testid="speech-model-collapse"]'
const ERROR = '[data-testid="speech-model-error"]'

const EXPAND_KEY = 'settingSpeechRecognition.models.expand'
const COLLAPSE_KEY = 'settingSpeechRecognition.models.collapse'
const EXPAND_HINT_KEY = 'settingSpeechRecognition.models.expandHint'
const COLLAPSE_HINT_KEY = 'settingSpeechRecognition.models.collapseHint'
const RECOMMENDED_BADGE = 'settingSpeechRecognition.models.recommended'
const INSTALLED_BADGE = 'settingSpeechRecognition.models.installed'

const RECOMMENDED_ID = 'sense-voice-small'
const HIDDEN_ID = 'tuff-asr-zh-tiny'

function row(id: string): string {
  return `[data-testid="speech-model-${id}"]`
}

function removeButton(id: string): string {
  return `[data-testid="speech-model-remove-${id}"]`
}

function model(
  overrides: Partial<VoiceSpeechModelEntry> & { id: string; version: string }
): VoiceSpeechModelEntry {
  return {
    name: overrides.id,
    engine: 'sherpa-onnx',
    languages: ['zh'],
    bytes: 42 * 1024 * 1024,
    installed: false,
    runnable: true,
    needsRuntime: null,
    ...overrides
  }
}

/** The recommended entry is offered but not on this machine. */
const RECOMMENDED = model({ id: RECOMMENDED_ID, version: '1.0.0', engine: 'sensevoice' })

/** Four bundles this machine already has — two of them two versions of the same model. */
const INSTALLED_ENTRIES = [
  model({ id: 'tuff-asr-zh', version: '0.1.0', installed: true }),
  model({ id: 'tuff-asr-zh', version: '0.2.0', installed: true }),
  model({ id: 'whisper-base', version: '1.0.0', engine: 'whisper.cpp', installed: true }),
  model({ id: 'whisper-tiny', version: '1.0.0', engine: 'whisper.cpp', installed: true })
]

/** Cloud-only tail: installable, unrelated to the recommendation, absent from disk. */
const HIDDEN_ENTRY = model({ id: HIDDEN_ID, version: '0.1.0' })

const INSTALLED: VoiceInstalledSpeechModel[] = INSTALLED_ENTRIES.map((entry) => ({
  id: entry.id,
  version: entry.version,
  name: entry.name,
  engine: entry.engine,
  bytes: entry.bytes,
  directory: `/models/${entry.id}/${entry.version}`
}))

function catalogWith(extra: VoiceSpeechModelEntry[] = []): VoiceSpeechModelCatalog {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    recommended: { id: RECOMMENDED.id, version: RECOMMENDED.version },
    models: [RECOMMENDED, ...INSTALLED_ENTRIES, HIDDEN_ENTRY, ...extra]
  }
}

/** Reads the interpolated `{count}` back out of the i18n mock's `key(count)` output. */
function countIn(text: string): number {
  const match = text.match(/\((\d+)\)/)
  expect(match, `no interpolated count in "${text}"`).not.toBeNull()
  return Number(match![1])
}

async function mountSettings(): Promise<VueWrapper> {
  const wrapper = mount(SpeechModelSettings)
  await flushPromises()
  return wrapper
}

describe('SpeechModelSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    voiceSdk.listInstalledSpeechModels.mockResolvedValue(INSTALLED)
    voiceSdk.getSpeechModelCatalog.mockResolvedValue(catalogWith())
    voiceSdk.getSpeechModelProgress.mockResolvedValue(null)
  })

  /**
   * A first-time reader has nothing to rank six bundles by, so the default view answers the
   * question for them: the catalog's recommendation, plus everything already on disk (which they
   * may need to remove, and which is a fact about this machine rather than about the cloud).
   * Everything else waits behind an explicit request — and must genuinely be absent, not merely
   * scrolled out of view.
   */
  it('shows the recommended bundle and what is on disk, and withholds the rest of the catalog', async () => {
    const wrapper = await mountSettings()

    expect(wrapper.findAll(row(RECOMMENDED_ID))).toHaveLength(1)
    expect(wrapper.findAll(row('tuff-asr-zh'))).toHaveLength(2)
    expect(wrapper.findAll(row('whisper-base'))).toHaveLength(1)
    expect(wrapper.findAll(row('whisper-tiny'))).toHaveLength(1)
    expect(wrapper.findAll(row(HIDDEN_ID))).toHaveLength(0)

    // The two shared-id rows are two versions, not one row rendered twice.
    const tuffRows = wrapper.findAll(row('tuff-asr-zh')).map((item) => item.text())
    expect(tuffRows.join('\n')).toContain('tuff-asr-zh@0.1.0')
    expect(tuffRows.join('\n')).toContain('tuff-asr-zh@0.2.0')

    wrapper.unmount()
  })

  /**
   * Hiding rows without saying how many is indistinguishable from a catalog that lost them, so
   * the count is part of the contract — and it has to be the real number of withheld rows.
   */
  it('says how many bundles the default view is withholding', async () => {
    const wrapper = await mountSettings()

    const expand = wrapper.get(EXPAND)
    expect(expand.text()).toContain(EXPAND_KEY)
    expect(countIn(expand.text())).toBe(1)

    const more = wrapper.get(MORE)
    expect(more.text()).toContain(EXPAND_HINT_KEY)
    expect(countIn(more.text())).toBe(1)

    wrapper.unmount()
  })

  /** The count follows the rows actually hidden, so a wider tail widens the count too. */
  it('keeps the withheld count in step with the rows it hides', async () => {
    voiceSdk.getSpeechModelCatalog.mockResolvedValue(
      catalogWith([
        model({ id: 'sense-voice-large', version: '1.0.0', engine: 'sensevoice' }),
        model({ id: 'paraformer-zh', version: '2.0.0' })
      ])
    )

    const wrapper = await mountSettings()

    expect(wrapper.findAll(row('sense-voice-large'))).toHaveLength(0)
    expect(wrapper.findAll(row('paraformer-zh'))).toHaveLength(0)
    expect(countIn(wrapper.get(EXPAND).text())).toBe(3)

    wrapper.unmount()
  })

  /**
   * Expansion is a round trip the reader must be able to take back: the disclosure stays on
   * screen while expanded (otherwise the revealed rows can never be hidden again), and collapsing
   * must actually remove the rows rather than just relabel the button.
   */
  it('reveals the withheld bundles on request and puts them back', async () => {
    const wrapper = await mountSettings()
    expect(wrapper.findAll(row(HIDDEN_ID))).toHaveLength(0)

    await wrapper.get(EXPAND).trigger('click')
    await flushPromises()

    expect(wrapper.findAll(row(HIDDEN_ID))).toHaveLength(1)
    expect(wrapper.get(row(HIDDEN_ID)).text()).toContain('tuff-asr-zh-tiny@0.1.0')
    expect(wrapper.find(EXPAND).exists()).toBe(false)
    const collapse = wrapper.get(COLLAPSE)
    expect(collapse.text()).toContain(COLLAPSE_KEY)
    expect(wrapper.get(MORE).text()).toContain(COLLAPSE_HINT_KEY)

    await collapse.trigger('click')
    await flushPromises()

    expect(wrapper.findAll(row(HIDDEN_ID))).toHaveLength(0)
    expect(wrapper.find(COLLAPSE).exists()).toBe(false)
    expect(countIn(wrapper.get(EXPAND).text())).toBe(1)

    wrapper.unmount()
  })

  /**
   * The two badges answer different questions — "the catalog suggests this" and "this machine has
   * it" — and the recommendation here is explicitly *not* installed. Conflating them would tell a
   * user their disk holds something it does not.
   */
  it('separates the recommendation badge from the installed badge', async () => {
    const wrapper = await mountSettings()

    const recommended = wrapper.get(row(RECOMMENDED_ID))
    expect(recommended.text()).toContain(RECOMMENDED_BADGE)
    expect(recommended.text()).not.toContain(INSTALLED_BADGE)

    for (const id of ['tuff-asr-zh', 'whisper-base', 'whisper-tiny']) {
      const rows = wrapper.findAll(row(id))
      expect(rows.length).toBeGreaterThan(0)
      for (const item of rows) {
        expect(item.text()).toContain(INSTALLED_BADGE)
        expect(item.text()).not.toContain(RECOMMENDED_BADGE)
      }
    }

    wrapper.unmount()
  })

  /**
   * A failed catalog read is about the network and the account, not about this machine. The user
   * whose connection is down must still see what occupies disk and be able to remove it — which is
   * the one action that has to keep working offline.
   */
  it('falls back to the local store when the catalog cannot be read', async () => {
    voiceSdk.getSpeechModelCatalog.mockRejectedValue(new Error('transport offline'))

    const wrapper = await mountSettings()

    expect(wrapper.find(ERROR).exists()).toBe(true)
    // Cloud knowledge is gone, so a recommended bundle that is not on disk cannot be listed.
    expect(wrapper.findAll(row(RECOMMENDED_ID))).toHaveLength(0)
    expect(wrapper.findAll(row('tuff-asr-zh'))).toHaveLength(2)
    expect(wrapper.findAll(row('whisper-base'))).toHaveLength(1)
    expect(wrapper.findAll(row('whisper-tiny'))).toHaveLength(1)

    expect(wrapper.findAll(removeButton('tuff-asr-zh'))).toHaveLength(2)
    expect(wrapper.findAll(removeButton('whisper-base'))).toHaveLength(1)
    expect(wrapper.findAll(removeButton('whisper-tiny'))).toHaveLength(1)

    // Nothing is withheld, so there is nothing to disclose.
    expect(wrapper.find(MORE).exists()).toBe(false)

    wrapper.unmount()
  })
})
