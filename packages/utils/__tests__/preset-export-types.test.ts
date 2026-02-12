import { describe, expect, it } from 'vitest'
import {
  PRESET_EXPORT_VERSION,
  createPresetExport,
  validatePresetData,
} from '../common/storage/entity/preset-export-types'

const layoutConfig = {
  preset: 'custom',
  header: { border: 'solid', opacity: 1, height: 26, blur: false },
  aside: { position: 'left', width: 68, border: 'solid', opacity: 0.6, collapsed: false },
  view: { radius: [0, 0, 0, 0], shadow: 'none', padding: 0, background: 'transparent' },
  nav: { style: 'icon', activeIndicator: 'dot' },
}

const coreBoxConfig = {
  preset: 'custom',
  logo: { position: 'left', size: 24, style: 'default' },
  input: { border: 'bottom', radius: 8, background: 'transparent' },
  results: { itemRadius: 6, itemPadding: 8, divider: false, hoverStyle: 'background' },
  container: { radius: 8, shadow: 'none', border: false },
}

describe('preset-export-types', () => {
  it('validates legacy v1 payloads (layout/coreBox only)', () => {
    const legacyPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: {
        name: 'Legacy Preset',
      },
      layout: layoutConfig,
      coreBox: coreBoxConfig,
    }

    const result = validatePresetData(legacyPayload)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('validates v2 payload with theme and canvas fields', () => {
    const payload = createPresetExport({
      name: 'V2 Preset',
      channel: 'beta',
      source: 'nexus',
      layout: layoutConfig,
      coreBox: coreBoxConfig,
      theme: {
        window: 'Mica',
        style: { dark: false, auto: true },
        addon: { contrast: false, coloring: true },
        transition: { route: 'slide' },
      },
      mainCanvas: {
        enabled: true,
        preset: 'custom',
        columns: 12,
        rowHeight: 24,
        gap: 8,
        items: [
          { id: 'header', area: 'header', x: 0, y: 0, w: 12, h: 2 },
          { id: 'aside', area: 'aside', x: 0, y: 2, w: 2, h: 8 },
          { id: 'view', area: 'view', x: 2, y: 2, w: 10, h: 8 },
        ],
      },
      coreBoxCanvas: {
        enabled: true,
        preset: 'custom',
        columns: 12,
        rowHeight: 24,
        gap: 8,
        items: [
          { id: 'logo', area: 'logo', x: 0, y: 0, w: 1, h: 1 },
          { id: 'input', area: 'input', x: 1, y: 0, w: 9, h: 1 },
          { id: 'actions', area: 'actions', x: 10, y: 0, w: 2, h: 1 },
        ],
      },
    })

    const result = validatePresetData(payload)
    expect(payload.version).toBe(PRESET_EXPORT_VERSION)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects malformed coreBox config without results field', () => {
    const badPayload = {
      version: PRESET_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      meta: {
        name: 'Bad CoreBox Preset',
      },
      coreBox: {
        preset: 'custom',
        logo: { position: 'left', size: 24, style: 'default' },
        input: { border: 'bottom', radius: 8, background: 'transparent' },
      },
    }

    const result = validatePresetData(badPayload)
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.includes('CoreBox'))).toBe(true)
  })
})
