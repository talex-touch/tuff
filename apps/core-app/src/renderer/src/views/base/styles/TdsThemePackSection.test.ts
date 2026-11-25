// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearTdsThemePack,
  hydrateTdsThemePack,
  TDS_DEFAULT_THEME_PACK_ID,
  TDS_THEME_PACK_STYLE_ID,
  useTdsThemePack,
  type TdsThemePack
} from '~/modules/tds-theme'

enableAutoUnmount(afterEach)

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key)
  })
}))

vi.mock('~/components/tuff/TuffGroupBlock.vue', () => ({
  default: {
    name: 'TuffGroupBlock',
    props: ['name', 'description'],
    template:
      '<section class="stub-group"><h3>{{ name }}</h3><p>{{ description }}</p><slot /></section>'
  }
}))

vi.mock('~/components/tuff/TuffBlockSwitch.vue', () => ({
  default: {
    name: 'TuffBlockSwitch',
    props: ['modelValue', 'title', 'description'],
    emits: ['update:modelValue'],
    template:
      '<label class="stub-switch"><input type="checkbox" data-testid="tds-theme-pack-sync-material" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><span>{{ title }}</span></label>'
  }
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: {
      disabled: { type: Boolean, default: false },
      nativeType: { type: String, default: 'button' }
    },
    template: '<button :type="nativeType" :disabled="disabled"><slot /></button>'
  }
}))

import TdsThemePackSection from './TdsThemePackSection.vue'

function makeValidCustomJson(): string {
  const pack: TdsThemePack = {
    schemaVersion: 1,
    meta: {
      id: 'custom-alpine-slate',
      name: 'Alpine Slate',
      description: 'Crisp monochrome alpine palette.',
      version: '1.0.0',
      author: 'Studio'
    },
    tokens: {
      light: {
        bg: '#ffffff',
        surface: '#f3f5f8',
        surface2: '#e7ebf0',
        border: '#d6dce5',
        borderStrong: '#b8c2d1',
        textPrimary: '#141923',
        textRegular: '#364152',
        textSecondary: '#4f5d73',
        textMuted: '#69778c',
        primary: '#1f5ec9',
        primarySoft: '#1f5ec91a',
        primaryBorder: '#1f5ec93d',
        onPrimary: '#ffffff',
        success: '#1c784f',
        warning: '#925e0e',
        danger: '#c2312a',
        info: '#4f5d73'
      },
      dark: {
        bg: '#11151b',
        surface: '#181e27',
        surface2: '#232b38',
        border: '#2f3a4b',
        borderStrong: '#44536b',
        textPrimary: '#f1f5fa',
        textRegular: '#cad4e3',
        textSecondary: '#98a6bd',
        textMuted: '#7d8ca3',
        primary: '#75aaff',
        primarySoft: '#75aaff26',
        primaryBorder: '#75aaff4d',
        onPrimary: '#081b3b',
        success: '#4bc48a',
        warning: '#e0ad48',
        danger: '#f07167',
        info: '#98a6bd'
      }
    },
    material: {
      windowPreference: 'pure',
      motionPreset: 'crisp'
    },
    surface: {
      canvasPattern: 'grid'
    }
  }
  return JSON.stringify(pack, null, 2)
}

