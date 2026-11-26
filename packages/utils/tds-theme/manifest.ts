import type {
  ParsePluginThemePackManifestOptions,
  TdsPluginThemePackManifestResult,
  TdsThemePack,
} from './types'
import { cloneThemePack, exportThemePackAsCss } from './css'
import { getBuiltInThemePack } from './presets'
import {
  TDS_PLUGIN_THEME_PACK_MANIFEST_KIND,
  TDS_PLUGIN_THEME_PACK_MANIFEST_VERSION,
} from './types'
import { createEmptyContrastReport, validateTdsThemePack } from './validator'

export const MAX_PLUGIN_THEME_PACK_MANIFEST_BYTES = 64 * 1024

const ALLOWED_ENVELOPE_KEYS = new Set(['manifestVersion', 'kind', 'pack'])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function measureUtf8Bytes(input: string): number {
  let bytes = 0
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code < 0x80) {
      bytes += 1
    }
    else if (code < 0x800) {
      bytes += 2
    }
    else if (code >= 0xd800 && code <= 0xdbff) {
      i += 1
      bytes += 4
    }
    else {
      bytes += 3
    }
  }
  return bytes
}

/**
 * Safely parses and validates a pure-JSON plugin or Store TDS Theme Pack manifest.
 *
 * Accepts either:
 *   1. A direct `TdsThemePack` JSON document (`{ schemaVersion: 1, meta, tokens, material?, surface? }`), or
 *   2. A store/plugin manifest envelope (`{ manifestVersion?: 1, kind: 'tds-theme-pack', pack: TdsThemePack }`).
 *
 * Enforces:
 *   - Strict payload byte ceiling (`maxBytes`, default 64 KiB) before parsing.
 *   - Strict schema whitelist & CSS injection rejection (zero component/script/region injection).
 *   - Full WCAG 2.1 AA + Refraction 0.85 contrast validation.
 *   - Built-in pack ID impersonation protection (`allowBuiltInId: false` by default) and `builtIn: false` stamping.
 */
export function parsePluginThemePackManifest(
  rawInput: string | unknown,
  options: ParsePluginThemePackManifestOptions = {},
): TdsPluginThemePackManifestResult {
  const maxBytes = Math.max(
    1024,
    Math.floor(options.maxBytes ?? MAX_PLUGIN_THEME_PACK_MANIFEST_BYTES),
  )
  const allowBuiltInId = options.allowBuiltInId === true
  const checkRefraction = options.checkRefraction !== false

  let parsed: unknown = rawInput
  if (typeof rawInput === 'string') {
    const bytes = measureUtf8Bytes(rawInput)
    if (bytes > maxBytes) {
      return {
        valid: false,
        errors: [`Theme pack manifest exceeds ${maxBytes} bytes (${bytes} bytes).`],
        contrastReport: createEmptyContrastReport(),
      }
    }
    try {
      parsed = JSON.parse(rawInput) as unknown
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : 'Unexpected token'
      return {
        valid: false,
        errors: [`Invalid JSON syntax: ${reason}`],
        contrastReport: createEmptyContrastReport(),
      }
    }
  }

  if (!isPlainRecord(parsed)) {
    return {
      valid: false,
      errors: ['Theme pack manifest must be a JSON object.'],
      contrastReport: createEmptyContrastReport(),
    }
  }

  let candidatePack: unknown = parsed
  if ('kind' in parsed || 'pack' in parsed || 'manifestVersion' in parsed) {
    const envelopeErrors: string[] = []
    for (const key of Object.keys(parsed)) {
      if (!ALLOWED_ENVELOPE_KEYS.has(key)) {
        envelopeErrors.push(`Unknown manifest envelope key "${key}" is not allowed.`)
      }
    }
    if (
      parsed.manifestVersion !== undefined
      && parsed.manifestVersion !== TDS_PLUGIN_THEME_PACK_MANIFEST_VERSION
    ) {
      envelopeErrors.push(
        `manifestVersion must be ${TDS_PLUGIN_THEME_PACK_MANIFEST_VERSION} when provided.`,
      )
    }
    if (parsed.kind !== TDS_PLUGIN_THEME_PACK_MANIFEST_KIND) {
      envelopeErrors.push(`kind must be "${TDS_PLUGIN_THEME_PACK_MANIFEST_KIND}".`)
    }
    if (!isPlainRecord(parsed.pack)) {
      envelopeErrors.push('pack must be a TdsThemePack object.')
    }
    if (envelopeErrors.length > 0) {
      return {
        valid: false,
        errors: envelopeErrors,
        contrastReport: createEmptyContrastReport(),
      }
    }
    candidatePack = parsed.pack
  }

  const validation = validateTdsThemePack(candidatePack, { checkRefraction })
  if (!validation.valid || !validation.pack) {
    return validation
  }

  const isBuiltInId = Boolean(getBuiltInThemePack(validation.pack.meta.id))
  if (!allowBuiltInId && isBuiltInId) {
    return {
      valid: false,
      errors: [
        `Cannot overwrite built-in theme pack "${validation.pack.meta.id}". Choose a unique meta.id.`,
      ],
      contrastReport: validation.contrastReport,
    }
  }

  const sanitizedPack: TdsThemePack = {
    ...cloneThemePack(validation.pack),
    meta: {
      ...validation.pack.meta,
      builtIn: allowBuiltInId && isBuiltInId,
    },
  }

  return {
    valid: true,
    errors: [],
    contrastReport: validation.contrastReport,
    pack: sanitizedPack,
    css: exportThemePackAsCss(sanitizedPack),
  }
}
