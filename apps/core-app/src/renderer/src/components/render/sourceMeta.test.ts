import { describe, expect, it } from 'vitest'
import type { TuffItem } from '@talex-touch/utils'
import type { ComposerTranslation } from 'vue-i18n'
import {
  formatResultSignalReason,
  resolvePermissionReasonLabel,
  resolveResultSignal,
  resolveSignalActionHint,
  resolveSignalReasonLabel,
  resolveSourceMeta
} from './sourceMeta'

const t = ((key: string, fallback?: string) => fallback ?? key) as ComposerTranslation
type TuffMetaExtension = Record<string, unknown>

function baseItem(overrides: Partial<TuffItem> = {}): TuffItem {
  return {
    id: 'item-1',
    source: {
      type: 'application',
      id: 'app-provider',
      name: 'Applications',
      permission: 'safe'
    },
    kind: 'app',
    render: {
      mode: 'default',
      basic: {
        title: 'Calendar'
      }
    },
    ...overrides
  } as TuffItem
}

function withMeta(meta: TuffMetaExtension): Partial<TuffItem> {
  return { meta: meta as TuffItem['meta'] }
}

describe('CoreBox source metadata', () => {
  it('resolves source label from source name when translation is missing', () => {
    expect(resolveSourceMeta(baseItem(), t)).toEqual({
      icon: 'i-ri-apps-line',
      label: 'Applications',
      type: 'application'
    })
  })

  it('shows failed result signal with explicit reason', () => {
    expect(
      resolveResultSignal(
        baseItem({
          meta: {
            extension: {
              status: 'failed',
              errorCode: 'PROVIDER_TIMEOUT'
            }
          }
        }),
        t
      )
    ).toEqual({
      label: 'Failed',
      tone: 'danger',
      reason: 'PROVIDER_TIMEOUT',
      actionHint: 'PROVIDER_TIMEOUT'
    })
  })

  it('shows degraded result signal from provider health metadata', () => {
    expect(
      resolveResultSignal(
        baseItem({
          meta: {
            extension: {
              health: 'degraded',
              reason: 'index warming'
            }
          }
        }),
        t
      )
    ).toEqual({
      label: 'Degraded',
      tone: 'warning',
      reason: 'index warming',
      actionHint: 'index warming'
    })
  })

  it('resolves direct resultSignal and provider metadata without extension wrapper', () => {
    expect(
      resolveResultSignal(
        baseItem(
          withMeta({
            resultSignal: {
              status: 'failed',
              reason: 'missing credentials'
            }
          })
        ),
        t
      )
    ).toEqual({
      label: 'Failed',
      tone: 'danger',
      reason: 'missing credentials',
      actionHint: 'missing credentials'
    })

    expect(
      resolveResultSignal(
        baseItem(
          withMeta({
            provider: {
              health: 'warning',
              errorCode: 'SECURE_STORE_DEGRADED'
            }
          })
        ),
        t
      )
    ).toEqual({
      label: 'Degraded',
      tone: 'warning',
      reason: 'SECURE_STORE_DEGRADED',
      actionHint: 'SECURE_STORE_DEGRADED'
    })
  })

  it('resolves top-level status and permission metadata for legacy providers', () => {
    expect(
      resolveResultSignal(
        baseItem(
          withMeta({
            status: 'unavailable',
            error: 'AUTH_REQUIRED'
          })
        ),
        t
      )
    ).toEqual({
      label: 'Failed',
      tone: 'danger',
      reason: 'AUTH_REQUIRED',
      actionHint: 'AUTH_REQUIRED'
    })

    expect(
      resolveResultSignal(
        baseItem(
          withMeta({
            permissions: ['network.internet']
          })
        ),
        t
      )
    ).toEqual({
      label: 'Permission',
      tone: 'warning',
      reason: 'network.internet',
      actionHint: 'Grant the required permission before executing.'
    })
  })

  it('infers visible failure state from known reason codes without explicit status', () => {
    expect(
      resolveResultSignal(
        baseItem(
          withMeta({
            errorCode: 'QUOTA_EXCEEDED'
          })
        ),
        t
      )
    ).toEqual({
      label: 'Failed',
      tone: 'danger',
      reason: 'QUOTA_EXCEEDED',
      actionHint: 'QUOTA_EXCEEDED'
    })

    expect(
      resolveResultSignal(
        baseItem(
          withMeta({
            provider: {
              reason: 'index warming'
            }
          })
        ),
        t
      )
    ).toEqual({
      label: 'Degraded',
      tone: 'warning',
      reason: 'index warming',
      actionHint: 'index warming'
    })

    expect(
      resolveResultSignal(
        baseItem(
          withMeta({
            reason: 'custom advisory'
          })
        ),
        t
      )
    ).toBeNull()
  })

  it('shows permission signal for items requiring explicit permissions', () => {
    expect(
      resolveResultSignal(
        baseItem({
          meta: {
            security: {
              permissions: ['clipboard.write', 'intelligence.basic']
            }
          }
        }),
        t
      )
    ).toEqual({
      label: 'Permission',
      tone: 'warning',
      reason: 'clipboard.write, intelligence.basic',
      actionHint: 'Grant the required permission before executing.'
    })
  })

  it('shows system signal for system-level sources', () => {
    expect(
      resolveResultSignal(
        baseItem({
          source: {
            type: 'system',
            id: 'corebox',
            name: 'CoreBox',
            permission: 'system'
          }
        }),
        t
      )
    ).toEqual({
      label: 'System',
      tone: 'info',
      reason: 'CoreBox'
    })
  })

  it('formats visible signal reasons as compact single-line text', () => {
    expect(formatResultSignalReason('  target   provider   timed out  ', 18)).toBe(
      'target provider...'
    )
    expect(formatResultSignalReason('PROVIDER_TIMEOUT', 28)).toBe('PROVIDER_TIMEOUT')
    expect(formatResultSignalReason(undefined, 28)).toBe('')
  })

  it('maps known failed and degraded reason codes to readable labels', () => {
    const readable = ((key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        'coreBox.resultSignalReasons.providerTimeout': 'Provider timed out',
        'coreBox.resultSignalReasons.indexWarming': 'Index warming',
        'coreBox.resultSignalReasons.credentialsMissing': 'Provider credentials missing',
        'coreBox.resultSignalReasons.secureStoreUnavailable': 'Secure store unavailable',
        'coreBox.resultSignalReasons.capabilityUnsupported': 'Capability unsupported'
      }
      return labels[key] ?? fallback ?? key
    }) as ComposerTranslation

    expect(resolveSignalReasonLabel('PROVIDER_TIMEOUT', readable)).toBe('Provider timed out')
    expect(resolveSignalReasonLabel('index warming', readable)).toBe('Index warming')
    expect(resolveSignalReasonLabel('auth-ref-missing', readable)).toBe(
      'Provider credentials missing'
    )
    expect(resolveSignalReasonLabel('secure_store_unavailable', readable)).toBe(
      'Secure store unavailable'
    )
    expect(resolveSignalReasonLabel('unsupported capability', readable)).toBe(
      'Capability unsupported'
    )
    expect(resolveSignalReasonLabel('opaque-code', readable)).toBe('opaque-code')
  })

  it('maps known permission codes to readable labels', () => {
    const readable = ((key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        'coreBox.permissionReasons.clipboardWrite': 'Clipboard write',
        'coreBox.permissionReasons.intelligenceBasic': 'AI access',
        'coreBox.permissionReasons.elevated': 'Elevated access'
      }
      return labels[key] ?? fallback ?? key
    }) as ComposerTranslation

    expect(
      resolvePermissionReasonLabel(['clipboard.write', 'intelligence.basic'], undefined, readable)
    ).toBe('Clipboard write, AI access')
    expect(resolvePermissionReasonLabel([], 'elevated', readable)).toBe('Elevated access')
    expect(resolvePermissionReasonLabel(['custom.scope'], undefined, readable)).toBe('custom.scope')
  })

  it('maps known result reasons to next-action hints', () => {
    const readable = ((key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        'coreBox.resultSignalActions.signIn': 'Sign in to Nexus',
        'coreBox.resultSignalActions.waitForIndex': 'Wait for index warm-up',
        'coreBox.resultSignalActions.checkCredentials': 'Repair provider credentials',
        'coreBox.resultSignalActions.repairSecureStore': 'Check secure-store health',
        'coreBox.resultSignalActions.switchCapability': 'Switch model or provider',
        'coreBox.resultSignalActions.inspectFailure': 'Inspect failure',
        'coreBox.resultSignalActions.reviewRequirement': 'Review requirement'
      }
      return labels[key] ?? fallback ?? key
    }) as ComposerTranslation

    expect(resolveSignalActionHint('NEXUS_AUTH_REQUIRED', 'danger', readable)).toBe(
      'Sign in to Nexus'
    )
    expect(resolveSignalActionHint('index warming', 'warning', readable)).toBe(
      'Wait for index warm-up'
    )
    expect(resolveSignalActionHint('missing credentials', 'danger', readable)).toBe(
      'Repair provider credentials'
    )
    expect(resolveSignalActionHint('SECURE_STORE_DEGRADED', 'warning', readable)).toBe(
      'Check secure-store health'
    )
    expect(resolveSignalActionHint('CAPABILITY_UNSUPPORTED', 'danger', readable)).toBe(
      'Switch model or provider'
    )
    expect(resolveSignalActionHint('opaque failure', 'danger', readable)).toBe('Inspect failure')
    expect(resolveSignalActionHint(undefined, 'warning', readable)).toBe('Review requirement')
  })
})