describe('TdsThemePackSection.vue', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearTdsThemePack(document)
    useTdsThemePack().resetPack(document)
    hydrateTdsThemePack(document)
  })

  afterEach(() => {
    clearTdsThemePack(document)
    window.localStorage.clear()
  })

  it('renders all 4 built-in presets with semantic buttons, AA badges, and switches active pack', async () => {
    const wrapper = mount(TdsThemePackSection)
    await flushPromises()

    const presetIds = [
      'tds-apple-neutral',
      'tds-obsidian-cobalt',
      'tds-paper-ink',
      'tds-graphite-emerald'
    ]
    for (const id of presetIds) {
      const card = wrapper.get(`[data-testid="tds-theme-pack-card-${id}"]`)
      expect(card.element.tagName).toBe('BUTTON')
      expect(card.attributes('type')).toBe('button')
      expect(card.text()).toContain('AA')
    }

    // Apple Neutral is active by default and Reset is disabled
    expect(
      wrapper
        .get('[data-testid="tds-theme-pack-card-tds-apple-neutral"]')
        .attributes('aria-pressed')
    ).toBe('true')
    expect(
      wrapper.get('[data-testid="tds-theme-pack-reset-btn"]').attributes('disabled')
    ).toBeDefined()

    // Select Obsidian Studio
    await wrapper.get('[data-testid="tds-theme-pack-card-tds-obsidian-cobalt"]').trigger('click')
    await flushPromises()

    expect(
      wrapper
        .get('[data-testid="tds-theme-pack-card-tds-obsidian-cobalt"]')
        .attributes('aria-pressed')
    ).toBe('true')
    const styleEl = document.getElementById(TDS_THEME_PACK_STYLE_ID)
    expect(styleEl?.textContent).toContain(':root:not(.contrast)')
    expect(styleEl?.textContent).toContain('#12141a')

    // Enable Sync Window Material and select Editorial Paper -> emits apply-window-preference('pure')
    const syncCheckbox = wrapper.get('[data-testid="tds-theme-pack-sync-material"]')
    await syncCheckbox.setValue(true)
    await wrapper.get('[data-testid="tds-theme-pack-card-tds-paper-ink"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('apply-window-preference')?.at(-1)).toEqual(['pure'])

    // Click Reset -> returns to Apple Neutral and clears custom style tag
    await wrapper.get('[data-testid="tds-theme-pack-reset-btn"]').trigger('click')
    await flushPromises()

    expect(useTdsThemePack().activePackId.value).toBe(TDS_DEFAULT_THEME_PACK_ID)
    expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)).toBeNull()
  })

  it('imports valid JSON pack, exports active JSON, and removes custom pack cleanly', async () => {
    const wrapper = mount(TdsThemePackSection)
    await flushPromises()

    await wrapper.get('[data-testid="tds-theme-pack-import-toggle"]').trigger('click')
    await wrapper.get('[data-testid="tds-theme-pack-import-input"]').setValue(makeValidCustomJson())
    await wrapper.get('[data-testid="tds-theme-pack-import-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="tds-theme-pack-import-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tds-theme-pack-card-custom-alpine-slate"]').exists()).toBe(
      true
    )
    expect(
      wrapper
        .get('[data-testid="tds-theme-pack-card-custom-alpine-slate"]')
        .attributes('aria-pressed')
    ).toBe('true')
    expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)?.textContent).toContain('#1f5ec9')

    // Export JSON displays valid JSON matching active pack
    await wrapper.get('[data-testid="tds-theme-pack-export-btn"]').trigger('click')
    await flushPromises()

    const exportTextarea = wrapper.get('[data-testid="tds-theme-pack-export-output"]')
    const exportedObj = JSON.parse(
      (exportTextarea.element as HTMLTextAreaElement).value
    ) as TdsThemePack
    expect(exportedObj.meta.id).toBe('custom-alpine-slate')

    // Remove custom pack falls back to default
    await wrapper.get('[data-testid="tds-theme-pack-remove-custom-alpine-slate"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="tds-theme-pack-card-custom-alpine-slate"]').exists()).toBe(
      false
    )
    expect(useTdsThemePack().activePackId.value).toBe(TDS_DEFAULT_THEME_PACK_ID)
  })

  it('displays clear inline errors on low-contrast or CSS-injection JSON without applying it', async () => {
    const wrapper = mount(TdsThemePackSection)
    await flushPromises()

    await wrapper.get('[data-testid="tds-theme-pack-import-toggle"]').trigger('click')

    // 1. CSS injection payload
    const malicious = JSON.parse(makeValidCustomJson()) as TdsThemePack
    malicious.meta.id = 'custom-evil'
    malicious.tokens.light.primary = 'red; background: url(http://evil.example/a.png)'

    await wrapper
      .get('[data-testid="tds-theme-pack-import-input"]')
      .setValue(JSON.stringify(malicious))
    await wrapper.get('[data-testid="tds-theme-pack-import-submit"]').trigger('click')
    await flushPromises()

    const injectionError = wrapper.get('[data-testid="tds-theme-pack-import-error"]')
    expect(injectionError.attributes('role')).toBe('alert')
    expect(injectionError.text()).toMatch(/unsafe css/i)
    expect(useTdsThemePack().activePackId.value).toBe(TDS_DEFAULT_THEME_PACK_ID)
    expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)).toBeNull()

    // 2. Low-contrast WCAG AA failure
    const lowContrast = JSON.parse(makeValidCustomJson()) as TdsThemePack
    lowContrast.meta.id = 'custom-low-contrast'
    lowContrast.tokens.light.textPrimary = '#e0e0e0'

    await wrapper
      .get('[data-testid="tds-theme-pack-import-input"]')
      .setValue(JSON.stringify(lowContrast))
    await wrapper.get('[data-testid="tds-theme-pack-import-submit"]').trigger('click')
    await flushPromises()

    const contrastError = wrapper.get('[data-testid="tds-theme-pack-import-error"]')
    expect(contrastError.text()).toMatch(/wcag aa contrast failed/i)
    expect(wrapper.find('[data-testid="tds-theme-pack-card-custom-low-contrast"]').exists()).toBe(
      false
    )
  })
})
