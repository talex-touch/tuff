// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { VoiceAsrSource } from '@talex-touch/utils/common/storage/entity/app-settings'
import {
  VOICE_SPEECH_CATALOG_ERROR_CODES,
  VoiceApiError,
  type VoiceInstalledSpeechModel,
  type VoiceSpeechModelCatalog,
  type VoiceSpeechModelEntry
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

// The SDK's error vocabulary is part of the contract, not something to fake: the component has to
// tell a projected `VoiceApiError` apart from a bare message and only trust codes from the closed
// published set. So the real class and code set stay in place and only the transport-bound factory
// is replaced.
vi.mock('@talex-touch/utils/transport/sdk/domains/voice', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createVoiceSdk: () => voiceSdk }
})

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

const CLOUD_IMPACT_KEY = 'settingSpeechRecognition.models.catalogImpact.cloud'

/** The rendered title key a projected speech-catalog code must resolve to. */
function catalogTitle(name: string): string {
  return `settingSpeechRecognition.models.catalogErrors.${name}`
}

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

async function mountSettings(props: { source?: VoiceAsrSource } = {}): Promise<VueWrapper> {
  const wrapper = mount(SpeechModelSettings, { props })
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

  /**
   * A catalog failure is one of five different facts, not one generic shrug: no session, no
   * answer in time, an upstream that is down, a payload that failed its checks, or an
   * unclassified transport fault. Collapsing them leaves the reader unable to decide whether to
   * sign in, wait, or simply retry — so each projected code owns a distinct title, and the human
   * message never gets to pick one.
   */
  it.each([
    {
      name: 'an account with no session',
      code: VOICE_SPEECH_CATALOG_ERROR_CODES.authRequired,
      title: catalogTitle('authRequired')
    },
    {
      name: 'a request that timed out',
      code: VOICE_SPEECH_CATALOG_ERROR_CODES.timeout,
      title: catalogTitle('timeout')
    },
    {
      name: 'an upstream outage',
      code: VOICE_SPEECH_CATALOG_ERROR_CODES.upstreamUnavailable,
      title: catalogTitle('upstreamUnavailable')
    },
    {
      name: 'a payload that failed validation',
      code: VOICE_SPEECH_CATALOG_ERROR_CODES.invalid,
      title: catalogTitle('invalid')
    },
    {
      name: 'an unclassified transport failure',
      code: VOICE_SPEECH_CATALOG_ERROR_CODES.unavailable,
      title: catalogTitle('unavailable')
    }
  ])('names $name with its own catalog title', async ({ code, title }) => {
    voiceSdk.getSpeechModelCatalog.mockRejectedValue(
      new VoiceApiError('The cloud model catalog could not be read.', code, true)
    )

    const wrapper = await mountSettings({ source: 'cloud' })

    const error = wrapper.get(ERROR)
    expect(error.text()).toContain(title)
    // Cloud dictation never touches the on-device catalog, so every failure has to say it is safe.
    expect(error.text()).toContain(CLOUD_IMPACT_KEY)

    wrapper.unmount()
  })

  /**
   * Messages are prose; only a projected code is evidence. A bare Error whose text happens to name
   * the auth code is the legacy shape this build has to survive — it carries no code, so it is not
   * proof the user is signed out, and it must degrade to the generic title.
   */
  it('does not read a bare message as a projected catalog code', async () => {
    voiceSdk.getSpeechModelCatalog.mockRejectedValue(
      new Error('SPEECH_CATALOG_AUTH_REQUIRED: no Nexus session')
    )

    const wrapper = await mountSettings({ source: 'cloud' })

    const error = wrapper.get(ERROR)
    expect(error.text()).toContain(catalogTitle('unavailable'))
    expect(error.text()).not.toContain(catalogTitle('authRequired'))

    wrapper.unmount()
  })

  /**
   * When the code and the message disagree, the code came from main and the text did not. Following
   * the text would let any upstream copy that mentions a code silently re-route every failure.
   */
  it('follows the projected code, not the message text, when the two disagree', async () => {
    voiceSdk.getSpeechModelCatalog.mockRejectedValue(
      new VoiceApiError(
        'SPEECH_CATALOG_AUTH_REQUIRED',
        VOICE_SPEECH_CATALOG_ERROR_CODES.timeout,
        true
      )
    )

    const wrapper = await mountSettings({ source: 'cloud' })

    const error = wrapper.get(ERROR)
    expect(error.text()).toContain(catalogTitle('timeout'))
    expect(error.text()).not.toContain(catalogTitle('authRequired'))

    wrapper.unmount()
  })

  /**
   * Only the five codes are agreed vocabulary. A future or internal token — a digest mismatch, the
   * one main deliberately keeps private — has no user copy, so it degrades to the generic title
   * instead of leaking the raw token into the interface.
   */
  it('declines a code outside the published set and shows the generic title', async () => {
    voiceSdk.getSpeechModelCatalog.mockRejectedValue(
      new VoiceApiError(
        'The cloud model catalog failed its integrity checks.',
        'SPEECH_CATALOG_DIGEST_MISMATCH',
        false
      )
    )

    const wrapper = await mountSettings({ source: 'cloud' })

    const error = wrapper.get(ERROR)
    expect(error.text()).toContain(catalogTitle('unavailable'))
    expect(error.text()).not.toContain('SPEECH_CATALOG_DIGEST_MISMATCH')

    wrapper.unmount()
  })

  /**
   * The impact line is about the reader's own dictation choice, not about the catalog: someone who
   * picked local-only has no cloud fallback to lean on, so the sentence has to change with the
   * source instead of repeating the cloud reassurance.
   */
  it.each(['local', 'hybrid'] as const)(
    'describes what a catalog failure means for %s dictation',
    async (source) => {
      voiceSdk.getSpeechModelCatalog.mockRejectedValue(
        new VoiceApiError(
          'The cloud model catalog could not be read.',
          VOICE_SPEECH_CATALOG_ERROR_CODES.unavailable,
          true
        )
      )

      const wrapper = await mountSettings({ source })

      expect(wrapper.get(ERROR).text()).toContain(
        `settingSpeechRecognition.models.catalogImpact.${source}`
      )

      wrapper.unmount()
    }
  )

  /**
   * A sign-out or a dead network changes what the cloud can offer; it does not change what is
   * already on disk. The installed rows and their remove controls stay put under a coded catalog
   * failure too, so the one action that still works offline is never taken away by a catalog the
   * user cannot read.
   */
  it('keeps installed rows and their remove controls when the catalog fails with a code', async () => {
    voiceSdk.getSpeechModelCatalog.mockRejectedValue(
      new VoiceApiError(
        'Sign in to access the on-device speech model catalog.',
        VOICE_SPEECH_CATALOG_ERROR_CODES.authRequired,
        false
      )
    )

    const wrapper = await mountSettings({ source: 'hybrid' })

    expect(wrapper.get(ERROR).text()).toContain(catalogTitle('authRequired'))
    expect(wrapper.findAll(row('tuff-asr-zh'))).toHaveLength(2)
    expect(wrapper.findAll(removeButton('tuff-asr-zh'))).toHaveLength(2)
    expect(wrapper.findAll(removeButton('whisper-base'))).toHaveLength(1)

    wrapper.unmount()
  })
})
